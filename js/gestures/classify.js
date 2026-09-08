// Gesture classifiers.
//
// Everything here is a PURE function of keypoints: no timers, no DOM, no
// state. All timing / gating / cooldown lives in js/gesture-engine.js.
//
// Keypoints are in mirrored stage-pixel space (see js/handpose.js). Use the
// helpers in ./fingers.js -- do not re-derive geometry.
//
// Each gesture has a `*Detail()` returning its raw measurements alongside `ok`.
// The classifier uses `ok`; the debug overlay and the live tuner read the
// measurements, which is what makes CONFIG.GESTURE tunable against a real hand
// instead of by guesswork.

import { CONFIG } from '../config.js';
import {
  angleBetween, centroid, dist, fingerDirection, fingerStates, flatFingerCount,
  handScale, midpoint, palmDirection, pinchAmount,
} from './fingers.js';

// Read thresholds at call time -- the tuner mutates CONFIG.GESTURE in place.
function g() { return CONFIG.GESTURE; }

// --- one-handed ---------------------------------------------------------

// L-Shape: thumb + index extended, other three curled, held at a corner angle.
// The angle test separates a deliberate L from a lazy pointing hand whose
// thumb happens to read as extended.
export function lshapeDetail(hand) {
  const kp = hand.keypoints;
  const s = fingerStates(kp);
  const fingersOk = s.thumb && s.index && !s.middle && !s.ring && !s.pinky;
  const angle = angleBetween(fingerDirection(kp, 'thumb'), fingerDirection(kp, 'index'));
  const angleOk = angle >= g().L_ANGLE_MIN && angle <= g().L_ANGLE_MAX;
  return { ok: fingersOk && angleOk, fingersOk, angle, angleOk };
}

// Shaka: thumb + pinky extended, middle three curled, tips splayed wide.
export function shakaDetail(hand) {
  const kp = hand.keypoints;
  const s = fingerStates(kp);
  const fingersOk = s.thumb && s.pinky && !s.index && !s.middle && !s.ring;
  const spread = dist(kp[4], kp[20]) / handScale(kp);
  const spreadOk = spread >= g().SHAKA_SPREAD_MIN;
  return { ok: fingersOk && spreadOk, fingersOk, spread, spreadOk };
}

// V sign: index + middle extended and splayed apart, ring and pinky curled.
// The thumb is not tested -- tucked or not, the V reads the same, and a looser
// test here costs nothing because no other gesture uses index + middle together.
export function veeDetail(hand) {
  const kp = hand.keypoints;
  const s = fingerStates(kp);
  const fingersOk = s.index && s.middle && !s.ring && !s.pinky;
  const spread = dist(kp[8], kp[12]) / handScale(kp);
  const spreadOk = spread >= g().V_SPREAD_MIN;
  return { ok: fingersOk && spreadOk, fingersOk, spread, spreadOk };
}

// --- two-handed ---------------------------------------------------------

// Frame: both hands make an L, sitting at opposite corners of a rectangle --
// index fingers pointing against each other, hands held apart. Separation is
// measured in hand-scales so it does not depend on distance from the camera.
export function frameDetail(h1, h2) {
  const l1 = lshapeDetail(h1);
  const l2 = lshapeDetail(h2);
  const bothL = l1.ok && l2.ok;

  const oppose = angleBetween(
    fingerDirection(h1.keypoints, 'index'),
    fingerDirection(h2.keypoints, 'index'),
  );
  const opposeOk = oppose >= g().FRAME_OPPOSE_MIN;

  const scale = avgScale(h1, h2);
  const sep = dist(centroid(h1.keypoints), centroid(h2.keypoints)) / scale;
  const sepOk = sep >= g().FRAME_SEP_MIN;

  return { ok: bothL && opposeOk && sepOk, bothL, oppose, opposeOk, sep, sepOk };
}

// Time-Out: one flat hand vertical (fingertips up), the other flat and
// horizontal, laid across its fingertips. Either hand may be the stem, so both
// role assignments are tried.
export function timeoutDetail(h1, h2) {
  const a = tShape(h1, h2);
  const b = tShape(h2, h1);
  if (a.ok) return a;
  if (b.ok) return b;
  // Neither passes: report whichever is closer, so tuning has a target.
  return a.touch <= b.touch ? a : b;
}

