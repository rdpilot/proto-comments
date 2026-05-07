// GET  /api/comments?project=slug&key=embed_key  → list (used for polling)
// POST /api/comments                              → insert
//   body: { project: slug, key: embed_key, page_path, selector, dom_path, snippet, body, author_name }

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

async function resolveProject(slug: string | null, key: string | null) {
  if (!slug || !key) return { error: 'missing project or key' as const };
  const sb = createServiceClient();
  const { data, error } = await sb
    .from('projects')
    .select('id, embed_key, mode')
    .eq('slug', slug)
    .single();
  if (error || !data) return { error: 'project not found' as const };
  if (data.embed_key !== key) return { error: 'invalid key' as const };
  return { project: data };
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('project');
  const key = req.nextUrl.searchParams.get('key');
  const since = req.nextUrl.searchParams.get('since');
  const r = await resolveProject(slug, key);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });

  const sb = createServiceClient();
  let q = sb
    .from('comments')
    .select('id, page_path, selector, dom_path, snippet, body, author_name, author_email, resolved_at, created_at')
    .eq('project_id', r.project.id)
    .order('created_at', { ascending: false });
  if (since) q = q.gt('created_at', since);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data || [] });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const r = await resolveProject(body?.project, body?.key);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });

  const required = ['page_path', 'selector', 'dom_path', 'snippet', 'body', 'author_name'];
  for (const k of required) {
    if (typeof body[k] !== 'string' || !body[k].trim()) {
      return NextResponse.json({ error: `missing ${k}` }, { status: 400 });
    }
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from('comments')
    .insert({
      project_id: r.project.id,
      page_path: body.page_path.slice(0, 256),
      selector: body.selector.slice(0, 1024),
      dom_path: body.dom_path.slice(0, 512),
      snippet: body.snippet.slice(0, 512),
      body: body.body.slice(0, 4000),
      author_name: body.author_name.slice(0, 64),
    })
    .select('id, page_path, selector, dom_path, snippet, body, author_name, author_email, resolved_at, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
