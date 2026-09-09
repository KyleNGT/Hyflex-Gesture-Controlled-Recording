# CLAUDE.md

Guidance for working in this repo. Read before making changes.

## What this is

**PTF50 – MCO: Gesture-Based Asynchronous Lecture Recorder.** A browser-based,
touchless lecture recording studio for AUF faculty producing asynchronous course
content. The professor controls layout changes with hand gestures while recording;
the app composites every layout change **in real time into one video file** so
there is zero post-production editing.

The single hard requirement that drives the architecture: **the downloaded file is
already the finished lecture.** No stitching feeds together afterward.

## Tech stack (no build step)

- **Plain JavaScript, ES modules, no bundler.** `index.html` loads `js/main.js`
  as `<script type="module">`. Third-party libs come from CDN via `<script>` tags
  or `import` from a CDN URL. Do not add npm/Vite/webpack/TypeScript. Do not add a
  `package.json` for app dependencies.
- **Hand tracking:** `@tensorflow-models/hand-pose-detection` with the
  **`runtime: 'mediapipe'`** (WASM) path — `@mediapipe/hands` supplies the
  solution assets via `solutionPath` (jsdelivr). The `tfjs` runtime returns
  all-NaN keypoints with tfjs 4.22 on some WebGL setups, so we do not use it.
  `tfjs-core` is still loaded because the hand-pose-detection UMD bundle needs it.
  Model docs: https://github.com/tensorflow/tfjs-models/tree/master/hand-pose-detection
- **PDF slides:** `pdfjs-dist` from CDN; remember to set `GlobalWorkerOptions.workerSrc`.
- **Everything else is platform APIs:** `getUserMedia`, `getDisplayMedia`,
  `canvas.captureStream()`, `MediaRecorder`, `requestAnimationFrame`.
- Pin exact CDN versions in URLs. Keep the full list at the top of `index.html`
  and mirrored in README.

## Running it

Needs a secure context for camera/mic/screen-share. `localhost` / `127.0.0.1`
count; `file://` does not. Use **VS Code Live Server** (right-click `index.html` →
"Open with Live Server"; `.vscode/settings.json` pins it to `127.0.0.1:5500`), or
any static server:

```
python3 -m http.server 8000   # then open http://localhost:8000
```

All app paths are relative, so the mount point / port does not matter. `media.js`
throws a clear error if opened without a secure context.

Tests live in `js/tests/` and run with no build: open `tests.html` on the same
static server. They drive the classifiers and the gesture engine with synthetic
keypoints. Keep any new tests DOM-free and framework-free so they stay runnable
that way.

## Architecture

Two decoupled loops plus a command bus. Keep them decoupled.

```
camera + screen streams ─┐
                         ├─► compositor loop  (rAF, ~30fps) ─► <canvas> ─► captureStream ─► MediaRecorder ─► .mp4 / .webm
PDF pages ───────────────┘        ▲
                                  │ current mode + slide index
detection loop (~15fps) ─► hand keypoints ─► gesture engine ─► COMMAND events ─► app state
```

### Suggested modules (`js/`)

| File | Responsibility |
|---|---|
| `main.js` | Bootstrap, permission flow, wire modules together |
| `media.js` | `getUserMedia` / `getDisplayMedia`, track lifecycle |
| `slides.js` | Load PDF, render page N to an offscreen canvas, cache |
| `handpose.js` | Load model once, run `estimateHands` on a timer, emit keypoints |
| `gestures/*.js` | Pure classifiers: keypoints → gesture name or `null` |
| `gesture-engine.js` | Action-zone gate, dwell timer, stationary check, debounce → emits `COMMAND` |
| `state.js` | App mode, slide index, recording state; single source of truth |
| `compositor.js` | The rAF render loop: draw current mode onto the recording canvas |
| `recorder.js` | `MediaRecorder` wrapper: start/stop/pause/resume, mux mic audio, download |
| `ui.js` | App shell chrome: header (mode chip + REC timer), the notice banner, the sidebar studio-overlay switches, red/yellow border, status text, and the overlay canvas (dwell ring, clutch meter, skeleton, guide line, metrics) |
| `tuner.js` | Live threshold panel (`t`): mutates `CONFIG` in place, persists, exports a diff |
| `tests/*.js` | Synthetic-keypoint tests for the classifiers + engine; run via `tests.html` |

