const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { familyFromFontFile, fontFamilyFromName } = require('./font-name');

/* ------------------------------------------------------------------ *
 * Papyrus: distraction-free writing. Notes live as .txt files in
 *   Documents\Papyrus\Notes\          (user-changeable in Settings;
 *   older folders stay searchable)
 *
 * A localhost server (127.0.0.1:7331+) serves the exact same UI to a
 * browser tab, backed by this process, so notes stay plain files on disk.
 *
 * First run under the Papyrus name: carry over the old Blank Slate data
 * folder (settings, window size, browser profile incl. chosen theme).
 * ------------------------------------------------------------------ */
try {
  const newDataDir = app.getPath('userData');
  const oldDataDir = path.join(path.dirname(newDataDir), 'Blank Slate');
  // Key off settings.json, not the folder: Electron/Chromium pre-creates
  // the user-data dir before this script runs.
  if (
    !fs.existsSync(path.join(newDataDir, 'settings.json')) &&
    fs.existsSync(path.join(oldDataDir, 'settings.json'))
  ) {
    for (const item of ['settings.json', 'window-state.json', 'Local Storage', 'Session Storage']) {
      try {
        const src = path.join(oldDataDir, item);
        if (!fs.existsSync(src)) continue;
        const dst = path.join(newDataDir, item);
        fs.rmSync(dst, { recursive: true, force: true });
        fs.cpSync(src, dst, { recursive: true });
      } catch (err) {
        console.error(`profile migration (${item}) failed:`, err);
      }
    }
  }
} catch (err) {
  console.error('profile migration failed:', err);
}

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_NOTES_DIR = path.join(app.getPath('documents'), 'Papyrus', 'Notes');
const FONTS_DIR = path.join(app.getPath('userData'), 'Fonts');
const FONT_FILE_RE = /^[A-Za-z0-9._-]+\.(ttf|otf|woff2?)$/i;
const MAX_RESULTS = 80;
const PORT_BASE = 7331;

// Prefs are validated the same way when loading and when saving: anything of
// the wrong type or out of range comes back as null, meaning "use the default".
const asFont = (v) => (typeof v === 'string' ? v.slice(0, 80) : null);
const asSize = (v) => (typeof v === 'number' && v >= 10 && v <= 48 ? Math.round(v) : null);
const asSpacing = (v) => (typeof v === 'number' && v >= 1 && v <= 3 ? Math.round(v * 100) / 100 : null);

let win = null;
let tray = null;
let server = null;
let browserUrl = null;
let isQuitting = false;
let settings = loadSettings();

/* ------------------------------ settings ------------------------------ */

function loadSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return {
      notesDir: typeof s.notesDir === 'string' && s.notesDir.trim() ? s.notesDir : DEFAULT_NOTES_DIR,
      legacyDirs: Array.isArray(s.legacyDirs)
        ? s.legacyDirs.filter((d) => typeof d === 'string' && d.trim())
        : [],
      theme: typeof s.theme === 'string' && s.theme ? s.theme : null,
      font: asFont(s.font),
      fontSize: asSize(s.fontSize),
      lineSpacing: asSpacing(s.lineSpacing),
      importedFonts: Array.isArray(s.importedFonts)
        ? s.importedFonts.filter(
            (f) => f && typeof f.family === 'string' && typeof f.file === 'string' && FONT_FILE_RE.test(f.file)
          )
        : [],
    };
  } catch {
    return { notesDir: DEFAULT_NOTES_DIR, legacyDirs: [], theme: null, font: null, fontSize: null, lineSpacing: null, importedFonts: [] };
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('settings save failed:', err);
  }
}

