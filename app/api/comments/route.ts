// GET  /api/comments?repo=<owner/repo>&label=<proto-comments:slug>&since=<iso>
// POST /api/comments
//   body: { repo, label, page_path, selector, dom_path, snippet, body, author_name }

import { NextRequest, NextResponse } from 'next/server';
import { octokitForRepo, parseRepo, isValidLabel, encodeIssueBody, decodeIssue } from '@/lib/github';

export async function GET(req: NextRequest) {
  const repoStr = req.nextUrl.searchParams.get('repo');
  const label = req.nextUrl.searchParams.get('label');
  const since = req.nextUrl.searchParams.get('since');

  const repo = parseRepo(repoStr);
  if (!repo || !isValidLabel(label)) {
    return NextResponse.json({ error: 'invalid repo or label' }, { status: 400 });
  }

  const octokit = await octokitForRepo(repo.owner, repo.repo);
  if (!octokit) {
    return NextResponse.json({ error: 'app not installed on this repo' }, { status: 404 });
  }

  const params: any = { owner: repo.owner, repo: repo.repo, labels: label!, state: 'all', per_page: 100 };
  if (since) params.since = since;

  const { data: issues } = await octokit.request('GET /repos/{owner}/{repo}/issues', params);
  const comments = issues
    .map(decodeIssue)
    .filter((c): c is NonNullable<ReturnType<typeof decodeIssue>> => !!c);

  return NextResponse.json({ comments }, {
    headers: { 'Cache-Control': 'no-store, must-revalidate' },
  });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const repo = parseRepo(body?.repo);
  const label = body?.label;
  if (!repo || !isValidLabel(label)) {
    return NextResponse.json({ error: 'invalid repo or label' }, { status: 400 });
  }

  const required = ['page_path', 'selector', 'dom_path', 'snippet', 'body', 'author_name'];
  for (const k of required) {
    if (typeof body[k] !== 'string' || !body[k].trim()) {
      return NextResponse.json({ error: `missing ${k}` }, { status: 400 });
    }
  }

  const octokit = await octokitForRepo(repo.owner, repo.repo);
  if (!octokit) {
    return NextResponse.json({ error: 'app not installed on this repo' }, { status: 404 });
  }

  // Make sure the label exists; create it if not. Surface real errors —
  // silently swallowing them caused first-comment-fails-with-no-clue bugs.
  try {
    await octokit.request('GET /repos/{owner}/{repo}/labels/{name}', {
      owner: repo.owner, repo: repo.repo, name: label,
    });
  } catch (e: any) {
    if (e.status === 404) {
      try {
        await octokit.request('POST /repos/{owner}/{repo}/labels', {
          owner: repo.owner, repo: repo.repo, name: label,
          color: '5e6ad2',
          description: 'proto-comments review feedback',
        });
      } catch (createErr: any) {
        // 422 = already exists (race with another concurrent POST). Anything
        // else means we genuinely couldn't create it — surface it so the
        // caller sees something better than "failed to save".
        if (createErr.status !== 422) {
          return NextResponse.json({
            error: 'failed to create label',
            detail: createErr.message,
            hint: 'The GitHub App may be missing "Issues: Write" permission on this repo. Re-install the App and grant it.',
          }, { status: 500 });
        }
      }
    } else {
      // Unexpected error checking for the label (auth, network, etc.) —
      // log it but proceed; issue creation will give a real error if it can't apply the label.
      console.error('label probe failed:', e.message);
    }
  }

  const fields = {
    page_path: body.page_path.slice(0, 256),
    selector: body.selector.slice(0, 1024),
    dom_path: body.dom_path.slice(0, 512),
    snippet: body.snippet.slice(0, 512),
    body: body.body.slice(0, 4000),
    author_name: body.author_name.slice(0, 64),
  };
  const title = (fields.body.split('\n')[0] || 'Comment').slice(0, 80);

  const created = await octokit.request('POST /repos/{owner}/{repo}/issues', {
    owner: repo.owner,
    repo: repo.repo,
    title,
    body: encodeIssueBody(fields),
    labels: [label],
  });

  const decoded = decodeIssue(created.data);
  if (!decoded) {
    return NextResponse.json({ error: 'created but failed to decode' }, { status: 500 });
  }
  return NextResponse.json(decoded);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
