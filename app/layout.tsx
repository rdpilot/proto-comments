import './globals.css';
import type { Metadata } from 'next';

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
  const label = isPreview ? 'proto-comments:landing-review-73f5' : 'proto-comments:landing-demo';
  // Friendlier pill copy for the public demo. Preview branches keep the
  // default "+ Comment" since we're using them for actual review work.
  const pillLabel = isPreview ? undefined : 'Try it here →';
  return (
    <html lang="en">
      <body>
        {children}
        <script
          src={`https://proto-comments.vercel.app/embed.js?v=${sha}`}
          data-repo="rdpilot/proto-comments"
          data-label={label}
          {...(pillLabel ? { 'data-pill-label': pillLabel } : {})}
          async
        />
      </body>
    </html>
  );
}
