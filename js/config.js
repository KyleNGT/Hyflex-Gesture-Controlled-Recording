// Every tunable constant lives here so threshold tuning never means hunting
// through modules. Values normalized "by hand scale" are divided by the
// wrist->middle-MCP distance before comparison (see gestures/fingers.js).

export const CONFIG = {
  // --- HCI gating ---
  DWELL_MS: 1500,          // hold a command gesture this long before it fires
  COOLDOWN_MS: 1000,       // dead time after a command fires
  ACTION_ZONE_TOP: 0.4,    // gesture centroid must sit in the top 40% of frame
  DRIFT_TOLERANCE: 0.06,   // normalized centroid drift that resets the dwell

  // --- pinch-drag clutch (Presentation Mode slide nav) ---
  PINCH_ON: 0.35,          // pinchAmount below this -> clutch engages
  PINCH_OFF: 0.5,          // pinchAmount above this -> clutch releases (hysteresis)
  DRAG_MIN: 0.15,          // normalized horizontal travel to count as a slide swipe

  // --- loops ---
  DETECT_FPS: 15,          // hand detection cadence (compositor runs on rAF ~60)

  // --- layout ---
  STAGE: { w: 1280, h: 720 },
  PIP: { w: 320, h: 180, margin: 24 },

  // --- dev ---
  DEBUG: true,             // draw skeleton + finger readout + action-zone line
};
