import fs from 'fs';
import path from 'path';

/**
 * Operation photos must be attachable from the camera *or* the gallery.
 *
 * `capture="environment"` reads like a hint for the rear camera, but on iOS and
 * Android it is not a hint: the browser opens the camera directly and drops the
 * gallery and Files entries from the sheet. Staff doing a delivery away from the
 * desk could therefore never attach a photo taken minutes earlier, or one a
 * colleague had sent them — the shot had to be taken inside the form or not at
 * all.
 *
 * Removing the attribute does not disable the camera; it demotes it to one of
 * the offered sources. This asserts the attribute stays gone, since re-adding it
 * looks harmless in review and silently removes the gallery again.
 */

const SRC = fs.readFileSync(path.join(__dirname, 'OperationsPage.tsx'), 'utf8');

/** Only JSX comments — a C-style strip would eat `accept="image/*"`. */
const CODE = SRC.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** A JSX tag ends at a lone `/>`; `[^>]*` would stop at the `>` in `e => {`. */
const fileInputs = [...CODE.matchAll(/<input\b[\s\S]*?\n\s*\/>/g)]
  .map(m => m[0])
  .filter(tag => /type="file"/.test(tag));

const hasAttr = (tag: string, name: string) => new RegExp(`^\\s*${name}\\b`, 'm').test(tag);

test('the page still has both photo inputs', () => {
  expect(fileInputs).toHaveLength(2);
});

test('no photo input forces the camera', () => {
  const forced = fileInputs.filter(tag => hasAttr(tag, 'capture'));
  expect(forced).toEqual([]);
});

test('every photo input still accepts an image from any source', () => {
  for (const tag of fileInputs) {
    expect(tag).toMatch(/accept="image\/\*"/);
  }
});

test('the free uploader keeps multiple; the slot input takes one file', () => {
  const slot = fileInputs.find(t => /ref=\{inputRef\}/.test(t))!;
  const free = fileInputs.find(t => !/ref=\{inputRef\}/.test(t))!;

  // One named position (front bumper, dashboard, a scratch) is one photo.
  expect(hasAttr(slot, 'multiple')).toBe(false);
  expect(hasAttr(free, 'multiple')).toBe(true);
});

test('nothing anywhere else in the app forces the camera either', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.tsx?$/.test(e.name) ? [full] : [];
    });

  const offenders = walk(path.join(__dirname, '..'))
    .filter(f => !f.endsWith('operations-photo-source.test.ts'))
    .filter((f) => {
      const code = fs.readFileSync(f, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
      return /^\s*capture[=\s]/m.test(code);
    })
    .map(f => path.relative(path.join(__dirname, '..'), f));

  expect(offenders).toEqual([]);
});

test('the labels no longer tell the user to take a photo', () => {
  const en = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'locales', 'en', 'operations.json'), 'utf8'));
  const ar = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'locales', 'ar', 'operations.json'), 'utf8'));

  // "Tap to capture" / "اضغط للتصوير" named the only source there used to be.
  expect(en.slots.tapToAdd).toBe('Tap to add');
  expect(en.form.replace).toBe('Replace');
  expect(en.form.tapPosition).not.toMatch(/capture/i);
  expect(ar.slots.tapToAdd).not.toMatch(/تصوير/);
  expect(ar.form.tapPosition).not.toMatch(/لتصويره/);

  // And the retired keys are gone, not left behind to be picked up again.
  expect(en.slots.tapToCapture).toBeUndefined();
  expect(en.form.replaceRetake).toBeUndefined();
});
