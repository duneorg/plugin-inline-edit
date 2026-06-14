/// <reference lib="dom" />
/**
 * Bubble formatting toolbar for the inline body editor.
 *
 * Usage:
 *   const menu = buildBubbleMenu();
 *   // Pass menu.element to BubbleMenu.configure({ element }) when creating
 *   // the TipTap editor, and use menu.inUrlMode in shouldShow.
 *   // After the editor is created call menu.wire(editor) to attach handlers
 *   // and get the syncActiveStates function.
 */

import type { Editor } from "@tiptap/core";

// ── DOM helpers ───────────────────────────────────────────────────────────────

function btn(html: string, title: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "dbm-btn";
  b.title = title;
  b.innerHTML = html;
  return b;
}

function sep(): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "dbm-sep";
  return s;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface BubbleMenu {
  /** Pass to BubbleMenu.configure({ element }). */
  element: HTMLDivElement;
  /**
   * Returns true while the URL-input sub-view is open. Use in shouldShow
   * so the menu stays visible while the user types a link/image URL even
   * though editor focus is momentarily elsewhere.
   */
  inUrlMode: () => boolean;
  /**
   * Wire click handlers and begin active-state tracking. Call once after
   * the TipTap editor has been created.
   */
  wire: (editor: Editor) => { syncActiveStates: () => void };
  /** Remove the element from the DOM (call in editor destroy). */
  destroy: () => void;
}

export function buildBubbleMenu(): BubbleMenu {
  const el = document.createElement("div");
  el.className = "dune-bubble-menu";
  document.body.appendChild(el);

  // ── Formatting bar ──────────────────────────────────────────────────────────
  const bar = document.createElement("div");
  bar.className = "dbm-bar";

  const boldBtn = btn("<b>B</b>", "Bold");
  const italicBtn = btn("<i>I</i>", "Italic");
  const strikeBtn = btn("<s>S</s>", "Strikethrough");
  const codeBtn = btn("&grave;", "Inline code");

  const h1Btn = btn("H<sub>1</sub>", "Heading 1");
  const h2Btn = btn("H<sub>2</sub>", "Heading 2");
  const h3Btn = btn("H<sub>3</sub>", "Heading 3");

  const ulBtn = btn("•", "Bullet list");
  const olBtn = btn("1.", "Ordered list");
  const taskBtn = btn("&#9744;", "Task list");
  const quoteBtn = btn("&#10077;", "Blockquote");
  const codeBlockBtn = btn("{}", "Code block");

  const linkBtn = btn("&#128279;", "Link");

  bar.append(
    boldBtn, italicBtn, strikeBtn, codeBtn,
    sep(),
    h1Btn, h2Btn, h3Btn,
    sep(),
    ulBtn, olBtn, taskBtn, quoteBtn, codeBlockBtn,
    sep(),
    linkBtn,
  );

  // ── URL input sub-view (shared for Link and Image) ──────────────────────────
  const urlView = document.createElement("div");
  urlView.className = "dbm-url-view";
  urlView.style.display = "none";

  const urlLabel = document.createElement("span");
  urlLabel.className = "dbm-url-label";

  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.className = "dbm-url-input";

  const urlConfirmBtn = btn("&#10003;", "Apply");
  const urlRemoveBtn = btn("&#10005;", "Remove");
  const urlCancelBtn = btn("&#8592;", "Cancel");

  urlView.append(urlLabel, urlInput, urlConfirmBtn, urlRemoveBtn, urlCancelBtn);

  el.append(bar, urlView);

  // ── URL mode state ──────────────────────────────────────────────────────────
  let urlMode: "link" | null = null;

  function showUrlView(existingValue: string): void {
    urlMode = "link";
    bar.style.display = "none";
    urlView.style.display = "flex";
    urlLabel.textContent = "URL:";
    urlInput.placeholder = "https://…";
    urlInput.value = existingValue;
    urlInput.focus();
    urlInput.select();
  }

  function hideUrlView(): void {
    urlMode = null;
    urlView.style.display = "none";
    bar.style.display = "flex";
  }

  // ── Wire ───────────────────────────────────────────────────────────────────

  function wire(editor: Editor): { syncActiveStates: () => void } {
    function applyUrl(): void {
      const url = urlInput.value.trim();
      if (url) editor.chain().focus().setLink({ href: url }).run();
      hideUrlView();
    }

    // Formatting buttons
    boldBtn.addEventListener("click", () => editor.chain().focus().toggleBold().run());
    italicBtn.addEventListener("click", () => editor.chain().focus().toggleItalic().run());
    strikeBtn.addEventListener("click", () => editor.chain().focus().toggleStrike().run());
    codeBtn.addEventListener("click", () => editor.chain().focus().toggleCode().run());
    h1Btn.addEventListener("click", () => editor.chain().focus().toggleHeading({ level: 1 }).run());
    h2Btn.addEventListener("click", () => editor.chain().focus().toggleHeading({ level: 2 }).run());
    h3Btn.addEventListener("click", () => editor.chain().focus().toggleHeading({ level: 3 }).run());
    ulBtn.addEventListener("click", () => editor.chain().focus().toggleBulletList().run());
    olBtn.addEventListener("click", () => editor.chain().focus().toggleOrderedList().run());
    taskBtn.addEventListener("click", () => editor.chain().focus().toggleTaskList().run());
    quoteBtn.addEventListener("click", () => editor.chain().focus().toggleBlockquote().run());
    codeBlockBtn.addEventListener("click", () => editor.chain().focus().toggleCodeBlock().run());

    // Link — switch to URL input view
    linkBtn.addEventListener("click", () => {
      showUrlView(editor.getAttributes("link").href ?? "");
    });

    // URL view buttons
    urlConfirmBtn.addEventListener("click", applyUrl);
    urlRemoveBtn.addEventListener("click", () => {
      if (urlMode === "link") editor.chain().focus().unsetLink().run();
      hideUrlView();
    });
    urlCancelBtn.addEventListener("click", () => {
      hideUrlView();
      editor.commands.focus();
    });

    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); applyUrl(); }
      if (e.key === "Escape") { hideUrlView(); editor.commands.focus(); }
    });

    // Active-state tracking
    function syncActiveStates(): void {
      boldBtn.classList.toggle("is-active", editor.isActive("bold"));
      italicBtn.classList.toggle("is-active", editor.isActive("italic"));
      strikeBtn.classList.toggle("is-active", editor.isActive("strike"));
      codeBtn.classList.toggle("is-active", editor.isActive("code"));
      h1Btn.classList.toggle("is-active", editor.isActive("heading", { level: 1 }));
      h2Btn.classList.toggle("is-active", editor.isActive("heading", { level: 2 }));
      h3Btn.classList.toggle("is-active", editor.isActive("heading", { level: 3 }));
      ulBtn.classList.toggle("is-active", editor.isActive("bulletList"));
      olBtn.classList.toggle("is-active", editor.isActive("orderedList"));
      taskBtn.classList.toggle("is-active", editor.isActive("taskList"));
      quoteBtn.classList.toggle("is-active", editor.isActive("blockquote"));
      codeBlockBtn.classList.toggle("is-active", editor.isActive("codeBlock"));
      linkBtn.classList.toggle("is-active", editor.isActive("link"));
    }

    return { syncActiveStates };
  }

  return {
    element: el,
    inUrlMode: () => urlMode !== null,
    wire,
    destroy: () => el.remove(),
  };
}
