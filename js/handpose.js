// Hand tracking. Creates the detector exactly once and polls estimateHands on a
// fixed cadence with an in-flight guard so calls never overlap.
//
// COORDINATE DECISION — read before touching downstream gesture code:
// The webcam preview and the recorded stage are MIRRORED (selfie view). We mirror
// keypoint x HERE, at the module boundary (x = videoWidth - x), so every consumer
// (classifiers, pinch-drag direction, overlay drawing) works in ONE mirrored
// space that matches what the professor sees on screen.
// We deliberately IGNORE the model's `handedness` label — it flips under
// mirroring and none of our five gestures need left/right identity; use geometry.

import { CONFIG } from './config.js';

let detector = null;
let running = false;
let inFlight = false;
let timer = null;

// MediaPipe Hands keypoint indices: 0 wrist, 1-4 thumb, 5-8 index,
// 9-12 middle, 13-16 ring, 17-20 pinky.

// MediaPipe (WASM) runtime. The tfjs runtime returns all-NaN keypoints with
// tfjs 4.22 on some WebGL setups; the WASM solution is the reference path.
export async function initHandpose() {
  detector = await handPoseDetection.createDetector(
    handPoseDetection.SupportedModels.MediaPipeHands,
    {
      runtime: 'mediapipe',
      solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240',
      modelType: 'full',
      maxHands: 2,
    },
  );
  console.log('[handpose] detector created (mediapipe runtime)');
}

// Starts the poll loop. `onHands` receives an array (0-2) of normalized hands:
//   { keypoints: [{x,y} x21], centroid: {x,y}, scale: number }
// all in mirrored video-pixel space. Empty array when no hands are visible.
export function start(videoEl, onHands) {
  if (!detector || running) return;
  running = true;
  const period = 1000 / CONFIG.DETECT_FPS;

  timer = setInterval(async () => {
    if (inFlight || videoEl.readyState < 2) return;
    inFlight = true;
    try {
      const raw = await detector.estimateHands(videoEl, { flipHorizontal: false });
      onHands(raw.map((h) => normalize(h, videoEl.videoWidth)));
    } catch (err) {
      console.error('[handpose] estimateHands failed', err);
    } finally {
      inFlight = false;
    }
  }, period);
}

export function stop() {
  running = false;
  if (timer) clearInterval(timer);
  timer = null;
}

function normalize(hand, videoWidth) {
  const keypoints = hand.keypoints.map((k) => ({ x: videoWidth - k.x, y: k.y }));
  const wrist = keypoints[0];
  const midMcp = keypoints[9];
  const scale = Math.hypot(midMcp.x - wrist.x, midMcp.y - wrist.y) || 1;

  let cx = 0;
  let cy = 0;
  for (const k of keypoints) { cx += k.x; cy += k.y; }
  cx /= keypoints.length;
  cy /= keypoints.length;

  return { keypoints, centroid: { x: cx, y: cy }, scale };
}
