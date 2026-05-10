# proto-comments

Pinned comments on any prototype URL. Reviewers click anything, leave feedback — no account, no sign-up. You pull the comments into Claude Code as markdown so your AI agent can ship the fixes.

**Live demo:** [proto-comments.vercel.app](https://proto-comments.vercel.app) — click any element on the page to leave a comment.

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
- Owner side (`fetch`, `resolve`, etc.) talks to GitHub directly via your local `gh` CLI — no relay involved.
- The relay exists because reviewers' browsers can't authenticate as you. It uses a GitHub App installation token, scoped to repos where the App is installed.

> **About the relay:** by default the slash command points at `proto-comments.vercel.app`, the hosted relay. Every prototype using it depends on that deployment staying up. If you'd rather not, follow [Deploy your own relay](#deploy-your-own-relay) below — comments stay in your repo either way.

## Install (use the hosted relay)

```bash
mkdir -p ~/.claude/commands
curl -o ~/.claude/commands/proto-comments.md \
  https://proto-comments.vercel.app/skill.md
```

Restart Claude Code. Then in any prototype repo:

```
/proto-comments new
```

The skill walks you through:
1. Picking a GitHub repo where comments will live (uses `gh repo list`)
2. Installing the GitHub App on that repo (one-click browser flow)
3. Creating the label and inserting the script tag into your layout
4. Detecting your deploy target (Vercel / Netlify / GitHub Pages / Cloudflare Pages) and running the deploy
5. Printing a shareable URL where the comment overlay is live

Share that URL with reviewers. They click any element, leave feedback. To pull comments back:

```
/proto-comments fetch
```

To resolve:

```
/proto-comments resolve 12 17
```

(issue numbers from the most recent fetch, runs `gh issue close` underneath)

## Slash command reference

| Command | What it does |
|---|---|
| `/proto-comments new [name]` | Picks a repo, installs the App, inserts the script tag, deploys, prints a shareable URL. Name is optional — Claude will ask if not given. |
| `/proto-comments fetch [slug]` | Lists open comments as markdown |
| `/proto-comments resolve <num1> [num2] ...` | Closes each issue (marks as resolved) |
| `/proto-comments reopen <num1> [num2] ...` | Reopens each issue |
| `/proto-comments list` | Lists all your projects |
| `/proto-comments update` | Re-fetches the skill from the relay (skill auto-updates weekly anyway) |

## Deploy your own relay

You'll need a Vercel account and a GitHub account. No database required.

### 1. Register a GitHub App

- Go to https://github.com/settings/apps/new
- Name: `your-org-proto-comments` (must be globally unique on GitHub)
- Homepage URL: your eventual Vercel URL (or `https://example.com` for now — editable later)
- Webhook → uncheck **Active**
- Repository permissions → **Issues: Read & write** (everything else: No access)
- Where can this be installed: **Any account** or **Only this account**
- Click **Create GitHub App**

After creating:
- Note the **App ID** (numeric)
- Click **Generate a private key** → download the `.pem` file
- Note the **App slug** (the URL is `github.com/apps/<slug>`)

### 2. Deploy to Vercel

Import this repo at https://vercel.com/new. Set these env vars:

| Name | Value |
|---|---|
| `GITHUB_APP_ID` | The numeric App ID |
| `GITHUB_APP_NAME` | The App slug (e.g. `proto-comments`) |
| `GITHUB_APP_PRIVATE_KEY_BASE64` | `cat key.pem \| base64` (paste the result, no newlines) |

Deploy. Your slash command install URL is `https://YOUR-DEPLOY-URL/skill.md`.

## Local development

```bash
git clone https://github.com/rdpilot/proto-comments
cd proto-comments
cp .env.example .env.local   # fill in GitHub App vars
npm install
npm run dev
```

Open http://localhost:3000.

## What's not in v1

- No threading / replies (one comment = one Issue)
- No notifications when comments arrive (subscribe to the GitHub label instead)
- No web dashboard for owners (the `gh` CLI is the dashboard)
- No verifiable identity for reviewers — display names are honor-system

## Security model

- The relay is **stateless**. GitHub App installation tokens (scoped to specific repos, auto-expire) read/write Issues. It cannot touch repos where the App isn't installed.
- POST/PATCH require a browser `Origin` or `Referer` header — blocks `curl`-based abuse.
- Per-(repo + IP) rate limit: 30 comments/minute on POST.
- The script tag exposes `data-repo` and `data-label`. Anyone who sees the prototype source can post comments to that label. For private repos, GitHub's own access control gates reads. Treat the prototype URL as semi-public.
- Display names are not authenticated. Anyone with the URL can post as any name. Fine for internal review; not a substitute for a real identity system.
- The GitHub App's private key is the only secret you hold. Don't commit it. Rotate by regenerating in GitHub App settings if leaked.

## Troubleshooting

- **Overlay doesn't show up:** open the page with `?__pc_reset=1` to nuke any stale localStorage. Check the browser console for `[proto-comments]` messages.
- **First comment fails to save:** the GitHub App needs `Issues: Read & write` on the chosen repo. Reinstall the App and confirm permissions.
- **Pin appears in the wrong place after a redesign:** the embed falls back to text-snippet matching when the CSS selector breaks, but if the surrounding text has also changed, the pin won't find anything. Resolve and re-comment.

## License

MIT — see [LICENSE](./LICENSE).
