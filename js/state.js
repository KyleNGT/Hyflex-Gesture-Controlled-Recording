// Single source of truth for app mode + recording status.
// The compositor READS this and never writes it. Everything that mutates state
// goes through the exported setters so subscribers stay in sync.

const state = {
  mode: 'idle',        // 'idle' | 'presentation' | 'whiteboard' | 'screenshare'
  slideIndex: 0,       // 0-based
  slideCount: 0,
  recording: false,
  paused: false,
  screenReady: false,  // a screenshare track exists
};

const subscribers = new Set();

function emit() {
  for (const fn of subscribers) fn(state);
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  subscribers.add(fn);
  fn(state);
  return () => subscribers.delete(fn);
}

export function setMode(mode) {
  if (mode === 'screenshare' && !state.screenReady) return;
  if (state.mode === mode) return;
  state.mode = mode;
  emit();
}

export function setSlideCount(n) {
  state.slideCount = n;
  if (state.slideIndex >= n) state.slideIndex = Math.max(0, n - 1);
  emit();
}

export function nextSlide() {
  if (state.slideIndex < state.slideCount - 1) {
    state.slideIndex++;
    emit();
  }
}

export function prevSlide() {
  if (state.slideIndex > 0) {
    state.slideIndex--;
    emit();
  }
}

export function setRecording(recording, paused = false) {
  state.recording = recording;
  state.paused = paused;
  emit();
}

export function setPaused(paused) {
  state.paused = paused;
  emit();
}

export function setScreenReady(ready) {
  state.screenReady = ready;
  if (!ready && state.mode === 'screenshare') state.mode = 'idle';
  emit();
}
