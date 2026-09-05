// Camera / microphone / screen capture. Owns the source <video> elements and
// the underlying MediaStreamTracks; nothing else touches getUserMedia.

import { CONFIG } from './config.js';

const camEl = document.getElementById('cam');
const screenEl = document.getElementById('screen');

let camStream = null;
let screenStream = null;
let micTrack = null;

export function getCamEl() { return camEl; }
export function getScreenEl() { return screenEl; }
export function getMicTrack() { return micTrack; }
export function hasScreen() { return !!screenStream; }

function assertMediaApi() {
  if (!window.isSecureContext || !navigator.mediaDevices) {
    throw new Error(
      'camera/screen APIs need a secure context — open the app over ' +
      'http://localhost or http://127.0.0.1 (e.g. VS Code Live Server), not file://',
    );
  }
}

export async function initCamera() {
  assertMediaApi();
  camStream = await navigator.mediaDevices.getUserMedia({
    video: { width: CONFIG.STAGE.w, height: CONFIG.STAGE.h },
    audio: true,
  });
  micTrack = camStream.getAudioTracks()[0] || null;
  camEl.srcObject = camStream;
  await camEl.play();
  return { stream: camStream, micTrack };
}

// Resolves to the screen track, or null if the user cancels the picker.
// Screenshare Mode must stay unavailable until this succeeds.
export async function pickScreen() {
  assertMediaApi();
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
  } catch (err) {
    if (err && err.name === 'NotAllowedError') return null;
    throw err;
  }
  screenEl.srcObject = screenStream;
  await screenEl.play();

  // If the user stops sharing from the browser UI, drop back cleanly.
  const track = screenStream.getVideoTracks()[0];
  track.addEventListener('ended', () => {
    screenStream = null;
    screenEl.srcObject = null;
    onScreenEnded();
  });
  return track;
}

let onScreenEnded = () => {};
export function setScreenEndedHandler(fn) { onScreenEnded = fn; }

export function stopAll() {
  for (const s of [camStream, screenStream]) {
    if (s) for (const t of s.getTracks()) t.stop();
  }
  camStream = screenStream = micTrack = null;
  camEl.srcObject = screenEl.srcObject = null;
}
