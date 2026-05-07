// GET /skill.md — returns the Claude Code slash-command markdown with the
// deploying instance's origin baked in. Users install with:
//   curl -o ~/.claude/commands/proto-comments.md https://<your-deploy>/skill.md

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const md = template.replaceAll('__API_BASE__', origin);
  return new NextResponse(md, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}

const template = `---
description: Pinned comments on prototypes — create a project, paste a script tag, share the URL, then pull reviewer feedback as markdown without anyone signing in.
argument-hint: <new|fetch|resolve|unresolve|list|delete> [args...]
---

# proto-comments

You are running the \`proto-comments\` command. The user's input after the slash command is in \`$ARGUMENTS\`. Parse it to determine which sub-command they want, and act accordingly.

## API base

\`\`\`
__API_BASE__
\`\`\`

## Local state

Owner tokens and embed keys are stored in \`~/.proto-comments/projects.json\`:

\`\`\`json
{
  "checkout-v2-a7f9": {
    "name": "Checkout v2",
    "owner_token": "...",
    "embed_key": "...",
    "created_at": "2026-05-07T..."
  }
}
\`\`\`

If the file doesn't exist, create it with \`mkdir -p ~/.proto-comments && echo '{}' > ~/.proto-comments/projects.json\` before any sub-command that needs it.

## Sub-commands

Parse \`$ARGUMENTS\`. The first whitespace-separated word is the sub-command; the rest is its argument string.

### \`new <project name>\`

The project name may be quoted or unquoted; treat the entire remainder of \`$ARGUMENTS\` after \`new \` as the name.

1. POST to \`__API_BASE__/api/projects/anon\` with body \`{"name": "<name>"}\`. Use \`curl\`.
2. Response: \`{ slug, name, owner_token, embed_key, script }\`.
3. Merge \`{slug: {name, owner_token, embed_key, created_at}}\` into \`~/.proto-comments/projects.json\`.
4. **Find the prototype's root layout file** in the current working directory:
   - Next.js App Router → \`app/layout.tsx\`
   - Next.js Pages → \`pages/_app.tsx\`
   - Vite/React → \`src/main.tsx\` or \`index.html\`
   - Plain HTML → \`index.html\`
   If unsure, ask the user.
5. Insert the returned \`script\` tag, env-gated to development:

   **Next.js (\`app/layout.tsx\`):**
   \`\`\`tsx
   {process.env.NODE_ENV !== 'production' && (
     <script src="..." data-project="..." data-key="..." async />
   )}
   \`\`\`

   **Vite (\`index.html\`):**
   \`\`\`html
   <script>
     if (import.meta.env.DEV) {
       const s = document.createElement('script');
       s.src = '__API_BASE__/embed.js';
       s.setAttribute('data-project', '<slug>');
       s.setAttribute('data-key', '<embed_key>');
       document.head.appendChild(s);
     }
   </script>
   \`\`\`

6. Print:
   \`\`\`
   ✓ Created project "<name>" (<slug>)
   ✓ Script tag added to <file>
   ✓ Owner token saved

   Share your prototype URL with reviewers — they don't need an account.
   Run /proto-comments fetch <slug> to pull comments.
   \`\`\`

### \`fetch [slug]\`

If \`slug\` is omitted, look at \`~/.proto-comments/projects.json\`. If there's exactly one project, use it. Otherwise list the projects and ask which one.

1. Read \`owner_token\` for the slug from the file. If missing, tell the user this project isn't on this machine.
2. GET \`__API_BASE__/api/markdown?project=<slug>\` with header \`x-owner-token: <token>\`.
3. The response is plain markdown — print it directly to the user without preamble.

The format includes \`id:<comment_id>\` after each item so the user can refer to comments by id for \`resolve\`/\`delete\`.

After printing, if there are comments, suggest a sensible next step (e.g., "Want me to apply 1 and 3?").

### \`resolve <id1> [id2] ...\`

For each comment id, find the project (look up in \`~/.proto-comments/projects.json\` — most likely the one most recently fetched; if ambiguous ask). PATCH \`__API_BASE__/api/comments/<id>\`:

\`\`\`json
{ "project": "<slug>", "key": "<embed_key>", "resolved": true }
\`\`\`

Print \`✓ Resolved <id>\` for each. Continue past failures.

### \`unresolve <id1> [id2] ...\`

Same as \`resolve\` but with \`"resolved": false\`.

### \`list\`

Print all projects from \`~/.proto-comments/projects.json\`:

\`\`\`
checkout-v2-a7f9 — Checkout v2 (3d ago)
landing-rev-bf21 — Landing redesign (today)
\`\`\`

### \`delete <id1> [id2] ...\`

Owner-only. For each id, DELETE \`__API_BASE__/api/comments/<id>\` with header \`x-owner-token: <token>\`.

## Notes

- Use \`curl\` via Bash for all API calls.
- The owner token is sensitive — don't echo it to the user unless they explicitly ask.
- The embed key is in the public script tag — fine to print.
- All endpoints accept JSON. No npm install required.
`;
