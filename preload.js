// Desktop-only bridge: exposes window.slate over IPC. In a browser tab the
// same API comes from slate-http.js, backed by the localhost server.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('slate', {
  saveNote: (filePath, content) => ipcRenderer.invoke('note:save', { filePath, content }),
  flushSync: (filePath, content) => ipcRenderer.sendSync('note:flush', { filePath, content }),
  listNotes: () => ipcRenderer.invoke('notes:list'),
  searchNotes: (query) => ipcRenderer.invoke('notes:search', query),
  readNote: (filePath) => ipcRenderer.invoke('note:read', filePath),
  deleteNote: (filePath) => ipcRenderer.invoke('note:delete', filePath),
  restoreNote: (filePath) => ipcRenderer.invoke('note:restore', filePath),
  switcherState: () => ipcRenderer.invoke('switcher:state'),
  touchNote: (filePath) => ipcRenderer.invoke('switcher:touch', filePath),
  pinNote: (filePath, pinned) => ipcRenderer.invoke('switcher:pin', { filePath, pinned }),
  setStartup: (mode) => ipcRenderer.invoke('switcher:set-startup', mode),
  saveImage: (dataUrl) => ipcRenderer.invoke('image:save', dataUrl),
  readImage: (ref) => ipcRenderer.invoke('image:read', ref),
  revealNote: (filePath) => ipcRenderer.invoke('note:reveal', filePath),
  openFolder: () => ipcRenderer.invoke('notes:folder'),
  importFont: () => ipcRenderer.invoke('font:import'),
  readFont: (file) => ipcRenderer.invoke('font:read', file),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setPrefs: (partial) => ipcRenderer.invoke('prefs:set', partial),
  chooseFolder: () => ipcRenderer.invoke('settings:choose-folder'),
  openBrowser: () => ipcRenderer.invoke('server:open'),
  isDesktop: true,
  setWindowBg: (color) => ipcRenderer.invoke('set-window-bg', color),
  onFlush: (cb) => ipcRenderer.on('app:flush', cb),
  onNewNote: (cb) => ipcRenderer.on('app:new-note', cb),
});
