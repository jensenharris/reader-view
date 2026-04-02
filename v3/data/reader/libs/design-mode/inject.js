/* global iframe */
'use strict';

[...document.querySelectorAll('.edit-toolbar')].forEach(e => e.remove());

[...iframe.contentDocument.querySelectorAll('[contenteditable]')].forEach(e => e.removeAttribute('contenteditable'));

{
  const toolbar = document.createElement('iframe');
  const doc = iframe.contentDocument;
  toolbar.onload = () => {
    toolbar.contentWindow.postMessage({
      method: 'spellcheck',
      value: doc.body.spellcheck
    }, '*');
  };

  // do not allow link opening
  const noredirect = e => {
    if (e.target.closest('a[href]')) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  doc.addEventListener('click', noredirect, true);

  // resize images
  const resize = doc.createElement('span');
  resize.style = `
    position: absolute;
    width: 16px;
    height: 16px;
    background-color: rgba(125, 0, 0, 0.5);
    border: solid 1px #fff;
    box-sizing: border-box;
    display: none;
    cursor: move;
  `;
  const move = e => {
    resize.img.width += e.movementX;
    const rect = resize.img.getBoundingClientRect();
    const b = doc.body.getBoundingClientRect();

    resize.style.left = (rect.right - b.left - 16) + 'px';
    resize.style.top = (rect.bottom - b.top - 16) + 'px';
    e.preventDefault();
    e.stopPropagation();
  };
  resize.onmousedown = () => {
    doc.body.style['user-select'] = 'none';
    doc.addEventListener('mousemove', move);
  };
  doc.addEventListener('mouseup', () => {
    doc.body.style['user-select'] = 'initial';
    doc.removeEventListener('mousemove', move);
  });
  doc.body.appendChild(resize);
  const onmouseover = e => {
    if (e.target === resize) {
      return;
    }
    if (e.target.tagName === 'IMG') {
      const rect = e.target.getBoundingClientRect();
      const b = doc.body.getBoundingClientRect();

      resize.style.left = (rect.right - b.left - 16) + 'px';
      resize.style.top = (rect.bottom - b.top - 16) + 'px';
      resize.style.display = 'block';
      resize.img = e.target;
    }
    else {
      resize.style.display = 'none';
    }
  };
  doc.addEventListener('mouseover', onmouseover);

  // toolbar positioning constants
  const toolbarWidth = 490;
  const toolbarHeight = 40;
  const snapThreshold = 28;
  const edgePadding = 10;

  // snap state: which edges the toolbar is anchored to
  // each property is either false (not snapped) or a number (gap in px from that edge)
  const snappedEdge = {top: edgePadding, right: false, bottom: false, left: false};

  // track whether the user is currently dragging
  let dragging = false;

  // clamp toolbar position to stay fully on screen
  const clampPosition = (left, top) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      left: Math.max(0, Math.min(vw - toolbarWidth, left)),
      top: Math.max(0, Math.min(vh - toolbarHeight, top))
    };
  };

  // resolve position from current snap state
  const positionFromSnap = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = parseInt(toolbar.style.left) || 0;
    let top = parseInt(toolbar.style.top) || 0;

    if (snappedEdge.left !== false) {
      left = snappedEdge.left;
    }
    else if (snappedEdge.right !== false) {
      left = vw - toolbarWidth - snappedEdge.right;
    }

    if (snappedEdge.top !== false) {
      top = snappedEdge.top;
    }
    else if (snappedEdge.bottom !== false) {
      top = vh - toolbarHeight - snappedEdge.bottom;
    }

    return clampPosition(left, top);
  };

  // apply position to the toolbar element
  const applyPosition = (left, top) => {
    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';
  };

  // evaluate whether the toolbar should snap to any edge based on its current position
  const evaluateSnap = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = parseInt(toolbar.style.left) || 0;
    const top = parseInt(toolbar.style.top) || 0;

    const distLeft = left;
    const distRight = vw - toolbarWidth - left;
    const distTop = top;
    const distBottom = vh - toolbarHeight - top;

    // horizontal snap
    if (distLeft <= snapThreshold) {
      snappedEdge.left = distLeft;
      snappedEdge.right = false;
    }
    else if (distRight <= snapThreshold) {
      snappedEdge.right = distRight;
      snappedEdge.left = false;
    }
    else {
      snappedEdge.left = false;
      snappedEdge.right = false;
    }

    // vertical snap
    if (distTop <= snapThreshold) {
      snappedEdge.top = distTop;
      snappedEdge.bottom = false;
    }
    else if (distBottom <= snapThreshold) {
      snappedEdge.bottom = distBottom;
      snappedEdge.top = false;
    }
    else {
      snappedEdge.top = false;
      snappedEdge.bottom = false;
    }

    // if snapped, animate to the exact snapped position
    const snapped = snappedEdge.left !== false || snappedEdge.right !== false ||
                    snappedEdge.top !== false || snappedEdge.bottom !== false;
    if (snapped) {
      const pos = positionFromSnap();
      toolbar.style.transition = 'left 0.15s ease-out, top 0.15s ease-out';
      applyPosition(pos.left, pos.top);
      setTimeout(() => {
        toolbar.style.transition = '';
      }, 160);
    }
  };

  // on window resize, reposition the toolbar
  const onWindowResize = () => {
    const hasSnap = snappedEdge.left !== false || snappedEdge.right !== false ||
                    snappedEdge.top !== false || snappedEdge.bottom !== false;
    if (hasSnap) {
      const pos = positionFromSnap();
      applyPosition(pos.left, pos.top);
    }
    else {
      // not snapped: clamp to keep on screen
      const left = parseInt(toolbar.style.left) || 0;
      const top = parseInt(toolbar.style.top) || 0;
      const pos = clampPosition(left, top);
      applyPosition(pos.left, pos.top);
    }
  };
  window.addEventListener('resize', onWindowResize);

  // unload
  const unload = (report = true) => {
    doc.removeEventListener('click', noredirect, true);
    doc.removeEventListener('mouseover', onmouseover);
    window.removeEventListener('resize', onWindowResize);
    resize.remove();
    toolbar.remove();
    chrome.runtime.onMessage.removeListener(onmessage);
    window.onmessage = '';
    if (report) {
      if (doc.designMode === 'on') {
        top.document.getElementById('design-mode-button').click();
      }
    }
  };

  // Check whether the current selection in the reader document is inside a sticky note.
  // When it is, design-mode toolbar commands must not run so they don't interfere with
  // the note's own editing behaviour.
  const selectionInNote = () => {
    const sel = doc.getSelection();
    if (sel && sel.anchorNode) {
      const el = sel.anchorNode.nodeType === Node.ELEMENT_NODE
        ? sel.anchorNode
        : sel.anchorNode.parentElement;
      if (el && el.closest && el.closest('.note')) {
        return true;
      }
    }
    // Also check active element (for cases where selection is collapsed / no selection)
    if (doc.activeElement && doc.activeElement.closest && doc.activeElement.closest('.note')) {
      return true;
    }
    return false;
  };

  window.onmessage = e => {
    const command = e.data.method;
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    if (
      command === 'bold' || command === 'italic' || command === 'insertorderedlist' || command === 'removeformat' ||
      command === 'insertunorderedlist' || command === 'indent' || command === 'outdent' || command === 'underline'
    ) {
      if (selectionInNote()) return;
      doc.execCommand(command);
      stop();
    }
    else if (command === 'link') {
      if (selectionInNote()) return;
      const href = prompt('Enter a URL (keep blank to remove link):', '');
      if (href) {
        doc.execCommand('createlink', false, href);
      }
      else {
        doc.execCommand('unlink');
      }
      stop();
    }
    else if (command === 'insertimage') {
      if (selectionInNote()) return;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = () => {
          doc.execCommand('insertimage', false, reader.result);
        };
        if (file) {
          reader.readAsDataURL(file);
        }
      };
      input.click();

      stop();
    }
    else if (command === 'heading-0') {
      if (selectionInNote()) return;
      doc.execCommand('formatBlock', false, 'p');
      stop();
    }
    else if (command === 'heading-1') {
      if (selectionInNote()) return;
      doc.execCommand('formatBlock', false, 'h1');
      stop();
    }
    else if (command === 'heading-2') {
      if (selectionInNote()) return;
      doc.execCommand('formatBlock', false, 'h2');
      stop();
    }
    else if (command === 'heading-3') {
      if (selectionInNote()) return;
      doc.execCommand('formatBlock', false, 'h3');
      stop();
    }
    else if (command === 'blockquote') {
      if (selectionInNote()) return;
      // find the parent element for quoting
      const find = () => {
        const sel = doc.getSelection();
        let node = sel.anchorNode;
        while (node && node.nodeType === 3) {
          node = node.parentNode;
        }
        while (node && node.nodeType === 1 && node.tagName !== 'BODY' && node.tagName !== 'BLOCKQUOTE') {
          if (['P', 'DIV', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName)) {
            break;
          }
          node = node.parentNode;
        }
        return node;
      };

      const node = find();
      if (node && node.tagName === 'BLOCKQUOTE') {
        doc.execCommand('formatBlock', false, node.dataset.tag || 'p');
      }
      else {
        const tag = node.tagName; // store for reversing
        doc.execCommand('formatBlock', false, 'blockquote');
        if (['P', 'DIV', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) {
          // find the new blockquote element
          const n = find();
          if (n.tagName === 'BLOCKQUOTE') {
            n.dataset.tag = tag;
          }
        }
      }

      stop();
    }
    else if (command === 'dragstart') {
      dragging = true;
      // release snap on drag start so position becomes absolute pixel-based
      snappedEdge.left = false;
      snappedEdge.right = false;
      snappedEdge.top = false;
      snappedEdge.bottom = false;
      stop();
    }
    else if (command === 'dragend') {
      dragging = false;
      evaluateSnap();
      stop();
    }
    else if (command === 'move') {
      const left = (parseInt(toolbar.style.left) || 0) + e.data.data.dx;
      const top = (parseInt(toolbar.style.top) || 0) + e.data.data.dy;
      const pos = clampPosition(left, top);
      applyPosition(pos.left, pos.top);
      stop();
    }
    else if (command === 'close') {
      unload();
      stop();
    }
    else if (command === 'spellcheck:false') {
      doc.body.spellcheck = false;
    }
    else if (command === 'spellcheck:true') {
      doc.body.spellcheck = true;
    }
  };

  toolbar.src = chrome.runtime.getURL('/data/reader/libs/design-mode/index.html');
  toolbar.classList.add('edit-toolbar');

  const startLeft = Math.max(edgePadding, Math.round((window.innerWidth - toolbarWidth) / 2));
  toolbar.style = `
    z-index: calc(Infinity);
    position: fixed;
    top: ${edgePadding}px;
    left: ${startLeft}px;
    width: ${toolbarWidth}px;
    height: ${toolbarHeight}px;
    border: solid 1px rgba(0,0,0,0.1);
    border-radius: 12px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.06);
    overflow: hidden;
  `;
  document.documentElement.appendChild(toolbar);
}
