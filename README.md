# HyFlex — Gesture-Based Asynchronous Lecture Recorder

PTF50-MCO. A browser-based, touchless lecture recording studio for AUF faculty.
Layout changes are composited **live** into one downloadable `.webm` — no
post-production editing.

See `CLAUDE.md` for the architecture and gesture design.

## Run

Needs a secure context for camera/mic/screen-share — serve over `localhost` /
`127.0.0.1`, never open `index.html` as a `file://` URL.

**VS Code Live Server** (recommended): right-click `index.html` → "Open with Live
Server". `.vscode/settings.json` pins it to `http://127.0.0.1:5500`.

Or any static server:

```
python3 -m http.server 8000     # then open http://localhost:8000
```

## Status

Scaffold pass. The recording pipeline is real; the five gesture classifiers in
`js/gestures/classify.js` are stubs. Drive the app meanwhile with:

| Key | Action |
|---|---|
| `1` / `2` / `3` / `0` | presentation / whiteboard / screenshare / idle |
| `←` / `→` | previous / next slide |
| `Space` | pause / resume recording |

Start/Stop Recording are mouse-only by design.

## Third-party (CDN, pinned)

- `hand-pose-detection` 2.0.1 with `@mediapipe/hands` 0.4.1675469240 (WASM runtime)
- `tfjs-core` 4.22.0 (required by the hand-pose-detection bundle)
- pdf.js 4.0.379 (ESM)
