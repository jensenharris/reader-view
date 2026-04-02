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

/* --- Serialization --- */

function serialize(body) {
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

function deserialize(text, doc) {
  const frag = doc.createDocumentFragment();
  if (!text || !text.trim()) {
    const p = doc.createElement('p');
    p.appendChild(doc.createElement('br'));
    frag.appendChild(p);
    return frag;
  }
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
  margin: 0;
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
`;

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

  const deleteNote = () => {
    if (noteBody.textContent.trim() === '' || confirm('Permanently remove this note?')) {
      tick.active = false;
      delete notes[id];
      chrome.storage.local.set({[key]: notes}, () => wrapper.remove());
    }
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

  // Compatibility: .value getter for save-as-HTML (index.js:451)
  Object.defineProperty(wrapper, 'value', {
    get: () => serialize(noteBody)
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

  // Input: save + empty check + smart typography
  noteBody.addEventListener('input', e => {
    tick();

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
    // Delete note
    if (e.code === 'Escape') {
      e.stopPropagation();
      deleteNote();
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

    // Cmd+] → indent list item
    if (e.code === 'BracketRight' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const sel = doc.getSelection();
      if (!sel.rangeCount) return;
      const li = findAncestor(sel.getRangeAt(0).startContainer, 'LI', noteBody);
      if (!li) return;
      const prev = li.previousElementSibling;
      if (!prev) return; // can't indent first item
      const list = li.parentElement;
      let subList = prev.querySelector(list.nodeName);
      if (!subList) {
        subList = doc.createElement(list.nodeName);
        prev.appendChild(subList);
      }
      subList.appendChild(li);
      setCursor(doc, li);
      tick();
      return;
    }

    // Cmd+[ → outdent list item
    if (e.code === 'BracketLeft' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const sel = doc.getSelection();
      if (!sel.rangeCount) return;
      const li = findAncestor(sel.getRangeAt(0).startContainer, 'LI', noteBody);
      if (!li) return;
      const list = li.parentElement;
      const parentLi = findAncestor(list, 'LI', noteBody);
      if (!parentLi) return; // already top level
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
      tick();
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

function enable() {
  const styles = document.createElement('style');
  styles.id = 'note-styling';
  styles.textContent = CSS;

  document.addEventListener('add-note', observe);

  ready().then(() => {
    iframe.contentDocument.body.append(styles);

    try {
      iframe.contentDocument.execCommand('defaultParagraphSeparator', false, 'p');
    }
    catch (e) { /* not supported */ }

    // Capture Cmd+[/] before Chrome uses it for navigation
    iframe.contentWindow.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
        const el = iframe.contentDocument.activeElement;
        if (el && el.classList.contains('note')) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }, true);

    chrome.storage.local.get({
      [key]: {},
      'notes:last-type': 0,
      'notes:font-size': 14
    }, prefs => {
      lastType = prefs['notes:last-type'];
      noteFontSize = prefs['notes:font-size'];
      iframe.contentDocument.body.style.setProperty('--note-font-size', noteFontSize + 'px');
      for (const [id, note] of Object.entries(prefs[key])) {
        add(id, note);
      }
    });
  });
}

function disable() {
  document.removeEventListener('add-note', observe);
  try {
    iframe.contentDocument.getElementById('note-styling').remove();
  }
  catch (e) { /* already removed */ }
}

export {enable, disable};
