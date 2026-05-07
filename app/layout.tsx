import './globals.css';

export const metadata = {
  title: 'proto-comments',
  description: 'Live prototype comments for design teams',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
