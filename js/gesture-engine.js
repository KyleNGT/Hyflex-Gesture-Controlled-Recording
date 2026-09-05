// Turns a stream of detected hands into debounced COMMANDS, enforcing the three
// HCI rules that defeat the Midas-Touch problem:
//   1. Action zone  - gesture centroid must be in the upper frame
//   2. Dwell time   - same gesture held still for CONFIG.DWELL_MS
//   3. Cooldown     - no second command for CONFIG.COOLDOWN_MS after one fires
//
// The pinch-drag slide clutch is handled separately and is NOT dwell-gated: it
// is a continuous manipulation, which is the whole point of a clutch.

import { CONFIG } from './config.js';
import { classify, pinchState } from './gestures/classify.js';
import { pinchAmount } from './gestures/fingers.js';
import { getState, setMode, nextSlide, prevSlide } from './state.js';

const GESTURE_COMMAND = {
  lshape: 'mode:presentation',
  frame: 'mode:whiteboard',
  shaka: 'mode:screenshare',
  timeout: 'toggle-pause',
};

let onCommand = () => {};

// Live status the overlay reads each frame.
const status = {
  gesture: null,       // currently classified gesture (pre-dwell)
  dwellProgress: 0,    // 0..1
  ringAt: null,        // {x,y} centroid to draw the ring around, or null
  inZone: false,
};

let dwellStart = 0;
let dwellGesture = null;
let dwellCentroid = null;
let cooldownUntil = 0;

// pinch clutch
let clutchEngaged = false;
let clutchStartX = 0;

export function setCommandHandler(fn) { onCommand = fn; }
export function getStatus() { return status; }

export function update(hands, now = performance.now()) {
  runCommandGestures(hands, now);
  runPinchClutch(hands);
}

function runCommandGestures(hands, now) {
  const zoneLine = CONFIG.ACTION_ZONE_TOP * CONFIG.STAGE.h;
  const gesture = classify(hands);
  status.gesture = gesture;

  // Which hand's centroid anchors the dwell ring: for two-handed gestures use
  // the midpoint, otherwise the single hand.
  const anchor = anchorCentroid(hands);
  const inZone = !!anchor && anchor.y <= zoneLine;
  status.inZone = inZone;

  const onCooldown = now < cooldownUntil;
  const valid = gesture && inZone && !onCooldown && GESTURE_COMMAND[gesture];

  if (!valid) {
    resetDwell();
    return;
  }

  const drifted = dwellCentroid &&
    dist(anchor, dwellCentroid) / CONFIG.STAGE.w > CONFIG.DRIFT_TOLERANCE;

  if (gesture !== dwellGesture || drifted) {
    dwellGesture = gesture;
    dwellStart = now;
    dwellCentroid = anchor;
  }

  const elapsed = now - dwellStart;
  status.dwellProgress = Math.min(1, elapsed / CONFIG.DWELL_MS);
  status.ringAt = anchor;

  if (elapsed >= CONFIG.DWELL_MS) {
    fire(GESTURE_COMMAND[gesture]);
    cooldownUntil = now + CONFIG.COOLDOWN_MS;
    resetDwell();
  }
}

function fire(command) {
  if (command.startsWith('mode:')) {
    setMode(command.slice(5));
  }
  onCommand(command);
}

function resetDwell() {
  dwellGesture = null;
  dwellCentroid = null;
  status.dwellProgress = 0;
  status.ringAt = null;
}

// Presentation Mode only. Pinch to engage, drag horizontally, release to commit.
function runPinchClutch(hands) {
  if (getState().mode !== 'presentation' || hands.length !== 1) {
    clutchEngaged = false;
    return;
  }
  const hand = hands[0];
  const amount = pinchAmount(hand.keypoints);
  const { x } = pinchState(hand);

  if (!clutchEngaged && amount < CONFIG.PINCH_ON) {
    clutchEngaged = true;
    clutchStartX = x;
  } else if (clutchEngaged && amount > CONFIG.PINCH_OFF) {
    clutchEngaged = false;
    const dx = (x - clutchStartX) / CONFIG.STAGE.w;
    if (dx <= -CONFIG.DRAG_MIN) nextSlide();      // drag left -> advance
    else if (dx >= CONFIG.DRAG_MIN) prevSlide();  // drag right -> back
  }
}

function anchorCentroid(hands) {
  if (hands.length === 0) return null;
  if (hands.length === 1) return hands[0].centroid;
  return {
    x: (hands[0].centroid.x + hands[1].centroid.x) / 2,
    y: (hands[0].centroid.y + hands[1].centroid.y) / 2,
  };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
