/**
 * proto-comments embed script
 * --------------------------------
 * Paste in your prototype:
 *   <script src="https://your-tool.vercel.app/embed.js"
 *           data-repo="you/your-prototype"
 *           data-label="proto-comments:checkout-v2"
 *           async></script>
 *
 * No accounts. Reviewers type a display name once, then click any element to comment.
 * Comments are stored as Issues in `data-repo` with `data-label` — the proto-comments
 * GitHub App must be installed there.
 */
(() => {
  if (window.__protoComments) return;

  const script = document.currentScript || Array.from(document.scripts).find((s) => /embed\.js/.test(s.src));
  if (!script) { console.error('[proto-comments] could not find own script tag'); return; }

  const repo = script.getAttribute('data-repo');
  const label = script.getAttribute('data-label');
  // Optional override for the minimized-pill text. Defaults to "+ Comment".
  const pillLabel = script.getAttribute('data-pill-label') || '+ Comment';
  // Ephemeral mode: never hit the server. Comments live in memory only and
  // vanish on refresh. Used by the landing-page demo so visitors can try
  // the UX without polluting the real GitHub repo.
  const ephemeral = script.getAttribute('data-ephemeral') === 'true';
  const apiBase = new URL(script.src).origin;

  if (!repo || !label) {
    console.error('[proto-comments] missing data-repo or data-label attribute');
    return;
  }

  const state = {
    project: null, // { id, name, slug }
    authorName: '',
    comments: [],
    active: true,
    pendingEl: null,
    hoveredEl: null,
    panelMinimized: true,
    panelPos: null,
    filter: 'unresolved', // 'all' | 'unresolved' | 'mine'
  };

  // Allow forcing a reset via ?__pc_reset=1 — escape hatch when the panel
  // somehow got off-screen due to a stale saved position.
  if (/[?&]__pc_reset=1\b/.test(location.search)) {
    try {
      localStorage.removeItem('__pc_panel_pos');
      localStorage.removeItem('__pc_panel_min');
    } catch (_) {}
  }

  try {
    // Drag position is intentionally NOT restored from localStorage —
    // every page load starts the panel at the top-right default. Users can
    // drag it within a session, but a refresh always brings it back.
    const min = localStorage.getItem('__pc_panel_min');
    if (min !== null) state.panelMinimized = min === '1';
    // In ephemeral mode (demo), don't persist or restore the name —
    // each visitor starts fresh as "you" and nothing is saved.
    state.authorName = ephemeral ? 'you' : (localStorage.getItem('__pc_name') || '');
  } catch (_) {}

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------
  function api(path, opts) {
    return fetch(`${apiBase}${path}`, opts).then(async (r) => {
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(`${r.status}: ${text}`);
      }
      return r.json();
    });
  }
  function withRepoLabel(qs) {
    return `repo=${encodeURIComponent(repo)}&label=${encodeURIComponent(label)}${qs ? '&' + qs : ''}`;
  }
  // Optional seed comments (JSON in data-seed) for demo mode. Useful for
  // the landing page so visitors land on an existing pin to click.
  let seedComments = [];
  const seedAttr = script.getAttribute('data-seed');
  if (seedAttr) {
    try { seedComments = JSON.parse(seedAttr); } catch (e) { console.warn('[proto-comments] data-seed parse failed:', e); }
  }
  async function fetchConfig() {
    if (ephemeral) {
      // Demo mode: never hit the server. Start with seeded comments only;
      // whatever the visitor posts lives in memory until refresh.
      return {
        project: { id: label, name: label.replace(/^proto-comments:/, ''), slug: label },
        comments: seedComments,
      };
    }
    return api(`/api/embed/config?${withRepoLabel()}`);
  }
  // Counter starts above the highest seed id so new posts don't collide.
  let ephemeralCounter = seedComments.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0);
  async function postComment(payload) {
    if (ephemeral) {
      // Fake a server response shape so the rest of the embed thinks
      // it succeeded. Comment vanishes on next refresh. ID is 1-indexed
      // so demo pins read cleanly (1, 2, 3) instead of GitHub issue numbers.
      const id = String(++ephemeralCounter);
      return {
        id, number: Number(id),
        page_path: payload.page_path, selector: payload.selector,
        dom_path: payload.dom_path, snippet: payload.snippet,
        body: payload.body, author_name: payload.author_name,
        resolved_at: null, created_at: new Date().toISOString(),
      };
    }
    return api(`/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, label, ...payload }),
    });
  }
  async function patchComment(id, resolved) {
    if (ephemeral) {
      return { id, resolved_at: resolved ? new Date().toISOString() : null };
    }
    return api(`/api/comments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, label, resolved }),
    });
  }
  async function pollSince(iso) {
    if (ephemeral) return { comments: [] };
    return api(`/api/comments?${withRepoLabel('since=' + encodeURIComponent(iso))}`);
  }

  // ---------------------------------------------------------------------------
  // Selector and snippet generation (same logic as v0 overlay)
  // ---------------------------------------------------------------------------
  function buildSelector(el) {
    if (!el || el === document.body) return 'body';
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy');
    if (testId) return `[data-testid="${testId}"]`;
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
      return `#${CSS.escape(el.id)}`;
    }
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur !== document.body && depth < 4) {
      let part = cur.tagName.toLowerCase();
      const classes = Array.from(cur.classList || [])
        .filter((c) => !/^(css-|sc-|jsx-|_|[a-z]+-\d+$)/i.test(c))
        .filter((c) => c.length < 30)
        .slice(0, 2);
      if (classes.length) part += '.' + classes.join('.');
      const parent = cur.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
        if (sameTag.length > 1) {
          const idx = sameTag.indexOf(cur) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      cur = cur.parentElement;
      depth++;
    }
    return parts.join(' > ');
  }

  function buildShortPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body && parts.length < 5) {
      const tag = cur.tagName.toLowerCase();
      const id = cur.id ? `#${cur.id}` : '';
      parts.unshift(`${tag}${id}`);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function getSnippet(el) {
    const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    if (text && text.length < 80) return text;
    if (text) return text.slice(0, 77) + '...';
    if (el.tagName === 'IMG') return `<img alt="${el.alt || ''}">`;
    if (el.tagName === 'INPUT') return `<input type="${el.type}" placeholder="${el.placeholder || ''}">`;
    return `<${el.tagName.toLowerCase()}>`;
  }

  function emailHandle(email) {
    return (email || '').split('@')[0] || 'anonymous';
  }

  // ---------------------------------------------------------------------------
  // Linear-style CSS
  // ---------------------------------------------------------------------------
  const CSS_TEXT = `
    .__pc * { box-sizing: border-box; }
    .__pc {
      font-family: ui-sans-serif, -apple-system, "Inter", "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      color: #e6e6e6;
    }
    .__pc_outline {
      position: fixed; pointer-events: none; z-index: 2147483645;
      border: 1.5px solid #5e6ad2;
      background: rgba(94, 106, 210, 0.06);
      border-radius: 4px;
    }
    .__pc_pin {
      position: absolute; z-index: 2147483646;
      width: 20px; height: 20px; border-radius: 50% 50% 50% 4px;
      background: #5e6ad2; color: white; font-size: 11px; font-weight: 500;
      display: flex; align-items: center; justify-content: center;
      transform: translate(-4px, -4px) rotate(-45deg);
      box-shadow: 0 1px 3px rgba(0,0,0,0.4); cursor: pointer;
      pointer-events: auto;
      transition: transform 80ms;
    }
    .__pc_pin:hover { transform: translate(-4px, -4px) rotate(-45deg) scale(1.1); }
    .__pc_pin.resolved { background: #2e2e34; color: #6f6f78; }
    .__pc_pin > span { transform: rotate(45deg); display: block; line-height: 1; }

    .__pc_panel {
      position: fixed; top: 16px; right: 16px; z-index: 2147483646;
      width: 340px;
      max-height: calc(100vh - 32px);
      background: #1c1c1f;
      border: 1px solid #2a2a30;
      border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02);
      display: flex; flex-direction: column;
      overflow: hidden;
      resize: none;
    }
    .__pc_panel.minimized {
      width: auto; height: auto; max-height: none;
      border-radius: 999px; padding: 0;
      cursor: grab;
    }
    .__pc_panel.minimized.__pc_dragging { cursor: grabbing; }
    .__pc_panel.minimized .__pc_panel_filters,
    .__pc_panel.minimized .__pc_panel_body,
    .__pc_panel.minimized .__pc_panel_footer { display: none; }
    .__pc_panel.minimized .__pc_panel_header {
      padding: 4px 10px 4px 6px; border-bottom: none; gap: 6px;
    }
    .__pc_panel.minimized .__pc_panel_title { display: none; }
    .__pc_panel.minimized .__pc_panel_count {
      background: #5e6ad2; color: #fff; font-weight: 500;
      min-width: 20px; height: 20px; padding: 0 6px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 10px; font-size: 11px;
    }

    .__pc_panel_header {
      padding: 10px 12px;
      border-bottom: 1px solid #2a2a30;
      display: flex; align-items: center; gap: 8px;
      user-select: none;
      cursor: grab;
    }
    .__pc_panel.__pc_dragging .__pc_panel_header { cursor: grabbing; }
    .__pc_panel_title { font-weight: 500; color: #e6e6e6; font-size: 12px; letter-spacing: 0.01em; }
    .__pc_panel_count {
      background: #2a2a30; color: #a0a0a8; font-size: 11px;
      padding: 1px 6px; border-radius: 10px; font-variant-numeric: tabular-nums;
    }
    .__pc_panel_spacer { flex: 1; }
    .__pc_iconbtn {
      background: transparent; border: none; color: #8a8a92;
      cursor: pointer; padding: 4px; border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
    }
    .__pc_iconbtn:hover { background: #2a2a30; color: #e6e6e6; }

    .__pc_panel_filters {
      display: flex; padding: 6px 8px; gap: 2px;
      border-bottom: 1px solid #2a2a30;
    }
    .__pc_filter {
      background: transparent; border: none; color: #8a8a92;
      font-size: 12px; padding: 4px 8px; border-radius: 4px;
      cursor: pointer; font-family: inherit;
    }
    .__pc_filter:hover { color: #e6e6e6; }
    .__pc_filter.active { background: #2a2a30; color: #e6e6e6; }

    .__pc_panel_body { flex: 1; overflow-y: auto; padding: 4px; }
    .__pc_empty { padding: 32px 16px; text-align: center; color: #6f6f78; font-size: 12px; }

    .__pc_item {
      padding: 10px 12px; border-radius: 6px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .__pc_item:hover { background: #232328; }
    .__pc_item + .__pc_item { margin-top: 2px; }
    .__pc_item.resolved { opacity: 0.55; }
    .__pc_item.resolved .__pc_item_body { text-decoration: line-through; text-decoration-color: #5a5a62; }
    .__pc_item.__pc_highlight {
      animation: __pc_pulse 1.6s ease-out;
    }
    @keyframes __pc_pulse {
      0%   { background: rgba(94, 106, 210, 0.4); border-color: #5e6ad2; }
      100% { background: transparent; border-color: transparent; }
    }

    .__pc_item_meta {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px; color: #8a8a92; margin-bottom: 4px;
    }
    .__pc_item_num {
      background: #5e6ad2; color: white; font-weight: 500;
      padding: 1px 5px; border-radius: 3px; font-size: 10px;
      font-variant-numeric: tabular-nums;
    }
    .__pc_item_num.resolved { background: #3a3a42; }
    .__pc_item_author { color: #e6e6e6; font-weight: 500; }
    .__pc_item_path {
      color: #6f6f78; font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 10.5px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      max-width: 120px;
    }
    .__pc_item_target {
      color: #8a8a92; font-size: 11px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      margin-bottom: 2px;
    }
    .__pc_item_body { color: #e6e6e6; font-size: 12.5px; white-space: pre-wrap; word-wrap: break-word; }
    .__pc_item_actions {
      display: flex; gap: 4px; margin-top: 8px;
      opacity: 0; transition: opacity 100ms;
    }
    .__pc_item:hover .__pc_item_actions { opacity: 1; }
    .__pc_item_action {
      background: transparent; border: 1px solid #2a2a30;
      color: #a0a0a8; padding: 2px 8px; border-radius: 4px;
      font-size: 11px; cursor: pointer; font-family: inherit;
    }
    .__pc_item_action:hover { background: #2a2a30; color: #e6e6e6; border-color: #3a3a42; }

    .__pc_panel_footer {
      padding: 8px; border-top: 1px solid #2a2a30;
      display: flex; gap: 6px;
    }
    .__pc_btn {
      background: #2a2a30; color: #e6e6e6; border: 1px solid #2a2a30;
      padding: 6px 10px; border-radius: 5px;
      font-size: 12px; font-weight: 500; cursor: pointer;
      font-family: inherit;
    }
    .__pc_btn:hover { background: #34343c; }
    .__pc_btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .__pc_btn_primary { background: #5e6ad2; border-color: #5e6ad2; }
    .__pc_btn_primary:hover { background: #6c78dc; }
    .__pc_btn_full { flex: 1; }

    .__pc_popover {
      position: absolute; z-index: 2147483647;
      width: 320px; background: #1c1c1f;
      border: 1px solid #2a2a30; border-radius: 8px; padding: 10px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
    }
    .__pc_popover_target {
      font-size: 11px; color: #8a8a92;
      margin-bottom: 6px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .__pc_popover textarea {
      width: 100%; min-height: 64px; box-sizing: border-box;
      background: #141417; color: #e6e6e6;
      border: 1px solid #2a2a30; border-radius: 5px;
      padding: 8px; font-family: inherit; font-size: 12.5px;
      resize: vertical; outline: none; line-height: 1.45;
    }
    .__pc_popover textarea:focus { border-color: #5e6ad2; }
    .__pc_popover_actions {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 8px; gap: 6px;
    }
    .__pc_kbd {
      font-size: 10.5px; color: #6f6f78;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }

    .__pc_auth {
      position: fixed; top: 16px; right: 16px; z-index: 2147483646;
      width: 320px; background: #1c1c1f;
      border: 1px solid #2a2a30; border-radius: 8px; padding: 16px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
    }
    .__pc_auth h3 { margin: 0 0 4px; font-size: 13px; font-weight: 500; }
    .__pc_auth p { margin: 0 0 12px; color: #8a8a92; font-size: 12px; }
    .__pc_auth input {
      width: 100%; box-sizing: border-box;
      background: #141417; color: #e6e6e6;
      border: 1px solid #2a2a30; border-radius: 5px;
      padding: 8px 10px; font-size: 12.5px; font-family: inherit;
      outline: none;
    }
    .__pc_auth input:focus { border-color: #5e6ad2; }

    .__pc_invite {
      position: fixed; z-index: 2147483647;
      background: #1c1c1f; border: 1px solid #2a2a30; border-radius: 8px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
      padding: 14px; width: 280px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .__pc_invite_label { font-size: 11px; color: #8a8a92;
      text-transform: uppercase; letter-spacing: 0.06em; }
    .__pc_invite input {
      background: #141417; color: #e6e6e6;
      border: 1px solid #2a2a30; border-radius: 5px;
      padding: 8px 10px; font-size: 13px; font-family: inherit; outline: none;
    }
    .__pc_invite input:focus { border-color: #5e6ad2; }
    .__pc_invite input.__pc_invalid { border-color: #d97757; }
    .__pc_invite_actions { display: flex; gap: 6px; justify-content: flex-end; }

    .__pc_toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647; background: #1c1c1f; color: #e6e6e6;
      border: 1px solid #2a2a30; border-radius: 6px;
      padding: 8px 14px; font-size: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      animation: __pc_toast_in 160ms ease-out;
    }
    @keyframes __pc_toast_in {
      from { opacity: 0; transform: translate(-50%, 6px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
  `;

  function injectStyles() {
    if (document.getElementById('__pc_styles')) return;
    const style = document.createElement('style');
    style.id = '__pc_styles';
    style.textContent = CSS_TEXT;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  let outlineEl, panelEl, popoverEl, authEl;

  function ensureOutline() {
    if (!outlineEl) {
      outlineEl = document.createElement('div');
      outlineEl.className = '__pc_outline';
      outlineEl.style.display = 'none';
      document.body.appendChild(outlineEl);
    }
    return outlineEl;
  }

  function showOutline(el) {
    const r = el.getBoundingClientRect();
    const o = ensureOutline();
    o.style.display = 'block';
    o.style.left = r.left + 'px';
    o.style.top = r.top + 'px';
    o.style.width = r.width + 'px';
    o.style.height = r.height + 'px';
  }

  function hideOutline() {
    if (outlineEl) outlineEl.style.display = 'none';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function relativeTime(iso) {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
    return d.toLocaleDateString();
  }

  function isOverlayChrome(el) {
    if (!el || !el.closest) return false;
    return !!(
      el.closest('.__pc_panel') ||
      el.closest('.__pc_popover') ||
      el.closest('.__pc_pin') ||
      el.closest('.__pc_outline') ||
      el.closest('.__pc_toast') ||
      el.closest('.__pc_auth') ||
      el.closest('.__pc_invite')
    );
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = '__pc_toast __pc';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  // ---------------------------------------------------------------------------
  // Pins
  // ---------------------------------------------------------------------------
  function renderPins() {
    document.querySelectorAll('.__pc_pin').forEach((p) => p.remove());
    const filtered = filteredComments();
    filtered.forEach((c, i) => {
      // Only render pins for comments on the current page
      if (c.page_path !== location.pathname) return;
      let el = null;
      try { el = document.querySelector(c.selector); } catch (_) {}
      if (!el) return;
      const r = el.getBoundingClientRect();
      const pin = document.createElement('div');
      pin.className = '__pc_pin' + (c.resolved_at ? ' resolved' : '');
      pin.style.left = r.left + window.scrollX + 'px';
      pin.style.top = r.top + window.scrollY + 'px';
      pin.innerHTML = `<span>${c.id}</span>`;
      pin.title = `${c.author_name || 'anonymous'}: ${c.body}`;
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        showOutline(el);
        setTimeout(hideOutline, 1500);
        // Open the panel if minimized, then highlight the matching comment row.
        if (state.panelMinimized) {
          state.panelMinimized = false;
          try { localStorage.setItem('__pc_panel_min', '0'); } catch (_) {}
          renderPanel();
        }
        highlightCommentItem(c.id);
      });
      document.body.appendChild(pin);
    });
  }

  // ---------------------------------------------------------------------------
  // Comment popover (when adding new)
  // ---------------------------------------------------------------------------
  function openPopover(el) {
    closePopover();
    state.pendingEl = el;
    const r = el.getBoundingClientRect();

    popoverEl = document.createElement('div');
    popoverEl.className = '__pc_popover __pc';
    popoverEl.innerHTML = `
      <div class="__pc_popover_target">${escapeHtml(getSnippet(el).slice(0, 60))}</div>
      <textarea placeholder="Leave a comment…" autofocus></textarea>
      <div class="__pc_popover_actions">
        <span class="__pc_kbd">⌘+↵ to save · esc to cancel</span>
        <button class="__pc_btn __pc_btn_primary" data-action="save">Comment</button>
      </div>
    `;
    const top = r.bottom + 8 + window.scrollY;
    const left = Math.min(r.left + window.scrollX, window.innerWidth - 340);
    popoverEl.style.top = top + 'px';
    popoverEl.style.left = Math.max(8, left) + 'px';

    document.body.appendChild(popoverEl);

    const ta = popoverEl.querySelector('textarea');
    setTimeout(() => ta.focus(), 0);

    popoverEl.querySelector('[data-action="save"]').addEventListener('click', saveComment);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePopover();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveComment();
    });
    popoverEl.addEventListener('click', (e) => e.stopPropagation());
    popoverEl.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  function closePopover() {
    if (popoverEl) { popoverEl.remove(); popoverEl = null; }
    state.pendingEl = null;
  }

  async function saveComment() {
    if (!popoverEl || !state.pendingEl) return;
    const body = popoverEl.querySelector('textarea').value.trim();
    if (!body) { closePopover(); return; }
    const el = state.pendingEl;

    closePopover();

    let data;
    try {
      data = await postComment({
        page_path: location.pathname,
        selector: buildSelector(el),
        dom_path: buildShortPath(el),
        snippet: getSnippet(el),
        body,
        author_name: state.authorName,
      });
    } catch (e) {
      console.error('[proto-comments] insert failed', e);
      toast('Failed to save comment');
      return;
    }
    upsertComment(data);
    renderAll();
  }

  // ---------------------------------------------------------------------------
  // Filter + sort
  // ---------------------------------------------------------------------------
  function filteredComments() {
    let list = state.comments.slice();
    if (state.filter === 'unresolved') list = list.filter((c) => !c.resolved_at);
    if (state.filter === 'mine') list = list.filter((c) => c.author_name && c.author_name === state.authorName);
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }

  function upsertComment(c) {
    const idx = state.comments.findIndex((x) => x.id === c.id);
    if (idx >= 0) state.comments[idx] = c;
    else state.comments.push(c);
  }

  function removeComment(id) {
    state.comments = state.comments.filter((c) => c.id !== id);
  }

  // ---------------------------------------------------------------------------
  // Panel (Linear style)
  // ---------------------------------------------------------------------------
  function renderPanel() {
    if (!panelEl) {
      panelEl = document.createElement('div');
      panelEl.className = '__pc_panel __pc';
      document.body.appendChild(panelEl);
      panelEl.addEventListener('click', (e) => e.stopPropagation());
      attachPanelDrag();
    }
    panelEl.classList.toggle('minimized', state.panelMinimized);

    const list = filteredComments();
    const unresolved = state.comments.filter((c) => !c.resolved_at).length;

    const items = list.map((c, i) => {
      const author = c.author_name || emailHandle(c.author_email);
      const isResolved = !!c.resolved_at;
      const safeId = escapeHtml(c.id);
      return `
        <div class="__pc_item ${isResolved ? 'resolved' : ''}" data-id="${safeId}">
          <div class="__pc_item_meta">
            <span class="__pc_item_num ${isResolved ? 'resolved' : ''}">${escapeHtml(c.id)}</span>
            <span class="__pc_item_author">${escapeHtml(author)}</span>
            <span>·</span>
            <span>${escapeHtml(relativeTime(c.created_at))}</span>
            <span class="__pc_panel_spacer"></span>
            <span class="__pc_item_path" title="${escapeHtml(c.page_path)}">${escapeHtml(c.page_path)}</span>
          </div>
          <div class="__pc_item_target">${escapeHtml(c.snippet)}</div>
          <div class="__pc_item_body">${escapeHtml(c.body)}</div>
          <div class="__pc_item_actions">
            <button class="__pc_item_action" data-resolve="${safeId}">${isResolved ? 'Unresolve' : 'Resolve'}</button>
          </div>
        </div>
      `;
    }).join('');

    panelEl.innerHTML = `
      <div class="__pc_panel_header">
        <span class="__pc_panel_title">${escapeHtml(state.project.name)}</span>
        <span class="__pc_panel_count">${unresolved}</span>
        <span class="__pc_panel_spacer"></span>
        <button class="__pc_iconbtn" data-action="minimize" title="${state.panelMinimized ? 'Expand' : 'Minimize'}">
          ${state.panelMinimized ? svgIcon('expand') : svgIcon('minimize')}
        </button>
      </div>
      <div class="__pc_panel_filters">
        ${['unresolved', 'all', 'mine'].map((f) => `
          <button class="__pc_filter ${state.filter === f ? 'active' : ''}" data-filter="${f}">${f[0].toUpperCase() + f.slice(1)}</button>
        `).join('')}
      </div>
      <div class="__pc_panel_body">
        ${list.length ? items : '<div class="__pc_empty">No comments yet.<br/>Click any element to add one.</div>'}
      </div>
      <div class="__pc_panel_footer">
        <button class="__pc_btn __pc_btn_full" data-action="rename" title="Change display name">${escapeHtml(state.authorName || 'Set name')}</button>
        <button class="__pc_btn __pc_btn_full __pc_btn_primary" data-action="copy" ${state.comments.length ? '' : 'disabled'}>Copy markdown</button>
      </div>
    `;

    applyPanelPos();

    panelEl.querySelector('[data-action="minimize"]').addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanelMinimized();
    });
    panelEl.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', (e) => {
      state.filter = b.getAttribute('data-filter');
      renderPanel();
      renderPins();
    }));
    panelEl.querySelectorAll('.__pc_item').forEach((row) => row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      jumpToComment(row.getAttribute('data-id'));
    }));
    panelEl.querySelectorAll('[data-resolve]').forEach((b) => b.addEventListener('click', () => toggleResolve(b.getAttribute('data-resolve'))));
    panelEl.querySelector('[data-action="copy"]')?.addEventListener('click', copyMarkdown);
    panelEl.querySelector('[data-action="rename"]').addEventListener('click', () => promptName(true));
  }

  // Scroll the matching panel item into view and pulse it briefly.
  // Triggered when user clicks a pin to find the corresponding comment.
  function highlightCommentItem(id) {
    // Wait one frame so the panel has finished re-rendering after expand.
    requestAnimationFrame(() => {
      if (!panelEl) return;
      const item = panelEl.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
      if (!item) return;
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      item.classList.add('__pc_highlight');
      setTimeout(() => item.classList.remove('__pc_highlight'), 1600);
    });
  }

  function jumpToComment(id) {
    const c = state.comments.find((x) => x.id === id);
    if (!c) return;
    if (c.page_path !== location.pathname) {
      // different page: navigate, append marker so we can scroll on arrival
      const url = new URL(c.page_path, location.origin);
      url.hash = '__pc=' + id;
      location.href = url.toString();
      return;
    }
    let el = null;
    try { el = document.querySelector(c.selector); } catch (_) {}
    if (!el) { toast('Element not found on this page anymore'); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showOutline(el);
    setTimeout(hideOutline, 1500);
  }

  function consumeJumpHash() {
    const m = location.hash.match(/__pc=([\w-]+)/);
    if (!m) return;
    const id = m[1];
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => jumpToComment(id), 100);
  }

  function togglePanelMinimized() {
    state.panelMinimized = !state.panelMinimized;
    try { localStorage.setItem('__pc_panel_min', state.panelMinimized ? '1' : '0'); } catch (_) {}
    if (state.panelMinimized) { hideOutline(); closePopover(); }
    renderPanel();
    renderPins();
  }

  function applyPanelPos() {
    if (!panelEl) return;
    const r = panelEl.getBoundingClientRect();
    const w = r.width || (state.panelMinimized ? 140 : 340);
    const h = r.height || (state.panelMinimized ? 32 : 200);
    if (state.panelPos) {
      const left = Math.max(8, Math.min(state.panelPos.left, window.innerWidth - w - 8));
      const top = Math.max(8, Math.min(state.panelPos.top, window.innerHeight - h - 8));
      panelEl.style.left = left + 'px';
      panelEl.style.top = top + 'px';
      panelEl.style.right = 'auto';
      panelEl.style.bottom = 'auto';
    } else {
<<<<<<< HEAD
      // Default: top-right with breathing room. Anchored to TOP so when
      // the user clicks to expand, the panel grows downward — not upward
      // (which produced a stretched-tall panel when anchored to bottom).
      panelEl.style.left = 'auto';
      panelEl.style.right = '24px';
      panelEl.style.top = '24px';
      panelEl.style.bottom = 'auto';
=======
      // Default: top-right. Always reset on refresh — saved positions are
      // intentionally not restored (see localStorage load logic).
      panelEl.style.left = 'auto';
      panelEl.style.right = '16px';
      panelEl.style.top = '16px';
>>>>>>> landing-review
    }
  }

  function attachPanelDrag() {
    let startX = 0, startY = 0, origLeft = 0, origTop = 0, moved = false, dragging = false;

    const onDown = (e) => {
      // ignore drags from inner buttons
      if (e.target.closest('button')) return;
      // when expanded, only drag from header
      if (!state.panelMinimized && !e.target.closest('.__pc_panel_header')) return;
      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY;
      const r = panelEl.getBoundingClientRect();
      origLeft = r.left; origTop = r.top;
      panelEl.classList.add('__pc_dragging');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
      e.stopPropagation();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      const left = Math.max(0, Math.min(origLeft + dx, window.innerWidth - panelEl.offsetWidth));
      const top = Math.max(0, Math.min(origTop + dy, window.innerHeight - panelEl.offsetHeight));
      panelEl.style.left = left + 'px';
      panelEl.style.top = top + 'px';
      panelEl.style.right = 'auto';
    };
    const onUp = (e) => {
      dragging = false;
      panelEl.classList.remove('__pc_dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (moved) {
        const r = panelEl.getBoundingClientRect();
        state.panelPos = { left: r.left, top: r.top };
        try { localStorage.setItem('__pc_panel_pos', JSON.stringify(state.panelPos)); } catch (_) {}
      } else if (state.panelMinimized) {
        // a click without drag on the minimized pill expands the panel
        togglePanelMinimized();
      }
    };
    panelEl.addEventListener('mousedown', onDown);
  }

  function svgIcon(kind) {
    if (kind === 'minimize') return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 8h10"/></svg>`;
    if (kind === 'expand') return `<span style="font-size:11px;font-weight:500;letter-spacing:0.01em;padding:0 4px;">${escapeHtml(pillLabel)}</span>`;
    return '';
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  async function toggleResolve(id) {
    const c = state.comments.find((x) => x.id === id);
    if (!c) return;
    const newResolved = !c.resolved_at;
    try {
      const updated = await patchComment(id, newResolved);
      c.resolved_at = updated.resolved_at;
      renderAll();
    } catch (e) {
      toast('Failed to update');
    }
  }

  function buildMarkdown() {
    const list = state.comments.filter((c) => !c.resolved_at)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const lines = [`# ${state.project.name} — ${list.length} comment${list.length === 1 ? '' : 's'}`, ''];
    list.forEach((c, i) => {
      const body = c.body.split('\n').map((l, idx) => idx === 0 ? l : '   ' + l).join('\n');
      const who = c.author_name ? ` — ${c.author_name}` : '';
      lines.push(`${i + 1}. ${body}${who}`);
      lines.push('   `' + c.selector + '` · ' + c.page_path);
      lines.push('');
    });
    return lines.join('\n').trimEnd();
  }

  function copyMarkdown() {
    const md = buildMarkdown();
    navigator.clipboard.writeText(md).then(
      () => toast(`Copied ${state.comments.filter((c) => !c.resolved_at).length} unresolved comments`),
      () => toast('Copy failed'),
    );
  }

  // ---------------------------------------------------------------------------
  // Display name capture (no auth)
  // ---------------------------------------------------------------------------
  function promptName(force) {
    if (authEl) return;
    if (!force && state.authorName) return;
    authEl = document.createElement('div');
    authEl.className = '__pc_auth __pc';
    authEl.innerHTML = `
      <h3>${escapeHtml(state.project?.name || 'Leave a comment')}</h3>
      <p>What should we show next to your comments?</p>
      <input type="text" placeholder="Your name" maxlength="64" autofocus value="${escapeHtml(state.authorName || '')}" />
      <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:8px;">
        ${force ? '<button class="__pc_btn" data-action="cancel">Cancel</button>' : ''}
        <button class="__pc_btn __pc_btn_primary" data-action="save">Save</button>
      </div>
    `;
    document.body.appendChild(authEl);
    authEl.addEventListener('click', (e) => e.stopPropagation());
    const input = authEl.querySelector('input');
    setTimeout(() => { input.focus(); input.select(); }, 0);
    const save = () => {
      const name = (input.value || '').trim().slice(0, 64);
      if (!name) { input.focus(); return; }
      state.authorName = name;
      // Don't persist in ephemeral mode (demo) — name vanishes on refresh.
      if (!ephemeral) {
        try { localStorage.setItem('__pc_name', name); } catch (_) {}
      }
      authEl.remove(); authEl = null;
      renderPanel();
    };
    authEl.querySelector('[data-action="save"]').addEventListener('click', save);
    authEl.querySelector('[data-action="cancel"]')?.addEventListener('click', () => { authEl.remove(); authEl = null; });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape' && force) { authEl.remove(); authEl = null; }
    });
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------
  function onMouseMove(e) {
    if (!state.active || state.panelMinimized || state.pendingEl) return;
    const el = e.target;
    if (!el || isOverlayChrome(el)) { hideOutline(); return; }
    state.hoveredEl = el;
    showOutline(el);
  }

  function onClick(e) {
    if (!state.active || state.panelMinimized) return;
    const el = e.target;
    if (!el || isOverlayChrome(el)) return;
    e.preventDefault();
    e.stopPropagation();
    hideOutline();
    if (!state.authorName) { promptName(true); return; }
    openPopover(el);
  }

  function onKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      state.active = !state.active;
      if (!state.active) { hideOutline(); closePopover(); }
      toast(state.active ? 'Comments on' : 'Comments off');
    }
    if (e.key === 'Escape' && popoverEl) closePopover();
  }

  // rAF-throttle scroll/resize. On resize, also re-clamp the panel position so
  // it stays in viewport (e.g., dragging from external monitor to laptop).
  let rafQueued = false;
  function onScrollOrResize(e) {
    if (rafQueued) return;
    rafQueued = true;
    requestAnimationFrame(() => {
      rafQueued = false;
      renderPins();
      if (e && e.type === 'resize') applyPanelPos();
    });
  }

  // SPA route changes: re-render pins/panel when the path changes without a full reload.
  // We patch history.pushState/replaceState to fire a custom event, and also listen for popstate.
  function watchRouteChanges() {
    const fire = () => window.dispatchEvent(new Event('__pc_route'));
    ['pushState', 'replaceState'].forEach((m) => {
      const orig = history[m];
      history[m] = function () { const r = orig.apply(this, arguments); fire(); return r; };
    });
    window.addEventListener('popstate', fire);
    let lastPath = location.pathname;
    window.addEventListener('__pc_route', () => {
      if (location.pathname === lastPath) return;
      lastPath = location.pathname;
      closePopover();
      renderAll();
    });
  }


  // ---------------------------------------------------------------------------
  // Render everything that depends on data
  // ---------------------------------------------------------------------------
  function renderAll() {
    renderPanel();
    renderPins();
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  async function boot() {
    injectStyles();

    let config;
    try { config = await fetchConfig(); }
    catch (e) {
      console.error('[proto-comments]', e);
      return;
    }
    state.project = config.project;
    state.comments = config.comments || [];

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    watchRouteChanges();

    renderAll();
    consumeJumpHash();

    // Self-check: confirm panel is actually in the viewport. If not, the saved
    // position must have been clamped to a bad spot OR the user's window has
    // changed. Force-reset to bottom-center default and re-render.
    setTimeout(() => {
      if (!panelEl) return;
      const r = panelEl.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0
        && r.right > 0 && r.bottom > 0
        && r.left < window.innerWidth
        && r.top < window.innerHeight;
      if (!visible) {
        console.warn('[proto-comments] panel rendered off-screen, resetting position');
        state.panelPos = null;
        try { localStorage.removeItem('__pc_panel_pos'); } catch (_) {}
        applyPanelPos();
      } else {
        console.log('[proto-comments] ready —', state.comments.length, 'comments,', state.panelMinimized ? 'minimized' : 'expanded', 'at', Math.round(r.left) + ',' + Math.round(r.top));
      }
    }, 200);
    startPolling();
  }

  function startPolling() {
    let lastPoll = new Date().toISOString();
    let inFlight = false;
    setInterval(async () => {
      if (inFlight) return;
      if (document.hidden) return;
      inFlight = true;
      try {
        const { comments: fresh } = await pollSince(lastPoll);
        lastPoll = new Date().toISOString();
        if (fresh && fresh.length) {
          fresh.forEach((c) => upsertComment(c));
          renderAll();
        }
      } catch (_) { /* ignore */ }
      inFlight = false;
    }, 5000);
  }

  window.__protoComments = { state, boot };
  boot();
})();
