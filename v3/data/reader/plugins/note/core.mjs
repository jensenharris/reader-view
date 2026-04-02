/**
    Reader View - Strips away clutter

    Copyright (C) 2014-2022 [@rNeomy]

    This program is free software: you can redistribute it and/or modify
    it under the terms of the Mozilla Public License as published by
    the Mozilla Foundation, either version 2 of the License, or
    (at your option) any later version.
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    Mozilla Public License for more details.
    You should have received a copy of the Mozilla Public License
    along with this program.  If not, see {https://www.mozilla.org/en-US/MPL/}.

    GitHub: https://github.com/rNeomy/reader-view/
    Homepage: https://webextension.org/listing/chrome-reader-view.html
*/

/* global iframe, args, ready */

const PALETTE = [
  {bg: '#FFF5CA', color: '#5C5017', dot: '#E9DD98'},
  {bg: '#FFE5DB', color: '#6B3324', dot: '#EEC8BC'},
  {bg: '#FFDAEA', color: '#6B2445', dot: '#EEBBD2'},
  {bg: '#F0E2FF', color: '#3D2266', dot: '#DCC8EE'},
  {bg: '#DAEDFF', color: '#1A3A5C', dot: '#BDD6EE'},
  {bg: '#D4F5EA', color: '#1A4D3A', dot: '#B4DDCC'},
  {bg: '#E0ECD0', color: '#344A1F', dot: '#C8D8B4'},
  {bg: '#F5F5F5', color: '#3A3A3A', dot: '#DADADA'}
];

// Highlighter background colors - saturated marker-style colors corresponding to PALETTE
const HIGHLIGHT_COLORS = [
  {bg: '#ffff81', label: 'Yellow'},
  {bg: '#ffb3b3', label: 'Red'},
  {bg: '#ffb3d9', label: 'Pink'},
  {bg: '#d9b3ff', label: 'Purple'},
  {bg: '#b3d9ff', label: 'Blue'},
  {bg: '#b3ffcc', label: 'Green'},
  {bg: '#d6f5a0', label: 'Lime'},
  {bg: '#e0e0e0', label: 'Gray'}
];

// Text colors - richer tones derived from PALETTE text colors
const TEXT_COLORS = [
  {color: '#5C5017', label: 'Dark Yellow'},
  {color: '#c0392b', label: 'Red'},
  {color: '#8e44ad', label: 'Purple'},
  {color: '#2980b9', label: 'Blue'},
  {color: '#27ae60', label: 'Green'},
  {color: '#d35400', label: 'Orange'},
  {color: '#2c3e50', label: 'Dark'},
  {color: '#7f8c8d', label: 'Gray'}
];

const FONT_SIZES = [11, 12, 13, 14, 16];
let lastType = 0;
let noteFontSize = 14;

const notes = {};
const key = 'notes:' + args.get('url').split('#')[0];

/* --- Helpers --- */

function findAncestor(node, tagName, boundary) {
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== boundary) {
    if (el.nodeName === tagName) return el;
    el = el.parentElement;
  }
  return null;
}

function atStartOf(range, element) {
  if (range.startOffset !== 0) return false;
  let node = range.startContainer;
  while (node && node !== element) {
    if (node !== node.parentNode.firstChild) return false;
    node = node.parentNode;
  }
  return node === element;
}

function setCursor(doc, node) {
  const sel = doc.getSelection();
  const r = doc.createRange();
  const target = node.firstChild || node;
  r.setStart(target, 0);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

/* --- Indent / Outdent helpers --- */

function doIndent(doc, noteBody, tick) {
  const sel = doc.getSelection();
  if (!sel.rangeCount) return;
  const li = findAncestor(sel.getRangeAt(0).startContainer, 'LI', noteBody);
  if (li) {
    const prev = li.previousElementSibling;
    if (prev) {
      // Nest under previous sibling
      const list = li.parentElement;
      let subList = prev.querySelector(list.nodeName);
      if (!subList) {
        subList = doc.createElement(list.nodeName);
        prev.appendChild(subList);
      }
      subList.appendChild(li);
      setCursor(doc, li);
    }
    else {
      // First item or only item: increase margin on the whole list
      const list = li.parentElement;
      const cur = parseInt(list.style.marginLeft, 10) || 0;
      list.style.marginLeft = (cur + 24) + 'px';
    }
    tick();
    return;
  }
  // Paragraph: increase margin-left by 24px
  let block = sel.getRangeAt(0).startContainer;
  if (block.nodeType === Node.TEXT_NODE) block = block.parentElement;
  while (block && block !== noteBody && block.nodeName !== 'P' && block.nodeName !== 'DIV') {
    block = block.parentElement;
  }
  if (block && block !== noteBody) {
    const cur = parseInt(block.style.marginLeft, 10) || 0;
    block.style.marginLeft = (cur + 24) + 'px';
    tick();
  }
}

function doOutdent(doc, noteBody, tick) {
  const sel = doc.getSelection();
  if (!sel.rangeCount) return;
  const li = findAncestor(sel.getRangeAt(0).startContainer, 'LI', noteBody);
  if (li) {
    const list = li.parentElement;
    const parentLi = findAncestor(list, 'LI', noteBody);
    if (parentLi) {
      // move siblings after this li into a new sub-list inside this li
      const after = [];
      let sib = li.nextElementSibling;
      while (sib) { after.push(sib); sib = sib.nextElementSibling; }
      if (after.length) {
        let tail = li.querySelector(list.nodeName);
        if (!tail) { tail = doc.createElement(list.nodeName); li.appendChild(tail); }
        after.forEach(item => tail.appendChild(item));
      }
      // move li after parentLi in the outer list
      parentLi.after(li);
      if (!list.firstElementChild) list.remove();
      setCursor(doc, li);
    }
    else {
      // Top-level list item: decrease margin on the whole list
      const cur = parseInt(list.style.marginLeft, 10) || 0;
      const next = Math.max(0, cur - 24);
      list.style.marginLeft = next ? next + 'px' : '';
    }
    tick();
    return;
  }
  // Paragraph: decrease margin-left by 24px (min 0)
  let block = sel.getRangeAt(0).startContainer;
  if (block.nodeType === Node.TEXT_NODE) block = block.parentElement;
  while (block && block !== noteBody && block.nodeName !== 'P' && block.nodeName !== 'DIV') {
    block = block.parentElement;
  }
  if (block && block !== noteBody) {
    const cur = parseInt(block.style.marginLeft, 10) || 0;
    const next = Math.max(0, cur - 24);
    block.style.marginLeft = next ? next + 'px' : '';
    tick();
  }
}

/* --- Serialization --- */

// Serialize saves innerHTML so rich formatting (marks, spans, bold, etc.) is preserved.
function serialize(body) {
  return body.innerHTML;
}

// Plain-text extraction for export (save-as-HTML) compatibility
function serializePlainText(body) {
  let text = '';
  for (const child of body.childNodes) {
    if (child.nodeName === 'UL') {
      for (const li of child.children) {
        text += '- ' + li.textContent + '\n';
      }
    }
    else if (child.nodeName === 'OL') {
      let n = 1;
      for (const li of child.children) {
        text += n + '. ' + li.textContent + '\n';
        n++;
      }
    }
    else if (child.nodeName === 'BR') {
      text += '\n';
    }
    else if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent.trim()) {
        text += child.textContent;
      }
    }
    else {
      text += child.textContent + '\n';
    }
  }
  return text.replace(/\n$/, '');
}

