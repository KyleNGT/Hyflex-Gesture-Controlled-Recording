// Turns a stream of detected hands into debounced COMMANDS, enforcing the three
// HCI rules that defeat the Midas-Touch problem:
//   1. Action zone  - gesture centroid must be in the upper frame
//   2. Dwell time   - same gesture held still for CONFIG.DWELL_MS
//   3. Cooldown     - no second command for CONFIG.COOLDOWN_MS after one fires
//
// The pinch-drag slide clutch is handled separately and is NOT dwell-gated: it
// is a continuous manipulation, which is the whole point of a clutch. It is
// still action-zone gated -- a clutch that engages at waist height would be the
// same Midas-Touch failure by another route.

import { CONFIG } from './config.js';
import { classify, pinchState } from './gestures/classify.js';
import { getState, setMode, nextSlide, prevSlide } from './state.js';

const GESTURE_COMMAND = {
  lshape: 'mode:presentation',
  frame: 'mode:whiteboard',
  shaka: 'mode:screenshare',
  timeout: 'toggle-pause',
  vee: 'toggle-record',
};

// Commands that begin or end a take hold longer before firing. A false positive
// on a layout change costs a second of confusion; a false positive here ends the
// recording, which is the one mistake the professor cannot undo.
const LONG_DWELL = new Set(['toggle-record']);

function dwellFor(command) {
  return LONG_DWELL.has(command) ? CONFIG.DWELL_MS_COMMIT : CONFIG.DWELL_MS;
}

let onCommand = () => {};

// Live status the overlay reads each frame.
const status = {
  gesture: null,       // currently classified gesture (pre-dwell)
  dwellProgress: 0,    // 0..1
  ringAt: null,        // {x,y} centroid to draw the ring around, or null
  longDwell: false,    // dwelling on a start/stop-the-take gesture
  inZone: false,
  cooldown: false,
  clutch: false,       // pinch clutch engaged
  clutchDx: 0,         // normalized horizontal travel since the clutch engaged
  pinch: null,         // raw pinch amount of the single visible hand
  lastCommand: null,   // most recently fired command
  lastCommandAt: 0,
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
  runPinchClutch(hands, now);
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
  status.cooldown = onCooldown;
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

  const command = GESTURE_COMMAND[gesture];
  const need = dwellFor(command);
  const elapsed = now - dwellStart;
  status.dwellProgress = Math.min(1, elapsed / need);
  status.ringAt = anchor;
  status.longDwell = LONG_DWELL.has(command);

  if (elapsed >= need) {
    fire(command, now);
    resetDwell();
  }
}

function fire(command, now = performance.now()) {
  if (command.startsWith('mode:')) {
    setMode(command.slice(5));
  }
  cooldownUntil = now + CONFIG.COOLDOWN_MS;
  status.lastCommand = command;
  status.lastCommandAt = now;
  onCommand(command);
}

function resetDwell() {
  dwellGesture = null;
  dwellCentroid = null;
  status.dwellProgress = 0;
  status.ringAt = null;
  status.longDwell = false;
}

// Presentation Mode only. Pinch to engage, drag horizontally, release to commit.
function runPinchClutch(hands, now) {
  const single = hands.length === 1 ? hands[0] : null;
  const pinch = pinchState(single);
  status.pinch = single ? pinch.amount : null;

  if (!single || getState().mode !== 'presentation' || now < cooldownUntil) {
    releaseClutch();
    return;
  }

  const zoneLine = CONFIG.ACTION_ZONE_TOP * CONFIG.STAGE.h;
  const inZone = single.centroid.y <= zoneLine;

  if (!clutchEngaged) {
    if (inZone && pinch.amount < CONFIG.PINCH_ON) {
      clutchEngaged = true;
      clutchStartX = pinch.x;
      status.clutch = true;
      status.clutchDx = 0;
    }
    return;
  }

  const dx = (pinch.x - clutchStartX) / CONFIG.STAGE.w;
  status.clutchDx = dx;

  if (pinch.amount > CONFIG.PINCH_OFF) {
    releaseClutch();
    if (dx <= -CONFIG.DRAG_MIN) commitSlide('next', now);      // drag left  -> advance
    else if (dx >= CONFIG.DRAG_MIN) commitSlide('prev', now);  // drag right -> back
  }
}

function releaseClutch() {
  clutchEngaged = false;
  status.clutch = false;
  status.clutchDx = 0;
}

function commitSlide(dir, now) {
  if (dir === 'next') nextSlide();
  else prevSlide();
  // Share the command cooldown so a released clutch cannot immediately re-arm
  // and double-advance on the same physical motion.
  cooldownUntil = now + CONFIG.COOLDOWN_MS;
  status.lastCommand = `slide:${dir}`;
  status.lastCommandAt = now;
  onCommand(`slide:${dir}`);
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
