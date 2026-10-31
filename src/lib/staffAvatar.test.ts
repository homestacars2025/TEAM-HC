import fs from 'fs';
import path from 'path';
import { getDefaultStaffAvatar, getStaffAvatar } from './staffAvatar';

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

describe('staff avatars across the dashboard', () => {
  it('ships all three default images', () => {
    for (const url of [MALE, FEMALE, NEUTRAL]) {
      expect(fs.existsSync(path.join(src, '..', 'public', url))).toBe(true);
    }
  });

  it.each([
    'components/Sidebar.tsx',
    'pages/AccountingPage.tsx',
    'pages/OperationsPage.tsx',
    'pages/KabisPage.tsx',
    'pages/TasksPage.tsx',
  ])('%s renders the shared avatar and no initials', file => {
    const source = read(file);
    expect(source).toContain('<StaffAvatar');
    expect(source).not.toMatch(/\.map\(\w+ => \w+\[0\]\)/);
    expect(source).not.toMatch(/initials/i);
  });

  it('goes through the shared helper, so no screen picks its own picture', () => {
    expect(read('components/Sidebar.tsx')).not.toMatch(/src=\{[^}]*avatar_url/);
  });
});
