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
    expect(read('pages/BookingsPage.tsx')).toContain('.bk-row td { border-bottom: 1px solid var(--border-subtle); }');
    expect(read('pages/FinesPage.tsx')).toContain('.fine-row td { border-bottom: 1px solid var(--border-subtle); }');
  });

  test('the sidebar border sits on the inner edge, so it flips in RTL', () => {
    expect(read('components/Sidebar.tsx')).toContain('border-e border-[var(--border-subtle)] bg-[var(--surface)]');
  });
});
