// All on-screen studio chrome for the professor. None of it is recorded:
//   - the overlay canvas (dwell ring, clutch meter, and -- when the studio
//     overlay is on -- the hand skeleton, guide line, and metrics readout),
//     stacked over #stage but never composited into it
//   - the red/yellow recording border framing the whole viewport
//   - the app header (mode chip + REC timer), the status line, the command
//     toast, the "not in the recording" notice, and the studio-overlay switches
//
// CONFIG.OVERLAY is the single source of truth for what the overlay shows;
// initChrome() keeps the sidebar switches and CONFIG.OVERLAY in sync, and
// setOverlay()/toggleOverlay() let the `d` key drive the same path.

import { CONFIG } from './config.js';
import { subscribe } from './state.js';
import { getStatus } from './gesture-engine.js';
import { describe } from './gestures/classify.js';
import { fingerStates } from './gestures/fingers.js';
import { toggleTuner } from './tuner.js';

const border = document.getElementById('border');
const statusEl = document.getElementById('status');
const toastEl = document.getElementById('toast');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');

const modeChip = document.getElementById('mode-chip');
const recIndicator = document.getElementById('rec-indicator');
const recTimeEl = document.getElementById('rec-time');

let latestHands = [];
let toastTimer = 0;
let stateLine = '';
let noteLine = '';
let isRecording = false;

// REC timer: wall-clock minus paused spans (pause genuinely stops the encoder).
let recActive = false;      // recording AND not paused
let prevRecording = false;
let recAccumMs = 0;
let recResumedAt = 0;

let noticeDismissed = false;
let chromeSync = () => {};

const HAND_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export function setHands(hands) {
  latestHands = hands || [];
}

// A sticky note appended to the live state line -- errors, progress, prompts.
export function setStatus(text) {
  noteLine = text;
  render();
}

// A transient confirmation: fired commands, saved files, permission results.
export function flash(text, ms = 2200) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