function tShape(vert, horiz) {
  const vDir = palmDirection(vert.keypoints);
  const hDir = palmDirection(horiz.keypoints);

  const up = -vDir.y;                    // stage y grows downward
  const across = Math.abs(hDir.x);
  const vertOk = up >= g().T_AXIS_MIN;
  const horizOk = across >= g().T_AXIS_MIN;

  const flatOk = flatFingerCount(vert.keypoints) >= g().T_FLAT_MIN &&
    flatFingerCount(horiz.keypoints) >= g().T_FLAT_MIN;

  // The crossbar's palm should sit on the stem's fingertips.
  const touch = dist(centroid(horiz.keypoints), vert.keypoints[12]) / avgScale(vert, horiz);
  const touchOk = touch <= g().T_TOUCH_MAX;

  return {
    ok: vertOk && horizOk && flatOk && touchOk,
    up, across, vertOk, horizOk, flatOk, touch, touchOk,
  };
}

function avgScale(h1, h2) {
  return (handScale(h1.keypoints) + handScale(h2.keypoints)) / 2 || 1;
}

// --- the classifier -----------------------------------------------------

// hands: array (0-2) of { keypoints, centroid, scale }
// Returns one of: 'lshape' | 'shaka' | 'vee' | 'frame' | 'timeout' | null
//
// Two-handed classes are tested FIRST so priority is unambiguous: two L-shapes
// resolve to 'frame', never to 'lshape'. When two hands are up but neither
// two-handed shape holds, a one-handed gesture still counts -- but only if
// exactly one hand is making one, so an ambiguous pair fires nothing.
export function classify(hands) {
  if (!hands || hands.length === 0) return null;

  if (hands.length >= 2) {
    const [h1, h2] = hands;
    if (frameDetail(h1, h2).ok) return 'frame';
    if (timeoutDetail(h1, h2).ok) return 'timeout';

    const a = singleHand(h1);
    const b = singleHand(h2);
    if (a && !b) return a;
    if (b && !a) return b;
    return null;
  }

  return singleHand(hands[0]);
}

function singleHand(hand) {
  if (lshapeDetail(hand).ok) return 'lshape';
  if (shakaDetail(hand).ok) return 'shaka';
  if (veeDetail(hand).ok) return 'vee';
  return null;
}

// Single-hand pinch state for the slide-nav clutch (Presentation Mode only).
// `amount` is the raw thumb-tip <-> index-tip separation in hand-scales; the
// engine applies the CONFIG.PINCH_ON / PINCH_OFF hysteresis around it. The
// reported point is the pinch itself (thumb/index midpoint), which is what the
// professor perceives as the thing being dragged.
export function pinchState(hand) {
  if (!hand) return { pinched: false, amount: Infinity, x: 0, y: 0 };
  const kp = hand.keypoints;
  const amount = pinchAmount(kp);
  const p = midpoint(kp[4], kp[8]);
  return { pinched: amount < CONFIG.PINCH_ON, amount, x: p.x, y: p.y };
}

// Human-readable measurements for the debug overlay / tuner. Returns rows of
// { label, value, ok } -- purely descriptive, never used for classification.
export function describe(hands) {
  const rows = [];
  if (!hands || hands.length === 0) return rows;

  if (hands.length === 1) {
    const l = lshapeDetail(hands[0]);
    const s = shakaDetail(hands[0]);
    rows.push({ label: 'L fingers', value: l.fingersOk ? 'yes' : 'no', ok: l.fingersOk });
    rows.push({ label: 'L angle', value: `${l.angle.toFixed(0)}d`, ok: l.angleOk });
    rows.push({ label: 'shaka fingers', value: s.fingersOk ? 'yes' : 'no', ok: s.fingersOk });
    rows.push({ label: 'shaka spread', value: s.spread.toFixed(2), ok: s.spreadOk });
    const v = veeDetail(hands[0]);
    rows.push({ label: 'V fingers', value: v.fingersOk ? 'yes' : 'no', ok: v.fingersOk });
    rows.push({ label: 'V spread', value: v.spread.toFixed(2), ok: v.spreadOk });
    rows.push({ label: 'pinch', value: pinchState(hands[0]).amount.toFixed(2), ok: null });
    return rows;
  }

  const f = frameDetail(hands[0], hands[1]);
  const t = timeoutDetail(hands[0], hands[1]);
  rows.push({ label: 'frame both-L', value: f.bothL ? 'yes' : 'no', ok: f.bothL });
  rows.push({ label: 'frame oppose', value: `${f.oppose.toFixed(0)}d`, ok: f.opposeOk });
  rows.push({ label: 'frame sep', value: f.sep.toFixed(2), ok: f.sepOk });
  rows.push({ label: 'T vertical', value: t.up.toFixed(2), ok: t.vertOk });
  rows.push({ label: 'T horizontal', value: t.across.toFixed(2), ok: t.horizOk });
  rows.push({ label: 'T flat', value: t.flatOk ? 'yes' : 'no', ok: t.flatOk });
  rows.push({ label: 'T touch', value: t.touch.toFixed(2), ok: t.touchOk });
  return rows;
}
