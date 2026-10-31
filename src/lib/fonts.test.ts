import fs from 'fs';
import path from 'path';

/**
 * The font standard, as things a later change could quietly undo: a hardcoded
 * family, a request to Google, or Geist drifting back to its full weight range.
 */

const SRC = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(SRC, file), 'utf8');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(tsx?|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

describe('the font standard', () => {
  test('no retired family is left anywhere, including the print templates', () => {
    const retired = /Cairo|['"]Inter['"]|Segoe UI|SF Pro|Circular|Helvetica|fontFamily: *'monospace'/;
    const offenders = walk(SRC).filter(f => retired.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('nothing is fetched from Google at runtime', () => {
    const files = [...walk(SRC), path.join(SRC, '..', 'public', 'index.html')];
    expect(files.filter(f => /fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(f, 'utf8')))).toEqual([]);
  });

  test('every font-family is a variable, or inherits one', () => {
    const concrete = /font-family:(?!\s*(?:var\(|inherit))/;
    const inline = /fontFamily:\s*['"](?!var\(|inherit)/;
    const offenders = walk(SRC)
      .filter(f => !f.endsWith('fonts.css'))
      .filter(f => {
        const src = fs.readFileSync(f, 'utf8');
        return concrete.test(src) || inline.test(src);
      });
    expect(offenders).toEqual([]);
  });

  test('Latin stops at 600, so "never 700" holds for every inline weight at once', () => {
    const css = read('fonts.css');
    expect(css.match(/font-weight: [^;]+;/g)?.every(w => w === 'font-weight: 100 600;')).toBe(true);
    expect(css).toContain('latin-ext'); // Turkish needs ğ, ş, ı and İ.
    expect(read('index.css')).toContain('font-synthesis-weight: none');
  });

  test('every print document carries the self-hosted fonts', () => {
    for (const file of ['lib/printContract.ts', 'lib/printReplacementSheet.ts', 'lib/printCustomerInvoice.ts', 'pages/KGMPage.tsx']) {
      expect(read(file)).toContain('${printFontStyles()}');
    }
  });

  test('tracking is switched off for Arabic, including inline letter-spacing', () => {
    expect(read('index.css')).toMatch(/html\[lang="ar"\] \*\s*\{\s*letter-spacing: normal !important;/);
  });
});