// Small UI prefs (currently just the theme) live in settings.json so the
// desktop window and every browser tab start out looking the same.
function setPrefs(partial) {
  let changed = false;
  if (partial && typeof partial === 'object') {
    if (typeof partial.theme === 'string' && partial.theme && partial.theme !== settings.theme) {
      settings.theme = partial.theme;
      changed = true;
    }
    const font = asFont(partial.font);
    if (font !== null && font !== settings.font) {
      settings.font = font;
      changed = true;
    }
    const fontSize = asSize(partial.fontSize);
    if (fontSize !== null && fontSize !== settings.fontSize) {
      settings.fontSize = fontSize;
      changed = true;
    }
    const lineSpacing = asSpacing(partial.lineSpacing);
    if (lineSpacing !== null && lineSpacing !== settings.lineSpacing) {
      settings.lineSpacing = lineSpacing;
      changed = true;
    }
    if (Array.isArray(partial.importedFonts)) {
      const byFamily = new Map();
      for (const f of partial.importedFonts) {
        if (!f || typeof f.family !== 'string' || typeof f.file !== 'string') continue;
        const family = f.family.trim().slice(0, 60);
        const file = f.file; // must be a bare file name: FONT_FILE_RE allows no separators
        if (!family || !FONT_FILE_RE.test(file)) continue;
        byFamily.set(family, { family, file });
      }
      const deduped = [...byFamily.values()];
      const keep = new Set(deduped.map((f) => f.file));
      for (const f of settings.importedFonts || []) {
        if (f && f.file && !keep.has(f.file)) {
          try {
            fs.unlinkSync(path.join(FONTS_DIR, f.file));
          } catch {
            /* already gone */
          }
        }
      }
      if (JSON.stringify(deduped) !== JSON.stringify(settings.importedFonts || [])) {
        settings.importedFonts = deduped;
        changed = true;
      }
    }
    if (changed) saveSettings();
  }
  return { theme: settings.theme || null, font: settings.font || null, fontSize: settings.fontSize || null };
}

// The one shape both surfaces (IPC and /api/settings) hand to the renderer.
const settingsSnapshot = () => ({
  notesDir: settings.notesDir,
  legacyDirs: settings.legacyDirs,
  theme: settings.theme || null,
  font: settings.font || null,
  fontSize: settings.fontSize || null,
  lineSpacing: settings.lineSpacing || null,
  importedFonts: settings.importedFonts || [],
  browserUrl,
});

function allNoteDirs() {
  const seen = new Set();
  const out = [];
  for (const d of [settings.notesDir, ...settings.legacyDirs]) {
    const key = path.resolve(d);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/* ------------------------------ helpers ------------------------------ */

const pad = (n) => String(n).padStart(2, '0');

// "2026-10-27 134038" — the stamp both new notes and new images are named by.
const timestamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

// Dialogs behave the same with or without a window to parent to.
const ask = (opts) => (win ? dialog.showMessageBoxSync(win, opts) : dialog.showMessageBoxSync(opts));
const pick = (opts) => (win ? dialog.showOpenDialogSync(win, opts) : dialog.showOpenDialogSync(opts));

function ensureNotesDir() {
  fs.mkdirSync(settings.notesDir, { recursive: true });
}

function isNoteFile(name) {
  return /\.(txt|md|markdown)$/i.test(name) && !name.startsWith('.');
}

function withinNoteDirs(filePath) {
  try {
    return allNoteDirs().some((dir) => {
      const rel = path.relative(dir, filePath);
      return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
    });
  } catch {
    return false;
  }
}

const IMAGE_MARKER_RE = /!\[[^\]]*\]\(images\/(?:[^()\n]|\([^()\n]*\))+\)/g;

function titleFrom(content) {
  const line = content
    .split(/\r?\n/)
    .map((l) => l.replace(IMAGE_MARKER_RE, '').trim())
    .find((l) => l.length > 0);
  return line ? line.replace(/\s+/g, ' ').trim() : '';
}

function sanitize(title) {
  return title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 44)
    .trim();
}

// What a note is called in lists: its first non-empty line, else its filename
// without the timestamp prefix, else a generic name.
function titleOf(head, name) {
  return (
    titleFrom(head) ||
    name
      .replace(/\.(txt|md|markdown)$/i, '')
      .replace(/^\d{4}-\d{2}-\d{2} \d{6} - /, '')
      .trim() ||
    'Untitled'
  );
}

// One-line previews/snippets: picture references become "[image]", the
// whitespace folds into single spaces.
const cleanText = (s) => s.replace(IMAGE_MARKER_RE, '[image]').replace(/\s+/g, ' ').trim();

