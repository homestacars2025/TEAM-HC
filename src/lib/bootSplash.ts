/**
 * The splash lives in `public/index.html`, outside React, so that it paints before
 * any script has loaded and stays one continuous element until the dashboard is
 * ready. Nothing here creates it; this only decides when it goes.
 */

const FADE_MS = 160;

/** A page may hold the splash for its first data, but never for long. */
const MAX_HOLD_MS = 1500;

/** A font this slow is not worth waiting for: the text swaps in when it arrives. */
const MAX_FONT_WAIT_MS = 1200;

/** What the first screen uses. Sample text, because each font file only covers part of Unicode. */
const FIRST_SCREEN_FONTS: Array<[font: string, sample: string]> = [
  ['400 14px "Geist Variable"', 'AaŞş'],
  ['500 13px "Geist Mono Variable"', 'Aa0'],
  ['400 14px "IBM Plex Sans Arabic"', 'ع'],
  ['500 14px "IBM Plex Sans Arabic"', 'ع'],
  ['600 14px "IBM Plex Sans Arabic"', 'ع'],
];

let holds = 0;
let wantsHide = false;
let gone = false;
let waiting: Array<() => void> = [];

const splash = () => document.getElementById('boot-splash');

function finish() {
  wantsHide = false;
  gone = true;
  const element = splash();
  if (element) {
    element.classList.add('is-done');
    window.setTimeout(() => { if (gone) element.hidden = true; }, FADE_MS);
  }
  const callbacks = waiting;
  waiting = [];
  callbacks.forEach(callback => callback());
}

/** Signing in lands here: the same splash covers the wait for that person's data. */
export function showBootSplash() {
  const element = splash();
  if (!element) return;
  gone = false;
  element.hidden = false;
  element.classList.remove('is-done');
}

/** Waits for any page still holding it. */
export function hideBootSplash() {
  if (gone) return;
  if (holds > 0) wantsHide = true;
  else finish();
}

/** Keeps the splash up until the returned function runs. Does nothing once it has gone. */
export function holdBootSplash(): () => void {
  if (gone) return () => {};
  holds += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    window.clearTimeout(timer);
    holds -= 1;
    if (holds === 0 && wantsHide) finish();
  };
  const timer = window.setTimeout(release, MAX_HOLD_MS);
  return release;
}

/** Runs now if the splash has gone. For anything worth seeing, such as an animation. */
export function afterBootSplash(callback: () => void): () => void {
  if (gone || !splash()) {
    callback();
    return () => {};
  }
  waiting.push(callback);
  return () => { waiting = waiting.filter(other => other !== callback); };
}

/** Resolves when the fonts are in, so the first text on screen is the final text. */
export function loadBootFonts(): Promise<void> {
  if (!document.fonts) return Promise.resolve();
  const fonts = Promise.all(FIRST_SCREEN_FONTS.map(([font, sample]) => document.fonts.load(font, sample)));
  const limit = new Promise(resolve => { window.setTimeout(resolve, MAX_FONT_WAIT_MS); });
  return Promise.race([fonts, limit]).then(() => undefined, () => undefined);
}
