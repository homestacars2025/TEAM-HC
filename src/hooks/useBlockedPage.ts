import { useEffect } from 'react';

let holders = 0;
let overflow = '';

/**
 * While a dialog is up nothing behind it can be scrolled or reached with the keyboard. The
 * dialogs here can stack, so the page comes back only when the last one has gone.
 */
export function useBlockedPage(): void {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const page = document.getElementById('root');
    if (holders === 0) {
      overflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      page?.setAttribute('inert', '');
    }
    holders += 1;
    return () => {
      holders -= 1;
      if (holders === 0) {
        document.body.style.overflow = overflow;
        page?.removeAttribute('inert');
      }
      opener?.focus?.();
    };
  }, []);
}