### The compositing pipeline (do not deviate)

1. One `<canvas>` (call it the **stage canvas**) is the only thing recorded.
2. Every frame, `compositor.js` clears it and draws the current mode's layout:
   slides + webcam PiP, or fullscreen webcam, or screenshare + webcam PiP.
3. `stageCanvas.captureStream(30)` gives the video track.
4. Build the recorded stream as
   `new MediaStream([...stage.getVideoTracks(), micTrack])` so audio is in the
   same file.
5. `MediaRecorder` prefers **`video/mp4` (H.264 + AAC)** — supported in Chromium
   126+ and Safari — and falls back to `video/webm` (vp9/opus, then vp8, then
   bare) where it is not, e.g. Firefox. Probe the `MIME_CANDIDATES` list with
   `MediaRecorder.isTypeSupported`. Chromium writes *fragmented* MP4, which every
   mainstream player reads. **The download extension always follows the container
   the browser actually gave us** (`recorder.getExtension()`); a WebM blob is
   never named `.mp4`.
6. On stop: `new Blob(chunks, {type})` → object URL → auto-trigger download.

**UI overlays (header, borders, loading ring, buttons, metrics, hand skeleton)
are NOT drawn on the stage canvas.** They are separate DOM elements + a
stacked overlay canvas, all owned by `ui.js`. They are studio aids for the
professor (no live audience), not part of the lecture. The stage canvas holds
lecture content only. The studio overlay (skeleton, guide line, metrics readout,
quick-guide panel) is gated by `CONFIG.OVERLAY` — a master `on` plus `metrics` /
`skeleton` / `guide` sub-flags, wired to the sidebar switches by `ui.js`. The
dwell ring and clutch meter are **not** gated: they are core HCI feedback. There
is no `CONFIG.DEBUG` any more.

## HCI rules — the core of the project

These exist to defeat the "Midas Touch" problem (natural gesticulation triggering
commands). All three gate **every command gesture**:

1. **Action zone.** The hand's keypoint centroid must be in the **upper frame**
   (near shoulder/face — the top 50% of the video height, `CONFIG.ACTION_ZONE_TOP`).
   Movements below the chest are ignored entirely. Check this *before* starting a
   dwell.
2. **Dwell time.** The same gesture must be held for **1500 ms** while the hand
   stays roughly stationary (wrist drift under a small threshold). A real change
   of gesture class, real drift, or leaving the zone resets the timer to 0 — but
   the hand-pose detector drops and misreads frames constantly, so a gesture lost
   for **less than `CONFIG.GESTURE_GRACE_MS` (300 ms)** *freezes* the dwell
   (progress held, no competing dwell started) rather than resetting it. This
   "coasting" is what makes a two-handed hold practical. See `gesture-engine.js`.
3. **Visual feedback.** While dwelling, `ui.js` draws a circular **loading ring**
   around the hand, filling `elapsed / dwell`. The arc dims while coasting. It
   completes → command fires once, then a cooldown (~1 s) before another command
   can start.

**State indicators (visible from across the room):**
- Recording active → solid **red** border around the screen.
- Paused → highly visible **yellow** border.
- These must always reflect `MediaRecorder.state` truthfully.

## Gesture vocabulary

