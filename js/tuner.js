// Live threshold tuner (press `t`). Mutates CONFIG in place, so every module
// that reads CONFIG at call time picks changes up on the next frame -- stand in
// front of the camera, hold a gesture, watch the debug readout, drag a slider.
//
// Tuned values are persisted to localStorage so a reload does not throw the
// session away, and "Copy for config.js" emits a paste-ready snippet so a good
// calibration can be committed instead of living in one browser profile.

import { CONFIG } from './config.js';

const STORE_KEY = 'hyflex.tuning';

// path is dotted into CONFIG. Keep every knob that affects recognition here;
// anything not listed is not meant to be tuned at runtime.
const FIELDS = [
  { group: 'Gating', path: 'DWELL_MS', min: 300, max: 3000, step: 50 },
  { group: 'Gating', path: 'DWELL_MS_COMMIT', min: 1000, max: 6000, step: 100 },
  { group: 'Gating', path: 'COOLDOWN_MS', min: 0, max: 3000, step: 50 },
  { group: 'Gating', path: 'ACTION_ZONE_TOP', min: 0.1, max: 1, step: 0.01 },
  { group: 'Gating', path: 'DRIFT_TOLERANCE', min: 0.01, max: 0.3, step: 0.005 },
  { group: 'Gating', path: 'GESTURE_GRACE_MS', min: 0, max: 1000, step: 25 },

  { group: 'Pinch clutch', path: 'PINCH_ON', min: 0.1, max: 1.2, step: 0.01 },
  { group: 'Pinch clutch', path: 'PINCH_OFF', min: 0.1, max: 1.5, step: 0.01 },
  { group: 'Pinch clutch', path: 'DRAG_MIN', min: 0.02, max: 0.5, step: 0.01 },

  { group: 'L-Shape', path: 'GESTURE.L_ANGLE_MIN', min: 0, max: 90, step: 1 },
  { group: 'L-Shape', path: 'GESTURE.L_ANGLE_MAX', min: 60, max: 180, step: 1 },

  { group: 'Shaka', path: 'GESTURE.SHAKA_SPREAD_MIN', min: 0.4, max: 2.5, step: 0.05 },

  { group: 'V sign', path: 'GESTURE.V_SPREAD_MIN', min: 0.2, max: 1.5, step: 0.05 },

  { group: 'Frame', path: 'GESTURE.FRAME_OPPOSE_MIN', min: 0, max: 180, step: 1 },
  { group: 'Frame', path: 'GESTURE.FRAME_SEP_MIN', min: 0.3, max: 4, step: 0.05 },

  { group: 'Time-Out', path: 'GESTURE.T_AXIS_MIN', min: 0.1, max: 1, step: 0.01 },
  { group: 'Time-Out', path: 'GESTURE.T_TOUCH_MAX', min: 0.5, max: 5, step: 0.05 },
  { group: 'Time-Out', path: 'GESTURE.T_FLAT_MIN', min: 0, max: 4, step: 1 },
];

const defaults = {};
let panel = null;

export function initTuner() {
  for (const f of FIELDS) defaults[f.path] = read(f.path);
  restore();

  panel = document.getElementById('tuner');
  panel.innerHTML = '';
  panel.appendChild(header());

  let currentGroup = '';
  for (const f of FIELDS) {
    if (f.group !== currentGroup) {
      currentGroup = f.group;
      const h = document.createElement('h4');
      h.textContent = currentGroup;
      panel.appendChild(h);
    }
    panel.appendChild(row(f));
  }
  panel.appendChild(footer());
}

export function toggleTuner() {
  panel.classList.toggle('open');
}

function header() {
  const h = document.createElement('h3');
  h.textContent = 'Gesture tuning  (t to hide)';
  return h;
}

function row(f) {
  const wrap = document.createElement('label');
  wrap.className = 'tuner-row';

  const name = document.createElement('span');
  name.className = 'tuner-name';
  name.textContent = f.path.replace('GESTURE.', '');

  const out = document.createElement('output');
  out.textContent = fmt(read(f.path), f.step);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = f.min;
  input.max = f.max;
  input.step = f.step;
  input.value = read(f.path);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    write(f.path, v);
    out.textContent = fmt(v, f.step);
    persist();
  });

  wrap.append(name, input, out);
  wrap.dataset.path = f.path;
  return wrap;
}

function footer() {
  const bar = document.createElement('div');
  bar.className = 'tuner-actions';

  const copy = document.createElement('button');
  copy.textContent = 'Copy for config.js';
  copy.addEventListener('click', () => {
    const text = snippet();
    console.log(text);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => { copy.textContent = 'Copied - paste into config.js'; },
        () => { copy.textContent = 'See console for the snippet'; },
      );
    } else {
      copy.textContent = 'See console for the snippet';
    }
    setTimeout(() => { copy.textContent = 'Copy for config.js'; }, 2500);
  });

  const reset = document.createElement('button');
  reset.textContent = 'Reset';
  reset.addEventListener('click', () => {
    for (const f of FIELDS) write(f.path, defaults[f.path]);
    localStorage.removeItem(STORE_KEY);
    syncInputs();
  });

  bar.append(copy, reset);
  return bar;
}

function syncInputs() {
  for (const wrap of panel.querySelectorAll('.tuner-row')) {
    const v = read(wrap.dataset.path);
    wrap.querySelector('input').value = v;
    wrap.querySelector('output').textContent = fmt(v, Number(wrap.querySelector('input').step));
  }
}

// Emits only the values that differ from the shipped defaults, so the snippet
// is a diff to apply rather than a wall of unchanged numbers.
function snippet() {
  const changed = FIELDS.filter((f) => read(f.path) !== defaults[f.path]);
  if (changed.length === 0) return '// tuning matches the defaults in config.js';
  return ['// tuned ' + new Date().toISOString().slice(0, 10) + ' - apply to js/config.js']
    .concat(changed.map((f) => `${f.path}: ${read(f.path)},   // was ${defaults[f.path]}`))
    .join('\n');
}

function persist() {
  const out = {};
  for (const f of FIELDS) out[f.path] = read(f.path);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(out));
  } catch (err) {
    console.warn('[tuner] could not persist tuning', err);
  }
}

function restore() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  } catch (err) {
    console.warn('[tuner] stored tuning was unreadable', err);
  }
  if (!saved) return;
  for (const f of FIELDS) {
    if (typeof saved[f.path] === 'number') write(f.path, saved[f.path]);
  }
  console.log('[tuner] restored saved tuning (Reset in the panel clears it)');
}

function read(path) {
  return path.split('.').reduce((o, k) => o[k], CONFIG);
}

function write(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], CONFIG)[last] = value;
}

function fmt(v, step) {
  return step >= 1 ? String(v) : v.toFixed(step >= 0.05 ? 2 : 3);
}
