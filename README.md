# proto-comments

Pinned comments on prototypes. Self-hosted. Reviewers don't sign up.

- Drop a script tag in your prototype.
- Share the prototype URL with your team.
- They open it, type a name once, click any element to leave a comment.
- You pull the comments back into Claude Code as markdown via a slash command.
- Apply changes, ship, repeat.

No magic links, no accounts, no Slack screenshots.

## Deploy your own

You'll need free accounts on **Supabase** and **Vercel**.

### 1. Create a Supabase project

- https://supabase.com/dashboard → New project
- Pick any name and region
- After it provisions, open **SQL Editor → New query**, paste [`supabase/schema.sql`](./supabase/schema.sql), and run it
- Open **Project Settings → API Keys**, copy:
  - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
  - `service_role` (secret) → `SUPABASE_SERVICE_ROLE_KEY`
  - `anon` (public) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Deploy to Vercel

Import this repo at https://vercel.com/new, paste the three env vars from above, deploy. You'll get a URL like `https://proto-comments-xxx.vercel.app`.

### 3. Install the slash command

```bash
mkdir -p ~/.claude/commands
curl -o ~/.claude/commands/proto-comments.md https://YOUR-DEPLOY-URL/skill.md
```

Restart Claude Code.

### 4. Use it

In any prototype repo:

```
/proto-comments new "Checkout v2"
```

Claude inserts the script tag into your root layout (env-gated to dev), saves the owner token locally, and you're done.

Share the prototype's preview URL. Reviewers click any element, leave comments. You run:

```
/proto-comments fetch
```

…and the comments land in Claude's context as lean markdown. Apply, resolve, repeat.

## How the data flows

```
   reviewer's browser              your Vercel deploy           your Supabase
  ┌─────────────────┐    HTTPS    ┌────────────────┐  service  ┌──────────┐
  │  embed.js       │ ─────────►  │  Next.js API   │ ────────► │  comments │
  │  (no auth)      │  POST       │  /api/comments │  role     │  table    │
  └─────────────────┘             └────────────────┘           └──────────┘
                                          ▲
                                          │ x-owner-token
                                          │
                                  ┌───────────────┐
                                  │ Claude Code   │
                                  │ /proto-       │
                                  │ comments      │
                                  │ fetch         │
                                  └───────────────┘
```

- **Comments** live in your Supabase `comments` table, keyed by `project_id`.
- The browser embed talks **only** to your Next.js API. It never sees Supabase credentials.
- Each project has two secrets: `embed_key` (in the script tag, used to read/post comments for that project) and `owner_token` (only in your local `~/.proto-comments/projects.json`, used to fetch markdown and delete).

## Local development

```bash
git clone https://github.com/rdpilot/proto-comments
cd proto-comments
cp .env.example .env.local   # fill in Supabase creds
npm install
npm run dev
```

Open http://localhost:3000.

## Slash command reference

| Command | What it does |
|---|---|
| `/proto-comments new "Project name"` | Creates a project, inserts the script tag, saves the owner token |
| `/proto-comments fetch [slug]` | Pulls unresolved comments as markdown. Defaults to the most recent project if there's only one |
| `/proto-comments resolve <id1> [id2] ...` | Marks comments resolved |
| `/proto-comments unresolve <id1> [id2] ...` | Reopens resolved comments |
| `/proto-comments delete <id1> [id2] ...` | Permanently deletes comments (owner only) |
| `/proto-comments list` | Lists projects you've created on this machine |

## What's NOT in v1

- No threading / replies
- No notifications when comments arrive
- No web dashboard for owners (the skill is the dashboard)
- No moderation tools beyond the owner deleting comments
- No verifiable identity — display names are honor-system

## Security model

- The embed talks only to your API; the browser never has Supabase credentials.
- Per-project `embed_key` gates reads/writes to that project's comments. Without the key, the slug alone gives nothing.
- `owner_token` is held only on the project creator's machine. It's required to fetch markdown or delete comments.
- Display names are not authenticated. Anyone with the prototype URL can post as any name. Fine for internal teams, not appropriate for adversarial environments.
- All data lives in your Supabase under your control. Compliance is yours to define.

## License

MIT — see [LICENSE](./LICENSE).
