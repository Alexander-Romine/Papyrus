# Papyrus

A distraction-free writing app for Windows, as a desktop window or a browser tab.

**Download:** [Releases page](../../releases)

![Papyrus screenshot](screenshot.png)

## Install

- **`Papyrus-Setup-<version>.exe`** - one-click installer, just for your user account
- **`Papyrus-Portable-<version>.exe`** - no installation, run it anywhere
- SmartScreen warning on first run: click **More info > Run anyway** (the app isn't code-signed)

## Build

Requires [Node.js](https://nodejs.org) 18+.

```sh
npm install
npm start
npm run dist
```

## Features

- Notes save as plain `.txt` files 600ms after you pause typing, with a 10 second safety flush
- Paste or drop screenshots inline; images live in an `images` folder next to your notes
- `Ctrl+N` new page, `Ctrl+P` search all notes, `Ctrl+,` settings, `Ctrl+S` save now
- Settings > **Use in a browser** opens the same notes in a localhost tab
- Themes, fonts (system, imported `.ttf`, or any installed) and line spacing in Settings

## Tech Stack

- [Electron](https://www.electronjs.org/)
- Vanilla HTML, CSS and JavaScript
- Packaged with [electron-builder](https://www.electron.build/)

## License

[MIT](LICENSE)
