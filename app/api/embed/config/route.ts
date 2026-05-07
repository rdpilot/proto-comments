// GET /api/embed/config?project=slug&key=embed_key
// Validates the embed key for a project and returns metadata + initial comments.
// The client never talks to Supabase directly anymore — all reads/writes go through our API.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('project');
  const key = req.nextUrl.searchParams.get('key');
  if (!slug || !key) {
    return NextResponse.json({ error: 'missing project or key' }, { status: 400 });
  }

  const sb = createServiceClient();
  const { data: project, error } = await sb
    .from('projects')
    .select('id, name, slug, embed_key, mode')
    .eq('slug', slug)
    .single();

  if (error || !project || project.embed_key !== key) {
    return NextResponse.json({ error: 'invalid project or key' }, { status: 404 });
  }

  const { data: comments } = await sb
    .from('comments')
    .select('id, page_path, selector, dom_path, snippet, body, author_name, author_email, resolved_at, created_at')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false });

  return NextResponse.json({
    project: { id: project.id, name: project.name, slug: project.slug },
    comments: comments || [],
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
