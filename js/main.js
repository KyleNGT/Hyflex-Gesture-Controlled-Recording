// Bootstrap + wiring. Nothing in here contains gesture or compositing logic —
// it just connects the modules and binds the mouse/keyboard controls.
//
// By design: Start/Stop Recording are MOUSE-ONLY. Gestures never start or stop
// capture — only pause/resume and layout.

import {
  setMode, nextSlide, prevSlide, setSlideCount, setRecording, setScreenReady,
  getState,
} from './state.js';
import { initCamera, pickScreen, setScreenEndedHandler } from './media.js';
import { loadPdf } from './slides.js';
import { initHandpose, start as startHandpose } from './handpose.js';
import { update as updateEngine, setCommandHandler, getStatus } from './gesture-engine.js';
import { startCompositor } from './compositor.js';
import * as recorder from './recorder.js';
import { initUI, setHands, setStatus } from './ui.js';

const els = {
  pdf: document.getElementById('pdf-input'),
  screen: document.getElementById('btn-screen'),
  start: document.getElementById('btn-start'),
  stop: document.getElementById('btn-stop'),
};

async function boot() {
  initUI();

  try {
    setStatus('requesting camera…');
    await initCamera();
  } catch (err) {
    setStatus(`camera failed: ${err.message}`);
    return;
  }

  startCompositor();

  setStatus('loading hand model…');
  try {
    await initHandpose();
  } catch (err) {
    setStatus(`hand model failed: ${err.message}`);
    return;
  }

  startHandpose(document.getElementById('cam'), (hands) => {
    window.__hyflex.lastHands = hands;   // dev hook, useful for tuning classifiers
    setHands(hands);
    updateEngine(hands);
  });

  setCommandHandler(onGestureCommand);
  bindControls();
  setStatus('ready');
}

function onGestureCommand(command) {
  // Mode commands are already applied by the engine; here we handle the rest.
  if (command === 'toggle-pause') togglePause();
}

function bindControls() {
  els.pdf.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStatus('loading PDF…');
    const n = await loadPdf(file);
    setSlideCount(n);
    setStatus(`PDF loaded (${n} pages)`);
  });

  els.screen.addEventListener('click', async () => {
    const track = await pickScreen();
    setScreenReady(!!track);
  });
  setScreenEndedHandler(() => setScreenReady(false));

  els.start.addEventListener('click', () => {
    recorder.start();
    setRecording(true, false);
    els.start.disabled = true;
    els.stop.disabled = false;
  });

  els.stop.addEventListener('click', () => {
    recorder.stop();
    setRecording(false, false);
    els.start.disabled = false;
    els.stop.disabled = true;
  });

  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case '0': setMode('idle'); break;
      case '1': setMode('presentation'); break;
      case '2': setMode('whiteboard'); break;
      case '3': setMode('screenshare'); break;
      case 'ArrowRight': nextSlide(); break;
      case 'ArrowLeft': prevSlide(); break;
      case ' ': e.preventDefault(); togglePause(); break;
      default: return;
    }
  });
}

function togglePause() {
  if (!recorder.isRecording()) return;
  if (recorder.isPaused()) {
    recorder.resume();
    setRecording(true, false);
  } else {
    recorder.pause();
    setRecording(true, true);
  }
}

// surface state for quick console poking during dev
window.__hyflex = { getState, getStatus, lastHands: [] };

boot();
