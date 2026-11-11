(() => {
  'use strict';
  // Papyrus renderer — sections below: themes · editor · images (draw, select,
  // resize, caret steering) · notes & toasts · top bar · switcher · settings ·
  // fonts · wiring · lifecycle · boot. All I/O goes through window.slate
  // (preload.js on desktop, slate-http.js in a browser tab).

  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const editor = $('editor');
  const topbar = $('topbar');
  const counts = $('counts');
  const savedFlag = $('saved-flag');
  const toastEl = $('toast');
  const switcher = $('switcher');
  const searchInput = $('search');
  const results = $('results');
  const previewEl = $('preview');
  const settingsEl = $('settings');
  const themeGrid = $('theme-grid');
  const folderPathEl = $('folder-path');
  const folderMetaEl = $('folder-meta');
  const browserUrlEl = $('browser-url');
  const wrapEl = $('wrap');

  let currentFilePath = null;
  let dirty = false;
  let saveTimer = null;
  let flashTimer = null;
  let topbarTimer = null;
  let toastTimer = null;
  let searchTimer = null;
  let items = [];
  let selected = 0;
  let searchToken = 0;

  /* ------------------------------ themes ------------------------------ */

  const VARS = {
    // Light and Dark are strictly neutral: black, white and grey only,
    // no tint of any kind. The others keep their own character.
    light: {
      '--bg': '#ffffff',
      '--text': '#141414',
      '--muted': '#8b8b8b',
      '--faint': '#b3b3b3',
      '--panel': '#ffffff',
      '--line': 'rgba(0, 0, 0, 0.10)',
      '--hover': 'rgba(0, 0, 0, 0.055)',
      '--sel': 'rgba(0, 0, 0, 0.18)',
      '--caret': '#111111',
      '--accent': '#333333',
      '--link': '#0000ee',
      '--mark': 'rgba(0, 0, 0, 0.14)',
      '--toast-bg': '#141414',
      '--toast-fg': '#ffffff',
      '--shadow': '0 24px 70px rgba(0, 0, 0, 0.20), 0 4px 16px rgba(0, 0, 0, 0.10)',
    },
    dark: {
      '--bg': '#121212',
      '--text': '#e9e9e9',
      '--muted': '#7a7a7a',
      '--faint': '#5c5c5c',
      '--panel': '#1b1b1b',
      '--line': 'rgba(255, 255, 255, 0.10)',
      '--hover': 'rgba(255, 255, 255, 0.07)',
      '--sel': 'rgba(255, 255, 255, 0.20)',
      '--caret': '#ffffff',
      '--accent': '#f0f0f0',
      '--link': '#8ab4f8',
      '--mark': 'rgba(255, 255, 255, 0.18)',
      '--toast-bg': '#242424',
      '--toast-fg': '#eeeeee',
      '--shadow': '0 24px 70px rgba(0, 0, 0, 0.55), 0 4px 16px rgba(0, 0, 0, 0.4)',
    },
    'purple-light': {
      '--bg': '#f7f4fc',
      '--text': '#2c2444',
      '--muted': '#8b83a3',
      '--faint': '#b0a8c4',
      '--panel': '#ffffff',
      '--line': 'rgba(58, 40, 104, 0.11)',
      '--hover': 'rgba(58, 40, 104, 0.07)',
      '--sel': 'rgba(146, 100, 230, 0.28)',
      '--caret': '#8b5cf6',
      '--accent': '#7547d8',
      '--link': '#0000ee',
      '--mark': 'rgba(167, 139, 250, 0.40)',
      '--toast-bg': '#2d2450',
      '--toast-fg': '#f4f0ff',
      '--shadow': '0 24px 70px rgba(48, 30, 92, 0.22), 0 4px 16px rgba(48, 30, 92, 0.10)',
    },
    'purple-dark': {
      '--bg': '#17131f',
      '--text': '#ebe6f6',
      '--muted': '#8f87a8',
      '--faint': '#645d7c',
      '--panel': '#1f1a2b',
      '--line': 'rgba(255, 255, 255, 0.10)',
      '--hover': 'rgba(255, 255, 255, 0.07)',
      '--sel': 'rgba(167, 139, 250, 0.32)',
      '--caret': '#a78bfa',
      '--accent': '#b79bff',
      '--link': '#8ab4f8',
      '--mark': 'rgba(167, 139, 250, 0.36)',
      '--toast-bg': '#2a2340',
      '--toast-fg': '#ebe6f6',
      '--shadow': '0 24px 70px rgba(0, 0, 0, 0.55), 0 4px 16px rgba(0, 0, 0, 0.4)',
    },
    // Sepia's palette, renamed: the app now wears it itself.
    papyrus: {
      '--bg': '#f6efe2',
      '--text': '#3b3226',
      '--muted': '#93856f',
      '--faint': '#b5a68d',
      '--panel': '#fbf6ea',
      '--line': 'rgba(70, 55, 30, 0.13)',
      '--hover': 'rgba(70, 55, 30, 0.07)',
      '--sel': 'rgba(196, 138, 54, 0.32)',
      '--caret': '#a5741f',
      '--accent': '#8a6218',
      '--link': '#0000ee',
      '--mark': 'rgba(214, 164, 74, 0.40)',
      '--toast-bg': '#3b3226',
      '--toast-fg': '#f6efe2',
      '--shadow': '0 24px 70px rgba(60, 45, 22, 0.20), 0 4px 16px rgba(60, 45, 22, 0.10)',
    },
    nord: {
      '--bg': '#2e3440',
      '--text': '#eceff4',
      '--muted': '#9aa7bd',
      '--faint': '#616e85',
      '--panel': '#3b4252',
      '--line': 'rgba(236, 239, 244, 0.14)',
      '--hover': 'rgba(236, 239, 244, 0.08)',
      '--sel': 'rgba(136, 192, 208, 0.30)',
      '--caret': '#88c0d0',
      '--accent': '#88c0d0',
      '--link': '#8ab4f8',
      '--mark': 'rgba(136, 192, 208, 0.40)',
      '--toast-bg': '#434c5e',
      '--toast-fg': '#eceff4',
      '--shadow': '0 24px 70px rgba(0, 0, 0, 0.55), 0 4px 16px rgba(0, 0, 0, 0.4)',
    },
  };

  // Grid order and display names; the look of each theme lives in VARS.
  // Each swatch is a mini mock of the page it produces (built in buildThemeGrid).
  const THEME_ORDER = [
    ['light', 'Light'],
    ['dark', 'Dark'],
    ['purple-light', 'Light Purple'],
    ['purple-dark', 'Dark Purple'],
    ['papyrus', 'Papyrus'], // sepia's palette, renamed — the app now wears it
    ['nord', 'Nord'],
  ];
  const THEMES = THEME_ORDER.map(([key, label]) => ({ key, label, vars: VARS[key] }));

  // The chosen theme is also stored in settings.json (see setPrefs below),
  // so browser tabs inherit whatever the desktop app is using.
  let themeTouched = false;

  function currentThemeKey() {
    return localStorage.getItem('slate-theme') || 'light';
  }

  function applyTheme(key) {
    const theme = THEMES.find((t) => t.key === key) || THEMES[0];
    const vars = theme.vars;

    for (const [name, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(name, value);
    }
    document.documentElement.dataset.theme = theme.key;
    localStorage.setItem('slate-theme', theme.key);
    window.slate.setWindowBg(vars['--bg']);

    themeGrid.querySelectorAll('.swatch').forEach((el) => {
      el.classList.toggle('sel', el.dataset.theme === theme.key);
    });
  }

  function buildThemeGrid() {
    // Built via the DOM API: inline style attributes are blocked by CSP.
    themeGrid.textContent = '';
    for (const t of THEMES) {
      const btn = document.createElement('button');
      btn.className = 'swatch';
      btn.dataset.theme = t.key;
      btn.title = `${t.label} theme`;

      const v = t.vars;
      // Mini mock of the page: an accent marker, then two lines of text.
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.background = v['--bg'];
      const bar = document.createElement('i');
      bar.className = 'bar';
      bar.style.background = v['--accent'];
      const line1 = document.createElement('i');
      line1.className = 'line l1';
      line1.style.background = v['--text'];
      const line2 = document.createElement('i');
      line2.className = 'line l2';
      line2.style.background = v['--muted'];
      chip.append(bar, line1, line2);

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = t.label;

      btn.append(chip, label);
      btn.addEventListener('click', () => {
        themeTouched = true;
        applyTheme(t.key);
        window.slate.setPrefs({ theme: t.key });
      });
      themeGrid.appendChild(btn);
    }
  }

  /* ------------------------------ editor ------------------------------ */

  // The height fix runs once per frame instead of once per keystroke: a typing
  // burst forces one textarea re-layout instead of one each. rAF runs before
  // paint so nothing ever clips; a hidden window or tab throttles rAF, so a
  // timer catches it there (the page is invisible until it comes back).
  let growQueued = false;
  let growTimer = 0;
  function autoGrow() {
    if (growQueued) return;
    growQueued = true;
    requestAnimationFrame(growNow);
    growTimer = setTimeout(growNow, 48);
  }
  function growNow() {
    if (!growQueued) return;
    growQueued = false;
    clearTimeout(growTimer); // rAF won the race; let the pending timer go
    // Collapsing the box to measure it can shrink the document under a
    // scrolled page and clamp the view to the top before the box is put
    // back. The size comes right back in this same tick, so the scroll
    // does too — this dance never moves the reader.
    const keepY = window.scrollY;
    editor.style.height = 'auto';
    editor.style.height = `${editor.scrollHeight}px`;
    if (window.scrollY !== keepY) window.scrollTo(0, keepY);
    scheduleImages();
    // A keystroke can arrive before this grow (Enter past the old bottom):
    // re-check while the typing turn is still open so the line is not left
    // off screen once the box can actually scroll to it.
    if (performance.now() < typingTurnUntil) holdViewForTyping();
    // The counts ride the same once-per-frame pass: a typing burst pays one
    // recount instead of one per keystroke.
    updateMeta();
  }

  // The reader's view only ever moves for the caret when the line being
  // typed has no pixels left on screen. The browser's own caret reveal
  // would otherwise slide the page a line at a time while typing near an
  // edge — the jump the reader notices — so every scroll it makes to
  // reveal the caret inside a keystroke is put right back. Scroll events
  // that arrive outside a typing turn are the reader's own (wheel, keys,
  // programmatic) and just move the anchor; navigation keypresses end the
  // turn early so arrow/Home/End reveals stay native. A line with nothing
  // left on screen gets the smallest scroll that brings it back.
  let viewAnchorY = window.scrollY;
  let typingTurnUntil = 0; // scrolls away from the anchor inside this window = caret reveal

  window.addEventListener('scroll', () => {
    if (window.scrollY === viewAnchorY) return;
    if (performance.now() >= typingTurnUntil) {
      viewAnchorY = window.scrollY; // the reader moved the view
      return;
    }
    window.scrollTo(0, viewAnchorY); // a reveal mid-keystroke: undo it
  });

  function holdViewForTyping() {
    if (document.activeElement !== editor) return;
    // A scroll whose event has not been delivered yet (a wheel or programmatic
    // move between keystrokes) still counts as the reader's: before the turn
    // opens, re-anchor here so nothing below is judged against a stale
    // position. Mid-turn the anchor stays put — the listener undoes any
    // caret reveal and keeps the view where the reader had it.
    if (performance.now() >= typingTurnUntil && window.scrollY !== viewAnchorY) {
      viewAnchorY = window.scrollY;
    }
    typingTurnUntil = performance.now() + 150;
    const vh = window.innerHeight;
    const edRect = editor.getBoundingClientRect();
    // A keystroke can outrun the height grow (Enter past the old bottom):
    // the box is still the old size, so nothing can be judged yet — the
    // re-check from the grow handles it while the turn is still open.
    if (edRect.height < editor.scrollHeight - 1) return;
    // The caret lives inside the editor: a fully visible editor cannot hold
    // an off-screen line, so no reveal is possible — just put the view back
    // where the reader had it if anything moved it.
    if (edRect.bottom <= vh && edRect.top >= 0) {
      typingTurnUntil = 0;
      if (window.scrollY !== viewAnchorY) window.scrollTo(0, viewAnchorY);
      return;
    }
    const lineHeight = syncMirror();
    mirrorHead.textContent = editor.value.slice(0, editor.selectionStart);
    // The mirror hangs at the document's origin, not on the editor, so its
    // height — text top through the caret's own line — measures down from the
    // editor's top edge (the dot span keeps even a caret after a trailing
    // newline on a real line). It is read in document coordinates, which
    // neither a reveal nor a transient clamp can move.
    const mirrorPad = parseFloat(getComputedStyle(mirrorEl).paddingBottom) || 0;
    const lineBottomDoc = edRect.top + window.scrollY + mirrorEl.getBoundingClientRect().height - mirrorPad;
    const lineTopDoc = lineBottomDoc - lineHeight;
    // Everything is judged against the reader's position, never against the
    // current scroll: a caret reveal or the height dance may have moved it,
    // and neither of them gets a say in what the line's visibility is.
    const a = viewAnchorY;
    const lineBottom = lineBottomDoc - a;
    const lineTop = lineTopDoc - a;
    if (lineBottom > 0 && lineTop < vh) {
      // The line still shows pixels where the reader is: whatever moved the
      // scroll in this keystroke, the view goes back to where they had it.
      if (window.scrollY !== a) window.scrollTo(0, a);
      return;
    }
    // Nothing of the line left on screen: the smallest scroll back.
    const y = lineBottom <= 0 ? lineTop : lineBottom - vh;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
    const target = Math.min(Math.max(a + y, 0), maxScroll);
    viewAnchorY = target;
    if (Math.abs(window.scrollY - target) > 0.5) window.scrollTo(0, target);
  }

  /* ------------------------------ images ------------------------------ */

  // The lines a picture hides, as text offsets: skipStart..skipEnd is the
  // region a caret may not rest in, upTo is where a caret arriving from
  // either side lands, and owns says the picture covers its reference's
  // own line. Used to steer the caret like a document editor does around
  // an inline image. Each range also names its picture (ref + index, the
  // same key the boxes are stored under) so a crossing stroke can light
  // it up. Pure text math — a caret move never pays for a measurement
  // pass, and the answers match refreshImages' by construction (same
  // text, same gate on the picture's bytes being decoded).
  function imageSkipRanges() {
    const text = editor.value;
    if (!text.includes('](images/')) return [];
    const out = [];
    let i = 0;
    for (const m of text.matchAll(IMAGE_RE)) {
      const index = i++;
      const meta = imageMeta.get(m[1]);
      if (!meta || !meta.nat || meta.failed) continue;
      const start = m.index;
      const end = start + m[0].length;
      const lineEnd = text.indexOf('\n', end);
      const reserved = newlineRun(text, lineEnd) - 1;
      if (reserved < 1) continue;
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      // When the reference sits alone on its line, the picture covers that
      // line too: the hidden region starts there, and the caret treats the
      // whole picture as one wide character it can hop over. Owning the line
      // also pays for one line of the space, so the reserved lines below plus
      // the reference's own line hold the picture; text sharing the line
      // pushes it down into the reserved lines only.
      const tail = lineEnd === -1 ? text.slice(end) : text.slice(end, lineEnd);
      const owns = text.slice(lineStart, start).trim() === '' && tail.trim() === '';
      // Only the reserved lines below the reference are hidden — the caret's
      // own line underneath the picture must stay editable.
      let bandEnd = lineEnd + 1;
      for (let k = 0; k < reserved && bandEnd < text.length; k++) {
        const nl = text.indexOf('\n', bandEnd);
        bandEnd = nl === -1 ? text.length : nl + 1;
      }
      out.push({
        ref: m[1],
        index,
        skipStart: owns ? lineStart : lineEnd + 1,
        skipEnd: bandEnd,
        lineStart,
        upTo: owns ? Math.max(0, lineStart - 1) : lineStart,
        owns,
      });
    }
    return out;
  }

  // A pasted screenshot is saved as a real file in <notesDir>/images; the note
  // keeps only a plain-text reference — ![image](images/…) — while #img-layer
  // draws the picture over its own line. The path may hold one balanced pair
  // of parentheses (a renamed file like "shot (2).png").
  const IMAGE_RE = /!\[[^\]]*\]\((images\/(?:[^()\n]|\([^()\n]*\))+)\)/g;
  const imgLayer = document.getElementById('img-layer');
  const imageMeta = new Map(); // ref -> { src?, nat?, loading?, failed? }
  const imageEls = new Map(); // "ref@@n" -> { box, img, handles, disp, cBox, … }
  let imageTimer = 0;
  let metaTimer = 0;
  let resizeJob = null; // active corner-drag, if any
  let selectedImage = null; // the picture the user clicked, if any
  let metricsRev = 0; // bumped when font metrics change; invalidates measurement caches
  const MIN_RESIZE = 40; // smallest width a picture can be dragged to
  const PILL_W = 14; // right-edge width handle, half of it hanging past the edge
  const PILL_H = 36;
  const SQUARE = 16; // corner square, centred on the corner

  // A resized picture records its display size in the reference alt text —
  // ![image 320x200](images/…). Plain ![image](…) falls back to the picture's
  // own size, scaled to fit the space the note reserved.
  function parseImgDims(marker) {
    const alt = /^!\[([^\]]*)\]/.exec(marker);
    if (!alt) return null;
    const d = /(\d+)x(\d+)$/.exec(alt[1]);
    if (!d) return null;
    const w = parseInt(d[1], 10);
    const h = parseInt(d[2], 10);
    if (!w || !h) return null;
    return { w, h };
  }

  // A timer rather than requestAnimationFrame: a hidden or minimized window
  // can starve rAF, and the layer must catch up as soon as the text changes.
  function scheduleImages() {
    if (imageTimer) return;
    imageTimer = setTimeout(() => {
      imageTimer = 0;
      refreshImages();
    }, 16);
  }

  // The same pass, run right now: typing, pasting, opening a note or changing
  // the font must move the reference cover in the same task the text reflows —
  // any delay lets the markdown underneath show for a frame.
  function refreshImagesNow() {
    if (imageTimer) {
      clearTimeout(imageTimer);
      imageTimer = 0;
    }
    refreshImages();
  }

  /* ------------------------------ text measurement ------------------------------ */

  // The mirror is a hidden div reproducing the editor's text metrics, so a
  // character offset can be placed on screen without touching the textarea.
  let mirrorEl = null;
  let mirrorHead = null;
  let mirrorDot = null;
  const MIRROR_STYLE = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'wordSpacing',
    'lineHeight', 'textIndent', 'textTransform', 'whiteSpace', 'wordBreak', 'overflowWrap',
    'padding', 'border',
  ];

  function imageMirror() {
    if (mirrorEl) return mirrorEl;
    mirrorEl = document.createElement('div');
    mirrorEl.setAttribute('aria-hidden', 'true');
    mirrorEl.style.cssText =
      'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;';
    mirrorHead = document.createElement('span');
    mirrorDot = document.createElement('span');
    mirrorDot.textContent = '\u200b';
    mirrorEl.append(mirrorHead, mirrorDot);
    document.body.appendChild(mirrorEl);
    return mirrorEl;
  }

  // Sync the mirror with the editor's metrics — once per measurement pass, not
  // once per offset. Returns the line height the pass needs anyway.
  function syncMirror() {
    const cs = getComputedStyle(editor);
    const m = imageMirror();
    for (const p of MIRROR_STYLE) m.style[p] = cs[p];
    m.style.width = `${editor.clientWidth}px`;
    return parseFloat(cs.lineHeight) || 27;
  }

  const lineHeightPx = () => parseFloat(getComputedStyle(editor).lineHeight) || 27;

  // Screen position of a text offset; call after syncMirror().
  function offsetToXY(offset) {
    const m = imageMirror();
    mirrorHead.textContent = editor.value.slice(0, offset);
    const mr = m.getBoundingClientRect();
    const dr = mirrorDot.getBoundingClientRect();
    return { top: dr.top - mr.top, left: dr.left - mr.left };
  }

  // Counted in place: slicing the tail just to read its leading newlines
  // copies the rest of the note on every call.
  const newlineRun = (text, i) => {
    let n = 0;
    while (i + n < text.length && text.charCodeAt(i + n) === 10) n += 1;
    return n;
  };

  // Style writes go through here so unchanged values are skipped: typing
  // re-runs the image layer constantly, most of it with nothing new.
  function putStyle(el, cache, prop, value) {
    if (cache[prop] === value) return;
    cache[prop] = value;
    el.style[prop] = value;
  }

  // Fit a picture into the space the note reserved for it, keeping its
  // proportions at every step.
  function fitImage(nw, nh, maxW, maxH) {
    if (!nw || !nh || !maxW || !maxH) return { w: 0, h: 0 };
    let w = Math.min(maxW, nw);
    let h = (w * nh) / nw;
    if (h > maxH) {
      h = maxH;
      w = (h * nw) / nh;
    }
    return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  }

  function ensureImageMeta(ref) {
    let meta = imageMeta.get(ref);
    if (!meta) {
      meta = { loading: false, failed: false };
      imageMeta.set(ref, meta);
    }
    if (meta.loading || meta.failed || meta.src) return meta;
    meta.loading = true;
    window.slate
      .readImage(ref)
      .then((src) => {
        meta.loading = false;
        if (!src) {
          meta.failed = true;
          return;
        }
        meta.src = src;
        const probe = new Image();
        probe.onload = () => {
          meta.nat = { w: probe.naturalWidth, h: probe.naturalHeight };
          scheduleImages();
        };
        probe.onerror = () => {
          meta.failed = true;
          scheduleImages();
        };
        probe.src = src;
      })
      .catch(() => {
        meta.loading = false;
        meta.failed = true;
        scheduleImages();
      });
    return meta;
  }

  function refreshImages() {
    if (!imgLayer) return;
    const text = editor.value;
    const matches = text.includes('](images/') ? [...text.matchAll(IMAGE_RE)] : [];
    const seen = new Set();
    const staged = []; // [entry, values] — every measurement first, every write after
    const caretPos = editor.selectionStart === editor.selectionEnd ? editor.selectionStart : -1;
    let steerTo = -1; // a caret stranded inside a picture's lines moves back out

    if (matches.length) {
      const wrapR = wrapEl.getBoundingClientRect();
      const edR = editor.getBoundingClientRect();
      const lineHeight = syncMirror();
      const offX = edR.left - wrapR.left;
      const offY = edR.top - wrapR.top;

      matches.forEach((m, i) => {
        const ref = m[1];
        const key = `${ref}@@${i}`;
        seen.add(key);
        const meta = ensureImageMeta(ref);

        let entry = imageEls.get(key);
        if (!entry) {
          const box = document.createElement('div');
          box.className = 'img-note';
          const img = document.createElement('img');
          img.alt = '';
          img.draggable = false;
          img.addEventListener('mousedown', (ev) => {
            if (ev.button !== 0) return;
            ev.preventDefault(); // clicking a picture selects it — no caret jump
            ev.stopPropagation(); // …and no click-through deselect
            selectImage(entry);
          });
          box.appendChild(img);
          const refCover = document.createElement('div');
          refCover.className = 'img-ref-cover';
          refCover.addEventListener('mousedown', (ev) => {
            if (ev.button !== 0) return;
            ev.preventDefault(); // the hidden reference is a click target for
            ev.stopPropagation(); // the picture, not for blind caret placement
            selectImage(entry);
          });
          const refCaret = document.createElement('div');
          refCaret.className = 'img-ref-caret';
          refCover.appendChild(refCaret);
          entry = { box, img, refCover, refCaret, handles: {}, cBox: {}, cImg: {}, cRef: {}, cCaret: {}, cHs: {}, geo: null };
          // Two handles: the right-edge pill (width only) and the bottom-right
          // square (proportional). One write-cache per handle: a shared one
          // would skip writes whose value matches another handle's last write,
          // leaving a handle unplaced.
          for (const corner of ['pill', 'se']) {
            const handle = document.createElement('div');
            handle.className = `img-handle h-${corner}`;
            handle.dataset.corner = corner;
            box.appendChild(handle);
            entry.handles[corner] = handle;
            entry.cHs[corner] = {};
            handle.addEventListener('mousedown', (ev) => beginResize(ev, entry));
          }
          // The cover lives beside the box, not inside it: the box hides while
          // there is no picture to draw (loading, missing, no room) and the
          // reference must stay covered regardless. Appended *under* the box:
          // when the picture claims the reference's own line it paints over
          // the cover, and when the box is hidden the cover shows alone. Its
          // 1px tuck tucks beneath the box — no seam either way.
          imgLayer.appendChild(refCover);
          imgLayer.appendChild(box);
          imageEls.set(key, entry);
        }
        // Where this picture sits in the text — tracked even when the file
        // itself is missing, so a selected picture can always be deleted.
        entry.ref = ref;
        entry.index = i;

        // The reference's screen position depends only on the text before its
        // end, the editor's width and the font metrics. A pass run while the
        // caret was only moving — or typing *below* the pictures — therefore
        // reuses last pass's measurements instead of paying three mirror
        // layouts per picture per keystroke. Anything at all different
        // (the marker's own text, a resize, the width, the font) measures fresh.
        const start = m.index;
        const end = start + m[0].length;
        const head = text.slice(0, end);
        let geo = entry.geo;
        if (!geo || geo.head !== head || geo.w !== edR.width || geo.lh !== lineHeight || geo.rev !== metricsRev) {
          geo = {
            head,
            w: edR.width,
            lh: lineHeight,
            rev: metricsRev,
            p1: offsetToXY(start),
            p2: offsetToXY(end - 1),
            p3: offsetToXY(end), // where the reference text stops
          };
          entry.geo = geo;
        }
        const p1 = geo.p1;
        const p2 = geo.p2;
        const p3 = geo.p3;
        const markerTop = p1.top;
        const markerH = p2.top + lineHeight - markerTop;

        // Blank lines the note leaves for the picture, counted from the end
        // of the reference's line so text typed on that line is harmless.
        const lineEnd = text.indexOf('\n', end);
        const reserved = Math.max(0, newlineRun(text, lineEnd) - 1);
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        // The reference alone on its line → the picture claims that line's
        // space and sits flush against the text above. Any other text on the
        // line (typed before or after the marker) moves the picture back
        // down a line, so nothing you write is ever hidden.
        const tail = lineEnd === -1 ? text.slice(end) : text.slice(end, lineEnd);
        const owns = text.slice(lineStart, start).trim() === '' && tail.trim() === '';

        const boxLeft = offX + Math.min(Math.max(p1.left, 0), edR.width);
        const boxW = Math.max(40, edR.width - Math.min(Math.max(p1.left, 0), edR.width));

        // The cover over the reference belongs to the text, not the picture:
        // it is staged on every pass — still loading, missing file, or no
        // reserved space included — so the markdown is never on screen.
        const stripVals = {
          refLeft: `${boxLeft}px`,
          refTop: `${offY + markerTop}px`,
          refH: `${markerH + 1}px`, // 1px tucks over the box's top — no seam
          refW: `${Math.max(6, p3.top === p1.top ? p3.left - p1.left : boxW)}px`,
          refCaret: caretPos === start ? '' : 'none',
        };

        // The box exists only while there is a picture to draw: space
        // reserved and the bytes decoded. A file that fails after it was
        // already shown keeps its picture — it is in memory; the cover
        // hides the reference either way.
        if (reserved < 1 || !meta.nat) {
          entry.disp = null;
          staged.push([entry, { display: 'none', ...stripVals }]);
          return;
        }

        const nat = meta.nat;
        const room = Math.min((reserved + (owns ? 1 : 0)) * lineHeight, Math.max(60, window.innerHeight * 0.55));
        const dims = parseImgDims(m[0]);
        const disp = fitImage(dims ? dims.w : nat.w, dims ? dims.h : nat.h, boxW, room);
        const imgH = disp.h;
        // Bookkeeping for the resize handles and the caret steering.
        entry.markerH = markerH;
        entry.boxW = boxW;
        entry.disp = disp;

        // The reserved lines under the reference — the picture's own span —
        // and the line above them.
        let skipStart = lineEnd + 1;
        let skipEnd = skipStart;
        for (let k = 0; k < reserved && skipEnd < text.length; k++) {
          const nl = text.indexOf('\n', skipEnd);
          skipEnd = nl === -1 ? text.length : nl + 1;
        }

        // The reference text is never handed back to the reader: a strip
        // exactly the width of `![image](…)` covers that line — and when the
        // picture claims the line, the picture itself covers it. A caret
        // stranded anywhere in the picture's hidden region is steered to just
        // above it (end of the paragraph before it), or to the reference's
        // start when that line still shows typed text.
        const navStart = owns ? lineStart : skipStart;
        const upTo = owns ? Math.max(0, lineStart - 1) : lineStart;
        if (caretPos >= 0 && caretPos >= navStart && caretPos < skipEnd) steerTo = upTo;
        staged.push([entry, {
          display: '',
          ...stripVals,
          left: `${boxLeft}px`,
          top: `${offY + (owns ? markerTop : markerTop + markerH)}px`,
          width: `${boxW}px`,
          height: `${imgH}px`,
          disp,
          src: meta.src ? meta.src : null,
        }]);
      });
    }

    // Everything was measured above — now one write pass for the whole layer
    // (putStyle skips values that didn't change, which is most of them while
    // the caret is just moving around).
    for (const [ent, s] of staged) {
      // The cover first — it is laid out in layer coordinates and must be
      // right even while the box below it is hidden.
      putStyle(ent.refCover, ent.cRef, 'left', s.refLeft);
      putStyle(ent.refCover, ent.cRef, 'top', s.refTop);
      putStyle(ent.refCover, ent.cRef, 'height', s.refH);
      putStyle(ent.refCover, ent.cRef, 'width', s.refW);
      putStyle(ent.refCaret, ent.cCaret, 'display', s.refCaret);
      putStyle(ent.box, ent.cBox, 'display', s.display);
      if (s.display === 'none') continue;
      putStyle(ent.box, ent.cBox, 'left', s.left);
      putStyle(ent.box, ent.cBox, 'top', s.top);
      putStyle(ent.box, ent.cBox, 'width', s.width);
      putStyle(ent.box, ent.cBox, 'height', s.height);
      if (s.disp) {
        // src is touched once per element so the browser keeps it decoded.
        if (s.src && ent.img.getAttribute('src') !== s.src) ent.img.src = s.src;
        putStyle(ent.img, ent.cImg, 'width', `${s.disp.w}px`);
        putStyle(ent.img, ent.cImg, 'height', `${s.disp.h}px`);
        placeHandles(ent, s.disp);
      }
    }

    if (steerTo >= 0) {
      editor.setSelectionRange(steerTo, steerTo);
      scheduleImages();
    }

    for (const [key, entry] of imageEls) {
      if (!seen.has(key)) {
        if (selectedImage === entry) selectedImage = null;
        entry.box.remove();
        entry.refCover.remove(); // the cover is a sibling now, not a child
        imageEls.delete(key);
      }
    }

    refreshLinks(); // same text pass: URL hotspots follow the reflow
  }

  // Park the two handles on the picture itself — the pill centred on the
  // right edge, the square centred on the bottom-right corner.
  function placeHandles(entry, disp) {
    const hs = entry.handles;
    if (!hs) return;
    const c = entry.cHs;
    putStyle(hs.pill, c.pill, 'left', `${disp.w - PILL_W / 2}px`);
    putStyle(hs.pill, c.pill, 'top', `${disp.h / 2 - PILL_H / 2}px`);
    putStyle(hs.se, c.se, 'left', `${disp.w - SQUARE / 2}px`);
    putStyle(hs.se, c.se, 'top', `${disp.h - SQUARE / 2}px`);
  }

  /* ------------------------------ clickable links ------------------------------ */

  // http(s) URLs get a thin hotspot over their own glyphs in a
  // pointer-events:none layer — the picture layer's mirror trick again.
  // Each band repaints its substring in classic link blue, underlined;
  // hover shows the tooltip, a plain click opens it (drag-to-select is
  // guarded so a selection ending on a link stays a selection). The layer
  // itself never intercepts drags or the caret.
  const LINK_RE = /https?:\/\/[^\s<>"'`]+/g;
  const linkLayer = $('link-layer');
  const linkTip = $('link-tip'); // lives in index.html
  const linkEls = new Map(); // start offset -> { els, cs, geo, url, rects }
  let linkHover = null;

  // A textarea can't colour part of its text, so each line band repaints its
  // own URL glyphs: the hotspot divs carry the substring in the editor's own
  // font over a page-coloured background, hiding the black original. While
  // the caret is inside the URL after typing (or a selection covers it), the
  // repaint is hidden so the native caret and highlight always win.
  const REPLICA_STYLE = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'textIndent', 'textTransform'];
  let linkProbe = null;
  let linkK = 0; // glyph-box inset from the line band's top (half-leading)
  let linkKRev = -1;
  let linkKLh = 0;
  let linkEditArmed = false; // set by 'input'; consumed by the next pass

  // Measure the inset once per font/size/spacing change: line-height leads
  // the glyph box, and every band's top is nudged by this much so the
  // repaint lands exactly on the original glyphs.
  function linkGlyphInset(edCs, lh) {
    if (linkKRev === metricsRev && linkKLh === lh) return linkK;
    if (!linkProbe) {
      linkProbe = document.createElement('div');
      linkProbe.setAttribute('aria-hidden', 'true');
      const span = document.createElement('span');
      span.textContent = 'Xg';
      linkProbe.appendChild(span);
      linkProbe.style.cssText =
        'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;white-space:pre;';
      document.body.appendChild(linkProbe);
    }
    for (const p of REPLICA_STYLE) linkProbe.style[p] = edCs[p];
    const pr = linkProbe.getBoundingClientRect();
    const sr = linkProbe.firstChild.getBoundingClientRect();
    linkK = sr.top - pr.top;
    linkKRev = metricsRev;
    linkKLh = lh;
    return linkK;
  }

  // The image layer's mirror only carries the text BEFORE the caret, and a
  // caret probe inside the URL (head + marker + tail) splits the URL into
  // two pieces that each wrap differently than the intact text the textarea
  // renders. The link pass measures in ONE mirror carrying the full,
  // unsplit document as plain textnodes — the URL lays out exactly as it
  // does in the textarea, wrap point included.
  let lmEl = null;
  let lmHead = null;
  let lmUrl = null;
  let lmTail = null;

  function syncLinkMirror(cs) {
    if (!lmEl) {
      lmEl = document.createElement('div');
      lmEl.setAttribute('aria-hidden', 'true');
      lmEl.style.cssText =
        'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;';
      lmHead = document.createTextNode('');
      lmUrl = document.createTextNode('');
      lmTail = document.createTextNode('');
      lmEl.append(lmHead, lmUrl, lmTail);
      document.body.appendChild(lmEl);
    }
    for (const p of MIRROR_STYLE) lmEl.style[p] = cs[p];
    lmEl.style.width = `${editor.clientWidth}px`;
  }

  // Trailing punctuation belongs to the sentence, not the link — except a
  // ")" closing a "(" inside the URL (wiki style), which the URL keeps.
  function trimUrl(raw) {
    let u = raw;
    while (u.length) {
      const last = u[u.length - 1];
      if (last === ')') {
        if ((u.match(/\(/g) || []).length >= (u.match(/\)/g) || []).length) break;
      } else if (!/[.,;:!?]/.test(last)) {
        break;
      }
      u = u.slice(0, -1);
    }
    return u;
  }

  // One rectangle per visual line: a long URL wraps, and each line's band
  // must sit exactly over that line's own text. Bands come from Range rects
  // over the URL's own textnode (one rect per line the range covers); a
  // binary search finds where each line ends — the char range the band's
  // repaint slices. Rects never mutate the mirror, so the layout the search
  // sees is the textarea's layout, wrap point included.
  function linkLineSpans(start, end, text) {
    lmHead.nodeValue = text.slice(0, start);
    lmUrl.nodeValue = text.slice(start, end);
    lmTail.nodeValue = text.slice(end);
    const mr = lmEl.getBoundingClientRect();
    const len = end - start;
    const range = document.createRange();
    range.setStart(lmUrl, 0);
    const spans = [];
    let pos = 0;
    while (pos < len) {
      // Largest e such that [pos, e) still sits on one visual line.
      let lo = pos + 1;
      let hi = len;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        range.setEnd(lmUrl, mid);
        if (range.getClientRects().length === 1) lo = mid;
        else hi = mid - 1;
      }
      range.setEnd(lmUrl, lo);
      const r = range.getClientRects()[0];
      spans.push({ left: r.left - mr.left, top: r.top - mr.top,
        width: Math.max(6, r.width), from: start + pos, to: start + lo });
      pos = lo;
    }
    return spans;
  }

  function refreshLinks() {
    if (!linkLayer) return;
    const text = editor.value;
    const matches = text.includes('http') ? [...text.matchAll(LINK_RE)] : [];
    const seen = new Set();
    const staged = []; // measured entries — one write pass afterwards
    let edCs = null; // editor's own metrics, copied onto every repaint
    let k = 0; // glyph-box inset for this pass
    let lh = 0;

    if (matches.length) {
      const wrapR = wrapEl.getBoundingClientRect();
      const edR = editor.getBoundingClientRect();
      lh = syncMirror();
      edCs = getComputedStyle(editor);
      syncLinkMirror(edCs);
      k = linkGlyphInset(edCs, lh);
      const offX = edR.left - wrapR.left;
      const offY = edR.top - wrapR.top;

      for (const m of matches) {
        const url = trimUrl(m[0]);
        const start = m.index;
        const end = start + url.length;
        seen.add(start);
        let entry = linkEls.get(start);
        if (!entry) {
          entry = { els: [], cs: [], geo: null, url, rects: [] };
          linkEls.set(start, entry);
        }
        entry.start = start;
        entry.url = url;

        // The picture layer's cache trick: geometry depends only on the
        // text before this link, so typing below it reuses the last pass.
        const head = text.slice(0, end);
        let geo = entry.geo;
        if (!geo || geo.head !== head || geo.w !== edR.width || geo.lh !== lh || geo.rev !== metricsRev) {
          geo = { head, w: edR.width, lh, rev: metricsRev, spans: linkLineSpans(start, end, text) };
          entry.geo = geo;
        }
        entry.rects = geo.spans.map((s) => ({ x: offX + s.left, y: offY + s.top, w: s.width, h: lh }));
        staged.push(entry);
      }
    }

    // Native editing wins: a selection covering a URL drops its repaint, and
    // a caret that lands inside a URL while typing (armed by 'input') keeps
    // it dropped until the caret leaves — so a later plain caret move or an
    // open click never flickers, and typing inside the URL stays native.
    const selA = editor.selectionStart;
    const selB = editor.selectionEnd;
    const armed = linkEditArmed;
    linkEditArmed = false;

    for (const entry of staged) {
      const endO = entry.start + entry.url.length;
      const inside = selA === selB && selA >= entry.start && selA <= endO;
      if (inside && armed) entry.editArmed = true;
      else if (!inside) entry.editArmed = false;
      const hide = (selA !== selB && selA < endO && selB > entry.start) || entry.editArmed === true;
      if (entry.hide !== hide) {
        entry.hide = hide;
        for (const el of entry.els) el.classList.toggle('editing', hide);
      }

      entry.rects.forEach((r, i) => {
        if (!entry.els[i]) {
          const el = document.createElement('div');
          // entry.hide is computed before the els exist, so a link born
          // hidden must carry the class from the start — later passes see
          // an unchanged hide and never toggle it on.
          el.className = entry.hide ? 'note-link editing' : 'note-link';
          entry.els[i] = el;
          entry.cs[i] = {};
          linkLayer.appendChild(el);
        }
        const el = entry.els[i];
        const c = entry.cs[i];
        // The repaint itself: the URL's own substring in the editor's font,
        // pushed up by the measured inset so its glyphs land on the originals.
        const span = entry.geo.spans[i];
        const sub = text.slice(span.from, span.to);
        if (el.textContent !== sub) el.textContent = sub;
        for (const p of REPLICA_STYLE) putStyle(el, c, p, edCs[p]);
        putStyle(el, c, 'whiteSpace', 'pre');
        putStyle(el, c, 'overflow', 'hidden');
        putStyle(el, c, 'display', '');
        putStyle(el, c, 'left', `${r.x}px`);
        putStyle(el, c, 'top', `${r.y - k}px`);
        putStyle(el, c, 'width', `${r.w}px`);
        putStyle(el, c, 'height', `${r.h}px`);
      });
      // Fewer wrapped lines than last pass — park the spares.
      for (let i = entry.rects.length; i < entry.els.length; i++) {
        putStyle(entry.els[i], entry.cs[i], 'display', 'none');
      }
    }

    for (const [start, entry] of linkEls) {
      if (seen.has(start)) continue;
      if (linkHover === entry) setLinkHover(null);
      for (const el of entry.els) el.remove();
      linkEls.delete(start);
    }
  }

  function setLinkHover(entry) {
    if (linkHover === entry) return;
    if (linkHover) for (const el of linkHover.els) el.classList.remove('hover');
    linkHover = entry;
    if (!entry) {
      document.body.classList.remove('over-link');
      linkTip.classList.remove('show');
      return;
    }
    for (const el of entry.els) el.classList.add('hover');
    document.body.classList.add('over-link');
    linkTip.textContent = entry.url;
    linkTip.classList.add('show');
  }

  function linkAt(x, y) {
    for (const entry of linkEls.values()) {
      for (const r of entry.rects) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return entry;
      }
    }
    return null;
  }

  // Hover and click are hit-tested against the measured rects; the layer
  // itself never sees a pointer event, so editing stays untouched.
  window.addEventListener('mousemove', (e) => {
    if (!linkEls.size) {
      if (linkHover) setLinkHover(null);
      return;
    }
    const wr = wrapEl.getBoundingClientRect();
    const entry = linkAt(e.clientX - wr.left, e.clientY - wr.top);
    setLinkHover(entry);
    if (!entry) return;
    const tr = linkTip.getBoundingClientRect();
    linkTip.style.left = `${Math.max(8, Math.min(e.clientX + 14, window.innerWidth - tr.width - 8))}px`;
    linkTip.style.top = `${Math.min(e.clientY + 18, window.innerHeight - tr.height - 8)}px`;
  });

  // Where a press began, so a drag to select text that happens to end on a
  // link is still a selection — only a still click opens the URL.
  let linkDown = null;
  window.addEventListener('mousedown', (e) => {
    linkDown = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  });
  window.addEventListener('blur', () => {
    linkDown = null;
  });

  document.addEventListener('click', (e) => {
    if (!linkEls.size) return;
    if (e.detail > 1) return; // double-click keeps its word-select meaning
    if (linkDown) {
      const dx = e.clientX - linkDown.x;
      const dy = e.clientY - linkDown.y;
      if (dx * dx + dy * dy > 25) return; // moved = a drag, not a click
    } else if (!e.ctrlKey && !e.metaKey) {
      return; // no press seen in this window: only the legacy modifier opens
    }
    const wr = wrapEl.getBoundingClientRect();
    const entry = linkAt(e.clientX - wr.left, e.clientY - wr.top);
    if (!entry) return;
    e.preventDefault();
    window.open(entry.url, '_blank'); // desktop: routed to the system browser
  });

  // Clicking a picture selects it, Google-Docs style: the pill and the corner
  // square appear, the reference text stays hidden, and Backspace/Delete
  // removes the whole picture in one stroke. Clicking anywhere else — or
  // typing, or moving the caret — lets go of the selection.
  function selectImage(entry) {
    if (selectedImage === entry) return;
    if (selectedImage) selectedImage.box.classList.remove('selected');
    selectedImage = entry;
    entry.box.classList.add('selected');
    scheduleImages(); // geometry pass also re-checks caret steering
  }

  function deselectImage() {
    if (!selectedImage) return;
    selectedImage.box.classList.remove('selected');
    selectedImage = null;
    scheduleImages();
  }

  document.addEventListener('mousedown', () => {
    typingTurnUntil = 0; // clicking places the caret: reveals stay native
    deselectImage();
  });

  // The span one picture owns in the text: its reference plus the blank
  // lines it is drawn over. Removing that span deletes the picture whole.
  function imageUnits() {
    const text = editor.value;
    if (!text.includes('](images/')) return [];
    const out = [];
    for (const m of text.matchAll(IMAGE_RE)) {
      const end = m.index + m[0].length;
      const run = newlineRun(text, end);
      out.push({ index: out.length, start: m.index, end, unitEnd: end + run, ref: m[1] });
    }
    return out;
  }

  // Removing a picture's span goes through the browser's own editing
  // command, so the stroke lands on the undo stack and Ctrl+Z puts the
  // picture back (its file was never touched). A bare setRangeText leaves
  // nothing for undo to find.
  function removeImageUnit(start, unitEnd) {
    editor.setSelectionRange(start, unitEnd);
    if (!document.execCommand('insertText', false, '')) {
      editor.setRangeText('', start, unitEnd, 'end'); // belt: removal always works
      editor.dispatchEvent(new Event('input')); // the command path fires its own
    }
    editor.setSelectionRange(start, start);
    scheduleImages();
  }

  function deleteSelectedImage() {
    const entry = selectedImage;
    const u = imageUnits()[entry.index];
    if (!u || u.ref !== entry.ref) {
      deselectImage();
      return;
    }
    removeImageUnit(u.start, u.unitEnd);
  }

  // Two handles, two jobs. The corner square scales the picture with its
  // proportions locked — the size follows the pointer's distance from the
  // fixed top-left anchor (so it also restores a width-only picture's true
  // proportions as it scales). The right-edge pill changes the width alone:
  // horizontal travel from the grab point, the left edge never moving.
  function beginResize(ev, entry) {
    if (ev.button !== 0 || resizeJob) return;
    if (!entry.disp || !entry.markerH) return;
    const meta = imageMeta.get(entry.ref);
    if (!meta || !meta.nat) return;
    ev.preventDefault();
    ev.stopPropagation();
    const corner = ev.currentTarget.dataset.corner;
    if (corner === 'pill') {
      resizeJob = {
        mode: 'width',
        entry,
        w0: entry.disp.w,
        h0: entry.disp.h,
        x0: ev.clientX,
        maxW: entry.boxW,
        cur: { w: entry.disp.w, h: entry.disp.h },
        x: ev.clientX,
        y: ev.clientY,
        raf: 0,
      };
    } else {
      const br = entry.box.getBoundingClientRect();
      const opp = { x: br.left, y: br.top };
      const diag = Math.hypot(ev.clientX - opp.x, ev.clientY - opp.y);
      if (diag < 1) return;
      resizeJob = {
        mode: 'scale',
        entry,
        opp,
        diag,
        w0: entry.disp.w,
        maxW: entry.boxW,
        nat: meta.nat,
        cur: { w: entry.disp.w, h: entry.disp.h },
        x: ev.clientX,
        y: ev.clientY,
        raf: 0,
      };
    }
    entry.box.classList.add('dragging');
    document.body.classList.add('resizing');
  }

  function applyResize(job) {
    const ent = job.entry;
    let w, h;
    if (job.mode === 'width') {
      // Width only: only horizontal travel counts, so the height — and with
      // it the reserved lines and the note's layout — never moves.
      w = Math.min(job.maxW, Math.max(MIN_RESIZE, job.w0 + (job.x - job.x0)));
      h = job.h0;
    } else {
      const d = Math.hypot(job.x - job.opp.x, job.y - job.opp.y);
      w = Math.min(job.maxW, Math.max(MIN_RESIZE, job.w0 * (d / job.diag)));
      h = Math.max(1, (w * job.nat.h) / job.nat.w);
    }
    job.cur = { w, h };
    ent.disp = { w: Math.round(w), h: Math.round(h) };
    putStyle(ent.img, ent.cImg, 'width', `${ent.disp.w}px`);
    putStyle(ent.img, ent.cImg, 'height', `${ent.disp.h}px`);
    putStyle(ent.box, ent.cBox, 'height', `${ent.disp.h}px`);
    placeHandles(ent, ent.disp);
  }

  // Pointer moves are coalesced into one style update per frame; the release
  // applies the final position synchronously before finishing.
  document.addEventListener('mousemove', (e) => {
    const job = resizeJob;
    if (!job) return;
    e.preventDefault();
    job.x = e.clientX;
    job.y = e.clientY;
    if (job.raf) return;
    job.raf = requestAnimationFrame(() => {
      job.raf = 0;
      if (resizeJob === job) applyResize(job);
    });
  });

  document.addEventListener('mouseup', () => {
    if (!resizeJob) return;
    const job = resizeJob;
    resizeJob = null;
    if (job.raf) cancelAnimationFrame(job.raf);
    applyResize(job);
    job.entry.box.classList.remove('dragging');
    document.body.classList.remove('resizing');
    finishResize(job);
  });

  // On release the new size is written back into the plain-text reference and
  // the blank lines below it are re-counted, so the reserved lines end exactly
  // at the picture's bottom — for the width-only pill too: its height never
  // moves, but the lines are re-counted to match it, which re-tightens any gap
  // a narrower column or hand-edited blank lines left behind.
  function finishResize(job) {
    const ent = job.entry;
    const text = editor.value;
    const matches = text.includes('](images/') ? [...text.matchAll(IMAGE_RE)] : [];
    const m = matches[ent.index];
    if (!m || m[1] !== ent.ref) return; // the note changed under us; stop
    if (Math.abs(job.cur.w - job.w0) < 1) return; // click, not drag
    const before = parseImgDims(m[0]);
    const markerEnd = m.index + m[0].length;
    const lh = lineHeightPx();
    let w, h;
    if (job.mode === 'width') {
      // Width only: horizontal travel sets the width; the height — the
      // picture's bottom — doesn't move.
      w = Math.min(job.maxW, Math.max(MIN_RESIZE, Math.round(job.cur.w)));
      h = Math.round(job.h0);
    } else {
      // Proportional: the released size snaps onto the line grid: the
      // reserved lines then end exactly at the picture's bottom instead of
      // wherever the drag happened to land — no leftover line of space
      // under a resized picture. The width follows the snapped height at
      // the picture's true proportions.
      const lines = Math.max(2, Math.round(job.cur.h / lh));
      h = Math.floor(lines * lh);
      w = Math.min(job.maxW, Math.max(MIN_RESIZE, Math.round((h * job.nat.w) / job.nat.h)));
    }
    const newMarker = m[0].replace(/^!\[[^\]]*\]/, `![image ${w}x${h}]`);
    // The reserved lines only exist when the reference owns its own line;
    // with text typed after it, only the size is rewritten.
    const canonical = text[markerEnd] === '\n';
    const run = newlineRun(text, markerEnd);
    // Whole lines down to the picture's bottom — the reserved lines plus the
    // reference's own line hold it at full size, with the caret landing on
    // the first line below it instead of a blank gap. h carries fitImage's
    // half-pixel rounding (75.6 -> 76), so a sub-half-pixel overhang must not
    // buy a whole extra line of gap — only a real overflow does.
    const newRun = Math.max(2, Math.ceil((h - 0.5) / lh));
    // Nothing to write: same size, and the lines already end at the bottom.
    if (before && before.w === w && before.h === h && (!canonical || run === newRun)) return;
    const regionEnd = markerEnd + run;
    // When the replaced span runs to the very end of the note, Chromium's redo
    // drops the inserted text's first line. So the span stops one newline short
    // of the end and the replacement carries one newline fewer — the two rejoin
    // to the same count, and both undo and redo come out right.
    const atEnd = run > 0 && regionEnd === text.length;
    const spanEnd = atEnd ? regionEnd - 1 : regionEnd;
    const replacement = newMarker + (canonical ? '\n'.repeat(newRun - (atEnd ? 1 : 0)) : '');
    const delta = replacement.length - (spanEnd - m.index);
    const shift = (o) =>
      o >= spanEnd ? o + delta : o >= m.index ? m.index + Math.min(o - m.index, newMarker.length) : o;
    const selA = editor.selectionStart;
    const selB = editor.selectionEnd;
    // Through the browser's own editing command so the resize lands on the
    // undo stack — Ctrl+Z puts the old size back.
    editor.setSelectionRange(m.index, spanEnd);
    if (!document.execCommand('insertText', false, replacement)) {
      editor.setRangeText(replacement, m.index, spanEnd, 'end'); // belt
    }
    editor.setSelectionRange(shift(selA), shift(selB));
    editor.dispatchEvent(new Event('input')); // staged with the caret where it belongs
    selectImage(ent); // the picture stays selected after a resize
    scheduleImages();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('unreadable'));
      reader.readAsDataURL(file);
    });
  }

  function insertImageFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    fileToDataUrl(file)
      .then((dataUrl) => window.slate.saveImage(dataUrl).then((res) => ({ dataUrl, res })))
      .then(({ dataUrl, res }) => {
        if (!res || !res.ref) {
          toast((res && res.error) || 'Could not save the image');
          return;
        }
        // Measure the picture first so the reserved space matches it.
        const probe = new Image();
        probe.onload = () => {
          const ref = res.ref;
          const meta = imageMeta.get(ref) || { loading: false, failed: false };
          meta.src = dataUrl;
          meta.nat = { w: probe.naturalWidth, h: probe.naturalHeight };
          meta.loading = false;
          meta.failed = false;
          imageMeta.set(ref, meta);
          placeImageRef(ref);
        };
        probe.onerror = () => toast('Could not read the image');
        probe.src = dataUrl;
      })
      .catch(() => toast('Could not save the image'));
  }

  function placeImageRef(ref) {
    const lineHeight = lineHeightPx();
    const maxH = Math.max(60, Math.round(window.innerHeight * 0.55));
    const nat = imageMeta.get(ref).nat;
    const disp = fitImage(nat.w, nat.h, editor.clientWidth, maxH);
    // fitImage rounds the height to a whole pixel (75.6 -> 76); tolerate that
    // sub-pixel overhang so a fresh paste doesn't reserve a phantom line.
    const lines = Math.max(2, Math.ceil((disp.h - 0.5) / lineHeight)); // down to the picture's bottom
    const marker = `![image](${ref})`;
    editor.focus(); // the command below needs the editor's own editing context
    const { selectionStart: s, selectionEnd: e } = editor;
    const before = editor.value.slice(0, s);
    // Images always get a line of their own.
    const lead = before && !before.endsWith('\n') ? '\n' : '';
    const text = `${lead}${marker}${'\n'.repeat(lines)}`;
    // Inserted through the browser's own editing command so the paste sits
    // on the undo stack like any other insert — Ctrl+Z takes the picture
    // back out again.
    editor.setSelectionRange(s, e);
    if (!document.execCommand('insertText', false, text)) {
      editor.setRangeText(text, s, e, 'end'); // belt: the paste always lands
      editor.dispatchEvent(new Event('input')); // the command path fires its own
    }
    scheduleImages();
  }

  // The tab and window title stay the brand — the page itself carries it and
  // nothing here ever changes it again. With a selection the numbers count
  // only the highlighted region; a collapsed caret counts the whole note.
  function updateMeta() {
    const selStart = editor.selectionStart;
    const selEnd = editor.selectionEnd;
    const selecting = selStart !== selEnd;
    const raw = selecting ? editor.value.slice(selStart, selEnd) : editor.value;
    const prose = raw.trim().replace(IMAGE_RE, '');
    const words = prose ? prose.split(/\s+/).length : 0;
    counts.textContent =
      `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'} · ${raw.length.toLocaleString()} characters`;
  }

  function flashSaved(explicit) {
    if (explicit) {
      toast('Saved');
      return;
    }
    savedFlag.textContent = '\u2713 saved';
    savedFlag.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => savedFlag.classList.remove('show'), 1600);
  }

  function save(explicit) {
    clearTimeout(saveTimer);
    saveTimer = null;
    const content = editor.value;

    // A completely empty document is never saved: no file for a blank page,
    // and an existing file keeps its last non-empty content.
    if (!content.trim()) {
      dirty = false;
      return Promise.resolve();
    }
    if (!dirty && !explicit) return Promise.resolve();

    dirty = false;
    return window.slate.saveNote(currentFilePath, content).then((fp) => {
      if (fp) currentFilePath = fp;
      flashSaved(!!explicit);
    });
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(false), 600);
  }

  function newNote() {
    typingTurnUntil = 0; // a note switch is not typing: the scroll it makes is kept
    save(false);
    closeSwitcher();
    closeSettings();
    editor.value = '';
    currentFilePath = null;
    dirty = false;
    autoGrow();
    refreshImagesNow(); // old covers must not outlive their note by a frame
    window.scrollTo(0, 0);
    editor.focus();
    editor.setSelectionRange(0, 0);
  }

  function openNote(filePath, opts) {
    save(false);
    // Frecency counts real opens only — this is the one entry point, and the
    // boot reopen passes touch: false so a relaunch never inflates the very
    // note it picked (or the runner-up would never catch up).
    if ((!opts || opts.touch !== false) && window.slate.touchNote) window.slate.touchNote(filePath);
    window.slate.readNote(filePath).then((content) => {
      typingTurnUntil = 0; // a note switch is not typing: nothing here is corrected
      editor.value = content;
      currentFilePath = filePath;
      dirty = false;
      autoGrow();
      closeSwitcher();
      closeSettings();
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
      refreshImagesNow(); // same task as the value set — nothing to paint first
    });
  }

  /* ------------------------------ counts & toasts ------------------------------ */

  const refreshCount = () => window.slate.listNotes().then((list) => list.length);

  function hideToast() {
    toastEl.classList.remove('show');
  }

  // Plain message, or a message with one action button (Restore); only the
  // action variant is clickable (see #toast.action in the stylesheet).
  function toast(message, ms = 2600, action) {
    clearTimeout(toastTimer);
    toastEl.textContent = '';
    const label = document.createElement('span');
    label.textContent = message;
    toastEl.appendChild(label);
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        hideToast();
        action.onClick();
      });
      toastEl.appendChild(btn);
      toastEl.classList.add('action');
    } else {
      toastEl.classList.remove('action');
    }
    toastEl.classList.add('show');
    toastTimer = setTimeout(hideToast, ms);
  }

  /* ------------------------------ top bar ------------------------------ */

  function pokeTopbar() {
    topbar.classList.add('visible');
    clearTimeout(topbarTimer);
    topbarTimer = setTimeout(() => topbar.classList.remove('visible'), 2600);
  }

  // Mouse moves arrive in bursts; poke at most every 100 ms so the hide-timer
  // isn't reset ~100×/s for no visual difference.
  let lastPoke = 0;
  window.addEventListener('mousemove', () => {
    const now = Date.now();
    if (now - lastPoke < 100) return;
    lastPoke = now;
    pokeTopbar();
  });

  /* ------------------------------ search switcher ------------------------------ */

  const escapeHtml = (s) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function formatDate(ms) {
    const d = new Date(ms);
    const now = new Date();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
    const yesterday = new Date(now.getTime() - 86400000);
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${time}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · ${time}`;
  }

  /* ------------------------------ pins + frecency ------------------------------ */

  // The state itself lives in the main process (switcher.json, never
  // settings.json) and is shared by every surface; it is loaded once per
  // visit to the switcher so a pin toggled elsewhere shows up fresh.
  let swStatePromise = null;
  let pinSet = new Set(); // mirror of state.pins, for the star in each row

  function switcherState() {
    if (!swStatePromise) {
      swStatePromise = window.slate
        .switcherState()
        .then((st) => ({
          frecency: (st && st.frecency) || {},
          pins: (st && st.pins) || [],
          startup: st && st.startup === 'new' ? 'new' : 'last',
        }))
        .catch(() => ({ frecency: {}, pins: [], startup: 'last' }));
    }
    return swStatePromise;
  }

  // Pins first, then opens weighted by recency (two-week half-life), then
  // newest. Searching reuses this order, so pinned matches stay on top.
  function rankList(list, state) {
    pinSet = new Set(state.pins);
    const score = (fp) => {
      const rec = state.frecency[fp];
      if (!rec || !rec.count) return 0;
      const ageDays = Math.max(0, Date.now() - (rec.last || 0)) / 86400000;
      return rec.count / 2 ** (ageDays / 14);
    };
    return list
      .map((n) => ({ n, pin: pinSet.has(n.filePath), s: score(n.filePath) }))
      .sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.s - a.s || b.n.mtime - a.n.mtime)
      .map((x) => x.n);
  }

  /* ------------------------------ live preview ------------------------------ */

  const previewCache = new Map(); // filePath -> { mtime, text }
  let previewToken = 0;
  let previewShown = null; // "path@@mtime" currently on screen

  function paintPreview(note, text) {
    const key = `${note.filePath}@@${note.mtime}`;
    if (previewShown === key) return;
    previewShown = key;
    const plain = text.replace(IMAGE_RE, '[image]');
    const body = plain.slice(0, 1400);
    previewEl.innerHTML =
      `<div class="p-title">${escapeHtml(note.title || 'Untitled')}</div>` +
      `<div class="p-date">${formatDate(note.mtime)}</div>` +
      `<div class="p-body">${escapeHtml(body)}${plain.length > 1400 ? '…' : ''}</div>`;
    previewEl.classList.add('visible');
  }

  function updatePreview() {
    const note = items[selected];
    if (!note) {
      previewShown = null;
      previewEl.classList.remove('visible');
      previewEl.innerHTML = '';
      return;
    }
    const token = ++previewToken;
    const cached = previewCache.get(note.filePath);
    if (cached && cached.mtime === note.mtime) {
      paintPreview(note, cached.text);
      return;
    }
    window.slate
      .readNote(note.filePath)
      .then((text) => {
        if (token !== previewToken) return; // a newer row won the race
        if (previewCache.size > 80) previewCache.delete(previewCache.keys().next().value);
        previewCache.set(note.filePath, { mtime: note.mtime, text });
        paintPreview(note, text);
      })
      .catch(() => {});
  }

  function renderResults(list, query, keepPath) {
    items = list;
    selected = keepPath ? Math.max(0, list.findIndex((n) => n.filePath === keepPath)) : 0;

    if (!list.length) {
      results.innerHTML = `<li class="empty">${
        query
          ? 'No notes match that search.'
          : 'Nothing saved yet. Notes show up here as soon as you start writing.'
      }</li>`;
      updatePreview();
      return;
    }

    const q = query.trim();
    const re = q ? new RegExp(escapeRe(q), 'ig') : null;

    results.innerHTML = list
      .map((n, i) => {
        const snippet = escapeHtml(n.snippet || n.preview || '');
        const html = re ? snippet.replace(re, (m) => `<mark>${m}</mark>`) : snippet;
        const pinned = pinSet.has(n.filePath);
        const cls = [];
        if (i === selected) cls.push('sel');
        if (pinned) cls.push('pinned');
        return `<li data-i="${i}"${cls.length ? ` class="${cls.join(' ')}"` : ''}>
          <button class="pin" type="button" tabindex="-1" title="${pinned ? 'Unpin' : 'Pin to top'}" aria-label="${pinned ? 'Unpin note' : 'Pin note'}">${pinned ? '★' : '☆'}</button>
          <div class="r-title">${escapeHtml(n.title)}</div>
          <div class="r-meta">${formatDate(n.mtime)}${pinned ? ' · pinned' : ''}</div>
          <div class="r-snippet">${html}</div>
        </li>`;
      })
      .join('');
    updatePreview();
  }

  function runSearch(keepPath) {
    const q = searchInput.value.trim();
    const token = ++searchToken;
    const pending = q ? window.slate.searchNotes(q) : window.slate.listNotes();
    Promise.all([pending, switcherState()]).then(([list, state]) => {
      if (token !== searchToken) return;
      renderResults(rankList(list, state), q, keepPath);
    });
  }

  function openSwitcher() {
    closeSettings();
    switcher.classList.add('open');
    switcher.setAttribute('aria-hidden', 'false');
    searchInput.value = '';
    searchToken = 0;
    swStatePromise = null; // re-rank against what the other surface wrote
    renderResults([], '');
    runSearch();
    searchInput.focus();
    searchInput.select();
    topbar.classList.add('visible');
  }

  function closeSwitcher() {
    if (!switcher.classList.contains('open')) return;
    switcher.classList.remove('open');
    switcher.setAttribute('aria-hidden', 'true');
    editor.focus();
  }

  function selectIndex(next) {
    if (!items.length) return;
    next = Math.min(items.length - 1, Math.max(0, next));
    if (next !== selected) {
      const prevLi = results.querySelector(`li[data-i="${selected}"]`);
      const nextLi = results.querySelector(`li[data-i="${next}"]`);
      if (prevLi) prevLi.classList.remove('sel');
      if (nextLi) {
        nextLi.classList.add('sel');
        nextLi.scrollIntoView({ block: 'nearest' });
      }
      selected = next;
    }
    updatePreview();
  }

  const moveSelection = (delta) => selectIndex(selected + delta);

  function openSelected() {
    const note = items[selected];
    if (note) openNote(note.filePath);
  }

  function togglePin(note) {
    if (!note) return;
    switcherState().then((st) => {
      const pinned = !st.pins.includes(note.filePath);
      return window.slate.pinNote(note.filePath, pinned).then((ok) => {
        if (!ok) return;
        if (pinned) st.pins.push(note.filePath);
        else st.pins = st.pins.filter((p) => p !== note.filePath);
        toast(pinned ? 'Pinned to top' : 'Unpinned', 1500);
        runSearch(note.filePath); // re-rank with this row still selected
      });
    });
  }

  // Delete moves the note to trash (main process confirms first); the toast
  // offers the way back.
  function deleteSelected() {
    const note = items[selected];
    if (!note) return;
    const wasOpen = currentFilePath === note.filePath;
    window.slate.deleteNote(note.filePath).then((moved) => {
      if (!moved) return;
      if (wasOpen) currentFilePath = null;
      runSearch();
      toast('Moved to trash', 7000, {
        label: 'Restore',
        onClick: () =>
          window.slate.restoreNote(moved).then((restored) => {
            if (!restored) {
              toast('Could not restore the note');
              return;
            }
            toast('Restored');
            runSearch();
            // Put back the page that was open when it was thrown away — but
            // never over text typed since (dirty is new work).
            if (wasOpen && !dirty && currentFilePath === null) openNote(restored);
          }),
      });
    });
  }

  /* ------------------------------ settings ------------------------------ */

  function refreshSettingsInfo() {
    window.slate.getSettings().then(({ notesDir, browserUrl, font, fontSize, lineSpacing, importedFonts: imported, launchOnStartup }) => {
      paintAutostart(launchOnStartup);
      folderPathEl.textContent = notesDir;
      folderPathEl.title = notesDir;
      if (browserUrlEl) {
        browserUrlEl.textContent = browserUrl || 'not running';
        browserUrlEl.title = browserUrl || '';
      }
      const openBtn = $('btn-open-browser');
      if (openBtn) openBtn.style.display = window.slate.isDesktop ? '' : 'none';
      if (Array.isArray(imported)) {
        importedFonts = imported;
        buildFontGrid();
      }
      applyFont(font, fontSize);
      if (lineSpacing) applySpacing(lineSpacing);
    });
    refreshCount().then((n) => {
      folderMetaEl.textContent = `${n.toLocaleString()} ${n === 1 ? 'note' : 'notes'} saved`;
    });
  }

  function openSettings() {
    closeSwitcher();
    settingsEl.classList.add('open');
    settingsEl.setAttribute('aria-hidden', 'false');
    refreshSettingsInfo();
    applyTheme(currentThemeKey());
    topbar.classList.add('visible');
    // Move focus into the dialog so it's usable from the keyboard.
    settingsEl.querySelector('.settings-panel').focus();
  }

  function closeSettings() {
    if (!settingsEl.classList.contains('open')) return;
    settingsEl.classList.remove('open');
    settingsEl.setAttribute('aria-hidden', 'true');
    editor.focus();
  }

  function chooseFolder() {
    window.slate.chooseFolder().then((res) => {
      if (!res || res.cancelled) return;
      refreshSettingsInfo();
      if (res.mode === 'move') {
        toast(`Notes folder changed: ${res.count} moved`);
      } else {
        toast(`Notes folder changed: old notes stay searchable`);
      }
    });
  }

  /* ------------------------------ wiring ------------------------------ */

  editor.addEventListener('input', () => {
    holdViewForTyping();
    dirty = true;
    deselectImage();
    linkEditArmed = true; // next link pass may drop the repaint for the caret
    autoGrow(); // growNow carries the counts too — once per frame
    scheduleSave();
    refreshImagesNow();
  });

  // Like Google Docs around an inline picture: it takes up no line of its
  // own — the hidden reference's line is the picture's first line. Up and
  // Down cross it in one stroke, lighting the picture up as they pass: Up
  // lands just above it (type there; Enter makes a fresh visible line above
  // it), Down on the line below with the column kept. Left/Right cross it
  // silently. Clicking it selects it.
  let verticalMotion = null;

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end } = editor;
      editor.setRangeText('  ', s, end, 'end');
      editor.dispatchEvent(new Event('input'));
    }
    // Moving the caret or asking out releases a selected picture.
    if (e.key === 'Escape' || /^(Arrow\w+|Home|End|PageUp|PageDown)$/.test(e.key)) {
      typingTurnUntil = 0; // moving the caret is the reader's: reveals stay native
      deselectImage();
    }
    // Deleting into a selected picture removes it whole. Like Google Docs,
    // Backspace from the line right below (or Delete from the line right
    // above) first reveals the picture as a selection — the line at its
    // bottom stays there with the caret — and only the next stroke removes it.
    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const caret = editor.selectionStart;
      const collapsed = caret === editor.selectionEnd;
      if (collapsed && selectedImage) {
        e.preventDefault();
        deleteSelectedImage();
        return;
      }
      if (collapsed && !selectedImage) {
        const units = imageUnits();
        const hit =
          e.key === 'Backspace'
            ? units.find((u) => caret === u.unitEnd && editor.value.lastIndexOf('\n', caret - 1) + 1 === caret)
            : units.find((u) => u.start > 0 && caret === u.start - 1);
        if (hit) {
          e.preventDefault();
          const entry = imageEls.get(`${hit.ref}@@${hit.index}`);
          if (entry) selectImage(entry); // stage one: show what is about to go
          else removeImageUnit(hit.start, hit.unitEnd); // layer not built yet
          return;
        }
      }
    }
    // Left and Right cross a picture in a single stroke, as if it were one
    // wide character sitting in the flow — without this the default caret
    // move would strand the caret inside the hidden reference line.
    if (
      (e.key === 'ArrowRight' || e.key === 'ArrowLeft') &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      editor.selectionStart === editor.selectionEnd
    ) {
      const caret = editor.selectionStart;
      for (const r of imageSkipRanges()) {
        if (!r.owns) continue;
        if (e.key === 'ArrowRight' && caret === r.skipStart - 1) {
          e.preventDefault();
          editor.setSelectionRange(r.skipEnd, r.skipEnd);
          break;
        }
        if (e.key === 'ArrowLeft' && caret === r.skipEnd) {
          const back = Math.max(0, r.skipStart - 1);
          e.preventDefault();
          editor.setSelectionRange(back, back);
          break;
        }
      }
    }
    if (
      (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      // Let the textarea make its normal move first, then steer the caret
      // out of the picture's lines in the same tick.
      verticalMotion = e.key;
      setTimeout(applyVerticalMotion, 0);
    }
  });

  function applyVerticalMotion() {
    const key = verticalMotion;
    verticalMotion = null;
    if (editor.selectionStart !== editor.selectionEnd) return;
    const caret = editor.selectionStart;
    for (const r of imageSkipRanges()) {
      if (caret < r.skipStart || caret >= r.skipEnd) continue;
      let target;
      if (key === 'ArrowUp') {
        target = r.upTo;
      } else {
        const text = editor.value;
        const landed = text.lastIndexOf('\n', caret - 1) + 1;
        const col = caret - landed;
        const belowEnd = text.indexOf('\n', r.skipEnd);
        const belowLen = (belowEnd === -1 ? text.length : belowEnd) - r.skipEnd;
        target = r.skipEnd + Math.min(col, belowLen);
      }
      editor.setSelectionRange(target, target);
      // The stroke crossed the picture, so it lights up rather than only
      // sliding past: highlighted until the next move, click or keystroke
      // (the usual deselect rules) — and Backspace/Delete then removes it.
      const entry = imageEls.get(`${r.ref}@@${r.index}`);
      if (entry) selectImage(entry);
      break;
    }
  }

  editor.addEventListener('mouseup', () => {
    if (resizeJob) return;
    if (editor.selectionStart !== editor.selectionEnd) return;
    const caret = editor.selectionStart;
    for (const r of imageSkipRanges()) {
      if (caret >= r.skipStart && caret < r.skipEnd) {
        editor.setSelectionRange(r.upTo, r.upTo);
        break;
      }
    }
  });

  // Arrow keys and clicks move the caret without firing 'input'; the layer
  // must still react (a caret that lands inside the picture's lines gets
  // steered back out on the next pass). The counts ride along: a drag or
  // shift+arrow changes the highlight without an input event, and a burst
  // of selectionchange during a drag pays one recount, not one per move.
  document.addEventListener('selectionchange', () => {
    if (document.activeElement !== editor) return;
    scheduleImages();
    if (metaTimer) return;
    metaTimer = setTimeout(() => {
      metaTimer = 0;
      updateMeta();
    }, 16);
  });

  // Ctrl+V with a screenshot in the clipboard goes straight into the note.
  editor.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.indexOf('image/') === 0) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) insertImageFile(file);
        return;
      }
    }
  });

  const hasFiles = (dt) => !!dt && Array.from(dt.types || []).includes('Files');

  // Dropping a file would otherwise navigate the window away from the app;
  // swallow drops and take images straight into the note.
  document.addEventListener('dragover', (e) => {
    if (hasFiles(e.dataTransfer)) e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    e.preventDefault();
    const img = Array.from(files).find((f) => /^image\//.test(f.type));
    if (img) insertImageFile(img);
  });

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (mod && e.key === ',') {
      e.preventDefault();
      settingsEl.classList.contains('open') ? closeSettings() : openSettings();
    } else if (mod && key === 'n') {
      e.preventDefault();
      newNote();
    } else if (mod && (key === 'p' || key === 'o')) {
      e.preventDefault();
      openSwitcher();
    } else if (mod && key === 's') {
      e.preventDefault();
      dirty = true;
      save(true);
    } else if (e.key === 'Escape') {
      if (switcher.classList.contains('open')) {
        e.preventDefault();
        closeSwitcher();
      } else if (settingsEl.classList.contains('open')) {
        e.preventDefault();
        closeSettings();
      }
    }
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 150);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      openSelected();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      togglePin(items[selected]);
    } else if (e.key === 'Delete' && searchInput.value === '') {
      e.preventDefault();
      deleteSelected();
    }
  });

  results.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    const i = Number(li.dataset.i);
    if (e.target.closest('.pin')) {
      selectIndex(i);
      togglePin(items[i]);
      return;
    }
    openNote(items[i].filePath);
  });

  // The star must not steal focus from the search box (Enter still opens).
  results.addEventListener('mousedown', (e) => {
    if (e.target.closest('.pin')) e.preventDefault();
  });

  results.addEventListener('mousemove', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    const i = Number(li.dataset.i);
    if (i === selected) return;
    results.querySelector('li.sel')?.classList.remove('sel');
    li.classList.add('sel');
    selected = i;
    updatePreview();
  });

  results.addEventListener('contextmenu', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    e.preventDefault();
    window.slate.revealNote(items[Number(li.dataset.i)].filePath);
  });

  switcher.addEventListener('mousedown', (e) => {
    if (e.target === switcher) closeSwitcher();
  });

  settingsEl.addEventListener('mousedown', (e) => {
    if (e.target === settingsEl) closeSettings();
  });

  on($('btn-notes'), 'click', openSwitcher);
  on($('btn-new'), 'click', newNote);
  on($('btn-settings'), 'click', () => {
    settingsEl.classList.contains('open') ? closeSettings() : openSettings();
  });
  on($('settings-close'), 'click', closeSettings);
  on($('btn-choose-folder'), 'click', chooseFolder);
  on($('btn-open-folder'), 'click', () => window.slate.openFolder());
  on($('btn-open-browser'), 'click', () => window.slate.openBrowser());

  // On-launch switch: reopen the last note (default) or start a fresh page.
  // The choice lives in switcher.json, so both surfaces share it.
  const startupSwitch = $('startup-toggle');
  function paintStartup(mode) {
    const reopen = mode !== 'new';
    startupSwitch.setAttribute('aria-checked', String(reopen));
    $('startup-label').textContent = reopen ? 'Reopen the last note' : 'Start with a new page';
  }
  on(startupSwitch, 'click', () => {
    const next = startupSwitch.getAttribute('aria-checked') === 'true' ? 'new' : 'last';
    paintStartup(next);
    window.slate.setStartup(next);
  });
  switcherState().then((st) => paintStartup(st.startup));

  // Launch-on-startup switch: starts Papyrus in the background at sign-in
  // (tray + localhost server, no window). Stored in settings.json like the
  // other prefs; main.js applies it to the OS login item, so the toggle
  // works the same from the desktop window and from a browser tab.
  const autostartSwitch = $('autostart-toggle');
  function paintAutostart(on) {
    autostartSwitch.setAttribute('aria-checked', String(!!on));
  }
  on(autostartSwitch, 'click', () => {
    const next = autostartSwitch.getAttribute('aria-checked') !== 'true';
    paintAutostart(next);
    window.slate.setPrefs({ launchOnStartup: next });
  });
  window.slate.getSettings().then((s) => paintAutostart(s.launchOnStartup));

  // Font family and size for the editor, stored with the other prefs so
  // the desktop window and every browser tab share them. Imported font
  // files live in the app's Fonts folder and are registered via FontFace.
  const DEFAULT_FONT_SIZE = 18;
  const FONT_CHOICES = [
    'Lexend', // the editor's own default font
    'Segoe UI', // the font the app's interface is drawn in
    'Lato',
    'Helvetica',
    'Verdana',
    'Times New Roman',
    'Cascadia Code', // coding font
    'Comic Sans MS',
    'Century Gothic',
  ];
  const fontGridEl = $('font-grid');
  const customFontEl = $('custom-font');
  const sizeValueEl = $('size-value');
  const importFontBtn = $('btn-import-font');
  const spacingValueEl = $('spacing-value');
  const DEFAULT_LINE_SPACING = 1.5;
  let currentFamily = '';
  let currentSize = DEFAULT_FONT_SIZE;
  let currentSpacing = DEFAULT_LINE_SPACING;
  let importedFonts = [];

  function applyFont(font, size) {
    metricsRev += 1;
    currentFamily = (font || '').trim().replace(/["']/g, '');
    currentSize = Math.min(48, Math.max(10, Math.round(Number(size) || DEFAULT_FONT_SIZE)));
    editor.style.fontFamily = currentFamily
      ? currentFamily.includes(',')
        ? currentFamily
        : `"${currentFamily}", Lexend, system-ui, sans-serif`
      : '';
    editor.style.fontSize = `${currentSize}px`;
    if (sizeValueEl && document.activeElement !== sizeValueEl) sizeValueEl.value = String(currentSize);
    if (customFontEl && document.activeElement !== customFontEl) customFontEl.value = currentFamily;
    autoGrow();
    refreshImagesNow(); // metrics changed — re-measure before the frame paints
    updateFontSelection();
  }

  // Spacing is kept to two decimals so typed values like 1.75 stay exact;
  // the steppers still move in tenths.
  function formatSpacing(n) {
    return String(Number(n.toFixed(2)));
  }

  function applySpacing(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    metricsRev += 1;
    currentSpacing = Math.min(3, Math.max(1, Math.round(num * 100) / 100));
    editor.style.lineHeight = String(currentSpacing);
    if (spacingValueEl && document.activeElement !== spacingValueEl) spacingValueEl.value = formatSpacing(currentSpacing);
    autoGrow();
    refreshImagesNow(); // line height changed — re-measure before the frame paints
  }

  function updateFontSelection() {
    if (!fontGridEl) return;
    const key = currentFamily || 'Lexend'; // the default stack renders as Lexend
    fontGridEl.querySelectorAll('.font-chip').forEach((chip) => {
      chip.classList.toggle('sel', chip.dataset.font === key);
    });
  }

  function buildFontGrid() {
    if (!fontGridEl) return;
    const families = [...importedFonts.map((f) => f.family), ...FONT_CHOICES].filter(
      (f, i, a) => a.indexOf(f) === i
    );
    fontGridEl.textContent = '';
    for (const family of families) {
      const chip = document.createElement('button');
      chip.className = 'font-chip';
      chip.dataset.font = family;
      chip.title = family;
      chip.style.fontFamily = `"${family}", Lexend, serif`;

      const name = document.createElement('span');
      name.className = 'fc-name';
      name.textContent = family;

      const aa = document.createElement('span');
      aa.className = 'fc-aa';
      aa.textContent = 'Ag';

      chip.append(name, aa);
      chip.addEventListener('click', () => {
        applyFont(family, currentSize);
        window.slate.setPrefs({ font: family });
        if (customFontEl) customFontEl.value = '';
      });
      fontGridEl.appendChild(chip);
    }
    updateFontSelection();
  }

  function loadFontFile(family, file) {
    if (!file) return Promise.resolve();
    return window.slate
      .readFont(file)
      .then((buf) => {
        if (!buf) return undefined;
        try {
          const face = new FontFace(family, buf);
          return face.load().then((loaded) => {
            document.fonts.add(loaded);
            metricsRev += 1; // the family's own metrics just landed
            refreshImagesNow(); // metrics changed under an already-set family
          });
        } catch {
          return undefined;
        }
      })
      .catch(() => undefined);
  }

  function importFont() {
    window.slate.importFont().then((res) => {
      if (!res || res.cancelled || !res.family || !res.file) return;
      const entry = { family: res.family, file: res.file };
      importedFonts = importedFonts.filter((f) => f.file !== res.file && f.family !== res.family).concat(entry);
      loadFontFile(entry.family, entry.file).then(() => {
        buildFontGrid();
        applyFont(entry.family, currentSize);
        window.slate.setPrefs({ importedFonts, font: entry.family });
        toast('Font imported');
      });
    });
  }

  on(importFontBtn, 'click', importFont);
  on(customFontEl, 'change', () => {
    const v = customFontEl.value.trim();
    applyFont(v, currentSize);
    window.slate.setPrefs({ font: v });
  });

  // Size and line spacing can be typed as well as stepped: Enter or a losing
  // focus commits, and both snap to their allowed range. applyFont/applySpacing
  // store the clamped value, so the pref saved is the one actually shown.
  const clampSize = (n) => Math.min(48, Math.max(10, Math.round(Number(n) || currentSize)));
  const clampSpacing = (n) => Math.min(3, Math.max(1, Math.round((Number(n) || currentSpacing) * 100) / 100));
  const setFontSize = (n) => {
    applyFont(currentFamily, clampSize(n));
    window.slate.setPrefs({ fontSize: currentSize });
  };
  const setSpacing = (n) => {
    applySpacing(clampSpacing(n));
    window.slate.setPrefs({ lineSpacing: currentSpacing });
  };
  on($('btn-size-down'), 'click', () => setFontSize(currentSize - 1));
  on($('btn-size-up'), 'click', () => setFontSize(currentSize + 1));
  on($('btn-spacing-down'), 'click', () => setSpacing(currentSpacing - 0.1));
  on($('btn-spacing-up'), 'click', () => setSpacing(currentSpacing + 0.1));

  if (sizeValueEl) {
    const commitSize = () => {
      setFontSize(sizeValueEl.value);
      sizeValueEl.value = String(currentSize);
    };
    sizeValueEl.addEventListener('change', commitSize);
    sizeValueEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commitSize();
      if (e.key === 'Escape') {
        sizeValueEl.value = String(currentSize);
        sizeValueEl.blur();
      }
    });
  }

  if (spacingValueEl) {
    const commitSpacing = () => {
      setSpacing(spacingValueEl.value);
      spacingValueEl.value = formatSpacing(currentSpacing);
    };
    spacingValueEl.addEventListener('change', commitSpacing);
    spacingValueEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commitSpacing();
      if (e.key === 'Escape') {
        spacingValueEl.value = formatSpacing(currentSpacing);
        spacingValueEl.blur();
      }
    });
  }

  /* ------------------------------ lifecycle ------------------------------ */

  window.slate.onFlush(() => window.slate.flushSync(currentFilePath, editor.value));
  window.slate.onNewNote(() => newNote());

  // Safety net: the usual save fires 600ms after a pause in typing, so
  // someone typing continuously would not be saved at all. Flush dirty
  // work at least every 10 seconds (a no-op when nothing changed).
  setInterval(() => {
    if (dirty) save(false);
  }, 10000);

  window.addEventListener('beforeunload', () => {
    if (dirty) window.slate.flushSync(currentFilePath, editor.value);
  });

  window.addEventListener('resize', autoGrow);

  /* ------------------------------ boot ------------------------------ */

  buildThemeGrid();
  applyTheme(currentThemeKey());

  // Sync the theme through settings.json: inherit the server's choice on
  // startup (unless the user just picked one), or publish ours if the
  // server has none yet (first run after the migration to Papyrus).
  window.slate.getSettings().then(({ theme, font, fontSize, lineSpacing, importedFonts: imported }) => {
    importedFonts = Array.isArray(imported) ? imported : [];
    buildFontGrid();
    if (!themeTouched) {
      if (theme && theme !== currentThemeKey()) applyTheme(theme);
      else if (!theme) window.slate.setPrefs({ theme: currentThemeKey() });
    }
    applySpacing(lineSpacing || DEFAULT_LINE_SPACING);
    // Register imported font files first so the editor renders in them.
    Promise.all(importedFonts.map((f) => loadFontFile(f.family, f.file))).then(() => applyFont(font, fontSize));
  });
  autoGrow();
  editor.focus();

  // On launch, reopen the last note when that's the chosen mode (the toggle
  // lives in Settings). The state's frecency is already pruned of deleted
  // notes, so the newest entry is safe to open — and opening it here is not
  // counted as an open, so a relaunch can't rig the ranking in its favor.
  switcherState().then((st) => {
    if (st.startup !== 'last') return;
    let last = null;
    let lastAt = 0;
    for (const [fp, rec] of Object.entries(st.frecency)) {
      if (rec && rec.last > lastAt) {
        lastAt = rec.last;
        last = fp;
      }
    }
    if (last) openNote(last, { touch: false });
  });

  // A webfont swapping in shifts the text metrics — catch it the moment it lands.
  if (document.fonts) document.fonts.ready.then(() => refreshImagesNow());

  // Let the buttons be noticed once, then fade away.
  pokeTopbar();
  topbarTimer = setTimeout(() => topbar.classList.remove('visible'), 5000);
})();
