// Gesture classifiers — STUBS for this pass.
//
// Everything here must be a PURE function of keypoints: no timers, no DOM, no
// state. All timing / gating / cooldown lives in js/gesture-engine.js.
//
// Keypoints are in mirrored video-pixel space (see js/handpose.js). Use the
// helpers in ./fingers.js — do not re-derive geometry.

import { fingerStates, pinchAmount } from './fingers.js';

// hands: array (0-2) of { keypoints, centroid, scale }
// Returns one of: 'lshape' | 'shaka' | 'frame' | 'timeout' | null
//
// TODO: implement, two-handed classes FIRST so priority is unambiguous:
//   - 'frame'   : both hands making an L, arranged as a rectangle
//   - 'timeout' : one hand vertical, the other horizontal across it (T)
//   then one-handed:
//   - 'lshape'  : thumb + index extended, middle/ring/pinky curled
//   - 'shaka'   : thumb + pinky extended, index/middle/ring curled
// Two L-shapes must resolve to 'frame', never 'lshape'.
export function classify(hands) {
  void hands;
  void fingerStates;
  return null;
}

// Single-hand pinch state for the slide-nav clutch (Presentation Mode only).
// Returns { pinched: boolean, x: number } where x is the pinch-point x in
// mirrored pixel space (used to measure horizontal drag).
//
// TODO: derive `pinched` from pinchAmount(hand.keypoints) with hysteresis
// handled by the engine (CONFIG.PINCH_ON / PINCH_OFF); report the raw amount
// via the engine, or just return thumb/index midpoint here.
export function pinchState(hand) {
  void pinchAmount;
  const p = hand ? hand.keypoints[4] : { x: 0 };
  return { pinched: false, x: p.x };
}