// Deserialize detects whether the saved content is HTML or legacy plain text.
// Legacy plain text used list prefixes ("- item" / "1. item"); HTML content
// will contain tags like <p>, <ul>, <mark>, <b>, etc.
function deserialize(text, doc) {
  const frag = doc.createDocumentFragment();
  if (!text || !text.trim()) {
    const p = doc.createElement('p');
    p.appendChild(doc.createElement('br'));
    frag.appendChild(p);
    return frag;
  }

  // If the content contains HTML tags, treat it as HTML
  if (/<[a-z][\s\S]*>/i.test(text)) {
    const temp = doc.createElement('div');
    temp.innerHTML = text;
    while (temp.firstChild) {
      frag.appendChild(temp.firstChild);
    }
    return frag;
  }

  // Legacy plain-text format
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^[-*]\s?/.test(line) && line !== '-' && line !== '*') {
      const ul = doc.createElement('ul');
      while (i < lines.length && /^[-*]\s?/.test(lines[i]) && lines[i] !== '-' && lines[i] !== '*') {
        const li = doc.createElement('li');
        li.textContent = lines[i].replace(/^[-*]\s?/, '');
        ul.appendChild(li);
        i++;
      }
      frag.appendChild(ul);
      continue;
    }
    if (/^\d+\.\s?/.test(line)) {
      const ol = doc.createElement('ol');
      while (i < lines.length && /^\d+\.\s?/.test(lines[i])) {
        const li = doc.createElement('li');
        li.textContent = lines[i].replace(/^\d+\.\s?/, '');
        ol.appendChild(li);
        i++;
      }
      frag.appendChild(ol);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const p = doc.createElement('p');
    p.textContent = line;
    frag.appendChild(p);
    i++;
  }
  return frag;
}

/* --- CSS --- */

const CSS = `
@keyframes noteIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.note[data-type] {
  position: absolute;
  z-index: 10;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  min-width: 200px;
  min-height: 120px;
  resize: both;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.2s ease, transform 0.15s ease;
  transform-origin: top center;
  white-space: pre-wrap;
}
.note[data-type]:focus-within {
  z-index: 11;
  box-shadow: 0 8px 24px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.1);
  transform: translateY(-1px);
}
.note[data-type].note-enter {
  animation: noteIn 0.25s ease-out;
}
.note-toolbar {
  display: flex;
  align-items: center;
  padding: 5px 8px 5px 11px;
  cursor: grab;
  flex-shrink: 0;
  -webkit-user-select: none;
  user-select: none;
  white-space: normal;
}
.note-toolbar:active {
  cursor: grabbing;
}
.note-close {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: currentColor;
  opacity: 0.12;
  cursor: default;
  flex-shrink: 0;
  transition: opacity 0.15s ease, background-color 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.note-close::after {
  content: "\\00d7";
  font-size: 10px;
  line-height: 1;
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.note-close:hover {
  opacity: 0.8;
  background-color: #ff5f57;
}
.note-close:hover::after {
  opacity: 1;
}
.note-colors {
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  margin-left: auto;
}
.note-color-btn {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  cursor: default;
  flex-shrink: 0;
  transition: opacity 0.15s ease;
  opacity: 0.45;
  background: conic-gradient(${PALETTE[0].dot}, ${PALETTE[1].dot}, ${PALETTE[2].dot}, ${PALETTE[3].dot}, ${PALETTE[4].dot}, ${PALETTE[5].dot}, ${PALETTE[6].dot}, ${PALETTE[0].dot});
}
.note-color-btn:hover {
  opacity: 0.75;
}
.note-colors.expanded .note-color-btn {
  margin-left: 3px;
}
.note-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  box-sizing: border-box;
  max-width: 0;
  opacity: 0;
  transform: scale(0);
  overflow: hidden;
  border-width: 0 !important;
  margin: 0;
  transition: max-width 0.2s ease, opacity 0.2s ease, transform 0.2s ease, margin 0.2s ease, border-width 0.15s ease;
  transition-delay: calc(var(--i) * 25ms);
}
.note-colors.expanded .note-dot {
  max-width: 12px;
  opacity: 1;
  transform: scale(1);
  margin: 0 2px;
  border-width: 1.5px !important;
  transition-delay: calc((7 - var(--i)) * 25ms);
}
.note-colors.expanded .note-dot:hover {
  transform: scale(1.25);
}
.note-font-btn {
  max-width: 0;
  opacity: 0;
  transform: scale(0);
  overflow: hidden;
  margin: 0;
  cursor: pointer;
  font-weight: 600;
  font-size: 12px;
  line-height: 12px;
  height: 12px;
  flex-shrink: 0;
  transition: max-width 0.2s ease, opacity 0.2s ease, transform 0.2s ease, margin 0.2s ease;
  transition-delay: calc(8 * 25ms);
  -webkit-user-select: none;
  user-select: none;
  position: relative;
  padding-right: 6px;
}
.note-font-btn::after {
  content: "\\25B2\\25BC";
  position: absolute;
  right: 0;
  top: 1px;
  font-size: 4px;
  line-height: 1;
  letter-spacing: -0.5px;
  writing-mode: vertical-lr;
  opacity: 0.6;
}
.note-colors.expanded .note-font-btn {
  max-width: 24px;
  opacity: 0.55;
  transform: scale(1) translateY(0.5px);
  margin: 0 4px 0 4px;
  transition-delay: calc((7 - 8) * 25ms);
}
.note-colors.expanded .note-font-btn:hover {
  opacity: 0.85;
}
.note-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 14px 16px;
  text-align: left;
  font: var(--note-font-size, 14px)/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: 0.01em;
  outline: none;
  word-wrap: break-word;
  overflow-wrap: break-word;
  cursor: text;
  position: relative;
  box-shadow: inset 0 4px 8px -4px rgba(0,0,0,0.06), inset 0 0 16px rgba(0,0,0,0.02);
  -webkit-user-select: text;
  user-select: text;
  -webkit-user-modify: read-write;
  pointer-events: auto;
}
.note-body p, .note-body li {
  text-align: left;
}
.note-body p {
  margin: 0 0 10px 0;
}
.note-body p:last-child {
  margin-bottom: 0;
}
.note-body ul, .note-body ol {
  margin: 0 0 10px 0;
  padding-left: 24px;
}
.note-body li {
  margin-block-end: 0.35em;
  padding-left: 2px;
}
.note-body ul {
  list-style-type: "–  ";
}
.note-body ol {
  list-style-type: decimal;
}
.note[data-type]::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  pointer-events: none;
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 2px,
    var(--note-grip) 2px,
    var(--note-grip) 3.5px
  );
  clip-path: polygon(100% 0, 100% 100%, 0 100%);
  opacity: 0.7;
}
.note[data-type]::-webkit-resizer {
  appearance: none;
  background: transparent;
}
${PALETTE.map((c, i) => `.note[data-type="${i}"] { background-color: ${c.bg}; color: ${c.color}; --note-grip: ${c.dot}; }
.note-dot[data-type="${i}"] { background-color: ${c.bg}; border: 1.5px solid ${c.dot}; }`).join('\n')}

/* --- Format Palette (inline in notes) --- */
.format-palette {
  position: absolute;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--fp-bg, #fff);
  color: var(--fp-fg, #333);
  box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.1);
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1;
  transform-origin: center bottom;
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 200ms ease-out, transform 200ms ease-out;
  white-space: nowrap;
}
.format-palette.above {
  transform-origin: center bottom;
}
.format-palette.below {
  transform-origin: center top;
}
.format-palette.visible {
  opacity: 1;
  transform: scale(1);
}
.format-palette.hiding {
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 150ms ease-in, transform 150ms ease-in;
}

/* Dark mode */
html[data-mode$="dark"] .format-palette {
  --fp-bg: #3a3a3a;
  --fp-fg: #e0e0e0;
}

/* Sections */
.fp-section {
  display: flex;
  align-items: center;
  gap: 4px;
}
.fp-section + .fp-section {
  border-top: 1px solid rgba(128,128,128,0.15);
  padding-top: 5px;
}

/* Section labels */
.fp-label {
  opacity: 0.45;
  margin-right: 2px;
  min-width: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Color dots */
.fp-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  box-sizing: border-box;
  border: 1.5px solid rgba(0,0,0,0.12);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.fp-dot:hover {
  transform: scale(1.25);
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}
.fp-dot.active {
  border-color: rgba(0,0,0,0.5);
  box-shadow: 0 0 0 2px rgba(0,0,0,0.15);
}
html[data-mode$="dark"] .fp-dot {
  border-color: rgba(255,255,255,0.15);
}
html[data-mode$="dark"] .fp-dot.active {
  border-color: rgba(255,255,255,0.6);
  box-shadow: 0 0 0 2px rgba(255,255,255,0.15);
}

/* Remove-color dot (x icon) */
.fp-dot-clear {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  box-sizing: border-box;
  border: 1.5px solid rgba(128,128,128,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  line-height: 1;
  opacity: 0.45;
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.fp-dot-clear::after {
  content: "\\00d7";
}
.fp-dot-clear:hover {
  transform: scale(1.25);
  opacity: 0.8;
}

/* Hide browser selection highlight when a color has been applied, so actual colors are visible */
.note-body.fp-color-applied ::selection {
  background: transparent !important;
  color: inherit !important;
}

/* Format buttons */
.fp-btn {
  min-width: 24px;
  height: 24px;
  border-radius: 5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-family: Georgia, "Times New Roman", serif;
  background: transparent;
  border: none;
  color: inherit;
  padding: 0 4px;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.fp-btn:hover {
  background-color: rgba(128,128,128,0.15);
}
.fp-btn.active {
  background-color: rgba(128,128,128,0.25);
  color: var(--fp-accent, #2980b9);
}
html[data-mode$="dark"] .fp-btn.active {
  --fp-accent: #4dacff;
}
.fp-btn-bold {
  font-weight: 800;
}
.fp-btn-italic {
  font-style: italic;
}
.fp-btn-underline {
  text-decoration: underline;
}
.fp-btn-strikethrough {
  text-decoration: line-through;
}
.fp-btn-superscript {
  font-size: 13px;
}
.fp-btn-superscript sup {
  font-size: 9px;
  vertical-align: super;
  line-height: 0;
}

/* --- Delete Confirmation Overlay --- */
@keyframes confirmIn {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes confirmOut {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.92); }
}
.note-confirm-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: inherit;
  border-radius: inherit;
  animation: confirmIn 0.2s ease-out both;
  pointer-events: auto;
  -webkit-user-select: none;
  user-select: none;
}
.note-confirm-overlay.hiding {
  animation: confirmOut 0.15s ease-in both;
  pointer-events: none;
}
.note-confirm-msg {
  font: 600 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  opacity: 0.7;
  letter-spacing: 0.01em;
}
.note-confirm-actions {
  display: flex;
  gap: 8px;
}
.note-confirm-btn {
  font: 500 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  padding: 6px 16px;
  border-radius: 99px;
  border: none;
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.1s ease;
  outline: none;
}
.note-confirm-btn:hover {
  filter: brightness(0.92);
}
.note-confirm-btn:active {
  transform: scale(0.96);
}
.note-confirm-btn--delete {
  background: #e05252;
  color: #fff;
}
.note-confirm-btn--cancel {
  background: rgba(128,128,128,0.15);
  color: inherit;
}

`;

