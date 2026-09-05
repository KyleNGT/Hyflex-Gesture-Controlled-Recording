// PDF slide deck. Renders each page once to an offscreen canvas at stage
// resolution and caches it, so the compositor only ever blits a bitmap.

import { CONFIG } from './config.js';
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

let doc = null;
let objectUrl = null;
const cache = new Map(); // pageIndex (0-based) -> HTMLCanvasElement

export function pageCount() {
  return doc ? doc.numPages : 0;
}

export async function loadPdf(file) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  cache.clear();
  objectUrl = URL.createObjectURL(file);
  doc = await pdfjsLib.getDocument(objectUrl).promise;
  return doc.numPages;
}

// Returns a cached canvas for the page, or null if not rendered yet. Kicks off
// the render on a miss so a later frame will have it.
export function getPage(index) {
  if (cache.has(index)) return cache.get(index);
  if (doc && index >= 0 && index < doc.numPages) renderPage(index);
  return null;
}

async function renderPage(index) {
  if (cache.has(index)) return;
  cache.set(index, null); // mark in-flight

  const page = await doc.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(CONFIG.STAGE.w / base.width, CONFIG.STAGE.h / base.height);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
  cache.set(index, canvas);
}
