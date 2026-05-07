-- ============================================================================
-- proto-comments schema (v1, public mode, no auth)
-- ----------------------------------------------------------------------------
-- Run this in the Supabase SQL editor for a new project.
-- The Next.js API uses the service-role key for all writes; RLS is enabled
-- but no anon policies are defined, so direct client access is locked out.
-- All traffic goes through your /api routes.
-- ============================================================================

create extension if not exists pgcrypto;

-- Projects: one per prototype. Anyone can create one via /api/projects/anon.
create table public.projects (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  slug         text        not null unique,                                 -- e.g. "checkout-v2-a7f9"
  owner_token  text        not null default encode(gen_random_bytes(24), 'hex'),  -- secret; lives in ~/.proto-comments/projects.json
  embed_key    text        not null default encode(gen_random_bytes(12), 'hex'),  -- in the public script tag; gates the embed API
  mode         text        not null default 'public' check (mode in ('public', 'invite_only')),
  created_at   timestamptz not null default now()
);

-- Comments: one row per pinned comment. Author identity is just a typed name.
create table public.comments (
  id            uuid         primary key default gen_random_uuid(),
  project_id    uuid         not null references public.projects(id) on delete cascade,
  author_name   text,                                                  -- typed by the reviewer, stored in localStorage
  author_email  text,                                                  -- reserved for invite_only mode (unused in v1)
  page_path     text         not null,                                 -- e.g. "/dashboard"
  selector      text         not null,                                 -- best-effort CSS selector
  dom_path      text         not null,                                 -- short tag chain, e.g. "div#root > main > button"
  snippet       text         not null,                                 -- visible text or tag info
  body          text         not null,                                 -- the comment text
  resolved_at   timestamptz,
  created_at    timestamptz  not null default now()
);

create index comments_project_created_idx  on public.comments (project_id, created_at desc);
create index comments_project_resolved_idx on public.comments (project_id, resolved_at);

-- ============================================================================
-- Row level security
-- ----------------------------------------------------------------------------
-- RLS is enabled but no anon/auth policies are added. Every write flows through
-- the Next.js API using the service-role key. The API gates access via:
--   - embed_key  → reviewer reads/writes for a single project
--   - owner_token → fetch markdown / delete comments
-- ============================================================================

alter table public.projects enable row level security;
alter table public.comments enable row level security;
