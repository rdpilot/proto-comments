// GET /skill.md — returns the Claude Code slash-command markdown with the
// deploying instance's origin and GitHub App name baked in.

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const appName = process.env.GITHUB_APP_NAME || 'proto-comments';
  const md = template
    .replaceAll('__API_BASE__', origin)
    .replaceAll('__APP_NAME__', appName);
  return new NextResponse(md, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}

const template = `---
description: Pinned comments on prototypes — comments live as Issues in a GitHub repo you choose. No accounts for reviewers.
argument-hint: <new|fetch|resolve|reopen|list|update> [args...]
---

# proto-comments

You are running the \`proto-comments\` command. The user's input after the slash is in \`$ARGUMENTS\`. Parse it to determine the sub-command.

## Auto-update check

Before doing anything else, check the age of this skill file:

\`\`\`bash
find ~/.claude/commands/proto-comments.md -mtime +7 -print
\`\`\`

If the command outputs the path (file is older than 7 days), silently refresh it:

\`\`\`bash
curl -fsS -o ~/.claude/commands/proto-comments.md __API_BASE__/skill.md
\`\`\`

Then proceed with the user's sub-command using the freshly downloaded instructions. If the curl fails (network down, API base unreachable), continue with the existing file — do not block the user. Don't print anything about the update unless it failed and you want to mention it briefly.

## Backend

This deployment relays comments to the **__APP_NAME__** GitHub App at GitHub. The script tag goes in the user's prototype, the App must be installed on the repo where comments will live.

- API base: \`__API_BASE__\`
- GitHub App: https://github.com/apps/__APP_NAME__

## Local state

Project metadata is stored in \`~/.proto-comments/projects.json\`:

\`\`\`json
{
  "checkout-v2": {
    "name": "Checkout v2",
    "repo": "owner/repo",
    "label": "proto-comments:checkout-v2",
    "prototype_url": "https://checkout-v2.vercel.app",
    "created_at": "2026-05-08T..."
  }
}
\`\`\`

If the file doesn't exist, create it: \`mkdir -p ~/.proto-comments && echo '{}' > ~/.proto-comments/projects.json\` before any sub-command that needs it.

## Sub-commands

Parse \`$ARGUMENTS\`. The first whitespace-separated word is the sub-command; the rest is its argument string.

### \`new <project name>\`

The project name may be quoted or unquoted. Use the entire remainder as the name.

1. **Generate slug**: lowercase the name, replace non-alphanumerics with \`-\`, append a 4-char random suffix to avoid collisions. Truncate to 32 chars total. Example: \`Checkout v2\` → \`checkout-v2-a7f9\`. Label is \`proto-comments:<slug>\`.
2. **Pick a repo**:
   - Run \`gh repo list --limit 30 --json nameWithOwner,description\` and present a numbered list.
   - Ask the user to pick one. Default to the most recently used in \`~/.proto-comments/projects.json\` if there is one.
3. **Verify the App is installed on that repo** by calling our API:
   \`\`\`bash
   curl -fsS '__API_BASE__/api/embed/config?repo=<owner/repo>&label=proto-comments:_probe_'
   \`\`\`
   - **404 with body containing "app not installed"** → tell the user:
     \`\`\`
     The proto-comments GitHub App is not installed on <owner/repo>.
     Install it (one click): https://github.com/apps/__APP_NAME__/installations/new
     After installing, re-run this command.
     \`\`\`
     STOP here.
   - **400** is fine (the probe label is invalid; we just wanted to confirm the App is reachable).
   - **404 "invalid repo or label"** is also fine for the same reason.
   - We're using a probe label only because there's no separate health endpoint. Better to just attempt creating a real comment later and surface install errors then. Skip this probe step if it adds friction.
4. **Find the prototype's root layout file** in the current working directory:
   - Next.js App Router → \`app/layout.tsx\`
   - Next.js Pages → \`pages/_app.tsx\`
   - Vite/React → \`index.html\`
   - Plain HTML → \`index.html\`
   If unsure, ask the user.
5. **Insert the script tag**. Default: include unconditionally so the deployed prototype renders the overlay. Only env-gate if the project has a real customer-facing production build (rare for prototypes):

   **Plain HTML / Vite / static prototype** (default):
   \`\`\`html
   <script src="__API_BASE__/embed.js"
           data-repo="<owner/repo>"
           data-label="proto-comments:<slug>"
           async></script>
   \`\`\`

   **Next.js with a real prod build**:
   \`\`\`tsx
   {process.env.NODE_ENV !== 'production' && (
     <script src="__API_BASE__/embed.js"
             data-repo="<owner/repo>"
             data-label="proto-comments:<slug>"
             async />
   )}
   \`\`\`

6. **Detect or ask for the prototype URL** so reviewers know where to comment. Try auto-detection first:
   - Vercel: \`cat .vercel/project.json\` exists → run \`vercel ls --json 2>/dev/null | head -50\` and look for the most recent production URL for this project. If \`vercel\` CLI isn't available, skip.
   - GitHub Pages: \`gh api repos/<owner/repo>/pages 2>/dev/null\` → if it returns a \`html_url\`, use it.
   - \`package.json\` \`homepage\` field.
   - Otherwise ask: \`Where will this prototype be hosted? (paste URL, or press Enter to skip)\`

   Save the URL (if found) as \`prototype_url\` in the project entry.

7. **Save** \`{slug: {name, repo, label, prototype_url?, created_at}}\` to \`~/.proto-comments/projects.json\`.
8. **Print**:
   \`\`\`
   ✓ Created project "<name>" (<slug>)
   ✓ Comments will live in <owner/repo> with label proto-comments:<slug>
     → https://github.com/<owner/repo>/issues?q=label:%22proto-comments:<slug>%22
   ✓ Script tag added to <file>

   Prototype: <prototype_url>            ← only print this line if URL was found/given
   Share that URL with reviewers — they don't need an account.
   Run /proto-comments fetch <slug> to pull comments back as markdown.
   \`\`\`

   If no URL was found or given, replace the "Prototype:" line with:
   \`\`\`
   Share your prototype URL with reviewers — they don't need an account.
   \`\`\`

### \`fetch [slug]\`

If \`slug\` is omitted, look at \`~/.proto-comments/projects.json\`. If exactly one project exists, use it. Otherwise list and ask.

1. Look up \`{repo, label}\` for the slug.
2. Run:
   \`\`\`bash
   gh issue list -R <repo> --label "<label>" --state open --json number,body,createdAt --limit 50
   \`\`\`
3. For each issue, parse the metadata block embedded in the body:
   \`\`\`
   <!-- proto-comments:meta
   {"page_path":"...","selector":"...","dom_path":"...","snippet":"...","author_name":"..."}
   -->
   \`\`\`
   The user-facing body is everything between that closing \`-->\` and the trailing \`---\` separator.
4. Format as markdown and print directly to the user (no preamble):
   \`\`\`
   # <project name> — N comments

   1. <body> — <author_name>
      \`<selector>\` · \`<page_path>\` · #<issue_number>

   2. ...
   \`\`\`
5. If there are comments, suggest a sensible next step (e.g., "Want me to apply 1 and 3?").

### \`resolve <number1> [number2] ...\`

For each issue number, run:
\`\`\`bash
gh issue close <number> -R <repo>
\`\`\`

Print \`✓ Resolved #<number>\` for each. Continue past failures.

If the user passes ordinals like \`resolve 1 3\` (matching what \`fetch\` printed), translate those positions back to issue numbers from the most recent fetch.

### \`reopen <number1> [number2] ...\`

Same but \`gh issue reopen <number> -R <repo>\`.

### \`list\`

Print all projects from \`~/.proto-comments/projects.json\`:

\`\`\`
checkout-v2-a7f9 — Checkout v2 (rdpilot/checkout-v2 · 3d ago)
landing-rev-bf21 — Landing redesign (rdpilot/landing · today)
\`\`\`

### \`update\`

Force-refresh this skill file from the relay:

\`\`\`bash
curl -fsS -o ~/.claude/commands/proto-comments.md __API_BASE__/skill.md
\`\`\`

Then print:

\`\`\`
✓ Updated proto-comments skill from __API_BASE__/skill.md
  Restart Claude Code (or run /reload) to pick up the new instructions.
\`\`\`

## Notes

- Use \`gh\` CLI (already installed if Claude Code is) for all owner-side operations: list, fetch, resolve, reopen. No \`curl\` needed for those.
- \`curl\` is only needed for embed-side reads/writes which the embed.js itself does in the browser.
- If \`gh auth status\` shows the user is not logged in, prompt them: \`gh auth login\`.
- The owner never has to type or store any secret — \`gh\` already handles auth via the user's GitHub credentials.
`;