/* --- Format Palette Logic --- */

let fpPalette = null;
let fpHideTimeout = null;
let fpSuppressHide = false;
// The active tick function for the note whose body owns the current selection.
// Set when the palette is shown so formatting actions can trigger a save.
let fpActiveTick = null;

function fpGetSelectionRect(doc) {
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const rects = range.getClientRects();
  if (rects.length === 0) return null;

  let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
  for (const r of rects) {
    if (r.width === 0 && r.height === 0) continue;
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
  }
  if (top === Infinity) return null;
  return {top, bottom, left, right, width: right - left, height: bottom - top};
}

function fpNormalizeColor(raw) {
  if (!raw) return '';
  const s = raw.replace(/\s/g, '').toLowerCase();
  if (s === 'transparent' || s === 'rgba(0,0,0,0)' || s === 'inherit') return '';
  // rgb(r,g,b) → #rrggbb
  const m = s.match(/^rgb\((\d+),(\d+),(\d+)\)$/);
  if (m) {
    const hex = (n) => parseInt(n, 10).toString(16).padStart(2, '0');
    return '#' + hex(m[1]) + hex(m[2]) + hex(m[3]);
  }
  return s;
}

function fpGetActiveFormats(doc) {
  const formats = {};
  try {
    formats.bold = doc.queryCommandState('bold');
    formats.italic = doc.queryCommandState('italic');
    formats.underline = doc.queryCommandState('underline');
    formats.strikeThrough = doc.queryCommandState('strikeThrough');
    formats.superscript = doc.queryCommandState('superscript');
  }
  catch (e) { /* queryCommandState may throw */ }

  const sel = doc.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const node = sel.anchorNode;
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (el) {
      // Check data attributes first, then fall back to inline styles
      const bg = el.closest('[data-fp-bg]');
      if (bg) {
        formats.bgColor = bg.dataset.fpBg;
      }
      else {
        // Walk ancestors looking for an inline background-color set by execCommand
        let walk = el;
        const noteBody = el.closest('.note-body');
        while (walk && walk !== noteBody) {
          const bgStyle = walk.style?.backgroundColor;
          if (bgStyle) {
            const norm = fpNormalizeColor(bgStyle);
            if (norm) {
              formats.bgColor = norm;
              break;
            }
          }
          walk = walk.parentElement;
        }
      }
      const fc = el.closest('[data-fp-color]');
      if (fc) {
        formats.textColor = fc.dataset.fpColor;
      }
      else {
        // Walk ancestors looking for an inline color set by execCommand
        let walk = el;
        const noteBody = el.closest('.note-body');
        while (walk && walk !== noteBody) {
          const cStyle = walk.style?.color;
          if (cStyle) {
            const norm = fpNormalizeColor(cStyle);
            if (norm) {
              formats.textColor = norm;
              break;
            }
          }
          walk = walk.parentElement;
        }
      }
    }
  }
  return formats;
}

