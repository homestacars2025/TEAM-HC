/**
 * Feature flags for work that is merged but not yet released.
 *
 * A flag lives in localStorage so it can be turned on for one person on the real
 * deployment, without a rebuild and without a preview URL — which is what makes
 * a half-finished feature reviewable on the device it will actually be used on.
 *
 * The value is written by the inline script in `public/index.html`, which reads
 * `?ff_lang=1` before React mounts; everything here only reads it. Keeping the
 * capture in one place means the pre-hydration path and the React path can never
 * disagree about whether a flag is on.
 */

export const FF_LANGUAGE_SWITCHER = 'hc_ff_lang';

/**
 * Released. The sidebar and the Cars page are translated, so an Arabic user
 * lands on a screen that is Arabic all the way through rather than an Arabic
 * layout wrapped around English text.
 *
 * The rest of the pages are still English. That is a smaller version of the
 * same problem, not a different one, so the remaining pages stay the priority.
 */
const LANGUAGE_SWITCHER_RELEASED = true;

/**
 * Whether the Arabic option is offered at all.
 *
 * This gates the *language*, not just the button. A stored `hc_lang=ar` left
 * over from testing must not put someone into RTL while the control to get back
 * out is hidden — so when the switcher is unavailable the dashboard pins itself
 * to English. That is also what keeps English byte-for-byte unchanged for every
 * user who has not opted in.
 */
export function languageSwitcherEnabled(): boolean {
  if (LANGUAGE_SWITCHER_RELEASED) return true;
  try {
    return localStorage.getItem(FF_LANGUAGE_SWITCHER) === '1';
  } catch {
    // Private mode or blocked storage — treat as off rather than failing.
    return false;
  }
}
