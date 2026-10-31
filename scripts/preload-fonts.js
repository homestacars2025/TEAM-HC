/*
 * Webpack hashes font filenames, so public/index.html can't name them. This runs
 * after the build and adds the preloads, which lets the fonts start downloading
 * with the page instead of after the stylesheet has been parsed.
 */
const fs = require('fs');
const path = require('path');

const BUILD = path.join(__dirname, '..', 'build');
const MEDIA = path.join(BUILD, 'static', 'media');
const INDEX = path.join(BUILD, 'index.html');

const ABOVE_THE_FOLD = [
  'geist-latin-wght-normal',
  'geist-latin-ext-wght-normal',
  'ibm-plex-sans-arabic-arabic-400-normal',
  'ibm-plex-sans-arabic-arabic-500-normal',
  'ibm-plex-sans-arabic-arabic-600-normal',
];

const files = fs.readdirSync(MEDIA);
const links = ABOVE_THE_FOLD.map(name => {
  const file = files.find(f => f.startsWith(`${name}.`) && f.endsWith('.woff2'));
  if (!file) throw new Error(`preload-fonts: no woff2 for ${name}`);
  return `<link rel="preload" href="/static/media/${file}" as="font" type="font/woff2" crossorigin>`;
});

const html = fs.readFileSync(INDEX, 'utf8');
const head = html.indexOf('<head>');
if (head === -1) throw new Error('preload-fonts: no <head> in index.html');
const at = head + '<head>'.length;
fs.writeFileSync(INDEX, html.slice(0, at) + links.join('') + html.slice(at));
