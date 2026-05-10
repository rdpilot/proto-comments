// GET  /api/comments?repo=<owner/repo>&label=<proto-comments:slug>&since=<iso>
// POST /api/comments
//   body: { repo, label, page_path, selector, dom_path, snippet, body, author_name }

import { NextRequest, NextResponse } from 'next/server';
import { octokitForRepo, parseRepo, isValidLabel, encodeIssueBody, decodeIssue } from '@/lib/github';

// In-memory rate limiter — per (repo+IP) per minute. Coarse but stops trivial
// abuse without requiring KV/Redis. Resets on cold start which is fine for a
// stateless relay.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_PER_MINUTE = 30; // 30 comments / minute / (repo+IP)

function checkRateLimit(key: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return { ok: true };
  }
  if (bucket.count >= RATE_LIMIT_PER_MINUTE) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { ok: true };
}

// Lightweight Origin/Referer check — blocks `curl` and other non-browser
// callers. Real browsers always send one of the two on cross-origin requests.
function hasBrowserOrigin(req: NextRequest): boolean {
  return !!(req.headers.get('origin') || req.headers.get('referer'));
}

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
  if (!hasBrowserOrigin(req)) {
    return NextResponse.json({ error: 'requests must come from a browser' }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const repo = parseRepo(body?.repo);
  const label = body?.label;
  if (!repo || !isValidLabel(label)) {
    return NextResponse.json({ error: 'invalid repo or label' }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const rl = checkRateLimit(`${repo.owner}/${repo.repo}|${ip}`);
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate limit exceeded', retry_after_seconds: rl.retryAfter }, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfter) },
    });
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

  // Unicode-aware truncation — String.slice splits surrogate pairs, which
  // breaks emoji and non-BMP characters at the boundary.
  const truncate = (s: string, n: number) => Array.from(s).slice(0, n).join('');

  const fields = {
    page_path: truncate(body.page_path, 256),
    selector: truncate(body.selector, 1024),
    dom_path: truncate(body.dom_path, 512),
    snippet: truncate(body.snippet, 512),
    body: truncate(body.body, 4000),
    author_name: truncate(body.author_name, 64),
  };
  const firstLine = fields.body.split('\n').find((l) => l.trim()) || 'Comment';
  const title = truncate(firstLine.trim(), 80);

  let created;
  try {
    created = await octokit.request('POST /repos/{owner}/{repo}/issues', {
      owner: repo.owner,
      repo: repo.repo,
      title,
      body: encodeIssueBody(fields),
      labels: [label],
    });
  } catch (e: any) {
    if (e.status === 403 || e.status === 422) {
      return NextResponse.json({
        error: 'failed to create issue',
        detail: e.message,
        hint: 'The GitHub App may be missing "Issues: Write" permission, or the label was not created. Verify App permissions and re-install.',
      }, { status: e.status });
    }
    throw e;
  }

  const decoded = decodeIssue(created.data);
  if (!decoded) {
    return NextResponse.json({ error: 'created but failed to decode' }, { status: 500 });
  }
  return NextResponse.json(decoded);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
