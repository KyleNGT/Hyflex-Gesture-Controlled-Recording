// The render loop. Draws the current app state onto #stage every frame. This
// canvas is the ONLY thing recorded — it never draws borders, the dwell ring,
// or any UI. Those belong to the overlay (js/ui.js).

import { CONFIG } from './config.js';
import { getState } from './state.js';
import { getPage } from './slides.js';
import { getCamEl, getScreenEl } from './media.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

let rafId = 0;

export function startCompositor() {
  if (rafId) return;
  const loop = () => {
    draw();
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

export function stopCompositor() {
  cancelAnimationFrame(rafId);
  rafId = 0;
}

function draw() {
  const { w, h } = CONFIG.STAGE;
  const state = getState();
  const cam = getCamEl();
  const screen = getScreenEl();

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  switch (state.mode) {
    case 'presentation': {
      const page = state.slideCount ? getPage(state.slideIndex) : null;
      if (page) drawContain(page, 0, 0, w, h);
      else placeholder(state.slideCount ? 'rendering slide…' : 'no PDF loaded');
      drawCamPip(cam);
      break;
    }
    case 'whiteboard':
      drawCamCover(cam, 0, 0, w, h);
      break;
    case 'screenshare':
      if (isReady(screen)) drawContain(screen, 0, 0, w, h);
      else placeholder('no screen selected');
      drawCamPip(cam);
      break;
    case 'idle':
    default:
      drawCamCover(cam, 0, 0, w, h);
      break;
  }
}

function drawCamPip(cam) {
  const { w: pw, h: ph, margin } = CONFIG.PIP;
  const x = CONFIG.STAGE.w - pw - margin;
  const y = CONFIG.STAGE.h - ph - margin;
  drawCamCover(cam, x, y, pw, ph);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, pw, ph);
}

// Webcam is mirrored (selfie view) to match the gesture coordinate space.
function drawCamCover(cam, dx, dy, dw, dh) {
  if (!isReady(cam)) return;
  ctx.save();
  ctx.translate(dx + dw, dy);
  ctx.scale(-1, 1);
  drawCoverInto(cam, 0, 0, dw, dh);
  ctx.restore();
}

function drawCoverInto(src, dx, dy, dw, dh) {
  const sw = src.videoWidth || src.width;
  const sh = src.videoHeight || src.height;
  const scale = Math.max(dw / sw, dh / sh);
  const cw = dw / scale;
  const ch = dh / scale;
  const sx = (sw - cw) / 2;
  const sy = (sh - ch) / 2;
  ctx.drawImage(src, sx, sy, cw, ch, dx, dy, dw, dh);
}

function drawContain(src, dx, dy, dw, dh) {
  const sw = src.videoWidth || src.width;
  const sh = src.videoHeight || src.height;
  const scale = Math.min(dw / sw, dh / sh);
  const rw = sw * scale;
  const rh = sh * scale;
  ctx.drawImage(src, dx + (dw - rw) / 2, dy + (dh - rh) / 2, rw, rh);
}

function isReady(videoEl) {
  return videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0;
}

function placeholder(text) {
  const { w, h } = CONFIG.STAGE;
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#888';
  ctx.font = '24px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h / 2);
  ctx.textAlign = 'left';
}
