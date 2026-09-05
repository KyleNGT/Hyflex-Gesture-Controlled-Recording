// On-screen feedback for the professor: the red/yellow state border, the status
// line, and the overlay canvas (dwell ring + debug skeleton). None of this is
// recorded — the overlay is a separate canvas stacked over #stage.

import { CONFIG } from './config.js';
import { subscribe } from './state.js';
import { getStatus } from './gesture-engine.js';
import { fingerStates } from './gestures/fingers.js';

const border = document.getElementById('border');
const statusEl = document.getElementById('status');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');

let latestHands = [];

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

export function setStatus(text) {
  statusEl.textContent = text;
}

export function initUI() {
  overlay.width = CONFIG.STAGE.w;
  overlay.height = CONFIG.STAGE.h;

  subscribe((state) => {
    border.classList.toggle('recording', state.recording && !state.paused);
    border.classList.toggle('paused', state.recording && state.paused);

    const bits = [`mode: ${state.mode}`];
    if (state.slideCount) bits.push(`slide ${state.slideIndex + 1}/${state.slideCount}`);
    if (state.recording) bits.push(state.paused ? 'PAUSED' : 'REC');
    if (!state.screenReady) bits.push('no screen');
    statusEl.textContent = bits.join('  ·  ');
  });

  const loop = () => {
    renderOverlay();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
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

function drawReadout() {
  const status = getStatus();
  octx.font = '18px ui-monospace, monospace';
  octx.fillStyle = '#0f0';
  octx.textAlign = 'left';

  const lines = [
    `gesture: ${status.gesture || '-'}`,
    `in zone: ${status.inZone}`,
    `dwell:   ${(status.dwellProgress * 100).toFixed(0)}%`,
  ];
  latestHands.forEach((hand, i) => {
    const s = fingerStates(hand.keypoints);
    const on = Object.entries(s).filter(([, v]) => v).map(([k]) => k);
    lines.push(`hand ${i}:  ${on.join(' ') || '(fist)'}`);
  });

  lines.forEach((line, i) => octx.fillText(line, 16, 28 + i * 22));
}

function drawDwellRing() {
  const status = getStatus();
  if (!status.ringAt || status.dwellProgress <= 0) return;
  const { x, y } = status.ringAt;
  const r = 60;
  octx.lineWidth = 8;

  octx.strokeStyle = 'rgba(255,255,255,0.25)';
  octx.beginPath();
  octx.arc(x, y, r, 0, Math.PI * 2);
  octx.stroke();

  octx.strokeStyle = '#fff';
  octx.beginPath();
  octx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + status.dwellProgress * Math.PI * 2);
  octx.stroke();
}
