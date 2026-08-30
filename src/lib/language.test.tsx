import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { LanguageProvider, useLanguage } from './LanguageContext';
import { languageSwitcherEnabled, FF_LANGUAGE_SWITCHER } from './featureFlags';
import { LANG_STORAGE_KEY } from '../i18n';

/** Reports what the provider decided, so the assertions read as behaviour. */
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

const mount = () => render(<LanguageProvider><Probe /></LanguageProvider>);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = '';
});

describe('the feature flag', () => {
  test('is off until explicitly turned on', () => {
    expect(languageSwitcherEnabled()).toBe(false);
    localStorage.setItem(FF_LANGUAGE_SWITCHER, '1');
    expect(languageSwitcherEnabled()).toBe(true);
    localStorage.setItem(FF_LANGUAGE_SWITCHER, '0');
    expect(languageSwitcherEnabled()).toBe(false);
  });

  test('blocked storage reads as off rather than throwing', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    expect(languageSwitcherEnabled()).toBe(false);
    spy.mockRestore();
  });
});

describe('English stays pinned while the switcher is hidden', () => {
  test('a left-over Arabic choice does not strand anyone in RTL', () => {
    // The regression that matters: without this, a stored language from testing
    // would flip a staff member's dashboard with no visible control to undo it.
    localStorage.setItem(LANG_STORAGE_KEY, 'ar');
    mount();

    expect(screen.getByTestId('lang')).toHaveTextContent('en');
    expect(screen.getByTestId('dir')).toHaveTextContent('ltr');
    expect(screen.getByTestId('can')).toHaveTextContent('false');
    expect(document.documentElement.dir).toBe('ltr');
  });

  test('setLang is inert, so no code path can flip the language behind the flag', () => {
    mount();
    act(() => { screen.getByText('go-ar').click(); });

    expect(screen.getByTestId('lang')).toHaveTextContent('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBeNull();
  });
});

describe('with the flag on', () => {
  beforeEach(() => { localStorage.setItem(FF_LANGUAGE_SWITCHER, '1'); });

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