function fpApplyBgColor(doc, color) {
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

  if (!color) {
    fpRemoveBgColor(doc);
    return;
  }

  // Use execCommand so the operation is on the browser's undo stack
  doc.execCommand('backColor', false, color);

  // Tag the elements created by execCommand with data-fp-bg for active-state detection
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    let ancestor = range.commonAncestorContainer;
    if (ancestor.nodeType !== Node.ELEMENT_NODE) ancestor = ancestor.parentNode;
    if (ancestor) {
      const normalizedColor = fpNormalizeColor(color);
      for (const el of ancestor.querySelectorAll('[style]')) {
        if (fpNormalizeColor(el.style.backgroundColor) === normalizedColor) {
          el.dataset.fpBg = color;
        }
      }
      // Also check the ancestor itself
      if (ancestor.style && fpNormalizeColor(ancestor.style.backgroundColor) === normalizedColor) {
        ancestor.dataset.fpBg = color;
      }
    }
  }

  if (fpActiveTick) fpActiveTick();
}

function fpRemoveBgColor(doc) {
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);

  // Try execCommand first (handles current-session formatting, stays on undo stack)
  doc.execCommand('backColor', false, 'transparent');

  // Walk the selection and unwrap any elements that still have background styling
  // This catches <mark>, <span style="background-color:...">, <font>, etc. from prior sessions
  let ancestor = range.commonAncestorContainer;
  if (ancestor.nodeType !== Node.ELEMENT_NODE) ancestor = ancestor.parentNode;
  if (ancestor) {
    const targets = [...ancestor.querySelectorAll('mark, [data-fp-bg], [style]')].filter(el => range.intersectsNode(el));
    for (const el of targets) {
      if (el.tagName === 'MARK' || el.dataset.fpBg) {
        // Unwrap: replace element with its children
        const parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        el.remove();
      }
      else if (el.style.backgroundColor && el.style.backgroundColor !== 'transparent') {
        el.style.backgroundColor = '';
        delete el.dataset.fpBg;
        // If the element has no other styles/attributes, unwrap it
        if (!el.getAttribute('style')?.trim() && !el.getAttributeNames().filter(a => a !== 'style').length) {
          const parent = el.parentNode;
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          el.remove();
        }
      }
    }
    ancestor.normalize();
  }

  if (fpActiveTick) fpActiveTick();
}

function fpApplyTextColor(doc, color) {
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

  if (!color) {
    fpRemoveTextColor(doc);
    return;
  }

  // Use execCommand so the operation is on the browser's undo stack
  doc.execCommand('foreColor', false, color);

  // Tag the elements created by execCommand with data-fp-color for active-state detection
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    let ancestor = range.commonAncestorContainer;
    if (ancestor.nodeType !== Node.ELEMENT_NODE) ancestor = ancestor.parentNode;
    if (ancestor) {
      const normalizedColor = fpNormalizeColor(color);
      for (const el of ancestor.querySelectorAll('[style]')) {
        if (fpNormalizeColor(el.style.color) === normalizedColor) {
          el.dataset.fpColor = color;
        }
      }
      // Also check the ancestor itself
      if (ancestor.style && fpNormalizeColor(ancestor.style.color) === normalizedColor) {
        ancestor.dataset.fpColor = color;
      }
    }
  }

  if (fpActiveTick) fpActiveTick();
}

function fpRemoveTextColor(doc) {
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);

  // Determine the note's inherited text color so we can reset to it
  const noteBody = fpFindNoteBody(doc);
  const inheritedColor = noteBody
    ? doc.defaultView.getComputedStyle(noteBody).color
    : '';

  if (inheritedColor) {
    doc.execCommand('foreColor', false, inheritedColor);
  }
  else {
    doc.execCommand('removeFormat', false, null);
  }

  // Walk the selection and unwrap any elements that still have text color styling
  // This catches <font color="...">, <span style="color:...">, etc. from prior sessions
  let ancestor = range.commonAncestorContainer;
  if (ancestor.nodeType !== Node.ELEMENT_NODE) ancestor = ancestor.parentNode;
  if (ancestor) {
    const targets = [...ancestor.querySelectorAll('font[color], [data-fp-color], [style]')].filter(el => range.intersectsNode(el));
    for (const el of targets) {
      if (el.tagName === 'FONT' && el.hasAttribute('color')) {
        // Unwrap <font color="..."> elements
        const parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        el.remove();
      }
      else if (el.dataset.fpColor || el.style.color) {
        el.style.color = '';
        delete el.dataset.fpColor;
        // If the element has no other styles/attributes worth keeping, unwrap it
        if (!el.getAttribute('style')?.trim() && el.tagName === 'SPAN' && !el.getAttributeNames().filter(a => a !== 'style').length) {
          const parent = el.parentNode;
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          el.remove();
        }
      }
    }
    ancestor.normalize();
  }

  if (fpActiveTick) fpActiveTick();
}

function fpCreatePalette(doc) {
  const el = doc.createElement('div');
  el.classList.add('format-palette');

  // --- Text colors (first row) ---
  const textSection = doc.createElement('div');
  textSection.classList.add('fp-section');
  const textLabel = doc.createElement('span');
  textLabel.classList.add('fp-label');
  textLabel.title = 'Text color';
  const textIconWrap = doc.createElement('span');
  textIconWrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="14" height="14" fill="currentColor"><path d="M254 52.8C249.3 40.3 237.3 32 224 32s-25.3 8.3-30 20.8L57.8 416H32c-17.7 0-32 14.3-32 32s14.3 32 32 32h96c17.7 0 32-14.3 32-32s-14.3-32-32-32h-4.4l22.4-64h156.1l22.4 64H320c-17.7 0-32 14.3-32 32s14.3 32 32 32h96c17.7 0 32-14.3 32-32s-14.3-32-32-32h-25.8L254 52.8zM279.8 304H168.2L224 132.4 279.8 304z"/></svg>';
  textLabel.appendChild(textIconWrap.firstChild);
  textSection.appendChild(textLabel);

  for (const c of TEXT_COLORS) {
    const dot = doc.createElement('span');
    dot.classList.add('fp-dot');
    dot.style.backgroundColor = c.color;
    dot.title = c.label;
    dot.dataset.textcolor = c.color;
    dot.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      fpWithSuppressedHide(() => {
        fpApplyTextColor(doc, c.color);
        const nb = fpFindNoteBody(doc);
        if (nb) nb.classList.add('fp-color-applied');
        fpRefreshActiveStates(doc, el);
      });
    });
    textSection.appendChild(dot);
  }
  const textClear = doc.createElement('span');
  textClear.classList.add('fp-dot-clear');
  textClear.title = 'Remove text color';
  textClear.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    fpWithSuppressedHide(() => {
      fpRemoveTextColor(doc);
      fpRefreshActiveStates(doc, el);
    });
  });
  textSection.appendChild(textClear);
  el.appendChild(textSection);

  // --- Highlight background colors (second row) ---
  const bgSection = doc.createElement('div');
  bgSection.classList.add('fp-section');
  const bgLabel = doc.createElement('span');
  bgLabel.classList.add('fp-label');
  bgLabel.title = 'Background color';
  const bgIconWrap = doc.createElement('span');
  bgIconWrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" width="14" height="14" fill="currentColor"><path d="M315.4 15.2C334.6-4.1 366.6-5.1 387 14.3l110.5 105.5c19.4 18.5 20.4 49.3 2.2 69l-227 238.3L63.5 233.6 315.4 15.2zM166.9 270.8l96.3 91.9L34.2 464 0 512l48-1.1 155-3.6L166.9 270.8z"/></svg>';
  bgLabel.appendChild(bgIconWrap.firstChild);
  bgSection.appendChild(bgLabel);

  for (const c of HIGHLIGHT_COLORS) {
    const dot = doc.createElement('span');
    dot.classList.add('fp-dot');
    dot.style.backgroundColor = c.bg;
    dot.title = c.label;
    dot.dataset.bg = c.bg;
    dot.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      fpWithSuppressedHide(() => {
        fpApplyBgColor(doc, c.bg);
        const nb = fpFindNoteBody(doc);
        if (nb) nb.classList.add('fp-color-applied');
        fpRefreshActiveStates(doc, el);
      });
    });
    bgSection.appendChild(dot);
  }
  const bgClear = doc.createElement('span');
  bgClear.classList.add('fp-dot-clear');
  bgClear.title = 'Remove background color';
  bgClear.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    fpWithSuppressedHide(() => {
      fpRemoveBgColor(doc);
      fpRefreshActiveStates(doc, el);
    });
  });
  bgSection.appendChild(bgClear);
  el.appendChild(bgSection);

  // --- Formatting buttons ---
  const fmtSection = doc.createElement('div');
  fmtSection.classList.add('fp-section');
  fmtSection.style.justifyContent = 'center';

  const buttons = [
    {cmd: 'bold', label: 'B', cls: 'fp-btn-bold', title: 'Bold'},
    {cmd: 'italic', label: 'I', cls: 'fp-btn-italic', title: 'Italic'},
    {cmd: 'underline', label: 'U', cls: 'fp-btn-underline', title: 'Underline'},
    {cmd: 'strikeThrough', label: 'S', cls: 'fp-btn-strikethrough', title: 'Strikethrough'},
    {cmd: 'superscript', label: null, cls: 'fp-btn-superscript', title: 'Superscript', html: 'X<sup>2</sup>'}
  ];

  buttons.forEach((b) => {
    const btn = doc.createElement('span');
    btn.classList.add('fp-btn', b.cls);
    btn.title = b.title;
    btn.dataset.fmtCmd = b.cmd;
    if (b.html) {
      btn.innerHTML = b.html;
    }
    else {
      btn.textContent = b.label;
    }
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      fpWithSuppressedHide(() => {
        doc.execCommand(b.cmd, false, null);
        if (fpActiveTick) fpActiveTick();
        fpRefreshActiveStates(doc, el);
      });
    });
    fmtSection.appendChild(btn);
  });

  el.appendChild(fmtSection);
  return el;
}

