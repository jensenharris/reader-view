/**
    Sunny Reader

    Copyright © 2026 Jensen Harris

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

/* global config */
'use strict';

const checkboxPrefs = [
  'auto-fullscreen', 'embedded', 'os-sync', 'display-loader',
  'reader-mode', 'faqs', 'cache-highlights',
  'context-open-in-reader-view', 'context-open-in-reader-view-bg',
  'context-switch-to-reader-view',
  'printing-button', 'screenshot-button', 'note-button', 'mail-button',
  'save-button', 'fullscreen-button', 'speech-button', 'images-button',
  'highlight-button', 'design-mode-button', 'navigate-buttons', 'show-icon',
  './plugins/tip/core.mjs', './plugins/doi/core.mjs',
  './plugins/note/core.mjs', './plugins/notify/core.mjs',
  './plugins/health/core.mjs', './plugins/chapters/core.mjs',
  './plugins/multiple-articles/core.mjs', './plugins/qr-code/core.mjs'
];

const valuePrefs = ['user-css', 'tts-scroll', 'highlights-count'];

// optional permission
{
  const request = e => {
    if (e.target.checked) {
      chrome.permissions.request({
        origins: ['*://*/*']
      }, granted => {
        if (granted === false) {
          e.target.checked = false;
        }
      });
    }
  };
  document.getElementById('context-open-in-reader-view').addEventListener('change', request);
  document.getElementById('context-open-in-reader-view-bg').addEventListener('change', request);
  document.getElementById('reader-mode').addEventListener('change', request);
}

document.getElementById('auto-permission').addEventListener('click', e => {
  e.preventDefault();
  chrome.permissions.request({
    origins: ['*://*/*']
  }, granted => {
    if (granted) {
      document.getElementById('auto-rules').disabled = false;
      document.getElementById('auto-permission').classList.add('hidden');
      document.getElementById('proceed-wo-permission').classList.add('hidden');
    }
  });
});
document.getElementById('proceed-wo-permission').addEventListener('click', e => {
  e.preventDefault();

  if (e.target.origins) {
    chrome.permissions.request({
      origins: e.target.origins
    }, () => {
      document.getElementById('auto-rules').disabled = false;
      e.target.classList.add('hidden');
    });
    delete e.target.origins;
    e.target.textContent = 'Limited Host Access';
  }
  else {
    const hosts = prompt('Comma-separated list of hosts (e.g. example.com, google.com)');
    if (hosts) {
      e.target.origins = hosts.split(/\s*,\s*/).filter(s => s).map(h => {
        if (h.startsWith('http')) {
          return h;
        }
        return '*://' + h + '/*';
      });
      e.target.textContent = 'Click to Confirm';
    }
  }
});
chrome.permissions.contains({
  origins: ['*://*/*']
}, granted => {
  if (granted) {
    document.getElementById('auto-rules').disabled = false;
    document.getElementById('auto-permission').classList.add('hidden');
    document.getElementById('proceed-wo-permission').classList.add('hidden');
  }
});

function save() {
  const json = document.getElementById('auto-rules').value.split(/\s*,\s*/).filter((s, i, l) => {
    return s && l.indexOf(s) === i;
  });
  document.getElementById('auto-rules').value = json.join(', ');

  let actions = [];
  try {
    actions = JSON.parse(document.getElementById('user-action').value);
  }
  catch (e) {
    alert('unable to parse "User actions":\n\n' + e.message);
    console.warn(e);
    if (config.prefs['user-action']) {
      actions = config.prefs['user-action'];
    }
  }

  const shortcuts = {};
  for (const div of [...document.getElementById('shortcuts').querySelectorAll('div')]) {
    const [ctrl, shift] = [...div.querySelectorAll('input[type=checkbox]')];
    const key = div.querySelector('input[type=text]');
    const id = div.dataset.id;

    if (key.value) {
      shortcuts[id] = [];
      if (ctrl.checked) {
        shortcuts[id].push('Ctrl/Command');
      }
      if (shift.checked) {
        shortcuts[id].push('Shift');
      }
      shortcuts[id].push(key.value.replace(/key/i, 'Key'));
    }
    else {
      shortcuts[id] = config.prefs.shortcuts[id];
    }
    ctrl.checked = config.prefs.shortcuts[id].indexOf('Ctrl/Command') !== -1;
    shift.checked = config.prefs.shortcuts[id].indexOf('Shift') !== -1;
    key.value = config.prefs.shortcuts[id].filter(s => s !== 'Ctrl/Command' && s !== 'Shift')[0];
  }

  const fonts = new Map();
  for (const line of document.getElementById('supported-fonts').value.split('\n')) {
    const [name, value] = line.split(/\s*:\s*/);
    if (name && value) {
      fonts.set(name.trim(), value.trim());
    }
  }

  const el = document.getElementById('max-wait-for-page-load');
  const waitTime = Math.max(0, Number.isNaN(el.valueAsNumber) ? 3 : el.valueAsNumber);

  const prefs = {};
  for (const key of checkboxPrefs) {
    prefs[key] = document.getElementById(key).checked;
  }
  for (const key of valuePrefs) {
    prefs[key] = document.getElementById(key).value;
  }

  Object.assign(prefs, {
    'auto-rules': json,
    'top-css': document.getElementById('top-style').value,
    'max-wait-for-page-load': waitTime,
    'user-action': actions,
    'tts-delay': Math.max(document.getElementById('tts-delay').value, 0),
    'title': document.getElementById('title').value || '[ORIGINAL] :: [BRAND]',
    'supported-fonts': Array.from(fonts, ([name, value]) => ({name, value})),
    shortcuts
  });

  chrome.storage.local.set(prefs, () => {
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(() => status.textContent = '', 750);
  });
}

