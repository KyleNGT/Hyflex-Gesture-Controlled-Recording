// Synthetic hands for the classifier tests. Builds the 21 MediaPipe keypoints
// from a canonical hand posed in "hand space" (wrist at the origin, fingers
// pointing up), then rotates / scales / places it in stage-pixel space.
//
// The numbers below are a plausible hand, not a captured one: they exist so the
// geometry in gestures/ can be exercised without a webcam. Real tuning still
// happens against a real hand with the live tuner.

import { centroid, handScale } from '../gestures/fingers.js';

// [x, y] in hand-space; y is negative "up", matching screen coordinates.
const WRIST = [0, 0];

const THUMB = {
  base: [[-0.2, -0.2], [-0.45, -0.35]],            // cmc, mcp
  extended: [[-0.85, -0.42], [-1.15, -0.45]],      // ip, tip
  curled: [[-0.42, -0.6], [-0.35, -0.75]],
};

const FINGER = {
  index: {
    mcp: [-0.3, -1.0],
    extended: [[-0.35, -1.45], [-0.37, -1.7], [-0.4, -1.9]],
    curled: [[-0.32, -1.3], [-0.3, -1.05], [-0.3, -0.8]],
  },
  middle: {
    mcp: [0, -1.05],
    extended: [[0, -1.5], [0, -1.75], [0, -2.0]],
    curled: [[0, -1.35], [0.02, -1.1], [0.02, -0.85]],
  },
  ring: {
    mcp: [0.28, -1.0],
    extended: [[0.3, -1.42], [0.32, -1.65], [0.33, -1.85]],
    curled: [[0.3, -1.28], [0.3, -1.05], [0.3, -0.82]],
  },
  pinky: {
    mcp: [0.55, -0.9],
    extended: [[0.6, -1.25], [0.62, -1.45], [0.63, -1.62]],
    curled: [[0.57, -1.15], [0.55, -0.95], [0.55, -0.75]],
  },
};

const ORDER = ['index', 'middle', 'ring', 'pinky'];

// up: which fingers are extended, e.g. ['thumb', 'index'].
// splay: push the index and middle tips apart into a real V.
function assemble(up, splay) {
  const on = new Set(up);
  const pts = [WRIST, ...THUMB.base, ...(on.has('thumb') ? THUMB.extended : THUMB.curled)];
  for (const name of ORDER) {
    const f = FINGER[name];
    pts.push(f.mcp, ...(on.has(name) ? f.extended : f.curled));
  }
  if (splay === 'apart') {
    pts[8] = [-0.75, -1.8];    // index tip, swung out
    pts[12] = [0.35, -1.95];   // middle tip, swung the other way
  } else if (splay === 'together') {
    pts[8] = [-0.12, -1.92];   // index tip laid alongside the middle finger
  }
  return pts;
}

// spec: { up, rotate (deg, cw), scale (px per hand unit), at {x,y}, anchor,
//         pinch (index tip snapped to the thumb tip),
//         splay: 'apart' (a real V) | 'together' (two fingers side by side) }
export function makeHand(spec) {
  const pts = assemble(spec.up || [], spec.splay);
  const rad = ((spec.rotate || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const s = spec.scale || 60;

  const kp = pts.map(([x, y]) => ({
    x: (x * cos - y * sin) * s,
    y: (x * sin + y * cos) * s,
  }));

  if (spec.pinch) {
    kp[8] = { x: kp[4].x + 4, y: kp[4].y + 4 };
  }

  const at = spec.at || { x: 640, y: 220 };
  const from = spec.anchor === 'centroid' ? centroid(kp) : kp[0];
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  for (const k of kp) { k.x += dx; k.y += dy; }

  return { keypoints: kp, centroid: centroid(kp), scale: handScale(kp) };
}

// Named postures used across the tests.
export const POSE = {
  lshape: (over = {}) => makeHand({ up: ['thumb', 'index'], ...over }),
  shaka: (over = {}) => makeHand({ up: ['thumb', 'pinky'], ...over }),
  vee: (over = {}) => makeHand({ up: ['index', 'middle'], splay: 'apart', ...over }),
  twoFingersTogether: (over = {}) =>
    makeHand({ up: ['index', 'middle'], splay: 'together', ...over }),
  openPalm: (over = {}) => makeHand({ up: ['thumb', 'index', 'middle', 'ring', 'pinky'], ...over }),
  fist: (over = {}) => makeHand({ up: [], ...over }),
  point: (over = {}) => makeHand({ up: ['index'], ...over }),
};