function fpRefreshActiveStates(doc, el) {
  const formats = fpGetActiveFormats(doc);

  // Normalize the active colors for comparison since execCommand-produced inline
  // styles may differ in format (e.g. rgb() vs hex) from the palette dot values.
  const activeBg = fpNormalizeColor(formats.bgColor || '');
  const activeText = fpNormalizeColor(formats.textColor || '');

  for (const dot of el.querySelectorAll('.fp-dot[data-bg]')) {
    dot.classList.toggle('active', activeBg !== '' && activeBg === fpNormalizeColor(dot.dataset.bg));
  }
  for (const dot of el.querySelectorAll('.fp-dot[data-textcolor]')) {
    dot.classList.toggle('active', activeText !== '' && activeText === fpNormalizeColor(dot.dataset.textcolor));
  }
  const cmdMap = {
    bold: formats.bold,
    italic: formats.italic,
    underline: formats.underline,
    strikeThrough: formats.strikeThrough,
    superscript: formats.superscript
  };
  for (const btn of el.querySelectorAll('.fp-btn[data-fmt-cmd]')) {
    btn.classList.toggle('active', !!cmdMap[btn.dataset.fmtCmd]);
  }
}

function fpShowPalette(doc) {
  const rect = fpGetSelectionRect(doc);
  if (!rect) return;

  const alreadyVisible = fpPalette && fpPalette.classList.contains('visible');

  if (!fpPalette) {
    fpPalette = fpCreatePalette(doc);
    doc.body.appendChild(fpPalette);
  }

  clearTimeout(fpHideTimeout);
  fpPalette.classList.remove('hiding');

  // Measure the palette without triggering transitions.
  // Temporarily disable transitions and set scale(1) to get true dimensions.
  fpPalette.style.transition = 'none';
  fpPalette.style.transform = 'scale(1)';
  fpPalette.style.visibility = 'hidden';
  const pRect = fpPalette.getBoundingClientRect();
  fpPalette.style.visibility = '';
  fpPalette.style.transform = alreadyVisible ? 'scale(1)' : '';
  fpPalette.style.transition = '';

  const viewportHeight = doc.documentElement.clientHeight;
  const viewportWidth = doc.documentElement.clientWidth;
  const gap = 8;

  const bodyRect = doc.body.getBoundingClientRect();

  const spaceAbove = rect.top;
  const spaceBelow = viewportHeight - rect.bottom;
  const placeAbove = spaceAbove >= pRect.height + gap || spaceAbove > spaceBelow;

  let top;
  if (placeAbove) {
    top = rect.top - bodyRect.top - pRect.height - gap;
    fpPalette.classList.add('above');
    fpPalette.classList.remove('below');
  }
  else {
    top = rect.bottom - bodyRect.top + gap;
    fpPalette.classList.add('below');
    fpPalette.classList.remove('above');
  }

  const centerX = rect.left + rect.width / 2;
  let left = centerX - pRect.width / 2 - bodyRect.left;
  const minLeft = -bodyRect.left + 4;
  const maxLeft = viewportWidth - bodyRect.left - pRect.width - 4;
  left = Math.max(minLeft, Math.min(left, maxLeft));

  fpPalette.style.top = top + 'px';
  fpPalette.style.left = left + 'px';

  fpRefreshActiveStates(doc, fpPalette);

  if (alreadyVisible) {
    // Already showing — just keep it visible, no animation
    fpPalette.classList.add('visible');
  }
  else {
    // Fresh appearance — animate in
    fpPalette.classList.remove('visible');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (fpPalette) fpPalette.classList.add('visible');
      });
    });
  }
}

function fpClearSelectionHighlight(doc) {
  const root = doc?.body || doc?.documentElement;
  if (!root) return;
  for (const el of root.querySelectorAll('.note-body.fp-color-applied')) {
    el.classList.remove('fp-color-applied');
  }
}

function fpHidePalette(immediate) {
  if (!fpPalette) return;

  const paletteDoc = fpPalette.ownerDocument;
  fpClearSelectionHighlight(paletteDoc);

  if (immediate) {
    fpPalette.classList.remove('visible');
    fpPalette.remove();
    fpPalette = null;
    fpActiveTick = null;
    return;
  }

  fpPalette.classList.remove('visible');
  fpPalette.classList.add('hiding');
  fpHideTimeout = setTimeout(() => {
    if (fpPalette) {
      fpPalette.remove();
      fpPalette = null;
    }
    fpActiveTick = null;
  }, 150);
}

function fpWithSuppressedHide(fn) {
  fpSuppressHide = true;
  try {
    fn();
  }
  finally {
    setTimeout(() => {
      fpSuppressHide = false;
    }, 50);
  }
}

/**
 * Find the note body element that contains the current selection, if any.
 * Returns the .note-body element or null.
 */