function restore() {
  for (const key of checkboxPrefs) {
    document.getElementById(key).checked = config.prefs[key];
  }
  for (const key of valuePrefs) {
    document.getElementById(key).value = config.prefs[key];
  }

  document.getElementById('auto-rules').value = config.prefs['auto-rules'].join(', ');
  document.getElementById('top-style').value = config.prefs['top-css'];
  document.getElementById('user-action').value = JSON.stringify(config.prefs['user-action'], null, '  ');
  document.getElementById('max-wait-for-page-load').value = config.prefs['max-wait-for-page-load'];
  document.getElementById('tts-delay').value = config.prefs['tts-delay'];
  document.getElementById('title').value = config.prefs['title'];

  for (const div of [...document.getElementById('shortcuts').querySelectorAll('div')]) {
    const [ctrl, shift] = [...div.querySelectorAll('input[type=checkbox]')];
    const key = div.querySelector('input[type=text]');
    const id = div.dataset.id;
    ctrl.checked = config.prefs.shortcuts[id].indexOf('Ctrl/Command') !== -1;
    shift.checked = config.prefs.shortcuts[id].indexOf('Shift') !== -1;
    key.value = config.prefs.shortcuts[id].filter(s => s !== 'Ctrl/Command' && s !== 'Shift')[0];
  }

  document.getElementById('supported-fonts').value = config.prefs['supported-fonts']
    .map(({name, value}) => name + ': ' + value).join('\n');
}
config.load(restore);
document.getElementById('save').addEventListener('click', save);

document.getElementById('support').addEventListener('click', () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '?rd=donate'
}));

document.getElementById('bug').addEventListener('click', () => chrome.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '#reviews'
}));

document.getElementById('reload').addEventListener('click', () => chrome.runtime.reload());

document.getElementById('reset').addEventListener('click', e => {
  if (e.detail === 1) {
    const status = document.getElementById('status');
    window.setTimeout(() => status.textContent = '', 750);
    status.textContent = 'Double-click to reset!';
  }
  else {
    localStorage.clear();
    chrome.storage.local.clear(() => {
      chrome.runtime.reload();
      window.close();
    });
  }
});

if (navigator.userAgent.indexOf('Firefox') !== -1) {
  document.getElementById('rate').href =
    'https://addons.mozilla.org/en-US/firefox/addon/reader-view/reviews/';
}
else if (navigator.userAgent.indexOf('OPR') !== -1) {
  document.getElementById('rate').href =
    'https://addons.opera.com/en/extensions/details/reader-view-2/#feedback-container';
}
else if (navigator.userAgent.indexOf('Edg/') !== -1) {
  document.getElementById('rate').href =
    'https://microsoftedge.microsoft.com/addons/detail/lpmbefndcmjoaepdpgmoonafikcalmnf';
}

document.getElementById('export-highlights').addEventListener('click', () => {
  chrome.storage.local.get({
    'highlights-objects': {}
  }, prefs => {
    const blob = new Blob([
      JSON.stringify(prefs['highlights-objects'], null, '  ')
    ], {
      type: 'application/json'
    });
    const href = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href,
      type: 'application/json',
      download: 'reader-view-highlights.json'
    }).dispatchEvent(new MouseEvent('click'));
    setTimeout(() => URL.revokeObjectURL(href));
  });
});

