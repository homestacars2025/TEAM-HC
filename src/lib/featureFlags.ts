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
 * Flip to `true` to release the language switcher to everyone. That is the
 * single change phase 3 needs once the sidebar is translated — until then, a
 * staff member would see an Arabic layout wrapped around English text.
 */
const LANGUAGE_SWITCHER_RELEASED = false;

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
