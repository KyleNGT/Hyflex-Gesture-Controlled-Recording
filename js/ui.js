// On-screen feedback for the professor: the red/yellow state border, the status
// line, the command toast, and the overlay canvas (dwell ring + clutch meter +
// debug skeleton). None of this is recorded -- the overlay is a separate canvas
// stacked over #stage, and the border is a full-viewport frame outside it.

import { CONFIG } from './config.js';
import { subscribe } from './state.js';
import { getStatus } from './gesture-engine.js';
import { describe } from './gestures/classify.js';
import { fingerStates } from './gestures/fingers.js';

const border = document.getElementById('border');
const statusEl = document.getElementById('status');
const toastEl = document.getElementById('toast');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');

let latestHands = [];
let toastTimer = 0;
let stateLine = '';
let noteLine = '';
let isRecording = false;

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

  subscribe((state) => {
    isRecording = state.recording;
    border.classList.toggle('recording', state.recording && !state.paused);
    border.classList.toggle('paused', state.recording && state.paused);

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
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function render() {
  statusEl.textContent = noteLine ? `${stateLine}  -  ${noteLine}` : stateLine;
}

function renderOverlay() {
  const { w, h } = CONFIG.STAGE;
  octx.clearRect(0, 0, w, h);

  if (CONFIG.DEBUG) {
    // action-zone boundary
    const zy = CONFIG.ACTION_ZONE_TOP * h;
    octx.strokeStyle = 'rgba(0,200,255,0.5)';
    octx.setLineDash([8, 8]);
    octx.beginPath();
    octx.moveTo(0, zy);
    octx.lineTo(w, zy);
    octx.stroke();
    octx.setLineDash([]);

    for (const hand of latestHands) drawSkeleton(hand);
    drawReadout();
  }

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
    `dwell:   ${(status.dwellProgress * 100).toFixed(0)}%`,
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
  octx.strokeStyle = status.longDwell ? '#ff9f1a' : '#fff';
  octx.beginPath();
  octx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + status.dwellProgress * Math.PI * 2);
  octx.stroke();

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