// Titles and previews only need a note's first bytes — listing a folder
// shouldn't read whole files.
function readHead(filePath, max = 800) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(max);
    const n = fs.readSync(fd, buf, 0, max, 0);
    return buf.toString('utf8', 0, n);
  } finally {
    fs.closeSync(fd);
  }
}

function newFilePath(title) {
  const stamp = timestamp();
  const t = sanitize(title);
  const base = t ? `${stamp} - ${t}` : stamp;
  let candidate = path.join(settings.notesDir, `${base}.txt`);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(settings.notesDir, `${base} (${i}).txt`);
    i += 1;
  }
  return candidate;
}

/* ------------------------------ images ------------------------------ */

// Pasted screenshots live in an `images` folder next to the notes, and the
// note itself only ever stores a plain-text reference: ![image](images/…).
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

const IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/i;

function imagesDir() {
  return path.join(settings.notesDir, 'images');
}

// Only files sitting directly inside <notesDir>/images are readable — no
// traversal, no subfolders, nothing else in the notes folder.
function resolveImageRef(ref) {
  if (typeof ref !== 'string' || !/^images\/[^/\\]+$/.test(ref)) return null;
  const abs = path.resolve(settings.notesDir, ref);
  const dir = path.resolve(imagesDir());
  return abs.startsWith(dir + path.sep) ? abs : null;
}

function saveImage(dataUrl) {
  const m = typeof dataUrl === 'string' ? IMAGE_DATA_URL_RE.exec(dataUrl) : null;
  if (!m) return { error: 'Unsupported image type' };
  const ext = /^jpe?g$/i.test(m[1]) ? 'jpg' : m[1].toLowerCase();
  let buf;
  try {
    buf = Buffer.from(m[2], 'base64');
  } catch {
    return { error: 'Could not read image' };
  }
  if (!buf.length) return { error: 'Empty image' };
  const dir = imagesDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return { error: 'Could not create the images folder' };
  }
  const stamp = timestamp();
  // Same-second pastes get a `-2` suffix — never parentheses, which would
  // break the ![image](…) reference parser.
  let file = path.join(dir, `${stamp}.${ext}`);
  let i = 2;
  while (fs.existsSync(file)) {
    file = path.join(dir, `${stamp}-${i}.${ext}`);
    i += 1;
  }
  try {
    fs.writeFileSync(file, buf);
  } catch {
    return { error: 'Could not write image' };
  }
  return { ref: `images/${path.basename(file)}` };
}

function readImageBuffer(ref) {
  const abs = resolveImageRef(ref);
  if (!abs) return null;
  try {
    return {
      body: fs.readFileSync(abs),
      mime: IMAGE_MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

// Anything written by older versions as .md becomes .txt on launch.
function migrateToTxt() {
  for (const dir of allNoteDirs()) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/\.(md|markdown)$/i.test(name)) continue;
      const base = name.replace(/\.(md|markdown)$/i, '');
      const src = path.join(dir, name);
      let dst = path.join(dir, `${base}.txt`);
      let i = 2;
      while (fs.existsSync(dst)) {
        dst = path.join(dir, `${base} (${i}).txt`);
        i += 1;
      }
      try {
        fs.renameSync(src, dst);
      } catch (err) {
        console.error('md->txt migration failed:', err);
      }
    }
  }
}

function doSaveSync({ filePath, content }) {
  if (typeof content !== 'string') return filePath || null;
  // Never persist a completely empty document: no file is created for a
  // blank page, and an existing file keeps its last non-empty content.
  if (!content.trim()) return filePath || null;
  try {
    if (filePath && withinNoteDirs(filePath)) {
      fs.writeFileSync(filePath, content, 'utf8');
      return filePath;
    }
    const target = newFilePath(titleFrom(content));
    fs.writeFileSync(target, content, 'utf8');
    return target;
  } catch (err) {
    console.error('save failed:', err);
    return filePath || null;
  }
}

// Every note file across the current folder and older ones; the scan lives
// here so listing and searching walk the disk exactly the same way.
function* noteFiles() {
  for (const dir of allNoteDirs()) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!isNoteFile(name)) continue;
      const filePath = path.join(dir, name);
      let st;
      try {
        st = fs.statSync(filePath);
      } catch {
        continue;
      }
      if (st.isFile()) yield { filePath, name, st };
    }
  }
}

