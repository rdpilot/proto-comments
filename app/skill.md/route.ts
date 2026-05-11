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
description: Pinned comments on prototypes — comments live as Issues in your GitHub repo. No accounts for reviewers.
argument-hint: <new|fetch|resolve|reopen|list|update> [args...]
---

# proto-comments

Sub-command in \`$ARGUMENTS\` (first word). Relay: \`__API_BASE__\` · App: https://github.com/apps/__APP_NAME__

If \`~/.claude/commands/proto-comments.md\` is older than 7 days, silently \`curl -fsS -o ~/.claude/commands/proto-comments.md __API_BASE__/skill.md\` before continuing. Skip silently on network failure.

Project metadata at \`~/.proto-comments/projects.json\`: \`{slug: {name, repo, label, prototype_url, prototype_url_live, created_at}}\`. Create with \`mkdir -p ~/.proto-comments && echo '{}' > ~/.proto-comments/projects.json\` if missing.

Use \`gh\` CLI for all owner-side work. If \`gh auth status\` fails, prompt \`gh auth login\`.

## new [project name]

Name is optional — ask if missing. Run all steps in order, no permission prompts:

1. **Slug**: lowercase name, non-alnum → \`-\`, append 4-char hex suffix, max 32 chars. Label: \`proto-comments:<slug>\`.

2. **Pick comments repo**: \`gh repo list --limit 30 --json nameWithOwner,description\`, present numbered list. Default to most recent in projects.json.

3. **Verify App installed** on the chosen repo:
   \`\`\`
   curl -fsS '__API_BASE__/api/embed/config?repo=<owner/repo>&label=proto-comments:_probe_'
   \`\`\`
   On 404 with "app not installed": tell user to install at \`https://github.com/apps/__APP_NAME__/installations/new\`, STOP.

4. **Create label**: \`gh label create "proto-comments:<slug>" -R <owner/repo> --color 5e6ad2 --description "proto-comments review thread" 2>/dev/null || true\`

5. **Insert script tag** in current dir's root layout (\`app/layout.tsx\` for Next App Router, \`pages/_app.tsx\` for Pages, else \`index.html\`). Ask if unsure.

   **For plain \`index.html\`** — use a single sed command, no Read+Edit handshake:
   \`\`\`bash
   sed -i.bak 's|</body>|  <script src="__API_BASE__/embed.js" data-repo="<owner/repo>" data-label="proto-comments:<slug>" async></script>\\n</body>|' index.html && rm index.html.bak
   \`\`\`

   **For Next.js / Vite / framework files** — Edit the file with the script tag before \`</body>\`. Default unconditional include:
   \`\`\`html
   <script src="__API_BASE__/embed.js" data-repo="<owner/repo>" data-label="proto-comments:<slug>" async></script>
   \`\`\`
   Only env-gate (\`process.env.VERCEL_ENV === 'preview'\`) for projects with a real production build that shouldn't show the overlay.

6. **Identify prototype repo** (NOT comments repo): \`gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null\`. Save as \`<prototype_repo>\`. If empty, prototype is local-only.

7. **Determine prototype URL** (REQUIRED). Try in order, reject \`localhost\`/\`127.0.0.1\`/\`0.0.0.0\`:
   - \`vercel ls --json 2>/dev/null | head -50\` → most recent production URL
   - \`gh api repos/<prototype_repo>/pages 2>/dev/null\` → \`html_url\`
   - \`wrangler.toml\` → \`https://<project>.pages.dev\`
   - \`package.json\` \`homepage\` (https only)
   - **Predict** if nothing live: \`https://<owner>.github.io/<repo>/\` for GitHub repos with \`index.html\` at root; \`https://<project>.vercel.app\` if \`.vercel/project.json\` exists
   - Else ask: \`Where will this be hosted? (paste public URL)\`. Block on answer.

8. **Save** to projects.json with \`prototype_url_live: false\`.

9. **Deploy automatically** — don't ask, just run:
   - \`scripts.deploy\` / \`publish\` / \`gh-pages\` / \`build:deploy\` in package.json → \`npm run <name>\`
   - Has \`gh-pages\` dep + \`scripts.build\` → \`npm run build && npx gh-pages -d <vite outDir or dist>\`
   - Vercel/Netlify/Cloudflare project (\`.vercel/\`, \`netlify.toml\`, \`wrangler.toml\`) → \`git add -A && git commit -m "add proto-comments script" && git push\`
   - GitHub Pages from main root (\`gh api repos/<prototype_repo>/pages -q .source.branch\` returns \`main\`) → same as above
   - **Brand-new repo, no Pages** (Pages API 404) → \`gh api -X POST repos/<prototype_repo>/pages -f "source[branch]=main" -f "source[path]=/" 2>&1 || true\` then commit + push
   - Unknown → ask once: \`Deploy command? (or 'skip')\`. Save as \`deploy_command\` in projects.json.

   On success, set \`prototype_url_live: true\`.

10. **Print**:
    \`\`\`
    ✓ Created project "<name>" (<slug>)
    ✓ Comments → <owner/repo> · proto-comments:<slug>
      https://github.com/<owner/repo>/issues?q=label:%22proto-comments:<slug>%22
    ✓ Script tag → <file>
    [✓ Deployed                                if deploy ran]

    Prototype: <prototype_url>
    <trailing line>
    \`\`\`
    Trailing line:
    - Deploy ran: \`Live now — share with reviewers (no account needed).\`
    - Async push: \`Live in ~30 seconds — then share with reviewers.\`
    - Skipped: \`Deploy to make this URL live, then share with reviewers.\`

    End: \`Run /proto-comments fetch <slug> to pull comments back here.\`

## fetch [slug]

If slug omitted and exactly one project exists, use it. Else list and ask.

\`gh issue list -R <repo> --label "<label>" --state open --json number,body,createdAt --limit 50\`

Each body has a metadata block:
\`\`\`
<!-- proto-comments:meta
{"page_path":"...","selector":"...","dom_path":"...","snippet":"...","author_name":"..."}
-->

<user comment text>

<!-- proto-comments:footer -->
---
_<author> on \`<path>\` — \`<selector>\`_
\`\`\`

User-facing body is between the meta closing \`-->\` and the footer sentinel. Falls back to \`\\n\\n---\\n\\n\` for legacy issues. Print directly:

\`\`\`
# <project name> — N comments

1. <body> — <author_name>
   #<issue_number> · \`<page_path>\` · \`<selector>\`

2. ...
\`\`\`

If comments exist, suggest a next step (e.g., "Want me to apply 1 and 3?").

## resolve / reopen <num1> [num2] ...

\`gh issue close <num> -R <repo>\` (resolve) or \`gh issue reopen <num> -R <repo>\` (reopen). Print \`✓ Resolved/Reopened #<num>\` for each, continue past failures. If user passes ordinals from last fetch, translate to issue numbers.

## list

Print projects from projects.json:
\`\`\`
<slug> — <name> (<repo> · <relative time>)
\`\`\`

## update

\`curl -fsS -o ~/.claude/commands/proto-comments.md __API_BASE__/skill.md\`

Then print: \`✓ Updated. Restart Claude Code to pick up the new instructions.\`
`;
