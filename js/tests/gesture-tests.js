// Classifier + engine tests. No build step, no framework, no DOM: open
// tests.html in the browser, or import runTests() anywhere.
//
// These lock in the SHAPE of each gesture and the HCI gates around it. They do
// not tell you whether the thresholds suit a particular person's hands -- that
// is what the live tuner is for.

import { CONFIG } from '../config.js';
import { classify, pinchState, frameDetail, timeoutDetail } from '../gestures/classify.js';
import {
  update as updateEngine, setCommandHandler, getStatus,
} from '../gesture-engine.js';
import { getState, setMode, setSlideCount } from '../state.js';
import { POSE, makeHand } from './hand-fixtures.js';

const IN_ZONE = { x: 640, y: 300 };    // centroid lands ~y=240, above the 288 line
const BELOW_ZONE = { x: 640, y: 700 };

export function runTests() {
  const results = [];
  const test = (name, fn) => {
    try {
      fn();
      results.push({ name, pass: true });
    } catch (err) {
      results.push({ name, pass: false, message: err.message });
    }
  };

  // --- one-handed shapes -------------------------------------------------

  test('L-Shape is recognized', () => {
    eq(classify([POSE.lshape()]), 'lshape');
  });

  test('Shaka is recognized', () => {
    eq(classify([POSE.shaka()]), 'shaka');
  });

  test('a V sign is recognized', () => {
    eq(classify([POSE.vee()]), 'vee');
  });

  test('two fingers held together are not a V', () => {
    eq(classify([POSE.twoFingersTogether()]), null);
  });

  test('a fist commands nothing', () => {
    eq(classify([POSE.fist()]), null);
  });

  test('an open palm commands nothing (Midas touch)', () => {
    eq(classify([POSE.openPalm()]), null);
  });

  test('a pointing hand is not an L-Shape', () => {
    eq(classify([POSE.point()]), null);
  });

  test('no hands, no gesture', () => {
    eq(classify([]), null);
    eq(classify(null), null);
  });

  // --- two-handed shapes -------------------------------------------------

  test('two opposed L-Shapes make a Frame, never an L-Shape', () => {
    const hands = [
      POSE.lshape({ at: { x: 500, y: 300 } }),
      POSE.lshape({ at: { x: 900, y: 300 }, rotate: 180 }),
    ];
    ok(frameDetail(hands[0], hands[1]).ok, 'frameDetail should pass');
    eq(classify(hands), 'frame');
  });

  test('two L-Shapes pointing the same way are ambiguous, not a Frame', () => {
    const hands = [
      POSE.lshape({ at: { x: 560, y: 300 } }),
      POSE.lshape({ at: { x: 700, y: 300 } }),
    ];
    eq(classify(hands), null);
  });

  test('Time-Out needs one vertical and one horizontal flat hand', () => {
    const hands = tPose();
    ok(timeoutDetail(hands[0], hands[1]).ok, 'timeoutDetail should pass');
    eq(classify(hands), 'timeout');
  });

  test('Time-Out works with the hands given in either order', () => {
    const [vert, horiz] = tPose();
    eq(classify([horiz, vert]), 'timeout');
  });

  test('two vertical palms are not a Time-Out', () => {
    const hands = [
      POSE.openPalm({ at: { x: 560, y: 400 } }),
      POSE.openPalm({ at: { x: 760, y: 400 } }),
    ];
    eq(classify(hands), null);
  });

  test('a crossbar far from the stem is not a Time-Out', () => {
    const vert = POSE.openPalm({ at: { x: 400, y: 500 } });
    const horiz = POSE.openPalm({ rotate: 90, at: { x: 1100, y: 200 }, anchor: 'centroid' });
    eq(classify([vert, horiz]), null);
  });

  test('one gesturing hand still counts when the other hand is idle', () => {
    eq(classify([POSE.lshape({ at: { x: 500, y: 300 } }),
      POSE.fist({ at: { x: 900, y: 300 } })]), 'lshape');
  });

  // --- pinch -------------------------------------------------------------

  test('pinch amount drops when thumb and index meet', () => {
    const open = pinchState(POSE.lshape());
    const shut = pinchState(makeHand({ up: ['thumb', 'index'], pinch: true }));
    ok(shut.amount < CONFIG.PINCH_ON, `pinched amount ${shut.amount.toFixed(2)} should be < PINCH_ON`);
    ok(open.amount > CONFIG.PINCH_OFF, `open amount ${open.amount.toFixed(2)} should be > PINCH_OFF`);
  });

  // --- engine gates ------------------------------------------------------

  // Times are absolute and monotonic across tests so one test's cooldown can
  // never leak into the next.
  let clock = 100000;
  const fired = [];
  setCommandHandler((c) => fired.push(c));
  const feed = (hands, dt) => { clock += dt; updateEngine(hands, clock); };

  test('a held gesture fires only after the dwell time', () => {
    setMode('idle');
    fired.length = 0;
    const hands = [POSE.lshape({ at: IN_ZONE })];
    feed(hands, 5000);
    feed(hands, CONFIG.DWELL_MS - 200);
    eq(fired.length, 0);
    feed(hands, 400);
    eq(fired[0], 'mode:presentation');
    eq(getState().mode, 'presentation');
  });

  test('starting a take needs the longer dwell, not the normal one', () => {
    setMode('idle');
    fired.length = 0;
    const hands = [POSE.vee({ at: IN_ZONE })];
    feed(hands, 5000);
    feed(hands, CONFIG.DWELL_MS + 200);        // past a normal command's dwell
    eq(fired.length, 0);
    ok(getStatus().longDwell, 'status should mark this as a long dwell');
    feed(hands, CONFIG.DWELL_MS_COMMIT - CONFIG.DWELL_MS);
    eq(fired[0], 'toggle-record');
  });

  test('the cooldown blocks an immediate second command', () => {
    fired.length = 0;
    const hands = [POSE.shaka({ at: IN_ZONE })];
    for (let i = 0; i < 4; i++) feed(hands, 300);   // inside COOLDOWN_MS
    eq(fired.length, 0);
  });

  test('a gesture below the action zone never fires', () => {
    setMode('idle');
    fired.length = 0;
    const hands = [POSE.lshape({ at: BELOW_ZONE })];
    feed(hands, 5000);
    for (let i = 0; i < 6; i++) feed(hands, 500);
    eq(fired.length, 0);
    ok(!getStatus().inZone, 'status should report out of zone');
  });

  test('changing gesture mid-dwell restarts the timer', () => {
    setMode('idle');
    fired.length = 0;
    feed([POSE.lshape({ at: IN_ZONE })], 5000);
    feed([POSE.lshape({ at: IN_ZONE })], CONFIG.DWELL_MS - 300);
    feed([POSE.shaka({ at: IN_ZONE })], 200);        // swap: dwell resets
    feed([POSE.shaka({ at: IN_ZONE })], 400);        // would have fired the L
    eq(fired.length, 0);
    feed([POSE.shaka({ at: IN_ZONE })], CONFIG.DWELL_MS);
    eq(fired[0], 'mode:screenshare');
  });

  test('drifting off the anchor restarts the dwell', () => {
    setMode('idle');
    fired.length = 0;
    const drift = CONFIG.DRIFT_TOLERANCE * CONFIG.STAGE.w * 2;
    feed([POSE.lshape({ at: IN_ZONE })], 5000);
    feed([POSE.lshape({ at: IN_ZONE })], CONFIG.DWELL_MS - 300);
    feed([POSE.lshape({ at: { x: IN_ZONE.x + drift, y: IN_ZONE.y } })], 200);
    feed([POSE.lshape({ at: { x: IN_ZONE.x + drift, y: IN_ZONE.y } })], 400);
    eq(fired.length, 0);
  });

  // --- pinch-drag clutch -------------------------------------------------

  test('pinch, drag left, release advances the slide', () => {
    fired.length = 0;
    setSlideCount(5);
    setMode('presentation');
    const start = getState().slideIndex;
    const travel = CONFIG.DRAG_MIN * CONFIG.STAGE.w + 40;

    feed([pinched(900)], 5000);                       // engage
    ok(getStatus().clutch, 'clutch should engage on a pinch in the zone');
    feed([pinched(900 - travel)], 100);               // drag left
    feed([POSE.lshape({ at: { x: 900 - travel, y: IN_ZONE.y } })], 100);  // release
    eq(getState().slideIndex, start + 1);
    ok(fired.includes('slide:next'), 'slide:next should fire');
  });

  test('a drag shorter than DRAG_MIN commits nothing', () => {
    fired.length = 0;
    setMode('presentation');
    const start = getState().slideIndex;
    feed([pinched(900)], 5000);
    feed([pinched(880)], 100);
    feed([POSE.lshape({ at: { x: 880, y: IN_ZONE.y } })], 100);
    eq(getState().slideIndex, start);
  });

  test('the clutch will not engage below the action zone', () => {
    fired.length = 0;
    setMode('presentation');
    const start = getState().slideIndex;
    const travel = CONFIG.DRAG_MIN * CONFIG.STAGE.w + 40;
    feed([pinched(900, BELOW_ZONE.y)], 5000);
    ok(!getStatus().clutch, 'clutch must stay disengaged below the zone');
    feed([pinched(900 - travel, BELOW_ZONE.y)], 100);
    feed([POSE.lshape({ at: { x: 900 - travel, y: BELOW_ZONE.y } })], 100);
    eq(getState().slideIndex, start);
  });

  test('the clutch is inert outside Presentation Mode', () => {
    fired.length = 0;
    setMode('whiteboard');
    const travel = CONFIG.DRAG_MIN * CONFIG.STAGE.w + 40;
    feed([pinched(900)], 5000);
    feed([pinched(900 - travel)], 100);
    feed([POSE.lshape({ at: { x: 900 - travel, y: IN_ZONE.y } })], 100);
    ok(!fired.includes('slide:next'), 'no slide command outside presentation');
  });

  setCommandHandler(() => {});
  return results;
}

function tPose() {
  const vert = POSE.openPalm({ at: { x: 640, y: 500 } });
  const stemTip = vert.keypoints[12];
  const horiz = POSE.openPalm({
    rotate: 90,
    at: { x: stemTip.x, y: stemTip.y - 10 },
    anchor: 'centroid',
  });
  return [vert, horiz];
}

function pinched(x, y = IN_ZONE.y) {
  return makeHand({ up: ['thumb', 'index'], pinch: true, at: { x, y } });
}

function eq(actual, expected) {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function ok(cond, message) {
  if (!cond) throw new Error(message || 'expected truthy');
}
