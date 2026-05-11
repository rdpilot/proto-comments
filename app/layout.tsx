import './globals.css';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: 'proto-comments',
  description: 'Pinned comments on any preview URL — not just Vercel\'s. Self-hosted, no accounts, /proto-comments slash command for Claude Code.',
  openGraph: {
    title: 'proto-comments',
    description: 'Pinned comments on any preview URL. Self-hosted. /proto-comments slash command for Claude Code.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'proto-comments',
    description: 'Pinned comments on any preview URL. Self-hosted. No accounts.',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Live demo: load the comment overlay on production AND preview deployments
  // so visitors can try it directly on the landing page. Cache-bust on deploy
  // SHA so embed.js updates always hit fresh.
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev';
  const isPreview = process.env.VERCEL_ENV === 'preview';
  const label = 'proto-comments:landing-demo';
  // VIDEO-DEMO BRANCH: behave exactly like production demo (ephemeral, seeded
  // pin on the H1) BUT with the default "+ Comment" pill instead of
  // "Try it here →". So you can record the canonical experience.
  const pillLabel = undefined;
  const ephemeral = 'true';
  // Seed pin on the H1 so visitors see a clickable example immediately.
  const seed = JSON.stringify([
    {
      id: '1',
      page_path: '/',
      selector: 'div.lp-wrap > section.lp-hero > h1',
      dom_path: 'div > section > h1',
      snippet: 'Comment on any prototype URL.',
      body: "Click my pin → click any element → leave a comment. This whole page is the demo. Refresh to clear everything.",
      author_name: 'roy',
      resolved_at: null,
      created_at: '2026-05-10T00:00:00Z',
    },
  ]);
  return (
    <html lang="en">
      <body>
        {children}
        <script
          src={`https://proto-comments.vercel.app/embed.js?v=${sha}`}
          data-repo="rdpilot/proto-comments"
          data-label={label}
          {...(pillLabel ? { 'data-pill-label': pillLabel } : {})}
          {...(ephemeral ? { 'data-ephemeral': ephemeral } : {})}
          {...(seed ? { 'data-seed': seed } : {})}
          async
        />
        <Analytics />
      </body>
    </html>
  );
}