document.getElementById('import-highlights').addEventListener('click', () => {
  const input = document.createElement('input');
  input.style.display = 'none';
  input.type = 'file';
  input.accept = '.json';
  input.acceptCharset = 'utf-8';

  document.body.appendChild(input);
  input.initialValue = input.value;
  input.onchange = () => {
    if (input.value !== input.initialValue) {
      const file = input.files[0];
      if (file.size > 100e6) {
        console.warn('100MB backup? I don\'t believe you.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = event => {
        input.remove();
        const json = JSON.parse(event.target.result);
        chrome.storage.local.get({
          'highlights-objects': {},
          'highlights-keys': []
        }, prefs => {
          for (const href of Object.keys(json)) {
            prefs['highlights-keys'].push(href);
            prefs['highlights-objects'][href] = prefs['highlights-objects'][href] || [];
            prefs['highlights-objects'][href].push(...json[href]);

            chrome.runtime.sendMessage({
              cmd: 'append-highlights',
              href,
              highlights: json[href]
            });
          }
          prefs['highlights-keys'] = prefs['highlights-keys'].filter((s, i, l) => {
            return s && l.indexOf(s) === i;
          });
          chrome.storage.local.set(prefs);
        });
      };
      reader.readAsText(file, 'utf-8');
    }
  };
  input.click();
});

document.getElementById('export-notes').addEventListener('click', () => {
  const cache = {};
  chrome.storage.local.get(null, prefs => {
    for (const [key, value] of Object.entries(prefs)) {
      if (key.startsWith('notes:')) {
        cache[key] = value;
      }
    }
    const blob = new Blob([
      JSON.stringify(cache, null, '  ')
    ], {
      type: 'application/json'
    });
    const href = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href,
      type: 'application/json',
      download: 'reader-view-notes.json'
    }).dispatchEvent(new MouseEvent('click'));
    setTimeout(() => URL.revokeObjectURL(href));
  });
});
document.getElementById('import-notes').addEventListener('click', () => {
  const input = document.createElement('input');
  input.style.display = 'none';
  input.type = 'file';
  input.accept = '.json';
  input.acceptCharset = 'utf-8';

  document.body.appendChild(input);
  input.initialValue = input.value;
  input.onchange = () => {
    if (input.value !== input.initialValue) {
      const file = input.files[0];
      if (file.size > 100e6) {
        console.warn('100MB backup? I don\'t believe you.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = event => {
        input.remove();
        const json = JSON.parse(event.target.result);
        chrome.storage.local.get(null, prefs => {
          for (const [key, value] of Object.entries(json)) {
            prefs[key] = Object.assign(prefs[key] || {}, value);
          }
          chrome.storage.local.set(prefs);
        });
      };
      reader.readAsText(file, 'utf-8');
    }
  };
  input.click();
});

document.getElementById('export').addEventListener('click', () => {
  chrome.storage.local.get(null, prefs => {
    const text = JSON.stringify(prefs, null, '\t');
    const blob = new Blob([text], {type: 'application/json'});
    const objectURL = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: objectURL,
      type: 'application/json',
      download: 'reader-view-preferences.json'
    }).dispatchEvent(new MouseEvent('click'));
    setTimeout(() => URL.revokeObjectURL(objectURL));
  });
});
document.getElementById('import').addEventListener('click', () => {
  const fileInput = document.createElement('input');
  fileInput.style.display = 'none';
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.acceptCharset = 'utf-8';

  document.body.appendChild(fileInput);
  fileInput.initialValue = fileInput.value;
  fileInput.onchange = readFile;
  fileInput.click();

  function readFile() {
    if (fileInput.value !== fileInput.initialValue) {
      const file = fileInput.files[0];
      if (file.size > 100e6) {
        return console.warn('The file is too large!');
      }
      const fReader = new FileReader();
      fReader.onloadend = event => {
        fileInput.remove();
        const json = JSON.parse(event.target.result);
        chrome.storage.local.set(json, () => chrome.runtime.reload());
      };
      fReader.readAsText(file, 'utf-8');
    }
  }
});

// links
for (const a of [...document.querySelectorAll('[data-href]')]) {
  if (a.hasAttribute('href') === false) {
    a.href = chrome.runtime.getManifest().homepage_url + '#' + a.dataset.href;
  }
}
