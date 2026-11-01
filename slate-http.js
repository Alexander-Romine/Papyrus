// Browser-side stand-in for the Electron preload bridge (window.slate).
// In the desktop app the preload defines window.slate first and this file
// does nothing; in a browser tab it maps the same API onto the localhost
// server in main.js, so both surfaces share one engine and one notes folder.
(() => {
  'use strict';
  if (window.slate) return;

  const json = (res) => {
    if (!res.ok) throw new Error(`request failed: ${res.status}`);
    return res.json();
  };

  const get = (path) => fetch(path).then(json);

  const post = (path, body) =>
    fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(json);

  window.slate = {
    isDesktop: false,

    saveNote: (filePath, content) => post('/api/save', { filePath, content }).then((r) => r.filePath),

    // Called during pagehide/beforeunload; keepalive lets the request
    // outlive the tab.
    flushSync: (filePath, content) => {
      fetch('/api/flush', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, content }),
      }).catch(() => {});
    },

    listNotes: () => get('/api/notes'),
    searchNotes: (query) => get('/api/search?q=' + encodeURIComponent(query)),
    readFont: (file) =>
      fetch('/fonts/' + encodeURIComponent(file)).then((r) => {
        if (!r.ok) throw new Error('font not found');
        return r.arrayBuffer();
      }),
    importFont: () => post('/api/import-font'),

    readNote: (filePath) =>
      get('/api/note?path=' + encodeURIComponent(filePath)).then((r) => r.content || ''),

    // Delete moves the note to trash; both return the path the file moved
    // to (or false), so the renderer can offer a restore.
    deleteNote: (filePath) => post('/api/delete', { filePath }).then((r) => r.deleted || false),
    restoreNote: (filePath) => post('/api/restore', { filePath }).then((r) => r.restored || false),
    switcherState: () => get('/api/switcher-state'),
    touchNote: (filePath) => post('/api/switcher-touch', { filePath }).then(() => true),
    pinNote: (filePath, pinned) => post('/api/switcher-pin', { filePath, pinned }).then((r) => !!r.ok),
    setStartup: (mode) => post('/api/switcher-startup', { startup: mode }).then((r) => r.startup),
    revealNote: (filePath) => post('/api/reveal', { filePath }),
    openFolder: () => post('/api/open-folder'),

    saveImage: (dataUrl) => post('/api/save-image', { data: dataUrl }),
    readImage: (ref) => Promise.resolve('/api/image?path=' + encodeURIComponent(ref)),

    getSettings: () => get('/api/settings'),
    setPrefs: (partial) => post('/api/prefs', partial),
    chooseFolder: () => post('/api/choose-folder'),
    openBrowser: () => {
      window.open(window.location.origin, '_blank');
      return Promise.resolve({ ok: true });
    },
    setWindowBg: () => {},

    // Events only exist on the desktop; the tab flushes itself on unload.
    onFlush: () => {},
    onNewNote: () => {},
  };
})();
