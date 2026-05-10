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
  // proto-comments overlay — only on preview deployments, never on production
  const showOverlay = process.env.VERCEL_ENV === 'preview';
  return (
    <html lang="en">
      <body>
        {children}
        {showOverlay && (
          <script
            src="https://proto-comments.vercel.app/embed.js"
            data-repo="rdpilot/proto-comments"
            data-label="proto-comments:landing-review-73f5"
            async
          />
        )}
      </body>
    </html>
  );
}
