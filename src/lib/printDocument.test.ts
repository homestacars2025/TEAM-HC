import { readFileSync } from 'fs';
import { join } from 'path';
import { asTabPage, isMobileDevice } from './printDocument';

const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8');

const nav = (userAgent: string, platform = '', maxTouchPoints = 0) => ({ userAgent, platform, maxTouchPoints });

describe('printDocument', () => {
  test('phones and tablets open the document in place', () => {
    expect(isMobileDevice(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', 'iPhone', 5))).toBe(true);
    expect(isMobileDevice(nav('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', 'Linux armv8l', 5))).toBe(true);
    // iPadOS asks for the desktop site and reports a Mac, but has touch.
    expect(isMobileDevice(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 'MacIntel', 5))).toBe(true);
  });

  test('desktops print from a hidden frame', () => {
    expect(isMobileDevice(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 'MacIntel', 0))).toBe(false);
    expect(isMobileDevice(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', 'Win32', 0))).toBe(false);
  });

  test('on a phone the A4 page is fitted to the screen, and printed at full size', () => {
    const page = asTabPage('<html><body><div class="page"></div></body></html>');
    expect(page).toMatch(/<script>[\s\S]*scale\([\s\S]*<\/script>\n<\/body><\/html>$/);
    expect(page).toContain('@media print{.page[data-fit]{transform:none!important;margin:0!important}}');
    expect(page).not.toContain('zoom');
  });

  test('no print document opens a popup or alerts about one', () => {
    for (const file of ['lib/printContract.ts', 'lib/printReplacementSheet.ts', 'lib/printCustomerInvoice.ts']) {
      const source = read(file);
      expect(source).not.toMatch(/window\.open|alert\(|[Pp]op-?up/);
      expect(source).toContain('printHtml(');
      expect(source).toContain('onclick="history.back()"');
    }
  });
});
