// Every tunable constant lives here so threshold tuning never means hunting
// through modules. Values normalized "by hand scale" are divided by the
// wrist->middle-MCP distance before comparison (see gestures/fingers.js).
//
// The live tuner (js/tuner.js, toggle with `t`) mutates this object in place,
// so read values at call time -- never destructure CONFIG into module scope.

export const CONFIG = {
  // --- HCI gating ---
  DWELL_MS: 1500,          // hold a command gesture this long before it fires
  DWELL_MS_COMMIT: 3000,   // ...but gestures that start/end a take hold longer
  COOLDOWN_MS: 1000,       // dead time after a command fires
  ACTION_ZONE_TOP: 0.5,    // gesture centroid must sit in the top 50% of frame
  DRIFT_TOLERANCE: 0.06,   // normalized wrist drift that resets the dwell
  GESTURE_GRACE_MS: 300,   // a gesture lost for less than this freezes the dwell
                           // instead of resetting it -- rides out detector dropouts

  // --- pinch-drag clutch (Presentation Mode slide nav) ---
  PINCH_ON: 0.35,          // pinchAmount below this -> clutch engages
  PINCH_OFF: 0.5,          // pinchAmount above this -> clutch releases (hysteresis)
  DRAG_MIN: 0.15,          // normalized horizontal travel to count as a slide swipe

  // --- gesture shape thresholds (all "scale" units = wrist->middle-MCP length) ---
  GESTURE: {
    // L-Shape: thumb + index extended, held at a corner-ish angle.
    L_ANGLE_MIN: 35,       // degrees between thumb and index pointing directions
    L_ANGLE_MAX: 145,

    // Shaka: thumb + pinky extended and splayed apart.
    SHAKA_SPREAD_MIN: 1.1, // thumb-tip <-> pinky-tip distance, in scale units

    // V sign (start/stop the take): index + middle extended and splayed into a
    // real V. The spread test rejects two fingers held together, which is a
    // common enough pointing posture to be worth ruling out.
    // Sizing this: hand scale is the palm length (~9 cm), and a comfortable
    // peace sign separates the fingertips by ~4-5 cm, so a real V lands near
    // 0.45-0.55 and fingers held together near 0.2. Set below the first.
    V_SPREAD_MIN: 0.45,    // index-tip <-> middle-tip distance, in scale units

    // Two-handed Frame: two L-shapes whose index fingers oppose each other.
    FRAME_OPPOSE_MIN: 55,  // degrees between the two index directions
    FRAME_SEP_MIN: 1.2,    // centroid separation, in scale units

    // Two-handed Time-Out: one hand vertical, one horizontal across it.
    T_AXIS_MIN: 0.55,      // |axis component| required to call a hand vert/horiz
    T_TOUCH_MAX: 2.6,      // horizontal palm -> vertical fingertips, scale units
    T_FLAT_MIN: 3,         // of index/middle/ring/pinky, how many must be extended
  },

  // --- loops ---
  DETECT_FPS: 15,          // hand detection cadence (compositor runs on rAF ~60)

  // --- layout ---
  STAGE: { w: 1280, h: 720 },
  PIP: { w: 320, h: 180, margin: 24 },

  // --- studio overlay ---
  // On-screen aids only; NONE of this is composited onto the stage canvas, so
  // none of it reaches the recording. `on` is the master switch; the three
  // sub-flags gate individual layers. The dwell ring and clutch meter ignore
  // these -- they are core HCI feedback, not debug chrome.
  OVERLAY: { on: true, metrics: true, skeleton: true, guide: true },
};
