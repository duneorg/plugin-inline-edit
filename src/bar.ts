/**
 * Admin bar injection — annotates HTML responses with edit-mode attributes
 * and injects the admin toolbar + auto-overlay client script.
 *
 * Two passes run on the rendered HTML:
 *
 *   1. **Annotation pass** — adds `data-dune-field` / `data-dune-editable`
 *      attributes so the auto-overlay client script can activate inline
 *      editors. The page title is detected heuristically (first `<h1>`);
 *      the body is annotated only on the element the theme explicitly marks
 *      with `data-dune-body` — there is no body-detection heuristic, because
 *      a wrong guess round-trips template-generated HTML into the markdown
 *      source on save. Elements with `data-dune-no-edit` are skipped.
 *      Elements already carrying `data-dune-*` attributes (written by hand
 *      or rendered by the `@dune/core/ui/editable` marker components) are
 *      left untouched.
 *
 *   2. **Injection pass** — appends the admin bar HTML + overlay client
 *      script before `</body>`.  The script is self-contained vanilla JS;
 *      the TipTap/Y.js editor bundle (built by core from this plugin's
 *      `clientEntries`, served at /plugins/inline-edit/editor.js) is
 *      lazy-imported only when a body edit starts, so browsing costs nothing.
 */

// ── HTML annotation pass ──────────────────────────────────────────────────────

/**
 * Annotate editable page elements with `data-dune-*` attributes so the
 * auto-overlay client script can activate inline editors.
 *
 * Rules:
 * - Skip any element that already has a `data-dune-field` / `data-dune-editable`
 *   attribute (component kit) or `data-dune-no-edit`.
 * - `<h1>` → title field annotation (first occurrence only).
 * - The first element carrying `data-dune-body` → body annotation. Themes opt
 *   in by placing this attribute on the element that wraps the rendered
 *   markdown body (the starter template does this by default). Without the
 *   marker, body editing is unavailable for the page.
 */
