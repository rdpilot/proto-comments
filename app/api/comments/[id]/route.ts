// PATCH /api/comments/:issue_number
//   body: { repo, label, resolved: boolean }
//   Closes (resolved=true) or reopens (resolved=false) the issue.

import { NextRequest, NextResponse } from 'next/server';
import { octokitForRepo, parseRepo, isValidLabel, decodeIssue } from '@/lib/github';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const repo = parseRepo(body?.repo);
  const label = body?.label;
  if (!repo || !isValidLabel(label)) {
    return NextResponse.json({ error: 'invalid repo or label' }, { status: 400 });
  }
  if (typeof body.resolved !== 'boolean') {
    return NextResponse.json({ error: 'resolved must be boolean' }, { status: 400 });
  }

  const issueNumber = Number(params.id);
  if (!Number.isFinite(issueNumber)) {
    return NextResponse.json({ error: 'invalid issue number' }, { status: 400 });
  }

  const octokit = await octokitForRepo(repo.owner, repo.repo);
  if (!octokit) {
    return NextResponse.json({ error: 'app not installed on this repo' }, { status: 404 });
  }

  // Confirm the issue actually has the label we expect — defense against
  // hopping to other issues in the repo.
  const { data: issue } = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
    owner: repo.owner, repo: repo.repo, issue_number: issueNumber,
  });
  if (!issue.labels.some((l: any) => (typeof l === 'string' ? l : l.name) === label)) {
    return NextResponse.json({ error: 'issue does not belong to this project' }, { status: 403 });
  }

  const { data: updated } = await octokit.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
    owner: repo.owner, repo: repo.repo, issue_number: issueNumber,
    state: body.resolved ? 'closed' : 'open',
  });

  const decoded = decodeIssue(updated);
  return NextResponse.json(decoded || { id: String(issueNumber), resolved_at: body.resolved ? new Date().toISOString() : null });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
