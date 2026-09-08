// MediaRecorder wrapper. Captures the stage canvas + mic into ONE file.
// Pause/resume genuinely stop the encoder, so paused spans leave no dead air in
// the output. Output is .webm -- in-browser .mp4 recording is not reliable, and
// the filename says so rather than pretending otherwise.

import { getMicTrack } from './media.js';

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

let recorder = null;
let chunks = [];
let mimeType = '';
let canvasStream = null;
let onStop = () => {};

function pickMime() {
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

// Called after the file has been handed to the browser: fn(filename, bytes).
// Also fires if the recorder stops on its own (e.g. the canvas track dies), so
// the UI can never be left showing a recording that is no longer running.
export function setOnStop(fn) { onStop = fn; }

export function isRecording() {
  return !!recorder && recorder.state !== 'inactive';
}

export function isPaused() {
  return !!recorder && recorder.state === 'paused';
}

export function getMimeType() {
  return mimeType;
}

export function start() {
  if (isRecording()) return true;
  const stage = document.getElementById('stage');
  if (!stage.captureStream) {
    throw new Error('canvas.captureStream is unavailable in this browser');
  }
  canvasStream = stage.captureStream(30);

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
  recorder.onerror = (e) => console.error('[recorder] error', e.error || e);
  recorder.onstop = finalize;
  recorder.start(1000); // gather a chunk per second
  return true;
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
  const name = `lecture-${stamp}.webm`;

  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  // The canvas capture track is ours alone; the mic belongs to media.js.
  if (canvasStream) for (const t of canvasStream.getVideoTracks()) t.stop();
  canvasStream = null;
  recorder = null;
  chunks = [];
  onStop(name, blob.size);
}
