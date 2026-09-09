// Bootstrap + wiring. Nothing in here contains gesture or compositing logic --
// it just connects the modules and binds the mouse/keyboard controls.
//
// By design: Start/Stop Recording are MOUSE-ONLY. Gestures never start or stop
// capture -- only pause/resume and layout.

import { CONFIG } from './config.js';
import {
  setMode, nextSlide, prevSlide, setSlideCount, setRecording, setScreenReady,
  getState,
} from './state.js';
import { initCamera, pickScreen, setScreenEndedHandler, stopAll } from './media.js';
import { loadPdf } from './slides.js';
import { initHandpose, start as startHandpose, stop as stopHandpose } from './handpose.js';
import { update as updateEngine, setCommandHandler, getStatus } from './gesture-engine.js';
import { startCompositor } from './compositor.js';
import * as recorder from './recorder.js';
import { initUI, setHands, setStatus, flash, toggleOverlay } from './ui.js';
import { initTuner, toggleTuner } from './tuner.js';

const els = {
  pdf: document.getElementById('pdf-input'),
  screen: document.getElementById('btn-screen'),
  start: document.getElementById('btn-start'),
  pause: document.getElementById('btn-pause'),
  stop: document.getElementById('btn-stop'),
  outFormat: document.getElementById('out-format'),
};

const COMMAND_LABEL = {
  'mode:presentation': 'Presentation',
  'mode:whiteboard': 'Whiteboard',
  'mode:screenshare': 'Screenshare',
  'toggle-pause': 'Pause / Resume',
  'toggle-record': 'Recording',
  'slide:next': 'Next slide',
  'slide:prev': 'Previous slide',
};

let canRecord = false;   // camera is up, so a take is possible

async function boot() {
  initUI();
  initTuner();
  bindControls();                 // usable even if the camera never arrives

  try {
    setStatus('requesting camera + microphone...');
    await initCamera();
  } catch (err) {
    setStatus(`camera failed: ${err.message}`);
    console.error(err);
    return;
  }

  startCompositor();
  canRecord = true;
  els.start.disabled = false;

  setStatus('loading hand model...');
  try {
    await initHandpose();
  } catch (err) {
    setStatus(`hand model failed: ${err.message} - keyboard controls still work`);
    console.error(err);
    return;
  }

  startHandpose(document.getElementById('cam'), (hands) => {
    window.__hyflex.lastHands = hands;   // dev hook, useful for tuning classifiers
    setHands(hands);
    updateEngine(hands);
  });

  setCommandHandler(onGestureCommand);
  flash('ready - gestures live');
}

function onGestureCommand(command) {
  // Mode and slide commands are already applied by the engine; here we handle
  // the rest and surface every fired command to the professor.
  if (command === 'toggle-pause') togglePause();
  else if (command === 'toggle-record') toggleRecord();
  flash(COMMAND_LABEL[command] || command);
}

function bindControls() {
  els.pdf.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStatus('loading PDF...');
    try {
      const n = await loadPdf(file);
      setSlideCount(n);
      flash(`PDF loaded - ${n} page${n === 1 ? '' : 's'}`);
    } catch (err) {
      setStatus(`PDF failed: ${err.message}`);
      console.error(err);
    }
  });

  els.screen.addEventListener('click', async () => {
    try {
      const track = await pickScreen();
      setScreenReady(!!track);
      flash(track ? 'screen shared' : 'screen share cancelled');
    } catch (err) {
      setStatus(`screen share failed: ${err.message}`);
      console.error(err);
    }
  });
  setScreenEndedHandler(() => {
    setScreenReady(false);
    flash('screen share ended');
  });

  els.start.addEventListener('click', startRecording);
  els.pause.addEventListener('click', togglePause);
  els.stop.addEventListener('click', stopRecording);
  els.outFormat.textContent = recorder.getContainerLabel();

  // Fires for a normal stop and for a recorder that dies on its own, so the
  // buttons and the border can never lie about MediaRecorder.state.
  recorder.setOnStop((name) => {
    setRecording(false, false);
    els.start.disabled = false;
    els.stop.disabled = true;
    els.pause.disabled = true;
    els.pause.textContent = 'Pause';
    flash(`saved ${name}`, 6000);
  });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    switch (e.key) {
      case '0': setMode('idle'); break;
      case '1': setMode('presentation'); break;
      case '2': setMode('whiteboard'); break;
      case '3': setMode('screenshare'); break;
      case 'ArrowRight': nextSlide(); break;
      case 'ArrowLeft': prevSlide(); break;
      case ' ': e.preventDefault(); togglePause(); break;
      case 'r': case 'R': toggleRecord(); break;
      case 't': case 'T': toggleTuner(); break;
      case 'd': case 'D': toggleOverlay(); break;
      default: return;
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (!recorder.isRecording()) return;
    e.preventDefault();
    e.returnValue = '';   // "leave site?" - a reload here loses the take
  });

  // Release the camera/mic light on navigation away.
  window.addEventListener('pagehide', () => {
    stopHandpose();
    recorder.stop();
    stopAll();
  });
}

// One path for both the mouse buttons and the V-sign gesture, so the two can
// never drift apart.
function startRecording() {
  if (!canRecord || recorder.isRecording()) return;
  try {
    recorder.start();
  } catch (err) {
    setStatus(`recording failed: ${err.message}`);
    console.error(err);
    return;
  }
  setRecording(true, false);
  els.start.disabled = true;
  els.stop.disabled = false;
  els.pause.disabled = false;
  els.pause.textContent = 'Pause';
  flash('recording');
}

function stopRecording() {
  if (!recorder.isRecording()) return;
  recorder.stop();     // recorder.setOnStop resets the buttons and the border
}

function toggleRecord() {
  if (recorder.isRecording()) stopRecording();
  else startRecording();
}

function togglePause() {
  if (!recorder.isRecording()) return;
  if (recorder.isPaused()) {
    recorder.resume();
    setRecording(true, false);
    els.pause.textContent = 'Pause';
  } else {
    recorder.pause();
    setRecording(true, true);
    els.pause.textContent = 'Resume';
  }
}

// surface state for quick console poking during dev
window.__hyflex = { getState, getStatus, CONFIG, lastHands: [] };

boot();
