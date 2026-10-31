import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(process.cwd(), 'src');
/** Not routed anywhere. */
const IGNORED = ['pages/DashboardPage.tsx'];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/** A primary button's colour is only ever set by `.hc-btn-primary`. */
const OWN_PRIMARY = [
  /background:[^,\n]*(?:#4ba6ea|#22c55e)[^}]*color: *'(?:#fff|white)'/,
  /color: *'(?:#fff|white)'[^}]*background:[^,\n]*(?:#4ba6ea|#22c55e)/,
  /linear-gradient\(135deg, #4ba6ea/,
  /<button[^>]*bg-\[var\(--accent-strong\)\][^>]*text-white/,
  /\.[\w-]*btn[\w-]*[^{]*\{[^}]*background: *#4ba6ea/,
  /\.[\w-]*btn-primary[^{]*\{[^}]*background: *var\(--cw/,
];

describe('buttons', () => {
  const files = sources(SRC).filter(path => !IGNORED.some(ignored => path.endsWith(ignored)));

  it('has no primary button with a colour of its own', () => {
    const offenders = files.filter(path => {
      const source = readFileSync(path, 'utf8');
      return OWN_PRIMARY.some(pattern => pattern.test(source));
    });
    expect(offenders).toEqual([]);
  });

  it('defines the brand colours once', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8');
    expect(css).toMatch(/--btn-primary-bg: #6EA4E7/);
    expect(css).toMatch(/--btn-primary-hover: #5A93DA/);
    expect(css).toMatch(/--btn-primary-active: #4A86D4/);
    expect(css).toMatch(/--btn-destructive-bg: #DC2626/);
  });
});
