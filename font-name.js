// Reads the family name out of a font file. Works for ttf/otf (sfnt) and
// woff (zlib-compressed tables). woff2 is brotli-compressed, so its name
// table cannot be read here; callers fall back to the file name then.
const zlib = require('zlib');

function familyFromNameTable(t) {
  if (!t || t.length < 6) return null;
  const count = t.readUInt16BE(2);
  const strOff = t.readUInt16BE(4);
  let fallback = null;
  for (let i = 0; i < count; i += 1) {
    const rec = 6 + i * 12;
    if (rec + 12 > t.length) break;
    const platform = t.readUInt16BE(rec);
    const nameId = t.readUInt16BE(rec + 6);
    const len = t.readUInt16BE(rec + 8);
    const off = t.readUInt16BE(rec + 10);
    if (nameId !== 1 && nameId !== 4) continue; // family or full name
    if (platform !== 3 && platform !== 1) continue; // Windows or Mac
    const start = strOff + off;
    if (start + len > t.length || len === 0) continue;
    let name;
    if (platform === 3) {
      if (len % 2 !== 0) continue;
      const raw = Buffer.from(t.subarray(start, start + len));
      raw.swap16(); // UTF-16BE -> UTF-16LE
      name = raw.toString('utf16le');
    } else {
      name = t.toString('latin1', start, start + len);
    }
    name = name.replace(/\u0000/g, '').trim();
    if (!name) continue;
    if (platform === 3 && nameId === 1) return name; // Windows family name wins
    if (!fallback) fallback = name;
  }
  return fallback;
}

function locateNameTable(buf) {
  if (buf.length < 12) return null;
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16;
    if (rec + 16 > buf.length) return null;
    if (buf.toString('ascii', rec, rec + 4) === 'name') {
      const off = buf.readUInt32BE(rec + 8);
      const len = buf.readUInt32BE(rec + 12);
      if (off + len > buf.length) return null;
      return buf.subarray(off, off + len);
    }
  }
  return null;
}

function familyFromFontFile(buf) {
  if (!buf || buf.length < 12) return null;
  const sig = buf.toString('ascii', 0, 4);
  try {
    if (sig === 'wOFF') {
      const num = buf.readUInt16BE(12);
      for (let i = 0; i < num; i += 1) {
        const rec = 44 + i * 20;
        if (rec + 20 > buf.length) break;
        if (buf.toString('ascii', rec, rec + 4) === 'name') {
          const off = buf.readUInt32BE(rec + 4);
          const comp = buf.readUInt32BE(rec + 8);
          const orig = buf.readUInt32BE(rec + 12);
          if (off + comp > buf.length) return null;
          const raw = buf.subarray(off, off + comp);
          const data = comp < orig ? zlib.inflateSync(raw) : Buffer.from(raw);
          return familyFromNameTable(data);
        }
      }
      return null;
    }
    if (sig === 'wOF2' || sig === 'ttcf') return null;
    return familyFromNameTable(locateNameTable(buf));
  } catch {
    return null;
  }
}

function fontFamilyFromName(fileName) {
  const base = String(fileName || '')
    .replace(/\.(ttf|otf|woff2?|ttc)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return base || 'Imported Font';
}

module.exports = { familyFromFontFile, fontFamilyFromName };
