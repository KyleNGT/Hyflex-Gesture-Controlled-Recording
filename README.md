# HyFlex — Gesture-Based Asynchronous Lecture Recorder

PTF50-MCO. A browser-based, touchless lecture recording studio for AUF faculty.
Layout changes are composited **live** into one downloadable file (**`.mp4`**
where the browser can encode H.264 — Chromium 126+, Safari — otherwise `.webm`),
with no post-production editing.

See `CLAUDE.md` for the architecture and gesture design.

## Layout

Desktop screen-recorder shell: the **preview** (the stage canvas that gets
recorded) fills the left; a titled header sits above it, and **every control —
sources, record buttons, the studio-overlay switches and the quick guide — is in
the right sidebar**. The "Studio overlay" switch (with sub-toggles for the
metrics readout and the hand skeleton) turns the on-screen aids on or off; none
of them are ever part of the recorded file, and a dismissible banner says so.

## Run

Needs a secure context for camera/mic/screen-share — serve over `localhost` /
`127.0.0.1`, never open `index.html` as a `file://` URL.

**VS Code Live Server** (recommended): right-click `index.html` → "Open with Live
Server". `.vscode/settings.json` pins it to `http://127.0.0.1:5500`.

Or any static server:

```
python3 -m http.server 8000     # then open http://localhost:8000
```

## Gestures

All command gestures are gated the same way: the hand must be in the **upper half
of the frame**, held **still** while a ring fills, then a 1 s cooldown. A gesture
briefly lost to the detector (under `GESTURE_GRACE_MS`) freezes the ring rather
than resetting it.

| Gesture | Hands | Hold | Effect |
|---|---|---|---|
| L-shape (thumb + index up, middle curled) | one | 1.5 s | Presentation mode |
| Pinch thumb+index, drag sideways, release | one | — | Previous / next slide |
| Two L-shapes framing a rectangle | two | 1.5 s | Whiteboard mode |
| Shaka (thumb + pinky, middle three curled) | one | 1.5 s | Screenshare mode |
| Time-out T (one hand vertical, one across it) | two | 1.5 s | Pause / resume recording |
| V sign (index + middle, splayed apart) | one | **3 s** | Start / stop recording |

The V sign holds for twice as long as the others, and draws an orange ring
labelled START or STOP rather than the usual white one. A false positive on a
layout gesture costs a second; a false positive here ends the take. The mouse
buttons do the same thing and are still there.

Recording state is a full-screen border: **red** while recording, **yellow**
while paused.

## Keyboard

| Key | Action |
|---|---|
| `1` / `2` / `3` / `0` | presentation / whiteboard / screenshare / idle |
| `←` / `→` | previous / next slide |
| `Space` | pause / resume recording |
| `r` | start / stop recording |
| `t` | gesture tuning panel |
| `d` | studio overlay (skeleton + metrics + guide) on / off |

## Tuning the gestures

Thresholds all live in `js/config.js`. Press **`t`** for a live panel that
mutates them in place while the app runs — hold a gesture, watch the metrics
readout (`d`, or the Studio overlay switch) show which condition is red, drag the
slider until it goes green.

Tuning is saved to `localStorage` so a reload keeps it. **Copy for config.js**
puts a paste-ready diff of the changed values on the clipboard; paste it into
`js/config.js` to make a calibration permanent, then **Reset** to clear the
browser-local copy.

## Tests

Open `tests.html` on the same static server. Framework-free, no build: it drives
the classifiers and the gesture engine with synthetic keypoints
(`js/tests/hand-fixtures.js`) and checks both that each gesture is recognized and
that ordinary hand poses — a fist, an open palm, a pointing hand — command
nothing. Threshold *values* still need a real hand; the tests only lock in shape
and gating.

## Status

Feature-complete. The recording pipeline, the five classifiers, the dwell/zone/
cooldown gating and the pinch-drag slide clutch are all implemented. What remains
is calibration against real hands via the tuner.

## Third-party (CDN, pinned)

- `hand-pose-detection` 2.0.1 with `@mediapipe/hands` 0.4.1675469240 (WASM runtime)
- `tfjs-core` 4.22.0 (required by the hand-pose-detection bundle)
- pdf.js 4.0.379 (ESM)
