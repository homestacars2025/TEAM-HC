import fs from 'fs';
import path from 'path';
import { AVATAR_BACKGROUND_KEYS, getAvatarBackground, getAvatarGradient, getDefaultStaffAvatar, getStaffAvatar } from './staffAvatar';

const src = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(src, file), 'utf8');

const MALE = '/avatars/staff-male.webp';
const FEMALE = '/avatars/staff-female.webp';
const NEUTRAL = '/avatars/staff-neutral.webp';

describe('getStaffAvatar', () => {
  it('prefers the person\'s own photo over everything else', () => {
    expect(getStaffAvatar({ avatar_url: 'https://x.test/a.jpg', gender: 'female' })).toBe('https://x.test/a.jpg');
  });

  it('falls back to the default for their gender', () => {
    expect(getStaffAvatar({ avatar_url: null, gender: 'male' })).toBe(MALE);
    expect(getStaffAvatar({ gender: 'female' })).toBe(FEMALE);
  });

  it('treats a blank avatar_url as no photo', () => {
    expect(getStaffAvatar({ avatar_url: '   ', gender: 'male' })).toBe(MALE);
  });

  it('is neutral when nothing is known', () => {
    expect(getStaffAvatar({ avatar_url: null, gender: null })).toBe(NEUTRAL);
    expect(getStaffAvatar({ gender: 'other' })).toBe(NEUTRAL);
    expect(getStaffAvatar(null)).toBe(NEUTRAL);
    expect(getStaffAvatar(undefined)).toBe(NEUTRAL);
  });

  it('ignores the photo when asked for the default, which is what a dead URL falls back to', () => {
    expect(getDefaultStaffAvatar({ avatar_url: 'https://x.test/a.jpg', gender: 'female' })).toBe(FEMALE);
  });
});

describe('avatar background', () => {
  it('offers exactly the colors the database allows', () => {
    expect(AVATAR_BACKGROUND_KEYS).toEqual(['sky', 'mint', 'peach', 'lavender']);
  });

  it.each([
    ['sky', '#EAF3FD', '#CFE2F7'],
    ['mint', '#E9F8EF', '#C9EBD8'],
    ['peach', '#FDF0E7', '#F6D5BF'],
    ['lavender', '#F1ECFD', '#DCD2F6'],
  ])('%s runs from its center to its edge at the rim', (avatar_bg, center, edge) => {
    expect(getAvatarGradient({ avatar_bg })).toBe(`radial-gradient(circle closest-side, ${center}, ${edge})`);
  });

  it('is sky when there is no color or an unknown one', () => {
    expect(getAvatarBackground(null)).toBe('sky');
    expect(getAvatarBackground({ avatar_bg: null })).toBe('sky');
    expect(getAvatarBackground({ avatar_bg: 'toString' })).toBe('sky');
  });

  it.each([
    'contexts/CurrentUserContext.tsx',
    'hooks/useStaffProfiles.ts',
    'pages/KabisPage.tsx',
    'pages/OperationsPage.tsx',
  ])('%s loads the color wherever it loads the photo', file => {
    const selects = read(file).split('\n').filter(line => line.includes('avatar_url,'));
    expect(selects.length).toBeGreaterThan(0);
    for (const line of selects) expect(line).toContain('avatar_bg');
  });

  it('colors every avatar through the shared component', () => {
    const css = read('index.css');
    expect(read('components/StaffAvatar.tsx')).toContain('getAvatarGradient(profile)');
    expect(css).not.toMatch(/\.hc-avatar-bust \{ background/);
    expect(css).toMatch(/\.hc-avatar-photo \{ padding: 2px; \}/);
  });
});

describe('staff avatars across the dashboard', () => {
  it('ships all three default images', () => {
    for (const url of [MALE, FEMALE, NEUTRAL]) {
      expect(fs.existsSync(path.join(src, '..', 'public', url))).toBe(true);
    }
  });

  it.each([
    'components/AccountMenu.tsx',
    'components/accounting/CustodyTab.tsx',
    'pages/OperationsPage.tsx',
    'pages/KabisPage.tsx',
  ])('%s renders the shared avatar and no initials', file => {
    const source = read(file);
    expect(source).toContain('<StaffAvatar');
    expect(source).not.toMatch(/\.map\(\w+ => \w+\[0\]\)/);
    expect(source).not.toMatch(/initials/i);
  });

  it('goes through the shared helper, so no screen picks its own picture', () => {
    expect(read('components/AccountMenu.tsx')).not.toMatch(/src=\{[^}]*avatar_url/);
  });
});
