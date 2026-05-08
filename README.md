# proto-comments

Pinned comments on any preview URL — wherever your prototype lives. Comments are stored as Issues in a GitHub repo you own. Reviewers don't sign up. You pull comments back into Claude Code as markdown.

## How it works

```
   reviewer browser            relay (this app)              your repo
  ┌────────────────┐  POST    ┌────────────────┐  GitHub    ┌──────────────┐
  │  embed.js      │ ───────► │  Next.js API   │  App API   │  Issues with │
  │  (no auth)     │          │  (stateless)   │ ────────►  │  proto-      │
  │                │          │                │            │  comments:*  │
  └────────────────┘          └────────────────┘            └──────────────┘
                                                                  ▲
                                                                  │ gh issue list
                                                                  │
                                                          ┌───────────────┐
                                                          │ Claude Code   │
                                                          │ /proto-       │
                                                          │ comments      │
                                                          │ fetch         │
                                                          └───────────────┘
```

- The script tag carries `data-repo` and `data-label`. The relay only knows what it receives in those request parameters; nothing is stored server-side.
- Comments are GitHub Issues in your repo with the label `proto-comments:<slug>`. Versioned, searchable, exportable, yours.
- The owner side (`/proto-comments fetch`, `resolve`, etc.) talks to GitHub directly via your local `gh` CLI — no relay involved.
- The relay is only needed because reviewers' browsers can't authenticate as you. It uses a GitHub App installation token, scoped to repos where the App is installed.

## Deploy your own relay

You'll need a Vercel account and a GitHub account. No database is required.

### 1. Register a GitHub App

- Go to https://github.com/settings/apps/new
- Name: `your-org-proto-comments` (must be globally unique on GitHub)
- Homepage URL: your eventual Vercel URL (or just `https://example.com` for now — you can edit later)
- Webhook → uncheck **Active**
- Permissions → Repository → **Issues: Read & write** (everything else: No access)
- Where can this be installed: **Any account** (open-source) or **Only this account**
- Click **Create GitHub App**

After creating, on the App settings page:
- Note the **App ID** (numeric)
- Click **Generate a private key**, download the .pem file
- Note the **App slug** (the part of the URL like `github.com/apps/<this-name>`)

### 2. Deploy to Vercel

Import this repo at https://vercel.com/new. Set these env vars:

| Name | Value |
|---|---|
| `GITHUB_APP_ID` | The numeric App ID |
| `GITHUB_APP_NAME` | The App slug (e.g. `proto-comments`) |
| `GITHUB_APP_PRIVATE_KEY_BASE64` | `cat key.pem \| base64` (paste the result, no newlines) |

Deploy. You'll get a URL like `https://your-tool.vercel.app`.

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

The skill walks you through:
- Picking a repo (using `gh repo list`)
- Installing the GitHub App on that repo (one-click in browser)
- Inserting the script tag into your prototype's layout

Then share the prototype URL with reviewers. They click any element, type a name once, leave comments. Comments land as Issues in your chosen repo with a `proto-comments:<slug>` label.

To pull comments back as markdown:

```
/proto-comments fetch
```

To mark resolved:

```
/proto-comments resolve 12 17
```

(uses issue numbers from the last fetch, runs `gh issue close` underneath)

## Local development

```bash
git clone https://github.com/rdpilot/proto-comments
cd proto-comments
cp .env.example .env.local   # fill in GitHub App vars
npm install
npm run dev
```

Open http://localhost:3000.

## Slash command reference

| Command | What it does |
|---|---|
| `/proto-comments new "Project name"` | Picks a repo, installs the App on it, inserts the script tag |
| `/proto-comments fetch [slug]` | `gh issue list` for the project's label, formats as markdown |
| `/proto-comments resolve <num1> [num2] ...` | `gh issue close` for each |
| `/proto-comments reopen <num1> [num2] ...` | `gh issue reopen` for each |
| `/proto-comments list` | Lists projects from `~/.proto-comments/projects.json` |

## What's NOT in v1

- No threading / replies
- No notifications when comments arrive (use GitHub's own — watch the label)
- No web dashboard for owners (gh CLI is the dashboard)
- No verifiable identity for reviewers — display names are honor-system

## Security model

- The relay is stateless. It uses GitHub App installation tokens (scoped to specific repos, auto-expire) to read/write Issues. It cannot access repos where the App isn't installed.
- The script tag exposes `data-repo` and `data-label`. Anyone who sees the prototype source can read or post comments to that label. For private repos, GitHub's own access control gates reads — but the relay can still post if it's installed on the repo. Treat the prototype URL as semi-public.
- Display names are not authenticated. Anyone with the URL can post as any name. Fine for internal teams.
- The GitHub App's private key is the only secret you hold. Don't commit it. Rotate it by regenerating in GitHub App settings if leaked.

## License

MIT — see [LICENSE](./LICENSE).
