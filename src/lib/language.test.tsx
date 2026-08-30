import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider, useLanguage } from './LanguageContext';
import { languageSwitcherEnabled } from './featureFlags';
import { LANG_STORAGE_KEY } from '../i18n';

/**
 * The switcher is released, so `languageSwitcherEnabled` is now true for
 * everyone. The gate it drives still exists and still matters — it is what any
 * future flag would reuse — so it is exercised through a mock rather than by
 * reaching for a localStorage value that no longer changes the answer.
 */
jest.mock('./featureFlags', () => ({
  ...jest.requireActual('./featureFlags'),
  languageSwitcherEnabled: jest.fn(() => true),
}));

const mockEnabled = languageSwitcherEnabled as jest.MockedFunction<typeof languageSwitcherEnabled>;

const Probe: React.FC = () => {
  const { lang, dir, canSwitch, setLang } = useLanguage();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="dir">{dir}</span>
      <span data-testid="can">{String(canSwitch)}</span>
      <button onClick={() => setLang('ar')}>go-ar</button>
    </div>
  );
};

/** The provider reads the route, so every mount needs one. */
const mount = (path = '/dashboard/cars') => render(
  <MemoryRouter initialEntries={[path]}>
    <LanguageProvider><Probe /></LanguageProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = '';
  mockEnabled.mockReturnValue(true);
});

// Restores any spy even when the assertion that follows it throws — without
// this, one failure silently breaks every test after it in the file.
afterEach(() => { jest.restoreAllMocks(); });

describe('the released flag', () => {
  test('is on for everyone, with no opt-in needed', () => {
    const real = jest.requireActual('./featureFlags').languageSwitcherEnabled;
    expect(real()).toBe(true);
  });

  test('does not depend on storage, so private mode still gets the switcher', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    const real = jest.requireActual('./featureFlags').languageSwitcherEnabled;
    expect(real()).toBe(true);
  });
});

describe('normal use', () => {
  test('defaults to English when nothing is stored', () => {
    mount();
    expect(screen.getByTestId('lang')).toHaveTextContent('en');
    expect(screen.getByTestId('can')).toHaveTextContent('true');
    expect(document.documentElement.dir).toBe('ltr');
  });

  test('honours a stored Arabic choice and writes it onto <html>', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'ar');
    mount();

    expect(screen.getByTestId('dir')).toHaveTextContent('rtl');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  test('switching persists, so the choice survives a reload', () => {
    mount();
    act(() => { screen.getByText('go-ar').click(); });

    expect(screen.getByTestId('dir')).toHaveTextContent('rtl');
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('ar');
  });

  test('a junk stored value falls back to English', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'klingon');
    mount();
    expect(screen.getByTestId('lang')).toHaveTextContent('en');
  });
});

describe('the gate, when a language is not on offer', () => {
  beforeEach(() => { mockEnabled.mockReturnValue(false); });

  test('a stored choice cannot strand anyone in a language they cannot leave', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'ar');
    mount();

    expect(screen.getByTestId('lang')).toHaveTextContent('en');
    expect(screen.getByTestId('dir')).toHaveTextContent('ltr');
    expect(screen.getByTestId('can')).toHaveTextContent('false');
    expect(document.documentElement.dir).toBe('ltr');
  });

  test('setLang is inert, so no code path can get around the gate', () => {
    mount();
    act(() => { screen.getByText('go-ar').click(); });

    expect(screen.getByTestId('lang')).toHaveTextContent('en');
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBeNull();
  });
});

describe('pre-auth routes', () => {
  test('the login page stays English even with Arabic stored', () => {
    // There is no language control before signing in, so honouring the stored
    // choice here would strand the user in RTL with no way to change it back.
    localStorage.setItem(LANG_STORAGE_KEY, 'ar');
    mount('/login');

    expect(screen.getByTestId('lang')).toHaveTextContent('en');
    expect(screen.getByTestId('dir')).toHaveTextContent('ltr');
    expect(document.documentElement.dir).toBe('ltr');
  });

  test('the stored choice survives, so signing in comes back in Arabic', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'ar');
    mount('/login');
    // Suspended for the route, never cleared.
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('ar');

    mount('/dashboard/cars');
    expect(screen.getAllByTestId('dir')[1]).toHaveTextContent('rtl');
  });
});
