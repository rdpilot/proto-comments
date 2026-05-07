// GET /api/markdown?project=slug
// Headers: x-owner-token: <token>
// Returns the markdown export of unresolved comments — for the Claude Code skill to pull.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('project');
  const ownerToken = req.headers.get('x-owner-token');
  if (!slug || !ownerToken) {
    return NextResponse.json({ error: 'missing project or owner token' }, { status: 400 });
  }

  const sb = createServiceClient();
  const { data: project } = await sb
    .from('projects')
    .select('id, name, owner_token')
    .eq('slug', slug)
    .single();
  if (!project || project.owner_token !== ownerToken) {
    return NextResponse.json({ error: 'invalid project or owner token' }, { status: 403 });
  }

  const { data: comments } = await sb
    .from('comments')
    .select('id, page_path, selector, body, author_name, created_at')
    .eq('project_id', project.id)
    .is('resolved_at', null)
    .order('created_at', { ascending: true });

  const list = comments || [];
  const lines = [`# ${project.name} — ${list.length} comment${list.length === 1 ? '' : 's'}`, ''];
  list.forEach((c, i) => {
    const body = c.body.split('\n').map((l: string, idx: number) => idx === 0 ? l : '   ' + l).join('\n');
    const who = c.author_name ? ` — ${c.author_name}` : '';
    lines.push(`${i + 1}. ${body}${who}`);
    lines.push('   `' + c.selector + '` · ' + c.page_path + ' · id:' + c.id);
    lines.push('');
  });

  return new NextResponse(lines.join('\n').trimEnd(), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
