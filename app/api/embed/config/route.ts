// GET /api/embed/config?repo=<owner>/<repo>&label=<proto-comments:slug>
// Validates the repo + label and returns project metadata + initial comments.

import { NextRequest, NextResponse } from 'next/server';
import { octokitForRepo, parseRepo, isValidLabel, decodeIssue } from '@/lib/github';

export async function GET(req: NextRequest) {
  const repoStr = req.nextUrl.searchParams.get('repo');
  const label = req.nextUrl.searchParams.get('label');

  const repo = parseRepo(repoStr);
  if (!repo || !isValidLabel(label)) {
    return NextResponse.json({ error: 'invalid repo or label' }, { status: 400 });
  }

  const octokit = await octokitForRepo(repo.owner, repo.repo);
  if (!octokit) {
    return NextResponse.json({ error: 'app not installed on this repo' }, { status: 404 });
  }

  const { data: issues } = await octokit.request(
    'GET /repos/{owner}/{repo}/issues',
    { owner: repo.owner, repo: repo.repo, labels: label!, state: 'all', per_page: 100 },
  );

  const comments = issues
    .map(decodeIssue)
    .filter((c): c is NonNullable<ReturnType<typeof decodeIssue>> => !!c)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Project name is the suffix after `proto-comments:` for display purposes.
  const slug = label!.replace(/^proto-comments:/, '');
  const project = { id: label, name: slug, slug };

  return NextResponse.json({ project, comments }, {
    headers: { 'Cache-Control': 'no-store, must-revalidate' },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
