import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDateLocale } from '../../hooks/useDateLocale';
import { formatSignalTime, relativeSignal, signalTone } from '../../lib/tracking';

export const TRACK_ICONS = {
  distance: <path d="M4 20c0-4 3-5 8-5s8-1 8-5-3-6-8-6M12 4l-3-2M12 4L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  moved: <path d="M4 15l5-5 4 4 7-8M15 6h5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  idle: <path d="M9 6v12M15 6v12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  moving: <path d="M12 3l7.5 18L12 17l-7.5 4L12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  ignition: <path d="M12 3v8M7 6.5a8 8 0 1010 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
};

/** Whole numbers with the same digits in both languages. */
export function useKm() {
  const locale = useDateLocale();
  return (value: number) => value.toLocaleString(locale);
}

/** When a car was last heard from, colored by how long ago that is. */
export const SignalAge: React.FC<{ iso: string | null; at: number; relative: boolean }> = ({ iso, at, relative }) => {
  const { t } = useTranslation('tracking');
  const locale = useDateLocale();
  const tone = signalTone(iso, at);
  if (!iso) return <span className={`hc-trk-signal is-${tone}`}>{t('signal.never')}</span>;
  const exact = formatSignalTime(iso, locale);
  return (
    <span className={`hc-trk-signal is-${tone}`} title={exact}>
      {relative ? relativeSignal(iso, at, locale) ?? t('signal.now') : exact}
    </span>
  );
};
