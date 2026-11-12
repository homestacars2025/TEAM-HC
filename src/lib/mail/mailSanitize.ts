import DOMPurify from 'dompurify';

/**
 * Email HTML is written by whoever mailed us, so it is hostile input.
 *
 * Two layers: DOMPurify strips scripts, handlers, forms and anything that can
 * run, and the reader then shows the result in a sandboxed iframe that cannot
 * run scripts either. Links open in a new tab, never in the dashboard.
 */

let hooked = false;

function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (/^\s*(javascript|data|vbscript):/i.test(href)) node.removeAttribute('href');
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
}

const FORBID_TAGS = ['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'meta', 'link', 'base'];

/**
 * Received mail. Inline `style` attributes stay, because most email layout lives
 * there; `<style>` blocks go, because they could restyle the page around them.
 */
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return '';
  ensureHooks();
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS,
    FORBID_ATTR: ['srcset', 'formaction', 'action', 'ping'],
    ALLOW_DATA_ATTR: false,
  });
}

/** What we send: the composer's own output, cleaned the same way before it leaves. */
export const sanitizeOutgoingHtml = sanitizeEmailHtml;

/** The visible text of some HTML, for a preview line or an empty-body check. */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(sanitizeEmailHtml(html), 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
