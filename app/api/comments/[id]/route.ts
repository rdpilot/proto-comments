// PATCH  /api/comments/:id  — toggle resolve. Body: { project, key, resolved: boolean }
// DELETE /api/comments/:id  — owner-token only. Headers: x-owner-token

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const { project, key, resolved } = body || {};
  if (!project || !key) return NextResponse.json({ error: 'missing project or key' }, { status: 400 });
  if (typeof resolved !== 'boolean') return NextResponse.json({ error: 'resolved must be boolean' }, { status: 400 });

  const sb = createServiceClient();
  const { data: proj } = await sb.from('projects').select('id, embed_key').eq('slug', project).single();
  if (!proj || proj.embed_key !== key) return NextResponse.json({ error: 'invalid project or key' }, { status: 404 });

  const { data, error } = await sb
    .from('comments')
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq('id', params.id)
    .eq('project_id', proj.id)
    .select('id, resolved_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ownerToken = req.headers.get('x-owner-token');
  if (!ownerToken) return NextResponse.json({ error: 'missing owner token' }, { status: 401 });

  const sb = createServiceClient();

  // join: only delete if the comment's project owner_token matches
  const { data: row } = await sb
    .from('comments')
    .select('id, project_id, projects!inner(owner_token)')
    .eq('id', params.id)
    .single();

  // @ts-expect-error – nested fk select shape
  if (!row || row.projects.owner_token !== ownerToken) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
  }

  const { error } = await sb.from('comments').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