export function initUI() {
  overlay.width = CONFIG.STAGE.w;
  overlay.height = CONFIG.STAGE.h;

  initChrome();

  subscribe((state) => {
    isRecording = state.recording;
    border.classList.toggle('recording', state.recording && !state.paused);
    border.classList.toggle('paused', state.recording && state.paused);

    trackRecTime(state);

    modeChip.textContent = state.mode;
    recIndicator.hidden = !state.recording;
    recIndicator.classList.toggle('paused', state.recording && state.paused);

    const bits = [`mode: ${state.mode}`];
    if (state.slideCount) bits.push(`slide ${state.slideIndex + 1}/${state.slideCount}`);
    bits.push(state.recording ? (state.paused ? 'PAUSED' : 'REC') : 'not recording');
    if (!state.screenReady) bits.push('no screen');
    stateLine = bits.join('  -  ');
    noteLine = '';
    render();
  });

  const loop = () => {
    renderOverlay();
    recTimeEl.textContent = fmtClock(currentRecMs());
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// --- studio-overlay switches + notice --------------------------------------

function initChrome() {
  const els = {
    on: document.getElementById('ov-on'),
    metrics: document.getElementById('ov-metrics'),
    skeleton: document.getElementById('ov-skeleton'),
    guide: document.getElementById('ov-guide'),
  };
  const subs = document.getElementById('ov-subs');
  const guidePanel = document.getElementById('guide-panel');
  const notice = document.getElementById('notice');
  const noticeClose = document.getElementById('notice-close');
  const tunerBtn = document.getElementById('btn-tuner');

  for (const k of ['on', 'metrics', 'skeleton', 'guide']) els[k].checked = CONFIG.OVERLAY[k];

  // Push the checkbox states into CONFIG.OVERLAY and reflect the dependent UI.
  // announce=true means "if the master switch is now on, surface the notice"
  // (used on load and whenever the master switch is flipped, not on sub-toggles).
  chromeSync = (announce) => {
    const ov = CONFIG.OVERLAY;
    for (const k of ['on', 'metrics', 'skeleton', 'guide']) ov[k] = els[k].checked;

    subs.classList.toggle('disabled', !ov.on);
    guidePanel.hidden = !(ov.on && ov.guide);

    if (!ov.on) notice.hidden = true;
    else if (announce && !noticeDismissed) notice.hidden = false;
  };

  els.on.addEventListener('change', () => chromeSync(true));
  for (const k of ['metrics', 'skeleton', 'guide']) {
    els[k].addEventListener('change', () => chromeSync(false));
  }
  noticeClose.addEventListener('click', () => {
    notice.hidden = true;
    noticeDismissed = true;
  });
  tunerBtn.addEventListener('click', toggleTuner);

  chromeSync(true);
}

// Called by main.js on the `d` key so keyboard and switch never disagree.
export function setOverlay(on) {
  const el = document.getElementById('ov-on');
  el.checked = on;
  chromeSync(true);
}

export function toggleOverlay() {
  const el = document.getElementById('ov-on');
  setOverlay(!el.checked);
  flash(`studio overlay ${el.checked ? 'on' : 'off'}`);
}

// --- REC timer ------------------------------------------------------------

function trackRecTime(state) {
  const active = state.recording && !state.paused;
  const now = performance.now();

  if (state.recording && !prevRecording) {
    recAccumMs = 0;                     // fresh take
    recResumedAt = now;
  } else if (active && !recActive) {
    recResumedAt = now;                 // resumed from pause
  } else if (!active && recActive) {
    recAccumMs += now - recResumedAt;   // paused or stopped
  }

  recActive = active;
  prevRecording = state.recording;
}

function currentRecMs() {
  return recAccumMs + (recActive ? performance.now() - recResumedAt : 0);
}

function fmtClock(ms) {
  const total = Math.floor(ms / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// --- overlay canvas -----------------------------------------------------

function render() {
  statusEl.textContent = noteLine ? `${stateLine}  -  ${noteLine}` : stateLine;
}

function renderOverlay() {
  const { w, h } = CONFIG.STAGE;
  const ov = CONFIG.OVERLAY;
  octx.clearRect(0, 0, w, h);

  if (ov.on && ov.skeleton) {
    const zy = CONFIG.ACTION_ZONE_TOP * h;
    octx.strokeStyle = 'rgba(0,200,255,0.5)';
    octx.setLineDash([8, 8]);
    octx.beginPath();
    octx.moveTo(0, zy);
    octx.lineTo(w, zy);
    octx.stroke();
    octx.setLineDash([]);

    for (const hand of latestHands) drawSkeleton(hand);
  }

  if (ov.on && ov.metrics) drawReadout();

  // Core HCI feedback -- always drawn, independent of the studio overlay.
  drawClutchMeter();
  drawDwellRing();
}

function drawSkeleton(hand) {
  const kp = hand.keypoints;
  octx.strokeStyle = 'rgba(0,255,120,0.9)';
  octx.lineWidth = 2;
  for (const [a, b] of HAND_EDGES) {
    octx.beginPath();
    octx.moveTo(kp[a].x, kp[a].y);
    octx.lineTo(kp[b].x, kp[b].y);
    octx.stroke();
  }
  octx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const k of kp) {
    octx.beginPath();
    octx.arc(k.x, k.y, 3, 0, Math.PI * 2);
    octx.fill();
  }
}

// Live per-test readout. The green/red column is the tuning surface: hold a
// gesture, see exactly which condition is the one failing.
function drawReadout() {
  const status = getStatus();
  octx.font = '16px ui-monospace, monospace';
  octx.textAlign = 'left';

  const head = [
    `gesture: ${status.gesture || '-'}`,
    `zone:    ${status.inZone ? 'in' : 'out'}${status.cooldown ? '  (cooldown)' : ''}`,
    `dwell:   ${(status.dwellProgress * 100).toFixed(0)}%${status.coasting ? '  (holding)' : ''}`,
  ];
  latestHands.forEach((hand, i) => {
    const on = Object.entries(fingerStates(hand.keypoints))
      .filter(([, v]) => v).map(([k]) => k);
    head.push(`hand ${i}:  ${on.join(' ') || '(fist)'}`);
  });

  let y = 26;
  octx.fillStyle = '#0f0';
  for (const line of head) {
    octx.fillText(line, 16, y);
    y += 20;
  }

  y += 6;
  for (const row of describe(latestHands)) {
    octx.fillStyle = row.ok === null ? '#9cf' : (row.ok ? '#6f6' : '#f77');
    octx.fillText(`${row.label.padEnd(14)}${row.value}`, 16, y);
    y += 20;
  }
}

// Horizontal travel of an engaged pinch clutch, against the commit threshold.
function drawClutchMeter() {
  const status = getStatus();
  if (!status.clutch) return;

  const { w, h } = CONFIG.STAGE;
  const barW = w * 0.5;
  const x0 = (w - barW) / 2;
  const y = h - 60;
  const ratio = Math.max(-1, Math.min(1, status.clutchDx / CONFIG.DRAG_MIN));

  octx.fillStyle = 'rgba(0,0,0,0.45)';
  octx.fillRect(x0, y - 14, barW, 28);
  octx.strokeStyle = 'rgba(255,255,255,0.5)';
  octx.lineWidth = 2;
  octx.strokeRect(x0, y - 14, barW, 28);

  const mid = x0 + barW / 2;
  octx.fillStyle = Math.abs(ratio) >= 1 ? '#6f6' : '#fff';
  const len = (barW / 2) * ratio;
  octx.fillRect(Math.min(mid, mid + len), y - 10, Math.abs(len), 20);

  octx.fillStyle = '#fff';
  octx.font = '14px ui-monospace, monospace';
  octx.textAlign = 'center';
  octx.fillText(ratio <= -1 ? 'release for NEXT' : ratio >= 1 ? 'release for PREV' : 'drag...', mid, y + 32);
  octx.textAlign = 'left';
}

function drawDwellRing() {
  const status = getStatus();
  if (!status.ringAt || status.dwellProgress <= 0) return;
  const { x, y } = status.ringAt;
  const r = 60;
  octx.lineWidth = 8;

  octx.strokeStyle = 'rgba(0,0,0,0.35)';
  octx.beginPath();
  octx.arc(x, y, r, 0, Math.PI * 2);
  octx.stroke();

  octx.strokeStyle = 'rgba(255,255,255,0.25)';
  octx.beginPath();
  octx.arc(x, y, r, 0, Math.PI * 2);
  octx.stroke();

  // Starting or stopping the take gets its own colour and a word in the middle:
  // this ring runs for 3 s, and it is the one command you cannot undo.
  // While coasting (the gesture briefly lost but within the grace window) the
  // arc dims, so a held-through dropout looks different from a live hold.
  octx.globalAlpha = status.coasting ? 0.4 : 1;
  octx.strokeStyle = status.longDwell ? '#ff9f1a' : '#fff';
  octx.beginPath();
  octx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + status.dwellProgress * Math.PI * 2);
  octx.stroke();
  octx.globalAlpha = 1;

  if (status.longDwell) {
    octx.fillStyle = '#ff9f1a';
    octx.font = '600 20px system-ui, sans-serif';
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillText(isRecording ? 'STOP' : 'START', x, y);
    octx.textAlign = 'left';
    octx.textBaseline = 'alphabetic';
  }
}