function listNotes() {
  const out = [];
  for (const { filePath, name, st } of noteFiles()) {
    try {
      const head = readHead(filePath);
      out.push({
        filePath,
        name,
        mtime: st.mtimeMs,
        size: st.size,
        title: titleOf(head, name),
        preview: cleanText(head).slice(0, 200),
      });
    } catch {
      /* skip unreadable files */
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

// Full-text search: one read per file (match, snippet and title all come
// from it), then the same newest-first, capped result list as listNotes.
function searchNotes(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits = [];
  for (const { filePath, name, st } of noteFiles()) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const idx = content.toLowerCase().indexOf(q);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 50);
    const end = Math.min(content.length, idx + q.length + 90);
    hits.push({
      filePath,
      name,
      mtime: st.mtimeMs,
      size: st.size,
      title: titleOf(content.slice(0, 800), name),
      snippet: (start > 0 ? '…' : '') + cleanText(content.slice(start, end)) + (end < content.length ? '…' : ''),
    });
  }
  hits.sort((a, b) => b.mtime - a.mtime);
  return hits.slice(0, MAX_RESULTS);
}

/* ------------------------------ trash (delete is recoverable) ------------------------------ */

// "Delete" moves the note into <notesDir>/.trash with a sortable timestamp
// prefix; restore() strips the prefix and puts it back. purgeTrash() empties
// the folder a month later. .trash is a dot-folder, so isNoteFile() keeps it
// out of listings and searches on its own.
const TRASH_PREFIX_RE = /^\d{4}-\d{2}-\d{2} \d{6} - /;
const TRASH_MAX_AGE = 30 * 24 * 3600 * 1000; // days the trash keeps notes

const trashDir = () => path.join(settings.notesDir, '.trash');

function trashNote(filePath) {
  if (!filePath || !withinNoteDirs(filePath)) return false;
  const base = path.basename(filePath);
  if (!isNoteFile(base)) return false;
  if (path.basename(path.dirname(filePath)) === '.trash') return false; // trash isn't recursive
  const answer = ask({
    type: 'warning',
    buttons: ['Move to Trash', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Delete note',
    message: `Move "${base}" to trash?`,
    detail: 'The note moves to a trash folder and can be restored from there for 30 days.',
  });
  if (answer !== 0) return false;
  const tdir = trashDir();
  try {
    fs.mkdirSync(tdir, { recursive: true });
  } catch {
    return false;
  }
  const stamp = timestamp();
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  let dst = path.join(tdir, `${stamp} - ${base}`);
  let i = 2;
  while (fs.existsSync(dst)) {
    dst = path.join(tdir, `${stamp} - ${stem} (${i})${ext}`);
    i += 1;
  }
  return moveNote(filePath, dst) ? dst : false;
}

function restoreNote(filePath) {
  if (!filePath || !withinNoteDirs(filePath)) return false;
  if (path.basename(path.dirname(filePath)) !== '.trash') return false;
  const base = path.basename(filePath);
  const original = base.replace(TRASH_PREFIX_RE, '');
  if (!original || original.startsWith('.')) return false;
  const ext = path.extname(original);
  const stem = original.slice(0, original.length - ext.length);
  let dst = path.join(settings.notesDir, original);
  let i = 2;
  while (fs.existsSync(dst)) {
    dst = path.join(settings.notesDir, `${stem} (${i})${ext}`);
    i += 1;
  }
  return moveNote(filePath, dst) ? dst : false;
}

// Trashed notes are kept for a month, then go for good. Run once at boot.
function purgeTrash() {
  let names;
  try {
    names = fs.readdirSync(trashDir());
  } catch {
    return; // no trash folder yet
  }
  const cutoff = Date.now() - TRASH_MAX_AGE;
  for (const name of names) {
    const fp = path.join(trashDir(), name);
    try {
      const st = fs.statSync(fp);
      if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(fp);
    } catch {
      /* raced or already gone */
    }
  }
}

/* ------------------------------ switcher state (pins + frecency) ------------------------------ */

// Deliberately its own file (switcher.json beside settings.json): how often
// and how recently every note was opened, plus the pinned list. Both
// surfaces read it through the API and every write is debounced.
const switcherFile = () => path.join(app.getPath('userData'), 'switcher.json');
let switcherState = null;
let switcherTimer = 0;

function loadSwitcher() {
  if (switcherState) return switcherState;
  switcherState = { frecency: {}, pins: [], startup: 'last' };
  try {
    const data = JSON.parse(fs.readFileSync(switcherFile(), 'utf8'));
    if (data && typeof data === 'object') {
      if (data.frecency && typeof data.frecency === 'object') switcherState.frecency = data.frecency;
      if (Array.isArray(data.pins)) switcherState.pins = data.pins.filter((p) => typeof p === 'string');
      if (data.startup === 'last' || data.startup === 'new') switcherState.startup = data.startup;
    }
  } catch {
    /* first run or unreadable: start empty */
  }
  return switcherState;
}

function saveSwitcher() {
  if (!switcherState) return;
  try {
    fs.writeFileSync(switcherFile(), JSON.stringify(switcherState), 'utf8');
  } catch (err) {
    console.error('switcher save failed:', err);
  }
}

function scheduleSwitcherSave() {
  clearTimeout(switcherTimer);
  switcherTimer = setTimeout(() => {
    switcherTimer = 0;
    saveSwitcher();
  }, 400);
}

function switcherSnapshot() {
  const st = loadSwitcher();
  // Frecency for notes that are gone (and were never pinned) ages out here,
  // so the file never grows without bound.
  const pins = new Set(st.pins);
  for (const p of Object.keys(st.frecency)) {
    if (!pins.has(p) && !fs.existsSync(p)) delete st.frecency[p];
  }
  return { frecency: st.frecency, pins: st.pins, startup: st.startup };
}

// What the app opens on launch: the last note ('last', the default) or a
// fresh page ('new'). Lives with the switcher state, not settings.json.
function setStartup(mode) {
  const st = loadSwitcher();
  const next = mode === 'new' ? 'new' : 'last';
  if (next !== st.startup) {
    st.startup = next;
    scheduleSwitcherSave();
  }
  return next;
}

// Counted only for user-initiated opens (renderer calls it from openNote).
function touchNote(filePath) {
  if (!filePath || !withinNoteDirs(filePath)) return false;
  const st = loadSwitcher();
  const rec = st.frecency[filePath] || { count: 0, last: 0 };
  rec.count += 1;
  rec.last = Date.now();
  st.frecency[filePath] = rec;
  scheduleSwitcherSave();
  return true;
}

function pinNote(filePath, pinned) {
  if (!filePath || !withinNoteDirs(filePath)) return false;
  const st = loadSwitcher();
  const at = st.pins.indexOf(filePath);
  if (pinned && at === -1) st.pins.push(filePath);
  else if (!pinned && at !== -1) st.pins.splice(at, 1);
  scheduleSwitcherSave();
  return true;
}

/* ------------------------------ dialogs (work with or without a window) ------------------------------ */

/* ------------------------------ folder picker ------------------------------ */

function moveNote(src, dst) {
  try {
    fs.renameSync(src, dst);
    return true;
  } catch {
    // Different drive (e.g. OneDrive -> local disk): copy then remove.
    try {
      fs.copyFileSync(src, dst);
      fs.unlinkSync(src);
      return true;
    } catch (err) {
      console.error('move failed:', err);
      return false;
    }
  }
}

function uniqueTarget(dir, name) {
  const base = name.replace(/\.(txt|md|markdown)$/i, '');
  let dst = path.join(dir, `${base}.txt`);
  let i = 2;
  while (fs.existsSync(dst)) {
    dst = path.join(dir, `${base} (${i}).txt`);
    i += 1;
  }
  return dst;
}

function chooseFolder() {
  const oldDir = settings.notesDir;

  const pickOpts = {
    title: 'Choose where your notes are saved',
    defaultPath: oldDir,
    properties: ['openDirectory', 'createDirectory'],
  };
  const picked = pick(pickOpts);
  if (!picked || !picked.length) return { cancelled: true };

  const newDir = picked[0];
  if (path.resolve(newDir) === path.resolve(oldDir)) return { cancelled: true };

  fs.mkdirSync(newDir, { recursive: true });

  const oldNotes = fs.existsSync(oldDir)
    ? fs.readdirSync(oldDir).filter((n) => isNoteFile(n) && fs.statSync(path.join(oldDir, n)).isFile())
    : [];

  let mode = 'move';
  if (oldNotes.length) {
    const askOpts = {
      type: 'question',
      buttons: ['Move them', 'Leave them here', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'Existing notes',
      message: `You have ${oldNotes.length} note${oldNotes.length === 1 ? '' : 's'} in your current folder.`,
      detail:
        'Move them to the new folder, or leave them where they are? Notes you leave behind will still show up in search.',
    };
    const answer = ask(askOpts);
    if (answer === 2) return { cancelled: true };
    mode = answer === 0 ? 'move' : 'leave';
  }

  if (mode === 'move') {
    let moved = 0;
    for (const name of oldNotes) {
      if (moveNote(path.join(oldDir, name), uniqueTarget(newDir, name))) moved += 1;
    }
    // Pasted screenshots live in <notesDir>/images so their references
    // keep resolving after the move.
    const oldImages = path.join(oldDir, 'images');
    if (fs.existsSync(oldImages) && fs.statSync(oldImages).isDirectory()) {
      try {
        fs.cpSync(oldImages, path.join(newDir, 'images'), { recursive: true });
        fs.rmSync(oldImages, { recursive: true, force: true });
      } catch {
        // Copy failed halfway? Leave the old folder in place — nothing is lost.
      }
    }
    settings.legacyDirs = settings.legacyDirs.filter(
      (d) => path.resolve(d) !== path.resolve(oldDir) && path.resolve(d) !== path.resolve(newDir)
    );
    settings.notesDir = newDir;
    saveSettings();
    return { notesDir: newDir, mode: 'move', count: moved };
  }

  // Leave old notes where they are, but keep them searchable.
  if (!settings.legacyDirs.some((d) => path.resolve(d) === path.resolve(oldDir))) {
    settings.legacyDirs.push(oldDir);
  }
  settings.legacyDirs = settings.legacyDirs.filter((d) => path.resolve(d) !== path.resolve(newDir));
  settings.notesDir = newDir;
  saveSettings();
  return { notesDir: newDir, mode: 'leave', count: oldNotes.length };
}

/* ------------------------------ imported fonts ------------------------------ */

function importFont() {
  const opts = {
    title: 'Import a font',
    properties: ['openFile'],
    filters: [{ name: 'Font files', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
  };
  const picked = pick(opts);
  if (!picked || !picked.length) return { cancelled: true };
  const src = picked[0];
  const ext = path.extname(src).toLowerCase();
  if (!['.ttf', '.otf', '.woff', '.woff2'].includes(ext)) return { cancelled: true, error: 'Unsupported file type' };

  fs.mkdirSync(FONTS_DIR, { recursive: true });
  const file = `font-${Date.now()}${ext}`;
  const dst = path.join(FONTS_DIR, file);
  try {
    fs.copyFileSync(src, dst);
  } catch (err) {
    console.error('font import failed:', err);
    return { cancelled: true, error: 'Copy failed' };
  }

  let family = null;
  try {
    family = familyFromFontFile(fs.readFileSync(dst));
  } catch {
    family = null;
  }
  family = (family || '').trim().slice(0, 60) || fontFamilyFromName(path.basename(src));
  return { family, file };
}

/* ------------------------------ window ------------------------------ */

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window-state.json'), 'utf8'));
  } catch {
    return {};
  }
}

function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  try {
    fs.writeFileSync(
      path.join(app.getPath('userData'), 'window-state.json'),
      JSON.stringify(win.getNormalBounds()),
      'utf8'
    );
  } catch {
    /* ignore */
  }
}

// --open-to-browser starts with the window hidden; the browser shortcut uses
// this so only the tab opens. The tray or any normal shortcut click shows it.
const hideOnLaunch = process.argv.includes('--open-to-browser');

function createWindow() {
  const s = loadWindowState();
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    width: s.width || 1000,
    height: s.height || 780,
    x: Number.isFinite(s.x) ? s.x : undefined,
    y: Number.isFinite(s.y) ? s.y : undefined,
    minWidth: 460,
    minHeight: 380,
    show: false,
    backgroundColor: dark ? '#121212' : '#ffffff',
    title: 'Papyrus',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  // Any window.open() from the page goes to the system default browser
  // instead of spawning another Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadFile('index.html');
  win.once('ready-to-show', () => {
    if (!hideOnLaunch) win.show();
  });
  win.on('close', saveWindowState);
  win.on('closed', () => {
    win = null;
  });
}

/* ------------------------------ localhost server (browser tab) ------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ico': 'image/x-icon',
};

const STATIC_FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/style.css': 'style.css',
  '/renderer.js': 'renderer.js',
  '/slate-http.js': 'slate-http.js',
  '/icon.ico': 'icon.ico',
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

function sendJson(res, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
  res.end(body);
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    if (req.method === 'GET' && STATIC_FILES[p]) {
      const file = path.join(__dirname, STATIC_FILES[p]);
      const body = fs.readFileSync(file);
      const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' };
      // The icon must reach tabs fresh so artwork updates show up.
      if (p === '/icon.ico') headers['Cache-Control'] = 'no-store';
      res.writeHead(200, headers);
      res.end(body);
      return;
    }

    if (req.method === 'GET') {
      if (p === '/api/ping') return sendJson(res, { ok: true, app: 'Papyrus', browserUrl });
      if (p === '/api/notes') return sendJson(res, listNotes());
      if (p === '/api/search') return sendJson(res, searchNotes(url.searchParams.get('q') || ''));
      if (p === '/api/note') {
        const fp = url.searchParams.get('path');
        return sendJson(res, { content: fp && withinNoteDirs(fp) ? fs.readFileSync(fp, 'utf8') : '' });
      }
      if (p === '/api/image') {
        const img = readImageBuffer(url.searchParams.get('path'));
        if (!img) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': img.mime, 'Cache-Control': 'no-store' });
        res.end(img.body);
        return;
      }
      if (p.startsWith('/fonts/')) {
        let file = '';
        try {
          file = decodeURIComponent(p.slice('/fonts/'.length));
        } catch {
          file = '';
        }
        if (FONT_FILE_RE.test(file)) {
          try {
            const body = fs.readFileSync(path.join(FONTS_DIR, file));
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.end(body);
            return;
          } catch {
            /* fall through to 404 */
          }
        }
      }
      if (p === '/api/settings') {
        return sendJson(res, settingsSnapshot());
      }
      if (p === '/api/switcher-state') return sendJson(res, switcherSnapshot());
    }

    if (req.method === 'POST') {
      const raw = await readBody(req);
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        /* keep defaults */
      }
      if (p === '/api/save' || p === '/api/flush') return sendJson(res, { filePath: doSaveSync(data) });
      if (p === '/api/delete') return sendJson(res, { deleted: trashNote(data.filePath) });
      if (p === '/api/restore') return sendJson(res, { restored: restoreNote(data.filePath) });
      if (p === '/api/switcher-touch') return sendJson(res, { ok: touchNote(data.filePath) });
      if (p === '/api/switcher-pin') return sendJson(res, { ok: pinNote(data.filePath, !!data.pinned) });
      if (p === '/api/switcher-startup') return sendJson(res, { startup: setStartup(data.startup) });
      if (p === '/api/reveal') {
        if (data.filePath && withinNoteDirs(data.filePath)) shell.showItemInFolder(data.filePath);
        return sendJson(res, { ok: true });
      }
      if (p === '/api/open-folder') {
        ensureNotesDir();
        shell.openPath(settings.notesDir);
        return sendJson(res, { ok: true });
      }
      if (p === '/api/prefs') return sendJson(res, setPrefs(data));
      if (p === '/api/save-image') return sendJson(res, saveImage(data.data));
      if (p === '/api/import-font') return sendJson(res, importFont());
      if (p === '/api/choose-folder') return sendJson(res, chooseFolder());
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (err) {
    console.error('server error:', err);
    try {
      res.writeHead(500);
      res.end('Error');
    } catch {
      /* headers already sent */
    }
  }
}

