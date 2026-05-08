import { headers } from 'next/headers';
import CopyableCode from './copyable-code';

export default function HomePage() {
  const h = headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;
  const githubUrl = 'https://github.com/rdpilot/proto-comments';

  return (
    <div className="lp-wrap">
      <nav className="lp-nav">
        <a href="/" className="lp-logo">proto-comments<span className="dot">.</span></a>
        <span className="lp-spacer" />
        <a href="#install">Install</a>
        <a href="#how">How it works</a>
        <a href={githubUrl}>GitHub</a>
      </nav>

      <section className="lp-hero">
        <h1>
          Pinned comments on any preview URL, wherever your prototype&nbsp;lives.
        </h1>
        <p>
          Vercel, Netlify, Cloudflare Pages, localhost, custom staging — your prototype
          loads, your team comments, you pull the feedback into Claude Code as markdown.
          One slash command, one script tag, no accounts.
        </p>
        <a className="lp-cta" href="#install">Install →</a>
        <a className="lp-cta-secondary" href={githubUrl}>View on GitHub</a>
      </section>

      <section className="lp-section" id="install">
        <h2>Install in two steps</h2>
        <div className="lp-install">
          <div className="lp-step">
            <div className="num">01</div>
            <h3>Install the slash command</h3>
            <CopyableCode>{`mkdir -p ~/.claude/commands
curl -o ~/.claude/commands/proto-comments.md \\
  ${origin}/skill.md`}</CopyableCode>
            <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
              Restart Claude Code so it picks up the new command.
            </p>
          </div>
          <div className="lp-step">
            <div className="num">02</div>
            <h3>Use it in any prototype</h3>
            <CopyableCode>{`/proto-comments new "Checkout v2"`}</CopyableCode>
            <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
              Claude inserts the script tag, saves the owner token, and you&apos;re done.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-section" id="how">
        <h2>How it works</h2>
        <div className="lp-how">
          <div>
            <div className="lp-how-step active" data-step="01">
              <div className="num">01</div>
              <h3>Spin up a project</h3>
              <p>One slash command in Claude Code creates the project and inserts the script tag into your prototype&apos;s root layout, env-gated to dev. You don&apos;t touch HTML.</p>
            </div>
            <div className="lp-how-step" data-step="02">
              <div className="num">02</div>
              <h3>Comment on anything</h3>
              <p>Reviewers click any element to pin a comment to it. Pins stick to the DOM, so feedback stays attached even as the prototype changes. No accounts, no inbox round-trips.</p>
            </div>
            <div className="lp-how-step" data-step="03">
              <div className="num">03</div>
              <h3>Pull as markdown</h3>
              <p><code className="kbd">/proto-comments fetch</code> drops every unresolved comment into Claude&apos;s context. Apply, resolve, repeat.</p>
            </div>
          </div>

          <div className="lp-panels">

            <div className="lp-panel active" data-panel="01">
              <pre className="lp-code"><span className="c">{'> '}</span><span className="k">/proto-comments</span>{` new `}<span className="s">{`"Checkout v2"`}</span>{`

`}<span className="t">{'✓'}</span>{` Created project `}<span className="s">{`"Checkout v2"`}</span>{` (checkout-v2-a7f9)
`}<span className="t">{'✓'}</span>{` Script tag added to `}<span className="s">app/layout.tsx</span>{`
`}<span className="t">{'✓'}</span>{` Owner token saved

Share your prototype URL with reviewers —
they don't need an account.`}</pre>
            </div>

            <div className="lp-panel" data-panel="02">
              <div className="lp-comment-mock">
                <div className="lp-comment-target">Get started →</div>
                <div className="lp-comment-input">align the CTA right on mobile, padding looks off below 480px<span className="caret" /></div>
                <div className="lp-comment-actions">
                  <span className="lp-comment-hint">⌘+↵ to save</span>
                  <button className="lp-name-mock-btn primary">Comment</button>
                </div>
              </div>
            </div>

            <div className="lp-panel" data-panel="03">
              <pre className="lp-code"><span className="c"># Checkout v2 — 3 comments</span>{`

1. align CTA right on mobile — alex
   `}<span className="s">{`\`.cta--primary\``}</span>{` · /pricing

2. tighten hero copy — sam
   `}<span className="s">{`\`h1.hero-title\``}</span>{` · /

3. logo too small in nav — alex
   `}<span className="s">{`\`nav .logo\``}</span>{` · /`}</pre>
            </div>

          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var steps = document.querySelectorAll('#how .lp-how-step');
            var panels = document.querySelectorAll('#how .lp-panel');
            function activate(id) {
              steps.forEach(function(s) { s.classList.toggle('active', s.dataset.step === id); });
              panels.forEach(function(p) { p.classList.toggle('active', p.dataset.panel === id); });
            }
            steps.forEach(function(s) {
              s.addEventListener('mouseenter', function() { activate(s.dataset.step); });
              s.addEventListener('focus', function() { activate(s.dataset.step); });
            });
          })();
        ` }} />
      </section>

      <section className="lp-section">
        <h2>Why proto-comments</h2>
        <div className="lp-features">
          <div className="lp-feature">
            <h3>Works anywhere</h3>
            <p>Any host, any URL. Vercel, Netlify, Cloudflare, custom staging, even localhost. The script tag doesn&apos;t care where it&apos;s loaded from.</p>
          </div>
          <div className="lp-feature">
            <h3>Your data, your DB</h3>
            <p>Comments live in a Supabase project you own. Nothing routes through anyone else&apos;s server. Comply however you need to.</p>
          </div>
          <div className="lp-feature">
            <h3>MIT, no telemetry</h3>
            <p>Open source. Fork it, modify it, run it however you want. No accounts, no tracking pixels, no dashboard you don&apos;t need.</p>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <span>proto-comments</span>
        <span className="lp-spacer" />
        <a href={githubUrl}>GitHub</a>
        <a href="/skill.md">skill.md</a>
        <span className="muted small">MIT</span>
      </footer>
    </div>
  );
}
