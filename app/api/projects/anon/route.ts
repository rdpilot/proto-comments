// POST /api/projects/anon
// Body: { name: string }
// Anonymous project creation. Returns slug, owner_token, embed_key, and a ready-to-paste script tag.
// The owner_token is shown ONCE and never returned again — caller must store it.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'project';
  const suffix = Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const name = (body?.name || '').trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const sb = createServiceClient();

  // try a few times in case of slug collision
  let project: any = null;
  for (let i = 0; i < 5; i++) {
    const slug = slugify(name);
    const { data, error } = await sb
      .from('projects')
      .insert({ name, slug, mode: 'public' })
      .select('id, name, slug, owner_token, embed_key')
      .single();
    if (!error) { project = data; break; }
    if (error.code !== '23505') {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  if (!project) return NextResponse.json({ error: 'could not create project' }, { status: 500 });

  const origin = req.nextUrl.origin;
  const script = `<script src="${origin}/embed.js" data-project="${project.slug}" data-key="${project.embed_key}" async></script>`;

  return NextResponse.json({
    slug: project.slug,
    name: project.name,
    owner_token: project.owner_token,
    embed_key: project.embed_key,
    script,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
