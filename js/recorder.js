// MediaRecorder wrapper. Captures the stage canvas + mic into ONE file.
// Pause/resume genuinely stop the encoder, so paused spans leave no dead air in
// the output. Output is .webm — in-browser .mp4 recording is not reliable.

import { getMicTrack } from './media.js';

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

let recorder = null;
let chunks = [];
let mimeType = '';

function pickMime() {
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export function isRecording() {
  return !!recorder && recorder.state !== 'inactive';
}

export function isPaused() {
  return !!recorder && recorder.state === 'paused';
}

export function start() {
  if (isRecording()) return;
  const stage = document.getElementById('stage');
  const canvasStream = stage.captureStream(30);

  const tracks = [...canvasStream.getVideoTracks()];
  const mic = getMicTrack();
  if (mic) tracks.push(mic);
  const stream = new MediaStream(tracks);

  mimeType = pickMime();
  chunks = [];
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  recorder.onstop = finalize;
  recorder.start(1000); // gather a chunk per second
}

export function pause() {
  if (recorder && recorder.state === 'recording') recorder.pause();
}

export function resume() {
  if (recorder && recorder.state === 'paused') recorder.resume();
}

export function stop() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}

function finalize() {
  const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lecture-${stamp}.webm`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  recorder = null;
  chunks = [];
}