function startServer(port, attempt) {
  const srv = http.createServer((req, res) => {
    handleRequest(req, res);
  });
  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < 9) {
      startServer(port + 1, attempt + 1);
    } else {
      console.error('browser server failed:', err.message);
    }
  });
  srv.listen(port, '127.0.0.1', () => {
    server = srv;
    browserUrl = `http://localhost:${port}`;
    console.log(`Papyrus for browsers: ${browserUrl}`);
  });
}

/* ------------------------------ IPC ------------------------------ */

ipcMain.handle('note:save', (_e, payload) => doSaveSync(payload));
ipcMain.on('note:flush', (e, payload) => {
  e.returnValue = doSaveSync(payload);
});

ipcMain.handle('notes:list', () => listNotes());
ipcMain.handle('notes:search', (_e, q) => searchNotes(String(q || '')));

ipcMain.handle('note:read', (_e, filePath) => {
  if (!filePath || !withinNoteDirs(filePath)) return '';
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
});

ipcMain.handle('note:delete', (_e, filePath) => trashNote(filePath));

ipcMain.handle('note:restore', (_e, filePath) => restoreNote(filePath));

ipcMain.handle('switcher:state', () => switcherSnapshot());
ipcMain.handle('switcher:touch', (_e, filePath) => touchNote(filePath));
ipcMain.handle('switcher:pin', (_e, payload) => pinNote(payload && payload.filePath, !!(payload && payload.pinned)));
ipcMain.handle('switcher:set-startup', (_e, mode) => setStartup(mode));

