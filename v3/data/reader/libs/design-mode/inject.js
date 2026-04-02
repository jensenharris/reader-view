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

  // unload
  const unload = (report = true) => {
    doc.removeEventListener('click', noredirect, true);
    doc.removeEventListener('mouseover', onmouseover);
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
      doc.execCommand(command);
      stop();
    }
    else if (command === 'link') {
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
      doc.execCommand('formatBlock', false, 'p');
      stop();
    }
    else if (command === 'heading-1') {
      doc.execCommand('formatBlock', false, 'h1');
      stop();
    }
    else if (command === 'heading-2') {
      doc.execCommand('formatBlock', false, 'h2');
      stop();
    }
    else if (command === 'heading-3') {
      doc.execCommand('formatBlock', false, 'h3');
      stop();
    }
    else if (command === 'blockquote') {
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
    else if (command === 'move') {
      toolbar.style.left = (parseInt(toolbar.style.left) + e.data.data.dx) + 'px';
      toolbar.style.top = (parseInt(toolbar.style.top) + e.data.data.dy) + 'px';
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
  const startLeft = Math.max(10, Math.round((window.innerWidth - 490) / 2));
  toolbar.style = `
    z-index: calc(Infinity);
    position: fixed;
    top: 10px;
    left: ${startLeft}px;
    width: 490px;
    height: 40px;
    border: solid 1px rgba(0,0,0,0.1);
    border-radius: 12px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.06);
    overflow: hidden;
  `;
  document.documentElement.appendChild(toolbar);
}
