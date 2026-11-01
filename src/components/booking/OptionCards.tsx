import React from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_QUANTITY } from '../../lib/bookingExtras';

export type OptionArtName = 'shield-none' | 'shield-partial' | 'shield-medium' | 'shield-full' | 'child-seat' | 'extra-driver' | 'extra-km';

const ART_DIR = '/illustrations/booking';
const artSet = (name: OptionArtName) => `${ART_DIR}/${name}.webp 1x, ${ART_DIR}/${name}@2x.webp 2x`;

export const OPTION_ART: OptionArtName[] = ['shield-none', 'shield-partial', 'shield-medium', 'shield-full', 'child-seat', 'extra-driver', 'extra-km'];

/** Fetched as the form opens, so the step doesn't fill in piece by piece on arrival. */
export function preloadOptionArt(): void {
  for (const name of OPTION_ART) {
    const image = new Image();
    image.srcset = artSet(name);
  }
}

/** The options' titles say what they are, so the picture stays out of a screen reader's way. */
const OptionArt: React.FC<{ art: OptionArtName }> = ({ art }) => (
  <img src={`${ART_DIR}/${art}.webp`} srcSet={artSet(art)} alt="" width={64} height={64} decoding="async" className="hc-option-art" />
);

const OptionGlyph: React.FC<{ glyph: 'pen' | 'plus' }> = ({ glyph }) => (
  <span aria-hidden="true" className="hc-option-glyph">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {glyph === 'pen' ? <path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4zM13.5 6.5l4 4" /> : <path d="M12 5v14M5 12h14" />}
    </svg>
  </span>
);

interface OptionText {
  art?: OptionArtName;
  glyph?: 'pen' | 'plus';
  title: string;
  description: string;
}

const Picture: React.FC<Pick<OptionText, 'art' | 'glyph'>> = ({ art, glyph }) =>
  (art ? <OptionArt art={art} /> : <OptionGlyph glyph={glyph ?? 'plus'} />);

const Text: React.FC<Pick<OptionText, 'title' | 'description'>> = ({ title, description }) => (
  <span className="min-w-0 flex-1">
    <span className="block text-[14.5px] font-semibold text-[#0f1117]">{title}</span>
    <span className="mt-0.5 block text-[12.5px] leading-snug text-gray-500">{description}</span>
  </span>
);

interface RadioOptionProps extends OptionText {
  name: string;
  selected: boolean;
  onSelect: () => void;
  /** Insurance can be left blank, so pressing the chosen one lets go of it. */
  onClear: () => void;
}

export const RadioOption: React.FC<RadioOptionProps> = ({ name, selected, onSelect, onClear, art, glyph, title, description }) => (
  <label className={`hc-option ${selected ? 'is-selected' : ''}`}>
    <Picture art={art} glyph={glyph} />
    <Text title={title} description={description} />
    <input
      type="radio"
      name={name}
      className="hc-radio"
      checked={selected}
      onChange={onSelect}
      onClick={() => { if (selected) onClear(); }}
    />
  </label>
);

interface ExtraOptionProps extends OptionText {
  selected: boolean;
  /** A stepper takes more width than the card has on the smallest phones. */
  wide?: boolean;
  children: React.ReactNode;
}

export const ExtraOption: React.FC<ExtraOptionProps> = ({ selected, wide = false, art, glyph, title, description, children }) => (
  <div className={`hc-option ${selected ? 'is-selected' : ''} ${wide ? 'has-stepper' : ''}`}>
    <Picture art={art} glyph={glyph} />
    <Text title={title} description={description} />
    <div className="hc-option-control">{children}</div>
  </div>
);

export const QuantityStepper: React.FC<{ value: number; onChange: (value: number) => void; label: string }> = ({ value, onChange, label }) => {
  const { t } = useTranslation('bookings');
  return (
    <div role="group" aria-label={label} dir="ltr" className="hc-stepper-input">
      <button type="button" aria-label={t('options.fewer', { name: label })} disabled={value <= 0} onClick={() => onChange(value - 1)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={t('options.more', { name: label })} disabled={value >= MAX_QUANTITY} onClick={() => onChange(value + 1)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  );
};

export const OptionSwitch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} className="hc-switch" onClick={() => onChange(!checked)}>
    <span aria-hidden="true" />
  </button>
);
