import { readFileSync } from 'fs';
import { join } from 'path';
import { ART_SIZES, type HomeArtName } from '../components/HomeArt';

const ART_DIR = join(process.cwd(), 'public/illustrations/home');
const names = Object.keys(ART_SIZES) as HomeArtName[];

/** VP8X header: the alpha flag, then width and height minus one, 24 bits each. */
function readWebp(file: string) {
  const bytes = readFileSync(join(ART_DIR, file));
  const uint24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
  return {
    extended: bytes.toString('latin1', 12, 16) === 'VP8X',
    alpha: (bytes[20] & 0x10) !== 0,
    width: uint24(24) + 1,
    height: uint24(27) + 1,
  };
}

describe('home illustrations', () => {
  it.each(names)('%s has real transparency at both sizes, and the size the page declares', name => {
    const [width, height] = ART_SIZES[name];
    const oneX = readWebp(`${name}.webp`);
    const twoX = readWebp(`${name}@2x.webp`);

    expect(oneX).toEqual({ extended: true, alpha: true, width, height });
    expect(twoX.extended && twoX.alpha).toBe(true);
    expect(Math.max(twoX.width, twoX.height)).toBe(960);
    expect(twoX.width / twoX.height).toBeCloseTo(width / height, 1);
  });
});
