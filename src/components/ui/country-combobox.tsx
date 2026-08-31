import * as React from 'react';
import { Popover } from '@base-ui/react/popover';
import { Command } from 'cmdk';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { COUNTRIES, getCountry, localisedCountryName } from '../../lib/countries';
import { cn } from '../../lib/utils';

interface CountryComboboxProps {
  /** ISO 3166-1 alpha-2. */
  value?: string;
  onChange?: (code: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A searchable country picker. Stores the alpha-2 code, shows "🇹🇷 Turkey".
 * Searching matches the name *and* the code, so typing "TR" works as well as
 * typing "Tur".
 */
export function CountryCombobox({
  value, onChange, placeholder, disabled, className,
}: CountryComboboxProps) {
  const { t, i18n } = useTranslation('common');
  const lang = i18n.resolvedLanguage ?? 'en';
  const [open, setOpen] = React.useState(false);
  const selected = getCountry(value);

  /**
   * Sorted in the reader's own collation. The search value keeps the English
   * name and the code alongside the localised one, so "TR", "Turkey" and
   * "تركيا" all find the same row.
   */
  const countries = React.useMemo(
    () => COUNTRIES
      .map((c) => ({ ...c, localised: localisedCountryName(lang, c.cca2, c.name) }))
      .sort((a, b) => a.localised.localeCompare(b.localised, lang)),
    [lang],
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={disabled}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3',
          'text-[13px] transition-colors outline-none',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span className={cn('truncate', selected ? 'text-foreground' : 'text-black/35')}>
          {selected
            ? `${selected.flag} ${localisedCountryName(lang, selected.cca2, selected.name)}`
            : placeholder ?? t('countryPicker.select')}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner className="z-50" sideOffset={4} align="start">
          <Popover.Popup
            className={cn(
              'media-scope w-[var(--anchor-width)] min-w-[220px] overflow-hidden rounded-lg bg-popover',
              'text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100',
              'data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95',
              'data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
            )}
          >
            <Command loop>
              <div className="border-b border-black/[0.06] px-3">
                <Command.Input
                  autoFocus
                  placeholder={t('countryPicker.search')}
                  className="h-9 w-full bg-transparent text-[13px] outline-none placeholder:text-black/30"
                />
              </div>
              <Command.List className="max-h-[240px] overflow-y-auto p-1">
                <Command.Empty className="px-3 py-4 text-center text-[12.5px] text-black/40">
                  {t('countryPicker.empty')}
                </Command.Empty>
                {countries.map((country) => (
                  <Command.Item
                    key={country.cca2}
                    value={`${country.localised} ${country.name} ${country.cca2}`}
                    onSelect={() => { onChange?.(country.cca2); setOpen(false); }}
                    className={cn(
                      'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px]',
                      'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                    )}
                  >
                    <span aria-hidden>{country.flag}</span>
                    <span className="min-w-0 flex-1 truncate">{country.localised}</span>
                    {value?.toUpperCase() === country.cca2 && <Check className="size-3.5 shrink-0" />}
                  </Command.Item>
                ))}
              </Command.List>
            </Command>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