ipcMain.handle('image:save', (_e, dataUrl) => saveImage(dataUrl));

ipcMain.handle('image:read', (_e, ref) => {
  const img = readImageBuffer(ref);
  return img ? `data:${img.mime};base64,${img.body.toString('base64')}` : null;
});

ipcMain.handle('note:reveal', (_e, filePath) => {
  if (filePath && withinNoteDirs(filePath)) shell.showItemInFolder(filePath);
});

ipcMain.handle('notes:folder', () => {
  ensureNotesDir();
  shell.openPath(settings.notesDir);
});

ipcMain.handle('settings:get', () => settingsSnapshot());

ipcMain.handle('prefs:set', (_e, partial) => setPrefs(partial));

ipcMain.handle('font:import', () => importFont());

ipcMain.handle('font:read', (_e, file) => {
  if (typeof file !== 'string' || !FONT_FILE_RE.test(file)) return null;
  try {
    return fs.readFileSync(path.join(FONTS_DIR, file));
  } catch {
    return null;
  }
});

ipcMain.handle('settings:choose-folder', () => chooseFolder());

ipcMain.handle('server:open', () => {
  if (browserUrl) shell.openExternal(browserUrl);
});

ipcMain.handle('set-window-bg', (_e, color) => {
  if (win && !win.isDestroyed() && /^#[0-9a-fA-F]{6}$/.test(color || '')) {
    win.setBackgroundColor(color);
  }
});

