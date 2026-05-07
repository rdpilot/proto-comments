# Examples

Sample HTML pages with the proto-comments embed already wired in. Useful for local testing of changes to `embed.js`.

To use:

1. Run `npm run dev` in the repo root.
2. Create a test project: `curl -X POST http://localhost:3000/api/projects/anon -H "Content-Type: application/json" -d '{"name":"Local test"}'`
3. Copy the returned `slug` and `embed_key` into the `<script>` tag at the bottom of each `.html` file.
4. Open the file with a local server pointed at this directory (e.g. `npx serve` or `python -m http.server`) — or paste them into `public/` temporarily.

These files are **not** part of the deployed app.