export function annotateEditableElements(html: string, sourcePath: string): string {
  const src = `data-dune-source="${escapeAttr(sourcePath)}"`;

  let annotated = html.replace(
    /(<h1\b)([^>]*?>)/,
    (_match, tag, rest) => {
      if (rest.includes("data-dune-")) return _match;
      return `${tag} data-dune-field="title" ${src}${rest}`;
    },
  );

  let bodyAnnotated = false;
  annotated = annotated.replace(
    /<[a-zA-Z][a-zA-Z0-9-]*\b[^>]*\bdata-dune-body\b[^>]*>/g,
    (match) => {
      if (bodyAnnotated) return match;
      if (match.includes("data-dune-editable") || match.includes("data-dune-no-edit")) return match;
      bodyAnnotated = true;
      const sourceAttr = match.includes("data-dune-source") ? "" : ` ${src}`;
      return match.replace(/>$/, ` data-dune-editable="body"${sourceAttr}>`);
    },
  );

  return annotated;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonStr(s: string): string {
  return JSON.stringify(s).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

// ── Admin bar HTML + auto-overlay script ─────────────────────────────────────

export function buildAdminBarHtml(opts: {
  sourcePath: string;
  pageTitle: string | null;
  adminPrefix: string;
  userName: string;
}): string {
  const { sourcePath, pageTitle, adminPrefix, userName } = opts;
  const encodedPath = encodeURIComponent(sourcePath);
  const adminPageUrl = `${adminPrefix}/pages/${encodedPath}`;
  const commitUrl = `${adminPrefix}/api/content/${encodedPath}/commit`;
  const fieldsUrl = `${adminPrefix}/api/content/${encodedPath}/fields`;

  return `
<style>
  #dune-admin-bar {
    position: fixed; top: 0; left: 0; right: 0; height: 40px;
    background: #1a1a2e; color: #fff;
    display: flex; align-items: center; gap: 10px;
    padding: 0 16px; z-index: 99999;
    font: 13px/1 system-ui, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,.35);
  }
  #dune-admin-bar .dune-ab-brand { font-weight: 700; color: #e2b96f; letter-spacing: .04em; }
  #dune-admin-bar .dune-ab-title {
    flex: 1; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; opacity: .7; max-width: 320px;
  }
  #dune-admin-bar button {
    border: none; border-radius: 4px; padding: 3px 12px;
    font-size: 12px; cursor: pointer;
  }
  #dune-ab-edit-toggle { background: #3498db; color: #fff; }
  #dune-ab-save { background: #27ae60; color: #fff; }
  #dune-ab-save:disabled { opacity: .6; cursor: default; }
  #dune-admin-bar .dune-ab-escape {
    color: rgba(255,255,255,.55); text-decoration: none;
    font-size: 12px; margin-left: auto;
  }
  #dune-admin-bar .dune-ab-user { font-size: 11px; opacity: .5; }
  body { padding-top: 40px !important; }

  /* Marker hover indicators (active when edit mode is on).
     Activation happens via the floating ✎ handle, never by clicking the
     content itself, so links inside editable regions stay followable. */
  body.dune-edit-mode [data-dune-field]:not([contenteditable="true"]):hover {
    outline: 2px dashed rgba(52,152,219,.5); outline-offset: 2px;
  }
  [data-dune-field][contenteditable="true"] {
    outline: 2px solid #3498db !important; outline-offset: 2px; border-radius: 2px;
  }
  body.dune-edit-mode [data-dune-editable="body"]:not(.dune-body-editing):hover {
    outline: 2px dashed rgba(52,152,219,.35); outline-offset: 4px;
  }

  /* Floating edit handle — repositioned to the hovered editable element */
  #dune-ao-edit-handle {
    position: absolute; display: none;
    background: #3498db; color: #fff;
    border: none; border-radius: 4px;
    padding: 3px 10px; font-size: 11px; cursor: pointer;
    box-shadow: 0 1px 4px rgba(0,0,0,.3); z-index: 99998;
  }

  /* Body editing: hide the rendered content while the TipTap editor is mounted */
  .dune-body-editing > :not(.dune-ao-editor-wrap) { display: none !important; }
  .dune-tiptap-editor {
    min-height: 200px; padding: 12px; background: #fff;
    border: 1px solid #3498db; border-radius: 4px;
  }
  .dune-tiptap-editor .ProseMirror { outline: none; }

  /* Floating sticky toolbar shown while body editing is active */
  .dune-ao-body-toolbar {
    height: 0; overflow: visible; position: sticky; top: 50px;
    text-align: right; pointer-events: none; z-index: 1001;
  }
  .dune-ao-body-toolbar-inner {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; pointer-events: all;
    background: #1a1a2e; border-radius: 0 0 6px 6px; font-size: 12px;
  }
  .dune-ao-body-toolbar button {
    border: none; border-radius: 4px; padding: 3px 10px;
    font-size: 12px; cursor: pointer; color: #fff;
  }
  .dune-status-saved { color: #2ecc71; }
  .dune-status-error { color: #e74c3c; }
</style>
<div id="dune-admin-bar">
  <span class="dune-ab-brand">✦ DUNE</span>
  <span class="dune-ab-title">${escapeHtml(pageTitle ?? sourcePath)}</span>
  <button id="dune-ab-edit-toggle">✎ Editing</button>
  <button id="dune-ab-save">Save</button>
  <a href="${adminPageUrl}" class="dune-ab-escape" title="Open full admin editor">Open in admin →</a>
  <span class="dune-ab-user">${escapeHtml(userName)}</span>
</div>
<script>
(function() {
  'use strict';

  // ── Globals ──────────────────────────────────────────────────────────────────
  window.__DUNE_EDIT_MODE__ = true;
  window.__DUNE_EDIT_SOURCE_PATH__ = ${jsonStr(sourcePath)};
  window.__DUNE_COMMIT_URL__ = ${jsonStr(commitUrl)};
  window.__DUNE_FIELDS_URL__ = ${jsonStr(fieldsUrl)};
  window.__DUNE_SOURCE_URL__ = ${jsonStr(commitUrl.replace("/commit", "/source"))};
  window.__DUNE_USER_NAME__ = ${jsonStr(userName)};
  window.__DUNE_EDIT_WS_PATH__ = ${jsonStr(`${adminPrefix}/collab/edit-ws`)};

  var editMode = true;
  document.body.classList.add('dune-edit-mode');

  // ── Admin bar buttons ─────────────────────────────────────────────────────────
  var saveBtn = document.getElementById('dune-ab-save');
  var toggleBtn = document.getElementById('dune-ab-edit-toggle');

  toggleBtn.addEventListener('click', function() {
    editMode = !editMode;
    window.__DUNE_EDIT_MODE__ = editMode;
    toggleBtn.textContent = editMode ? '✎ Editing' : '👁 Preview';
    toggleBtn.style.background = editMode ? '#3498db' : 'rgba(255,255,255,.15)';
    toggleBtn.style.border = editMode ? 'none' : '1px solid rgba(255,255,255,.2)';
    document.body.classList.toggle('dune-edit-mode', editMode);
    if (!editMode) hideHandle();
    window.dispatchEvent(new CustomEvent('dune:edit-mode-change', { detail: { mode: editMode ? 'edit' : 'preview' } }));
  });

  saveBtn.addEventListener('click', async function() {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      var res = await fetch(window.__DUNE_COMMIT_URL__, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      saveBtn.textContent = res.ok ? 'Saved ✓' : 'Error ✗';
      saveBtn.style.background = res.ok ? '#2ecc71' : '#e74c3c';
      setTimeout(function() {
        saveBtn.textContent = 'Save';
        saveBtn.style.background = '#27ae60';
        saveBtn.disabled = false;
      }, 2000);
    } catch(e) {
      saveBtn.textContent = 'Error ✗';
      saveBtn.style.background = '#e74c3c';
      saveBtn.disabled = false;
    }
  });

  // ── Auto-overlay activation ───────────────────────────────────────────────────

  function patchField(fieldName, newValue) {
    return fetch(window.__DUNE_FIELDS_URL__, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [fieldName]: newValue } })
    });
  }

  var DEBOUNCE_MS = 600;

  function debounce(fn, ms) {
    var t;
    return function() {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function() { fn.apply(null, args); }, ms);
    };
  }

  // ── Floating edit handle ──────────────────────────────────────────────────
  // One shared ✎ button repositioned to whichever editable element is
  // hovered. Editing only starts when the handle is clicked — clicks on the
  // content itself (including links) behave exactly as for visitors.

  var handle = document.createElement('button');
  handle.id = 'dune-ao-edit-handle';
  handle.type = 'button';
  handle.textContent = '✎ Edit';
  document.body.appendChild(handle);
  var handleTarget = null;

  function showHandle(el) {
    handleTarget = el;
    var r = el.getBoundingClientRect();
    handle.style.top = (window.scrollY + r.top - 10) + 'px';
    handle.style.left = Math.max(0, window.scrollX + r.right - 56) + 'px';
    handle.style.display = 'block';
  }

  function hideHandle() {
    handleTarget = null;
    handle.style.display = 'none';
  }

  document.addEventListener('mouseover', function(e) {
    if (!editMode) { hideHandle(); return; }
    if (e.target === handle) return;
    var el = e.target.closest && e.target.closest('[data-dune-field], [data-dune-editable="body"]');
    if (el && el.contentEditable !== 'true' && !el.dataset.duneEditing) {
      showHandle(el);
    } else if (handleTarget && !handleTarget.contains(e.target)) {
      hideHandle();
    }
  });

  handle.addEventListener('click', function() {
    if (!handleTarget) return;
    var el = handleTarget;
    hideHandle();
    if (el.dataset.duneEditable === 'body') startBodyEditing(el);
    else startFieldEditing(el);
  });

  function startFieldEditing(el) {
    if (el.contentEditable === 'true') return;

    if (!el.dataset.duneAoActive) {
      el.dataset.duneAoActive = '1';
      var fieldName = el.dataset.duneField;

      var saveDebounced = debounce(function(value) {
        patchField(fieldName, value).catch(function() {});
      }, DEBOUNCE_MS);

      el.addEventListener('input', function() {
        if (el.contentEditable === 'true') saveDebounced(el.textContent);
      });

      el.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          el.contentEditable = 'false';
          el.textContent = el.dataset.duneAoOriginal || '';
        }
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      });

      el.addEventListener('blur', function() {
        if (el.contentEditable !== 'true') return;
        el.contentEditable = 'false';
        el.dataset.duneAoOriginal = el.textContent;
      });
    }

    el.dataset.duneAoOriginal = el.textContent;
    el.contentEditable = 'true';
    el.focus();
  }

  // ── Body editing — TipTap WYSIWYG over the markdown source ────────────────
  //
  // The markdown source is fetched from the server and edited in TipTap with
  // the tiptap-markdown extension; on save, TipTap serialises back to
  // markdown and the exact string is written via PATCH __body + commit.
  // No HTML-to-markdown reconstruction happens anywhere.

  function startBodyEditing(editEl) {
    if (editEl.dataset.duneEditing) return;
    editEl.dataset.duneEditing = '1';

    var toolbar = document.createElement('div');
    toolbar.className = 'dune-ao-body-toolbar';
    var toolbarInner = document.createElement('div');
    toolbarInner.className = 'dune-ao-body-toolbar-inner';
    var saveBodyBtn = document.createElement('button');
    saveBodyBtn.textContent = 'Save';
    saveBodyBtn.style.background = '#27ae60';
    var cancelBodyBtn = document.createElement('button');
    cancelBodyBtn.textContent = 'Cancel';
    cancelBodyBtn.style.background = 'rgba(255,255,255,.15)';
    var statusSpan = document.createElement('span');
    statusSpan.style.cssText = 'color:#fff;font-size:11px;margin-left:4px;';
    statusSpan.textContent = 'Loading editor…';
    toolbarInner.appendChild(saveBodyBtn);
    toolbarInner.appendChild(cancelBodyBtn);
    toolbarInner.appendChild(statusSpan);
    toolbar.appendChild(toolbarInner);

    var editorWrap = document.createElement('div');
    editorWrap.className = 'dune-ao-editor-wrap';
    var editorMount = document.createElement('div');
    editorMount.className = 'dune-tiptap-editor';
    editorWrap.appendChild(toolbar);
    editorWrap.appendChild(editorMount);

    var editor = null;

    function deactivate() {
      if (editor) { editor.destroy(); editor = null; }
      if (editorWrap.parentNode) editorWrap.parentNode.removeChild(editorWrap);
      editEl.classList.remove('dune-body-editing');
      delete editEl.dataset.duneEditing;
    }

    cancelBodyBtn.addEventListener('click', deactivate);

    saveBodyBtn.addEventListener('click', async function() {
      if (!editor) return;
      saveBodyBtn.disabled = true;
      saveBodyBtn.textContent = 'Saving…';
      try {
        if (editor.isConnected()) {
          // Collab path: write local changes into the shared Y.js doc, give
          // the update a moment to reach the server (fire-and-forget wire
          // protocol, no ack), then commit — the server persists the doc.
          editor.flushToDoc();
          await new Promise(function(r) { setTimeout(r, 300); });
        } else {
          // Standalone path: write the markdown directly via the fields API.
          var pr = await fetch(window.__DUNE_FIELDS_URL__, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { __body: editor.getMarkdown() } })
          });
          if (!pr.ok) throw new Error('patch failed: ' + pr.status);
        }
        var cr = await fetch(window.__DUNE_COMMIT_URL__, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' }, body: '{}'
        });
        if (!cr.ok) throw new Error('commit failed: ' + cr.status);
        statusSpan.textContent = 'Saved ✓';
        statusSpan.className = 'dune-status-saved';
        setTimeout(function() { location.reload(); }, 800);
      } catch(err) {
        statusSpan.textContent = String(err && err.message || err);
        statusSpan.className = 'dune-status-error';
        saveBodyBtn.disabled = false;
        saveBodyBtn.textContent = 'Save';
      }
    });

    // Show the toolbar immediately (loading state), then load the bundled
    // editor module (served from /plugins/inline-edit/editor.js, built by
    // core from this plugin's clientEntries) and the markdown source.
    editEl.insertBefore(editorWrap, editEl.firstChild);
    editEl.classList.add('dune-body-editing');

    var peersSpan = document.createElement('span');
    peersSpan.style.cssText = 'color:#9fd3ff;font-size:11px;margin-left:8px;';
    toolbarInner.appendChild(peersSpan);

    Promise.all([
      import('/plugins/inline-edit/editor.js'),
      fetch(window.__DUNE_SOURCE_URL__, { credentials: 'include' })
        .then(function(res) {
          if (!res.ok) throw new Error('source fetch failed: ' + res.status);
          return res.json();
        })
    ]).then(function(loaded) {
      var mod = loaded[0];
      var data = loaded[1];
      if (!data || typeof data.body !== 'string') throw new Error('no markdown source');
      var wsProto = location.protocol === 'https:' ? 'wss://' : 'ws://';
      var sourcePath = window.__DUNE_EDIT_SOURCE_PATH__;
      editor = mod.mountBodyEditor({
        element: editorMount,
        wsUrl: wsProto + location.host + window.__DUNE_EDIT_WS_PATH__ +
          '?path=' + encodeURIComponent(sourcePath),
        fallbackMarkdown: data.body,
        userName: window.__DUNE_USER_NAME__ || 'Editor',
        onPeersChange: function(peers) {
          peersSpan.textContent = peers.length
            ? '\u{1F465} ' + peers.map(function(p) { return p.name; }).join(', ')
            : '';
        },
        onConnection: function(connected) {
          statusSpan.textContent = connected ? '' : 'offline';
        }
      });
      return editor.ready;
    }).then(function() {
      statusSpan.textContent = '';
      editorMount.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') deactivate();
      });
    }).catch(function(err) {
      statusSpan.textContent = String(err && err.message || err);
      statusSpan.className = 'dune-status-error';
      saveBodyBtn.disabled = true;
    });
  }

  function checkBodyMarker() {
    if (!document.querySelector('[data-dune-editable="body"]')) {
      console.info('[dune] Inline body editing unavailable: no element with data-dune-body found. Add data-dune-body to the element wrapping the rendered page body in your template.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkBodyMarker);
  } else {
    checkBodyMarker();
  }

})();
</script>`;
}

// ── Response injection ────────────────────────────────────────────────────────

/**
 * Annotate editable elements and inject the admin bar into an HTML response.
 * Returns the original response unchanged if it is not an HTML response.
 */
export async function injectAdminBar(
  response: Response,
  opts: {
    sourcePath: string;
    pageTitle: string | null;
    adminPrefix: string;
    userName: string;
  },
): Promise<Response> {
  if (!response.body) return response;

  const bodyBytes = await response.arrayBuffer();
  let html = new TextDecoder().decode(bodyBytes);

  html = annotateEditableElements(html, opts.sourcePath);

  const barHtml = buildAdminBarHtml(opts);
  if (html.includes("</body>")) {
    html = html.replace("</body>", `${barHtml}</body>`);
  } else if (html.includes("</html>")) {
    html = html.replace("</html>", `${barHtml}</html>`);
  } else {
    html = html + barHtml;
  }

  const encoded = new TextEncoder().encode(html);
  const headers = new Headers(
    [...response.headers.entries()].filter(
      ([k]) => k.toLowerCase() !== "content-length",
    ),
  );
  headers.set("Content-Length", String(encoded.byteLength));

  return new Response(encoded, { status: response.status, headers });
}