function fpFindNoteBody(doc) {
  const sel = doc.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const anchor = sel.anchorNode;
  const el = anchor?.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;
  if (!el) return null;
  return el.closest('.note-body');
}


let fpMouseIsDown = false;

function fpOnSelectionChange(doc) {
  if (fpSuppressHide) return;

  const sel = doc.getSelection();
  const hasSelection = sel && !sel.isCollapsed && sel.toString().trim() !== '';

  if (hasSelection) {
    const noteBody = fpFindNoteBody(doc);
    if (!noteBody) {
      fpHidePalette();
      return;
    }

    // Find the tick function for this note via wrapper's data
    const wrapper = noteBody.closest('.note[data-type]');
    if (wrapper && wrapper._fpTick) {
      fpActiveTick = wrapper._fpTick;
    }

    // Don't show palette while still dragging to select; wait for mouseup
    if (fpMouseIsDown) return;

    fpShowPalette(doc);
  }
  else {

    fpHidePalette();
  }
}

function fpOnMouseDown(e, doc) {
  if (fpPalette && fpPalette.contains(e.target)) return;

  fpMouseIsDown = true;

  const sel = doc.getSelection();
  if (!sel || sel.isCollapsed) {
    fpHidePalette();
  }
}

function fpOnMouseUp(doc) {
  fpMouseIsDown = false;

  if (fpSuppressHide) return;

  const sel = doc.getSelection();
  const hasSelection = sel && !sel.isCollapsed && sel.toString().trim() !== '';

  if (hasSelection) {
    const noteBody = fpFindNoteBody(doc);
    if (!noteBody) return;

    const wrapper = noteBody.closest('.note[data-type]');
    if (wrapper && wrapper._fpTick) {
      fpActiveTick = wrapper._fpTick;
    }

    fpShowPalette(doc);
  }
}

function fpOnScroll(doc) {
  if (fpPalette) {
    const sel = doc.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) {
      fpShowPalette(doc);
    }
    else {
      fpHidePalette();
    }
  }
}

/* --- Core --- */

