/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // The embed script and config endpoint must be loadable from any origin.
        // Short cache so embed.js updates propagate quickly when we ship fixes —
        // 60s was too long for active iteration.
        source: '/(embed.js|api/embed/.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
          { key: 'Cache-Control', value: 'public, max-age=10, s-maxage=10' },
        ],
      },
      {
        source: '/api/invite',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
      {
        // Comment read/write endpoints — embed.js issues POST/PATCH from any origin
        source: '/api/comments/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
