import fs from 'fs';
import path from 'path';

/**
 * Catches a translated page that still renders an English word.
 *
 * The two guards used while migrating each page compare against the *previous*
 * version of the file: "is every new locale value a string that used to be
 * there?" and "is every string that used to be there now covered by a locale
 * value?". Both answer yes when a string is used at two sites and only one gets
 * wired — which is how the Fines toolbar kept an "Add Fine" button, and how
 * "Cancel" survived on five pages.
 *
 * This asks a different question, of the file as it is now: is there a line
 * that is still nothing but English prose? That is what a JSX text node looks
 * like once it is on its own line, which is exactly where the other two checks
 * cannot see.
 */

const PAGES_DIR = path.join(__dirname, '..', 'pages');

/** Pages migrated so far. Add a page here when it is translated. */
const TRANSLATED = [
  'CarsPage.tsx',
  'CarIssuesPage.tsx',
  'BookingsPage.tsx',
  'OperationsPage.tsx',
  'CalendarPage.tsx',
  'FinesPage.tsx',
  'TasksPage.tsx',
];

/** A line holding only capitalised English prose — no code punctuation. */
const BARE_ENGLISH = /^[A-Z][A-Za-z]*(?: [A-Za-z()#…'&/,.-]+){0,8}[.?…]?$/;

describe.each(TRANSLATED)('%s', (file) => {
  test('renders no bare English text node', () => {
    const src = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
    const offenders = src
      .split('\n')
      .map((line, i) => [i + 1, line.trim()] as const)
      .filter(([, text]) => text.length > 2 && BARE_ENGLISH.test(text))
      .map(([n, text]) => `${file}:${n} ${JSON.stringify(text)}`);

    expect(offenders).toEqual([]);
  });
});