const add = (id, {content, type, box}, active = false) => {
  const doc = iframe.contentDocument;

  type = isNaN(type) ? lastType : type;

  box = box || {
    left: Math.round(400 + (Math.random() - 0.5) * 300),
    top: doc.documentElement.scrollTop + Math.round(400 + (Math.random() - 0.5) * 300),
    width: 300,
    height: 300
  };

  const setColor = newType => {
    type = newType;
    lastType = type;
    wrapper.setAttribute('data-type', type);
    chrome.storage.local.set({'notes:last-type': type});
    tick();
  };

  const doDelete = () => {
    fpHidePalette(true);
    tick.active = false;
    delete notes[id];
    chrome.storage.local.set({[key]: notes}, () => wrapper.remove());
  };

  let confirmOverlay = null;
  const deleteNote = () => {
    // Empty notes are deleted immediately without confirmation
    if (noteBody.textContent.trim() === '') {
      doDelete();
      return;
    }
    // Prevent stacking multiple overlays
    if (confirmOverlay) return;

    const overlay = doc.createElement('div');
    overlay.classList.add('note-confirm-overlay');
    confirmOverlay = overlay;

    const msg = doc.createElement('span');
    msg.classList.add('note-confirm-msg');
    msg.textContent = 'Delete this note?';
    overlay.appendChild(msg);

    const actions = doc.createElement('div');
    actions.classList.add('note-confirm-actions');

    const btnDelete = doc.createElement('button');
    btnDelete.classList.add('note-confirm-btn', 'note-confirm-btn--delete');
    btnDelete.textContent = 'Delete';

    const btnCancel = doc.createElement('button');
    btnCancel.classList.add('note-confirm-btn', 'note-confirm-btn--cancel');
    btnCancel.textContent = 'Cancel';

    actions.appendChild(btnDelete);
    actions.appendChild(btnCancel);
    overlay.appendChild(actions);
    wrapper.appendChild(overlay);

    const dismiss = () => {
      overlay.classList.add('hiding');
      overlay.addEventListener('animationend', () => {
        overlay.remove();
        confirmOverlay = null;
      }, {once: true});
    };

    btnDelete.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      doDelete();
    });
    btnCancel.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      dismiss();
    });
    // Also dismiss on Escape while the overlay is showing
    overlay.addEventListener('keydown', e => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
      }
    });

    btnCancel.focus();
  };

  let timeout;
  const save = () => {
    const val = serialize(noteBody);
    wrapper.setAttribute('data-note-value', val);
    notes[id] = {
      date: Date.now(),
      box,
      type,
      content: val
    };
    chrome.storage.local.set({
      [key]: Object.entries(notes).filter(([, o]) => o.content.trim()).reduce((p, [nid, o]) => {
        p[nid] = o;
        return p;
      }, {})
    });
  };
  const tick = () => {
    if (tick.active) {
      clearTimeout(timeout);
      timeout = setTimeout(save, 200);
    }
    else {
      clearTimeout(timeout);
    }
  };
  tick.active = true;

  // Wrapper
  const wrapper = doc.createElement('div');
  wrapper.classList.add('note');
  wrapper.setAttribute('data-type', type);
  if (active) {
    wrapper.classList.add('note-enter');
    wrapper.addEventListener('animationend', () => wrapper.classList.remove('note-enter'), {once: true});
  }
  wrapper.style.cssText = `
    width: ${box.width}px;
    height: ${box.height}px;
    left: ${box.left}px;
    top: ${box.top}px;
  `;

  // Expose tick on the wrapper so the format palette can trigger saves
  wrapper._fpTick = tick;

  // Compatibility: .value getter for save-as-HTML (index.js:451)
  // Returns plain text so the exported HTML file has readable note content.
  Object.defineProperty(wrapper, 'value', {
    get: () => serializePlainText(noteBody)
  });

  // Toolbar
  const toolbar = doc.createElement('div');
  toolbar.classList.add('note-toolbar');
  toolbar.title = 'Drag to move';

  // Close dot (left side, macOS-style)
  const closeBtn = doc.createElement('span');
  closeBtn.classList.add('note-close');
  closeBtn.title = 'Delete note';
  closeBtn.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    deleteNote();
  });
  toolbar.appendChild(closeBtn);

  // Color picker (right side)
  const colors = doc.createElement('div');
  colors.classList.add('note-colors');

  // Color palette button (first in DOM = rightmost due to row-reverse)
  const colorBtn = doc.createElement('span');
  colorBtn.classList.add('note-color-btn');
  colorBtn.title = 'Change color';
  colorBtn.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    colors.classList.toggle('expanded');
  });
  colors.appendChild(colorBtn);

  // Color dots (appear to the left of swatch due to row-reverse)
  PALETTE.forEach((_, i) => {
    const dot = doc.createElement('span');
    dot.classList.add('note-dot');
    dot.setAttribute('data-type', i);
    dot.style.setProperty('--i', i);
    dot.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      setColor(i);
      colors.classList.remove('expanded');
    });
    colors.appendChild(dot);
  });

  // Font size button (appears in expanded picker)
  const fontBtn = doc.createElement('span');
  fontBtn.classList.add('note-font-btn');
  fontBtn.textContent = 'A';
  fontBtn.title = 'Cycle font size';
  fontBtn.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    const idx = FONT_SIZES.indexOf(noteFontSize);
    noteFontSize = FONT_SIZES[(idx + 1) % FONT_SIZES.length];
    chrome.storage.local.set({'notes:font-size': noteFontSize});
    doc.body.style.setProperty('--note-font-size', noteFontSize + 'px');
  });
  colors.appendChild(fontBtn);

  toolbar.appendChild(colors);
  wrapper.appendChild(toolbar);

  // Body (contenteditable)
  const noteBody = doc.createElement('div');
  noteBody.classList.add('note-body', 'note');
  noteBody.setAttribute('contenteditable', 'true');
  noteBody.appendChild(deserialize(content, doc));

  // Collapse color picker + ensure editable on click
  noteBody.addEventListener('mousedown', () => {
    colors.classList.remove('expanded');
    if (noteBody.getAttribute('contenteditable') !== 'true') {
      noteBody.setAttribute('contenteditable', 'true');
    }
  });


  // Input: save + empty check + smart typography + strip inherited formatting on new lines
  noteBody.addEventListener('input', e => {
    tick();

    // When Enter creates a new line/list-item, strip any inherited color/highlight
    // spans so the new line starts clean.
    if (e.inputType === 'insertParagraph') {
      const sel = doc.getSelection();
      if (!sel.rangeCount) return;
      let node = sel.getRangeAt(0).startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

      // Walk up from cursor and unwrap any formatting spans that are
      // empty or only contain a <br> (i.e. the browser copied them for the new line)
      while (node && node !== noteBody) {
        const parent = node.parentElement;
        const isFormatSpan = (
          (node.tagName === 'SPAN' || node.tagName === 'FONT' || node.tagName === 'MARK') &&
          (node.style.backgroundColor || node.style.color || node.hasAttribute('color') || node.dataset.fpBg || node.dataset.fpColor)
        );
        if (isFormatSpan) {
          // Move children out and remove the wrapper
          while (node.firstChild) parent.insertBefore(node.firstChild, node);
          node.remove();
        }
        node = parent;
      }
      return;
    }

    if (e.inputType === 'insertText') {
      const sel = doc.getSelection();
      if (!sel.rangeCount || !sel.getRangeAt(0).collapsed) return;
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return;
      const offset = range.startOffset;
      const text = node.textContent;
      // -- → em dash
      if (offset >= 2 && text.substring(offset - 2, offset) === '--') {
        node.textContent = text.substring(0, offset - 2) + '\u2014' + text.substring(offset);
        const r = doc.createRange();
        r.setStart(node, offset - 1);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
  });

  // Paste: strip HTML
  noteBody.addEventListener('paste', e => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    doc.execCommand('insertText', false, text);
  });

  // Keyboard
  noteBody.addEventListener('keydown', e => {
    // Delete note (or dismiss confirmation if already showing)
    if (e.code === 'Escape') {
      e.stopPropagation();
      if (confirmOverlay) {
        confirmOverlay.classList.add('hiding');
        confirmOverlay.addEventListener('animationend', () => {
          confirmOverlay.remove();
          confirmOverlay = null;
        }, {once: true});
      }
      else {
        deleteNote();
      }
      return;
    }

    // Alt+Number → color
    if (e.code.startsWith('Digit') && e.altKey) {
      setColor(Number(e.code.replace('Digit', '')) % PALETTE.length);
      e.preventDefault();
      return;
    }

    // Enter → list auto-formatting
    if (e.key === 'Enter' && !e.shiftKey) {
      const sel = doc.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      // Inside a list item?
      const li = findAncestor(range.startContainer, 'LI', noteBody);
      if (li) {
        if (li.textContent.trim() === '') {
          e.preventDefault();
          const list = li.parentElement;
          const p = doc.createElement('p');
          p.appendChild(doc.createElement('br'));

          const after = [];
          let sib = li.nextElementSibling;
          while (sib) {
            after.push(sib);
            sib = sib.nextElementSibling;
          }

          list.after(p);
          if (after.length) {
            const newList = doc.createElement(list.nodeName);
            after.forEach(item => newList.appendChild(item));
            p.after(newList);
          }
          li.remove();
          if (!list.firstElementChild) list.remove();
          setCursor(doc, p);
        }
        return;
      }

      // In a paragraph → check for list prefix
      let block = range.startContainer;
      if (block.nodeType === Node.TEXT_NODE) block = block.parentElement;
      while (block && block !== noteBody && block.nodeName !== 'P' && block.nodeName !== 'DIV') {
        block = block.parentElement;
      }
      if (!block) return;
      if (block === noteBody) {
        // bare text in noteBody without <p> wrapper — wrap it first
        let textNode = range.startContainer;
        if (textNode.nodeType === Node.TEXT_NODE && textNode.parentElement === noteBody) {
          const p = doc.createElement('p');
          noteBody.insertBefore(p, textNode);
          p.appendChild(textNode);
          block = p;
        }
        else return;
      }

      const text = block.textContent;

      // Bullet: - or * (space optional)
      const bullet = text.match(/^[-*]\s?([\s\S]*)$/);
      if (bullet && text !== '-' && text !== '*') {
        e.preventDefault();
        const ul = doc.createElement('ul');
        const li1 = doc.createElement('li');
        li1.textContent = bullet[1];
        ul.appendChild(li1);
        const li2 = doc.createElement('li');
        li2.appendChild(doc.createElement('br'));
        ul.appendChild(li2);
        block.replaceWith(ul);
        setCursor(doc, li2);
        return;
      }

      // Numbered: 1. 2. etc. (space optional)
      const num = text.match(/^(\d+)\.\s?([\s\S]*)$/);
      if (num) {
        e.preventDefault();
        const ol = doc.createElement('ol');
        const li1 = doc.createElement('li');
        li1.textContent = num[2];
        ol.appendChild(li1);
        const li2 = doc.createElement('li');
        li2.appendChild(doc.createElement('br'));
        ol.appendChild(li2);
        block.replaceWith(ol);
        setCursor(doc, li2);
        return;
      }
    }

    // Tab → indent, Shift+Tab → outdent
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        doOutdent(doc, noteBody, tick);
      }
      else {
        doIndent(doc, noteBody, tick);
      }
      return;
    }

    // Cmd+] → indent
    if (e.code === 'BracketRight' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      doIndent(doc, noteBody, tick);
      return;
    }

    // Cmd+[ → outdent
    if (e.code === 'BracketLeft' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      doOutdent(doc, noteBody, tick);
      return;
    }

    // Backspace at start of li → convert to paragraph
    if (e.key === 'Backspace') {
      const sel = doc.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return;

      const li = findAncestor(range.startContainer, 'LI', noteBody);
      if (!li || !atStartOf(range, li)) return;

      e.preventDefault();
      const list = li.parentElement;
      const p = doc.createElement('p');
      while (li.firstChild) p.appendChild(li.firstChild);
      if (!p.firstChild) p.appendChild(doc.createElement('br'));

      const after = [];
      let sib = li.nextElementSibling;
      while (sib) {
        after.push(sib);
        sib = sib.nextElementSibling;
      }

      list.after(p);
      if (after.length) {
        const newList = doc.createElement(list.nodeName);
        after.forEach(item => newList.appendChild(item));
        p.after(newList);
      }
      li.remove();
      if (!list.firstElementChild) list.remove();
      setCursor(doc, p);
    }
  });

  wrapper.appendChild(noteBody);

  // Resize observer
  const resizeObserver = new ResizeObserver(() => {
    box.width = Math.max(200, wrapper.offsetWidth);
    box.height = Math.max(120, wrapper.offsetHeight);
    tick();
  });
  resizeObserver.observe(wrapper);

  // Drag (toolbar only, not on close or colors)
  toolbar.addEventListener('mousedown', ed => {
    if (ed.target.closest('.note-colors') || ed.target.closest('.note-close')) return;

    ed.preventDefault();
    colors.classList.remove('expanded');
    const dx = ed.clientX - box.left;
    const dy = ed.clientY - box.top;
    const padding = doc.body.getBoundingClientRect().left;

    let prevX = ed.clientX;
    let prevY = ed.clientY;
    let sx = 0;
    let rx = 0;
    let animFrame;

    wrapper.style.transition = 'none';
    wrapper.style.transformOrigin = 'top center';

    // Continuously interpolate toward target (creates bottom-lag inertia)
    let targetSx = 0;
    let targetRx = 0;
    const animate = () => {
      sx += (targetSx - sx) * 0.14;
      rx += (targetRx - rx) * 0.14;
      if (Math.abs(sx) < 0.01) sx = 0;
      if (Math.abs(rx) < 0.01) rx = 0;
      wrapper.style.transform = `perspective(600px) rotateX(${rx}deg) skewX(${sx}deg)`;
      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);

    const move = e => {
      box.left = Math.min(Math.max(-padding, e.clientX - dx), doc.body.offsetWidth - box.width + padding);
      box.top = Math.max(0, e.clientY - dy);
      wrapper.style.left = box.left + 'px';
      wrapper.style.top = box.top + 'px';

      // Raw velocity → skew target (bottom physically trails behind top)
      const rawVx = e.clientX - prevX;
      const rawVy = e.clientY - prevY;
      prevX = e.clientX;
      prevY = e.clientY;

      targetSx = Math.max(-8, Math.min(8, -rawVx * 0.7));
      targetRx = Math.max(-6, Math.min(6, rawVy * 0.5));

      tick();
    };
    const done = () => {
      doc.removeEventListener('mousemove', move);
      doc.removeEventListener('mouseup', done);
      cancelAnimationFrame(animFrame);

      // Spring back with elastic ease
      wrapper.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease';
      wrapper.style.transform = '';
      wrapper.style.transformOrigin = '';
    };
    doc.addEventListener('mousemove', move);
    doc.addEventListener('mouseup', done);
  });

  doc.body.appendChild(wrapper);

  if (active) {
    noteBody.focus();
  }
};

