/**
 * Country display, without shipping a country database.
 *
 * `Intl.DisplayNames` already knows every region name the browser can render, and
 * a flag emoji is just the two letters of the code shifted into the regional
 * indicator block — so the whole feature is a list of codes plus two small
 * functions, rather than a megabyte of JSON.
 */

const ALPHA2 =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO ' +
  'FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE ' +
  'JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO ' +
  'MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW ' +
  'PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM ' +
  'TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW';

export interface Country {
  cca2: string;
  name: string;
  flag: string;
}

const displayNames: Intl.DisplayNames | null = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

/** `"TR"` → `"🇹🇷"`. Regional indicators sit 0x1F1A5 above the ASCII letters. */
function flagOf(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map((c) => c.charCodeAt(0) + 0x1f1a5),
  );
}

function nameOf(code: string): string {
  try {
    return displayNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Resolves an alpha-2 code. Returns null for anything that is not one. */
export function getCountry(code: string | null | undefined): Country | null {
  const value = code?.trim();
  if (!value || !/^[A-Za-z]{2}$/.test(value)) return null;
  const cca2 = value.toUpperCase();
  return { cca2, name: nameOf(cca2), flag: flagOf(cca2) };
}

/**
 * `"TR"` → `"🇹🇷 Turkey"`. A value that is not an alpha-2 code (older free-text
 * rows, say) is returned as typed rather than swallowed.
 */
export function formatCountry(code: string | null | undefined): string {
  const country = getCountry(code);
  if (!country) return code?.trim() ?? '';
  return `${country.flag} ${country.name}`;
}

/** Every alpha-2 country, sorted by display name — the combobox's option list. */
export const COUNTRIES: Country[] = ALPHA2.split(/\s+/)
  .filter(Boolean)
  .map((cca2) => ({ cca2, name: nameOf(cca2), flag: flagOf(cca2) }))
  .sort((a, b) => a.name.localeCompare(b.name));


// ─── Localised region names ───────────────────────────────────────────────────

/**
 * A country's name in the reader's language.
 *
 * Arabic comes from `Intl.DisplayNames` rather than a translated list — the
 * browser already ships every region name, so there is no 200-entry file to
 * write or keep current.
 *
 * English deliberately does *not* go through Intl. The picker in Bookings
 * carries its own English names, and Intl disagrees with several of them
 * ("Congo - Kinshasa" for "Congo (DRC)"), so routing English through here would
 * quietly reword the list. `fallback` is that existing English name, used
 * whenever the locale is English or the lookup fails.
 */
const localisedCache = new Map<string, Intl.DisplayNames | null>();

function displayNamesFor(locale: string): Intl.DisplayNames | null {
  const cached = localisedCache.get(locale);
  if (cached !== undefined) return cached;
  let made: Intl.DisplayNames | null = null;
  try {
    made = new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    made = null;
  }
  localisedCache.set(locale, made);
  return made;
}

export function localisedCountryName(
  locale: string,
  code: string,
  fallback: string,
): string {
  if (!locale.startsWith('ar')) return fallback;
  if (!/^[A-Za-z]{2}$/.test(code)) return fallback;
  try {
    return displayNamesFor(locale)?.of(code.toUpperCase()) ?? fallback;
  } catch {
    return fallback;
  }
}