| Gesture | Hand(s) | Recognizer sketch | Effect |
|---|---|---|---|
| **L-Shape** | one | thumb + index extended, middle curled (ring/pinky not tested), held at a corner angle | → **Presentation Mode**: PDF full-bleed, webcam PiP bottom-right |
| **Pinch & Drag clutch** | one | thumb tip–index tip distance below threshold = "clutched"; track x; release to commit | Horizontal drag in Presentation Mode → prev/next slide. **Not dwell-based** — it's a continuous manipulation. Pinch avoids false positives from open-palm sweeps. |
| **Two-handed Frame** | two | both hands making L-shapes, arranged as a rectangle | → **Whiteboard Mode**: hide slides, raw webcam feed to 100% fullscreen |
| **Shaka** | one | thumb + pinky extended, index/middle/ring curled | → **Screenshare Mode**: screenshare fullscreen, webcam back to PiP |
| **Two-handed Time-Out (T-shape)** | two | one hand vertical (fingertips up), other horizontal across it | Toggle `MediaRecorder` pause/resume. Border red↔yellow. |
| **V sign** | one | index + middle extended and splayed apart, ring/pinky curled | Start/stop the take. **Dwells for `DWELL_MS_COMMIT` (3 s), not the usual 1.5 s.** |

Notes:
- `maxHands: 2`. Two-handed gestures require both hands detected and each passing
  its per-hand shape test.
- The stage canvas and the on-screen webcam preview are **mirrored** (selfie view).
  Keep gesture x-math and the model's `handedness` in one consistent coordinate
  space — decide mirrored-vs-raw once, in `handpose.js`, and document it there.
- Classifiers in `gestures/` must be **pure functions** of keypoints: no timers,
  no DOM, no state. All timing/gating lives in `gesture-engine.js`.

## App modes / layout

| Mode | Stage canvas contents |
|---|---|
| **Idle** (pre-record) | webcam preview (fullscreen cover) |
| **Presentation** | current PDF page as background, webcam PiP bottom-right |
| **Whiteboard** | raw webcam feed, fullscreen |
| **Screenshare** | screenshare track fullscreen, webcam PiP bottom-right |

Mode and slide index live in `state.js`. `compositor.js` reads them; it never
owns them. Mode transitions should be instant on the stage canvas (a hard cut is
fine; a short crossfade is a nice-to-have, not required).

## Demonstration flow (target UX)

1. Open app → upload PDF → grant webcam + screenshare → click **Start Recording**
   (physical mouse). Border turns red.
2. Hold **L-Shape** near shoulder → ring fills 1.5 s → Presentation Mode.
3. **Pinch-drag** left → next slide.
4. **Time-Out** T-shape → ring fills → recording pauses, border yellow. Draw on
   physical whiteboard. Repeat T-shape → resume, border red.
5. **Frame** gesture → Whiteboard Mode (fullscreen raw webcam).
6. **Shaka** → Screenshare Mode.
7. Click **Stop Recording** (physical mouse), or hold the **V sign** for 3 s →
   file downloads automatically.

Start/Stop Recording are also **mouse buttons**, and remain the primary path.
The V-sign gesture reaches the same `startRecording()` / `stopRecording()` in
`main.js`, so the two can never drift apart. It is deliberately harder to trigger
than any other gesture — a 3 s dwell and an orange ring labelled START/STOP —
because ending a take is the one command with no undo.

Superseded note (kept for the record): the original spec said gestures never
start or stop recording — only pause/resume and layout.

## Conventions & gotchas

- Load the hand-pose model **once**; never per frame. Show a loading state until
  `createDetector` resolves.
- Run detection on a timer/throttle (~15 fps), compositing on `requestAnimationFrame`
  (~30 fps). Don't couple them.
- Guard against `estimateHands` overlapping calls (skip if previous still running).
- Always stop all `MediaStreamTrack`s on teardown / stop.
- Handle permission denial and "no hands detected" gracefully with visible status.
- `getDisplayMedia` can be cancelled by the user — treat Screenshare Mode as
  unavailable until a screen track exists.
- Keep magic numbers (dwell ms, zone fraction, pinch threshold, drift threshold,
  cooldown ms) in one `config.js` object so they're tunable.
- **Read `CONFIG` at call time, never destructure it into module scope.** The
  live tuner mutates `CONFIG` in place while the app runs; a value captured at
  import time silently stops responding to the sliders.
- ASCII, 2-space indent, `const`/`let`, small modules, no framework patterns.
