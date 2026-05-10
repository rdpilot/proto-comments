// GitHub App helper. The App acts as the relay between embed.js (in reviewers'
// browsers) and the prototype owner's GitHub repo. We never store comments —
// each comment is an Issue with a known label.

import { App } from '@octokit/app';

let _app: App | null = null;

function getApp(): App {
  if (_app) return _app;
  const appId = process.env.GITHUB_APP_ID;
  const b64 = process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
  if (!appId || !b64) {
    throw new Error('GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY_BASE64 not set');
  }
  const privateKey = Buffer.from(b64, 'base64').toString('utf8');
  _app = new App({ appId: Number(appId), privateKey });
  return _app;
}

// Returns an Octokit instance authed as the App's installation on `owner/repo`,
// or null if the app isn't installed there.
export async function octokitForRepo(owner: string, repo: string) {
  try {
    const app = getApp();
    const { data: installation } = await app.octokit.request(
      'GET /repos/{owner}/{repo}/installation',
      { owner, repo },
    );
    return await app.getInstallationOctokit(installation.id);
  } catch (e: any) {
    if (e.status === 404) return null;
    throw e;
  }
}

// Validate `<owner>/<repo>` shape.
export function parseRepo(input: string | null | undefined): { owner: string; repo: string } | null {
  if (!input) return null;
  const m = String(input).match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

// Validate label shape — must start with our prefix to scope app access.
// Slug must start with an alphanumeric to avoid leading-dot oddities.
export function isValidLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return /^proto-comments:[a-zA-Z0-9][\w.-]{0,63}$/.test(label);
}

// Encode/decode comment metadata in the issue body. The body is markdown that
// renders cleanly on GitHub but also carries structured fields we round-trip.
export type CommentFields = {
  page_path: string;
  selector: string;
  dom_path: string;
  snippet: string;
  body: string;
  author_name: string;
};

// Sentinel marker for the trailing footer — unique enough that user bodies
// containing markdown horizontal rules (---) don't collide.
const FOOTER_SENTINEL = '<!-- proto-comments:footer -->';

export function encodeIssueBody(c: CommentFields): string {
  const meta = [
    '<!-- proto-comments:meta',
    JSON.stringify({
      page_path: c.page_path,
      selector: c.selector,
      dom_path: c.dom_path,
      snippet: c.snippet,
      author_name: c.author_name,
    }),
    '-->',
  ].join('\n');
  return `${meta}\n\n${c.body}\n\n${FOOTER_SENTINEL}\n\n---\n_${escapeMd(c.author_name)} on \`${escapeMd(c.page_path)}\` — \`${escapeMd(c.selector)}\`_`;
}

export function decodeIssue(issue: { number: number; body?: string | null; title: string; state: string; created_at: string; closed_at?: string | null }): CommentFields & { id: string; number: number; resolved_at: string | null; created_at: string } | null {
  const body = issue.body || '';
  const m = body.match(/<!-- proto-comments:meta\n([\s\S]+?)\n-->/);
  if (!m) return null;
  let meta: any;
  try { meta = JSON.parse(m[1]); } catch { return null; }
  // The user-facing body is between the closing `-->` of the meta block and
  // the sentinel marker. Falls back to legacy `\n\n---\n\n` for issues
  // created before the sentinel was introduced.
  const after = body.slice(m.index! + m[0].length);
  let sepIdx = after.indexOf(FOOTER_SENTINEL);
  if (sepIdx < 0) sepIdx = after.lastIndexOf('\n\n---\n\n');
  const userBody = (sepIdx >= 0 ? after.slice(0, sepIdx) : after).trim();
  return {
    id: String(issue.number),
    number: issue.number,
    page_path: meta.page_path || '',
    selector: meta.selector || '',
    dom_path: meta.dom_path || '',
    snippet: meta.snippet || '',
    author_name: meta.author_name || '',
    body: userBody,
    resolved_at: issue.state === 'closed' ? (issue.closed_at || issue.created_at) : null,
    created_at: issue.created_at,
  };
}

function escapeMd(s: string): string {
  return String(s).replace(/[\\`*_{}\[\]()#+\-.!|<>]/g, (c) => '\\' + c);
}