const observe = () => {
  const id = Math.random().toString(36).substring(7);
  add(id, {content: '', type: lastType}, true);
};

// Block Cmd+[/] browser navigation so it can be used for indent/outdent in notes
const blockBracketNav = e => {
  if ((e.metaKey || e.ctrlKey) && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
    e.preventDefault();
  }
};

// Suspend designMode when clicking into a note so it doesn't eat keystrokes.
// Uses capture phase on mousedown so designMode is off BEFORE focus lands.
let designModeNoteHandler = null;
let designModeSuspended = false;

function setupDesignModeGuard(doc) {
  designModeNoteHandler = e => {
    const inNote = e.target.closest && e.target.closest('.note-body');
    if (inNote) {
      if (doc.designMode === 'on') {
        doc.designMode = 'off';
        designModeSuspended = true;
      }
    }
    else if (designModeSuspended) {
      doc.designMode = 'on';
      designModeSuspended = false;
    }
  };
  doc.addEventListener('mousedown', designModeNoteHandler, true);
}

function teardownDesignModeGuard(doc) {
  if (designModeNoteHandler) {
    doc.removeEventListener('mousedown', designModeNoteHandler, true);
    designModeNoteHandler = null;
  }
  if (designModeSuspended) {
    doc.designMode = 'on';
    designModeSuspended = false;
  }
}

// Bound handlers for the format palette (stored so they can be removed on disable)
let fpSelectionHandler = null;
let fpMouseDownHandler = null;
let fpMouseUpHandler = null;
let fpScrollHandler = null;

function enable() {
  const styles = document.createElement('style');
  styles.id = 'note-styling';
  styles.textContent = CSS;

  document.addEventListener('add-note', observe);

  // Capture-phase listeners at every level to block Chrome's back/forward
  // navigation before it can process Cmd+[/]. preventDefault() only —
  // the event still propagates to the noteBody handler for indent/outdent.
  window.addEventListener('keydown', blockBracketNav, true);
  document.addEventListener('keydown', blockBracketNav, true);

  ready().then(() => {
    const doc = iframe.contentDocument;

    iframe.contentWindow.addEventListener('keydown', blockBracketNav, true);
    doc.addEventListener('keydown', blockBracketNav, true);

    doc.body.append(styles);

    try {
      doc.execCommand('defaultParagraphSeparator', false, 'p');
    }
    catch (e) { /* not supported */ }

    // Format palette: listen for selection changes within notes
    fpSelectionHandler = () => fpOnSelectionChange(doc);
    fpMouseDownHandler = e => fpOnMouseDown(e, doc);
    fpMouseUpHandler = () => fpOnMouseUp(doc);
    fpScrollHandler = () => fpOnScroll(doc);

    doc.addEventListener('selectionchange', fpSelectionHandler);
    doc.addEventListener('mousedown', fpMouseDownHandler);
    doc.addEventListener('mouseup', fpMouseUpHandler);
    iframe.contentWindow.addEventListener('scroll', fpScrollHandler);

    // Guard against designMode eating keystrokes in notes
    setupDesignModeGuard(doc);

    chrome.storage.local.get({
      [key]: {},
      'notes:last-type': 0,
      'notes:font-size': 14
    }, prefs => {
      lastType = prefs['notes:last-type'];
      noteFontSize = prefs['notes:font-size'];
      doc.body.style.setProperty('--note-font-size', noteFontSize + 'px');
      for (const [id, note] of Object.entries(prefs[key])) {
        add(id, note);
      }
    });
  });
}

function disable() {
  fpHidePalette(true);

  document.removeEventListener('add-note', observe);
  window.removeEventListener('keydown', blockBracketNav, true);
  document.removeEventListener('keydown', blockBracketNav, true);
  try {
    const doc = iframe.contentDocument;

    iframe.contentWindow.removeEventListener('keydown', blockBracketNav, true);
    doc.removeEventListener('keydown', blockBracketNav, true);
    doc.getElementById('note-styling').remove();

    // Remove designMode guard
    teardownDesignModeGuard(doc);

    // Remove format palette listeners
    if (fpSelectionHandler) doc.removeEventListener('selectionchange', fpSelectionHandler);
    if (fpMouseDownHandler) doc.removeEventListener('mousedown', fpMouseDownHandler);
    if (fpMouseUpHandler) doc.removeEventListener('mouseup', fpMouseUpHandler);
    if (fpScrollHandler) iframe.contentWindow.removeEventListener('scroll', fpScrollHandler);
    fpSelectionHandler = null;
    fpMouseDownHandler = null;
    fpMouseUpHandler = null;
    fpScrollHandler = null;
    fpMouseIsDown = false;
  }
  catch (e) { /* already removed */ }
}

export {enable, disable};
