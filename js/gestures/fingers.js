// Mechanical hand-geometry helpers. Pure functions of keypoints (mirrored
// stage-pixel space). Shared by the classifiers and the debug overlay.
//
// MediaPipe Hands index map:
//   0 wrist
//   1 thumb_cmc   2 thumb_mcp   3 thumb_ip    4 thumb_tip
//   5 index_mcp   6 index_pip   7 index_dip   8 index_tip
//   9 middle_mcp 10 middle_pip 11 middle_dip 12 middle_tip
//  13 ring_mcp   14 ring_pip   15 ring_dip   16 ring_tip
//  17 pinky_mcp  18 pinky_pip  19 pinky_dip  20 pinky_tip

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

// The four fingers that lie flat in an open palm. The thumb is excluded because
// it is judged by splay, not by extension along the palm axis.
export const FLAT_FINGERS = ['index', 'middle', 'ring', 'pinky'];

const JOINTS = {
  thumb: { mcp: 2, pip: 3, tip: 4 },
  index: { mcp: 5, pip: 6, tip: 8 },
  middle: { mcp: 9, pip: 10, tip: 12 },
  ring: { mcp: 13, pip: 14, tip: 16 },
  pinky: { mcp: 17, pip: 18, tip: 20 },
};

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function handScale(kp) {
  return dist(kp[0], kp[9]) || 1;
}

export function centroid(kp) {
  let x = 0;
  let y = 0;
  for (const k of kp) { x += k.x; y += k.y; }
  return { x: x / kp.length, y: y / kp.length };
}

// A finger is "extended" when its tip is meaningfully farther from the wrist
// than its PIP joint is. The thumb barely bends toward the wrist, so it is
// judged by how far the tip has splayed from the index MCP instead.
export function isExtended(kp, finger) {
  const wrist = kp[0];
  const j = JOINTS[finger];
  if (finger === 'thumb') {
    return dist(kp[j.tip], kp[5]) > dist(kp[j.mcp], kp[5]) * 1.4;
  }
  return dist(kp[j.tip], wrist) > dist(kp[j.pip], wrist) * 1.1;
}

export function fingerStates(kp) {
  const out = {};
  for (const f of FINGERS) out[f] = isExtended(kp, f);
  return out;
}

// How many of index/middle/ring/pinky are extended -- "is this palm open?".
export function flatFingerCount(kp) {
  let n = 0;
  for (const f of FLAT_FINGERS) if (isExtended(kp, f)) n++;
  return n;
}

// thumb-tip <-> index-tip separation, normalized by hand scale.
export function pinchAmount(kp) {
  return dist(kp[4], kp[8]) / handScale(kp);
}

// Unit vector from a finger's MCP to its tip (pointing direction).
export function fingerDirection(kp, finger) {
  const j = JOINTS[finger];
  return unit(kp[j.tip].x - kp[j.mcp].x, kp[j.tip].y - kp[j.mcp].y);
}

// The hand's own axis: wrist -> middle MCP. Points the way the palm "aims"
// regardless of which fingers are curled, so it survives a fist.
export function palmDirection(kp) {
  return unit(kp[9].x - kp[0].x, kp[9].y - kp[0].y);
}

// Unsigned angle between two unit vectors, in degrees (0..180).
export function angleBetween(a, b) {
  const d = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
  return (Math.acos(d) * 180) / Math.PI;
}

function unit(dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

export { JOINTS };
