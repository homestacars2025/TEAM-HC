/**
 * Fonts for the print documents.
 *
 * Each print template is its own document, in a hidden iframe or a page of its
 * own, so it inherits none of the app's stylesheets or CSS variables. Rather than a second
 * list of font files that could drift, this copies the `@font-face` rules the app
 * already loaded — same self-hosted files, same 600 cap on Latin — and defines the
 * variables the templates use.
 *
 * The stack is the English one whatever the UI language: these are bilingual
 * documents, so Latin stays Geist and Arabic comes from Plex glyph by glyph.
 */

const FONT_VARIABLES = `:root{
  --font-plex-arabic:"IBM Plex Sans Arabic";
  --font-sans:"Geist Variable",var(--font-plex-arabic),ui-sans-serif,system-ui,sans-serif;
  --font-mono:"Geist Mono Variable",var(--font-plex-arabic),ui-monospace,monospace;
}
html{font-synthesis-weight:none}`;

/** A print document has no stylesheet to resolve against, so each URL is made absolute. */
const absoluteUrls = (rule: string, base: string): string =>
  rule.replace(/url\(["']?([^"')]+)["']?\)/g, (_match, url: string) => `url("${new URL(url, base).href}")`);

function fontFaceRules(): string {
  const rules: string[] = [];
  Array.from(document.styleSheets).forEach(sheet => {
    let cssRules: CSSRuleList;
    try {
      cssRules = sheet.cssRules;
    } catch {
      return; // A cross-origin sheet can't be read, and none of ours are.
    }
    Array.from(cssRules).forEach(rule => {
      if (rule.cssText.startsWith('@font-face')) {
        rules.push(absoluteUrls(rule.cssText, sheet.href ?? window.location.href));
      }
    });
  });
  return rules.join('\n');
}

/** A `<style>` tag for the `<head>` of a print document. */
export function printFontStyles(): string {
  return `<style>\n${fontFaceRules()}\n${FONT_VARIABLES}\n</style>`;
}
