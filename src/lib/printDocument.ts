/**
 * Prints a standalone HTML document (a contract, a replacement sheet, an invoice)
 * without a popup.
 *
 * The documents need data first, and a `window.open` after an `await` is no longer
 * the click that asked for it, so phone browsers block it. Instead:
 *
 * - On a desktop the document goes into a hidden iframe on this page and the print
 *   dialog opens over it.
 * - On a phone or tablet the document replaces this page. iOS prints the parent of an
 *   iframe rather than the iframe, so the document has to be the page itself. Its bar
 *   keeps "Print / Save PDF" (the share sheet saves a PDF from there) and "Back".
 *
 * The Admin app does the same.
 */

/** iPhone, iPad and Android, including iPadOS, which reports itself as a Mac with touch. */
export function isMobileDevice(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator): boolean {
  return /iPhone|iPad|iPod|Android/i.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

/** Long enough for any print dialog to be dismissed; the iframe goes once it is. */
const CLEANUP_FALLBACK_MS = 60_000;
/** A stalled font costs the typeface, never the printout. */
const FONT_WAIT_MS = 2_000;

function printInFrame(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.dataset.hcPrint = '';

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    frame.remove();
  };

  // `load` waits for the images; the fonts are a separate wait.
  frame.addEventListener('load', () => {
    const win = frame.contentWindow;
    if (!win) return remove();
    const fonts = win.document.fonts?.ready ?? Promise.resolve();
    Promise.race([fonts, new Promise(resolve => window.setTimeout(resolve, FONT_WAIT_MS))]).then(() => {
      win.addEventListener('afterprint', () => window.setTimeout(remove, 0));
      window.setTimeout(remove, CLEANUP_FALLBACK_MS);
      win.focus();
      win.print();
    });
  }, { once: true });

  frame.srcdoc = html;
  document.body.appendChild(frame);
}

/**
 * An A4 page is wider than a phone, so on screen each page is scaled to fit; print
 * still gets it at full size. A transform rather than `zoom`, which iOS undoes by
 * holding zoomed text at its minimum font size. Safari's text autosizing would
 * enlarge text inside the wide page too, so that's off.
 */
const FIT_TO_SCREEN = `<style>html{-webkit-text-size-adjust:100%;text-size-adjust:100%}@media print{.page[data-fit]{transform:none!important;margin:0!important}}</style>
<script>(function(){function fit(){var w=document.documentElement.clientWidth;document.querySelectorAll('.page').forEach(function(p){p.style.transform='';p.style.margin='';delete p.dataset.fit;var z=Math.min(1,w/p.offsetWidth);if(z>=1)return;p.dataset.fit='';p.style.transformOrigin='0 0';p.style.transform='scale('+z+')';p.style.marginRight=(-(1-z)*p.offsetWidth)+'px';p.style.marginBottom=(-(1-z)*p.offsetHeight)+'px';});}fit();addEventListener('resize',fit);if(document.fonts)document.fonts.ready.then(fit);})();</script>`;

export function asTabPage(html: string): string {
  return html.includes('</body>') ? html.replace('</body>', `${FIT_TO_SCREEN}\n</body>`) : html + FIT_TO_SCREEN;
}

function openInPlace(html: string): void {
  window.location.href = URL.createObjectURL(new Blob([asTabPage(html)], { type: 'text/html' }));
}

export function printHtml(html: string): void {
  if (isMobileDevice() || typeof window.print !== 'function') openInPlace(html);
  else printInFrame(html);
}
