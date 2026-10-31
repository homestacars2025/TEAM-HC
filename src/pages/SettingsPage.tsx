import React from 'react';
import { useTranslation } from 'react-i18next';
import { CURRENCIES, CURRENCY_SYMBOLS, useCurrency, type Currency } from '../lib/CurrencyContext';
import { LANGUAGES, LANGUAGE_NAMES, useLanguage, type Language } from '../lib/LanguageContext';
import { playNotificationSound } from '../lib/notificationSound';
import { useCurrentUser } from '../contexts/CurrentUserContext';

const Row: React.FC<{ label: string; hint: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
    <div className="min-w-0">
      <div className="text-sm font-medium text-[#0f1117]">{label}</div>
      <div className="mt-0.5 text-[13px] text-gray-500">{hint}</div>
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const segmentClass = (selected: boolean) =>
  `min-h-11 cursor-pointer rounded-xl border px-4 text-sm font-medium transition-colors sm:min-h-10 ${
    selected
      ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-strong)]'
      : 'border-[var(--border-subtle)] bg-[var(--surface)] text-gray-600 hover:border-gray-300'
  }`;

const Switch: React.FC<{ label: string; checked: boolean; disabled: boolean; onChange: (next: boolean) => void }> = ({
  label, checked, disabled, onChange,
}) => (
  <button
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="flex min-h-11 cursor-pointer items-center disabled:cursor-default disabled:opacity-50"
  >
    <span className={`flex h-7 w-12 items-center rounded-full p-0.5 transition-colors ${checked ? 'justify-end bg-[var(--accent-strong)]' : 'justify-start bg-gray-300'}`}>
      <span className="size-6 rounded-full bg-white shadow-sm" />
    </span>
  </button>
);

const SettingsPage: React.FC = () => {
  const { t } = useTranslation('settings');
  const { lang, canSwitch } = useLanguage();
  const { currency } = useCurrency();
  const { settings, updateSettings } = useCurrentUser();

  return (
    <div className="flex max-w-3xl flex-col gap-6 p-4 sm:p-6 lg:p-10">
      <header>
        <h1 className="text-2xl font-semibold text-[#0f1117] sm:text-[28px]">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
      </header>

      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)]">
        {canSwitch && (
          <Row label={t('language.label')} hint={t('language.hint')}>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map((option: Language) => (
                <button
                  key={option}
                  type="button"
                  lang={option}
                  aria-pressed={lang === option}
                  onClick={() => updateSettings({ lang: option })}
                  className={segmentClass(lang === option)}
                >
                  {LANGUAGE_NAMES[option]}
                </button>
              ))}
            </div>
          </Row>
        )}

        <Row label={t('currency.label')} hint={t('currency.hint')}>
          <div className="grid grid-cols-4 gap-2">
            {CURRENCIES.map((option: Currency) => (
              <button
                key={option}
                type="button"
                aria-pressed={currency === option}
                aria-label={option}
                onClick={() => updateSettings({ currency: option })}
                className={segmentClass(currency === option)}
              >
                {CURRENCY_SYMBOLS[option]}
              </button>
            ))}
          </div>
        </Row>

        <Row label={t('sound.label')} hint={t('sound.hint')}>
          <Switch
            label={t('sound.label')}
            checked={settings?.notificationSound ?? false}
            disabled={!settings}
            onChange={next => {
              updateSettings({ notificationSound: next });
              // Turning it on is the preview, and the click unlocks audio in the browser.
              if (next) playNotificationSound();
            }}
          />
        </Row>

        <Row label={t('collapsed.label')} hint={t('collapsed.hint')}>
          <Switch
            label={t('collapsed.label')}
            checked={settings?.startCollapsed ?? false}
            disabled={!settings}
            onChange={next => updateSettings({ startCollapsed: next })}
          />
        </Row>
      </section>
    </div>
  );
};

export default SettingsPage;
