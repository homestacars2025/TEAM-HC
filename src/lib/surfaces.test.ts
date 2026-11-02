import fs from 'fs';
import path from 'path';

/**
 * Surfaces are white and separated by a hairline, and both come from one place so
 * later visual steps can change them there.
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

describe('surfaces', () => {
  test('the tokens exist', () => {
    const css = read('index.css');
    expect(css).toContain('--surface: #FFFFFF;');
    expect(css).toContain('--border-subtle: #EBEBEB;');
  });

  test('no page keeps the old grey wash or the retired token', () => {
    const offenders = walk(SRC).filter(f => /#f8fafc 0%|surface-secondary|--cw-bg:#/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('tables keep a hairline between rows now the zebra stripes are gone', () => {
    expect(read('index.css')).toMatch(/\.hc-cash-table tbody tr \{[^}]*border: 1px solid var\(--border-subtle\)/);
    expect(read('index.css')).toMatch(/\.hc-fine-row \{[^}]*border: 1px solid var\(--border-subtle\)/);
  });

  test('depth is defined once, with the light on the reading side', () => {
    const css = read('index.css');
    expect(css.match(/^\.surface-depth \{/gm)).toHaveLength(1);
    expect(css).toContain('html[dir="rtl"] { --depth-from: 85% 0%; }');
  });

  test('stat tiles keep a compact size from 640px, on both money pages', () => {
    const css = read('index.css');
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 220px));');
    expect(css).toContain('max-width: 692px;');
    expect(css).toContain('.hc-tile { height: 140px; }');
    for (const page of ['pages/CustodyPage.tsx', 'pages/WalletPage.tsx']) expect(read(page)).toContain('<StatTile');
  });

  test('the frame clips what is parked off-screen, but main can still scroll sideways', () => {
    const css = read('index.css');
    expect(css).toContain('contain: paint;');
    // KGM's 998px table is reached by scrolling `main`.
    expect(css).not.toMatch(/\.hc-main \{[^}]*overflow-x/);
  });

  test('the phone frame follows the visible height and the safe areas', () => {
    const css = read('index.css');
    expect(css).toContain('height: 100dvh;');
    expect(css).toContain('.hc-sidebar-foot { padding-bottom: calc(12px + env(safe-area-inset-bottom)); }');
    expect(fs.readFileSync(path.join(SRC, '..', 'public', 'index.html'), 'utf8')).toContain('viewport-fit=cover');
  });

  test('the sidebar border sits on the inner edge, so it flips in RTL', () => {
    expect(read('components/Sidebar.tsx')).toContain('border-e border-[var(--border-subtle)] bg-[var(--surface)]');
  });
});