/* ------------------------------ lifecycle ------------------------------ */

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'icon.ico'));
    tray.setToolTip('Papyrus');
    const menu = Menu.buildFromTemplate([
      { label: 'Open Papyrus', click: () => (win ? win.show() : createWindow()) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
    tray.on('click', () => {
      if (!win) createWindow();
      else if (win.isMinimized()) win.restore();
      else win.show();
      win && win.focus();
    });
  } catch (err) {
    console.error('tray failed:', err);
  }
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Clicking the shortcut again = a fresh page in the running app.
    if (!win) {
      createWindow();
      return;
    }
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send('app:new-note');
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.papyrus.app');
    Menu.setApplicationMenu(null);
    ensureNotesDir();
    purgeTrash();
    migrateToTxt();
    createWindow();
    createTray();
    startServer(PORT_BASE, 0);
  });

  app.on('window-all-closed', () => {
    // Keep the process (and the localhost server) alive so browser tabs keep
    // working; the tray menu or taskbar shortcut reopens the window.
    if (!server) app.quit();
  });

  // Give the renderer a moment to flush the last keystrokes before exiting.
  app.on('before-quit', (e) => {
    if (isQuitting || !win) return;
    isQuitting = true;
    e.preventDefault();
    win.webContents.send('app:flush');
    setTimeout(() => {
      saveSwitcher(); // a debounced pin/frecency write must not be lost
      app.exit(0);
    }, 500);
  });
}
