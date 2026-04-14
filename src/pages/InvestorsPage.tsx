import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Investor {
  id: number;
  profile_id: string | null;
  company_name: string | null;
  total_investment: number | null;
  is_active: boolean;
  created_at: string;
  phone: string | null;
  commission_rate: number | null;
  whatsapp: string | null;
  email: string | null;
  // joined from profiles
  full_name: string | null;
  avatar_url: string | null;
}

interface EditForm {
  company_name: string;
  phone_dial: string;
  phone_number: string;
  whatsapp_dial: string;
  whatsapp_number: string;
  email: string;
  commission_rate: string;
  is_active: boolean;
}

type FilterStatus = 'all' | 'active' | 'inactive';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function getAvatarColor(id: string | number): string {
  const colors = ['#4ba6ea', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#ef4444'];
  const key = String(id);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function formatRate(rate: number | null): string {
  if (rate == null) return '—';
  return `${rate}%`;
}

// ─── Countries ────────────────────────────────────────────────────────────────

interface Country { code: string; name: string; dial: string; flag: string; }

const COUNTRIES: Country[] = [
  { code: 'TR', name: 'Turkey',                        dial: '+90',   flag: '🇹🇷' },
  { code: 'AF', name: 'Afghanistan',                   dial: '+93',   flag: '🇦🇫' },
  { code: 'AL', name: 'Albania',                       dial: '+355',  flag: '🇦🇱' },
  { code: 'DZ', name: 'Algeria',                       dial: '+213',  flag: '🇩🇿' },
  { code: 'AD', name: 'Andorra',                       dial: '+376',  flag: '🇦🇩' },
  { code: 'AO', name: 'Angola',                        dial: '+244',  flag: '🇦🇴' },
  { code: 'AG', name: 'Antigua and Barbuda',           dial: '+1268', flag: '🇦🇬' },
  { code: 'AR', name: 'Argentina',                     dial: '+54',   flag: '🇦🇷' },
  { code: 'AM', name: 'Armenia',                       dial: '+374',  flag: '🇦🇲' },
  { code: 'AU', name: 'Australia',                     dial: '+61',   flag: '🇦🇺' },
  { code: 'AT', name: 'Austria',                       dial: '+43',   flag: '🇦🇹' },
  { code: 'AZ', name: 'Azerbaijan',                    dial: '+994',  flag: '🇦🇿' },
  { code: 'BS', name: 'Bahamas',                       dial: '+1242', flag: '🇧🇸' },
  { code: 'BH', name: 'Bahrain',                       dial: '+973',  flag: '🇧🇭' },
  { code: 'BD', name: 'Bangladesh',                    dial: '+880',  flag: '🇧🇩' },
  { code: 'BB', name: 'Barbados',                      dial: '+1246', flag: '🇧🇧' },
  { code: 'BY', name: 'Belarus',                       dial: '+375',  flag: '🇧🇾' },
  { code: 'BE', name: 'Belgium',                       dial: '+32',   flag: '🇧🇪' },
  { code: 'BZ', name: 'Belize',                        dial: '+501',  flag: '🇧🇿' },
  { code: 'BJ', name: 'Benin',                         dial: '+229',  flag: '🇧🇯' },
  { code: 'BT', name: 'Bhutan',                        dial: '+975',  flag: '🇧🇹' },
  { code: 'BO', name: 'Bolivia',                       dial: '+591',  flag: '🇧🇴' },
  { code: 'BA', name: 'Bosnia and Herzegovina',        dial: '+387',  flag: '🇧🇦' },
  { code: 'BW', name: 'Botswana',                      dial: '+267',  flag: '🇧🇼' },
  { code: 'BR', name: 'Brazil',                        dial: '+55',   flag: '🇧🇷' },
  { code: 'BN', name: 'Brunei',                        dial: '+673',  flag: '🇧🇳' },
  { code: 'BG', name: 'Bulgaria',                      dial: '+359',  flag: '🇧🇬' },
  { code: 'BF', name: 'Burkina Faso',                  dial: '+226',  flag: '🇧🇫' },
  { code: 'BI', name: 'Burundi',                       dial: '+257',  flag: '🇧🇮' },
  { code: 'CV', name: 'Cabo Verde',                    dial: '+238',  flag: '🇨🇻' },
  { code: 'KH', name: 'Cambodia',                      dial: '+855',  flag: '🇰🇭' },
  { code: 'CM', name: 'Cameroon',                      dial: '+237',  flag: '🇨🇲' },
  { code: 'CA', name: 'Canada',                        dial: '+1',    flag: '🇨🇦' },
  { code: 'CF', name: 'Central African Republic',      dial: '+236',  flag: '🇨🇫' },
  { code: 'TD', name: 'Chad',                          dial: '+235',  flag: '🇹🇩' },
  { code: 'CL', name: 'Chile',                         dial: '+56',   flag: '🇨🇱' },
  { code: 'CN', name: 'China',                         dial: '+86',   flag: '🇨🇳' },
  { code: 'CO', name: 'Colombia',                      dial: '+57',   flag: '🇨🇴' },
  { code: 'KM', name: 'Comoros',                       dial: '+269',  flag: '🇰🇲' },
  { code: 'CG', name: 'Congo',                         dial: '+242',  flag: '🇨🇬' },
  { code: 'CD', name: 'Congo (DRC)',                   dial: '+243',  flag: '🇨🇩' },
  { code: 'CR', name: 'Costa Rica',                    dial: '+506',  flag: '🇨🇷' },
  { code: 'HR', name: 'Croatia',                       dial: '+385',  flag: '🇭🇷' },
  { code: 'CU', name: 'Cuba',                          dial: '+53',   flag: '🇨🇺' },
  { code: 'CY', name: 'Cyprus',                        dial: '+357',  flag: '🇨🇾' },
  { code: 'CZ', name: 'Czech Republic',                dial: '+420',  flag: '🇨🇿' },
  { code: 'DK', name: 'Denmark',                       dial: '+45',   flag: '🇩🇰' },
  { code: 'DJ', name: 'Djibouti',                      dial: '+253',  flag: '🇩🇯' },
  { code: 'DM', name: 'Dominica',                      dial: '+1767', flag: '🇩🇲' },
  { code: 'DO', name: 'Dominican Republic',            dial: '+1809', flag: '🇩🇴' },
  { code: 'EC', name: 'Ecuador',                       dial: '+593',  flag: '🇪🇨' },
  { code: 'EG', name: 'Egypt',                         dial: '+20',   flag: '🇪🇬' },
  { code: 'SV', name: 'El Salvador',                   dial: '+503',  flag: '🇸🇻' },
  { code: 'GQ', name: 'Equatorial Guinea',             dial: '+240',  flag: '🇬🇶' },
  { code: 'ER', name: 'Eritrea',                       dial: '+291',  flag: '🇪🇷' },
  { code: 'EE', name: 'Estonia',                       dial: '+372',  flag: '🇪🇪' },
  { code: 'SZ', name: 'Eswatini',                      dial: '+268',  flag: '🇸🇿' },
  { code: 'ET', name: 'Ethiopia',                      dial: '+251',  flag: '🇪🇹' },
  { code: 'FJ', name: 'Fiji',                          dial: '+679',  flag: '🇫🇯' },
  { code: 'FI', name: 'Finland',                       dial: '+358',  flag: '🇫🇮' },
  { code: 'FR', name: 'France',                        dial: '+33',   flag: '🇫🇷' },
  { code: 'GA', name: 'Gabon',                         dial: '+241',  flag: '🇬🇦' },
  { code: 'GM', name: 'Gambia',                        dial: '+220',  flag: '🇬🇲' },
  { code: 'GE', name: 'Georgia',                       dial: '+995',  flag: '🇬🇪' },
  { code: 'DE', name: 'Germany',                       dial: '+49',   flag: '🇩🇪' },
  { code: 'GH', name: 'Ghana',                         dial: '+233',  flag: '🇬🇭' },
  { code: 'GR', name: 'Greece',                        dial: '+30',   flag: '🇬🇷' },
  { code: 'GD', name: 'Grenada',                       dial: '+1473', flag: '🇬🇩' },
  { code: 'GT', name: 'Guatemala',                     dial: '+502',  flag: '🇬🇹' },
  { code: 'GN', name: 'Guinea',                        dial: '+224',  flag: '🇬🇳' },
  { code: 'GW', name: 'Guinea-Bissau',                 dial: '+245',  flag: '🇬🇼' },
  { code: 'GY', name: 'Guyana',                        dial: '+592',  flag: '🇬🇾' },
  { code: 'HT', name: 'Haiti',                         dial: '+509',  flag: '🇭🇹' },
  { code: 'HN', name: 'Honduras',                      dial: '+504',  flag: '🇭🇳' },
  { code: 'HU', name: 'Hungary',                       dial: '+36',   flag: '🇭🇺' },
  { code: 'IS', name: 'Iceland',                       dial: '+354',  flag: '🇮🇸' },
  { code: 'IN', name: 'India',                         dial: '+91',   flag: '🇮🇳' },
  { code: 'ID', name: 'Indonesia',                     dial: '+62',   flag: '🇮🇩' },
  { code: 'IR', name: 'Iran',                          dial: '+98',   flag: '🇮🇷' },
  { code: 'IQ', name: 'Iraq',                          dial: '+964',  flag: '🇮🇶' },
  { code: 'IE', name: 'Ireland',                       dial: '+353',  flag: '🇮🇪' },
  { code: 'IL', name: 'Israel',                        dial: '+972',  flag: '🇮🇱' },
  { code: 'IT', name: 'Italy',                         dial: '+39',   flag: '🇮🇹' },
  { code: 'JM', name: 'Jamaica',                       dial: '+1876', flag: '🇯🇲' },
  { code: 'JP', name: 'Japan',                         dial: '+81',   flag: '🇯🇵' },
  { code: 'JO', name: 'Jordan',                        dial: '+962',  flag: '🇯🇴' },
  { code: 'KZ', name: 'Kazakhstan',                    dial: '+7',    flag: '🇰🇿' },
  { code: 'KE', name: 'Kenya',                         dial: '+254',  flag: '🇰🇪' },
  { code: 'KI', name: 'Kiribati',                      dial: '+686',  flag: '🇰🇮' },
  { code: 'KW', name: 'Kuwait',                        dial: '+965',  flag: '🇰🇼' },
  { code: 'KG', name: 'Kyrgyzstan',                    dial: '+996',  flag: '🇰🇬' },
  { code: 'LA', name: 'Laos',                          dial: '+856',  flag: '🇱🇦' },
  { code: 'LV', name: 'Latvia',                        dial: '+371',  flag: '🇱🇻' },
  { code: 'LB', name: 'Lebanon',                       dial: '+961',  flag: '🇱🇧' },
  { code: 'LS', name: 'Lesotho',                       dial: '+266',  flag: '🇱🇸' },
  { code: 'LR', name: 'Liberia',                       dial: '+231',  flag: '🇱🇷' },
  { code: 'LY', name: 'Libya',                         dial: '+218',  flag: '🇱🇾' },
  { code: 'LI', name: 'Liechtenstein',                 dial: '+423',  flag: '🇱🇮' },
  { code: 'LT', name: 'Lithuania',                     dial: '+370',  flag: '🇱🇹' },
  { code: 'LU', name: 'Luxembourg',                    dial: '+352',  flag: '🇱🇺' },
  { code: 'MG', name: 'Madagascar',                    dial: '+261',  flag: '🇲🇬' },
  { code: 'MW', name: 'Malawi',                        dial: '+265',  flag: '🇲🇼' },
  { code: 'MY', name: 'Malaysia',                      dial: '+60',   flag: '🇲🇾' },
  { code: 'MV', name: 'Maldives',                      dial: '+960',  flag: '🇲🇻' },
  { code: 'ML', name: 'Mali',                          dial: '+223',  flag: '🇲🇱' },
  { code: 'MT', name: 'Malta',                         dial: '+356',  flag: '🇲🇹' },
  { code: 'MH', name: 'Marshall Islands',              dial: '+692',  flag: '🇲🇭' },
  { code: 'MR', name: 'Mauritania',                    dial: '+222',  flag: '🇲🇷' },
  { code: 'MU', name: 'Mauritius',                     dial: '+230',  flag: '🇲🇺' },
  { code: 'MX', name: 'Mexico',                        dial: '+52',   flag: '🇲🇽' },
  { code: 'FM', name: 'Micronesia',                    dial: '+691',  flag: '🇫🇲' },
  { code: 'MD', name: 'Moldova',                       dial: '+373',  flag: '🇲🇩' },
  { code: 'MC', name: 'Monaco',                        dial: '+377',  flag: '🇲🇨' },
  { code: 'MN', name: 'Mongolia',                      dial: '+976',  flag: '🇲🇳' },
  { code: 'ME', name: 'Montenegro',                    dial: '+382',  flag: '🇲🇪' },
  { code: 'MA', name: 'Morocco',                       dial: '+212',  flag: '🇲🇦' },
  { code: 'MZ', name: 'Mozambique',                    dial: '+258',  flag: '🇲🇿' },
  { code: 'MM', name: 'Myanmar',                       dial: '+95',   flag: '🇲🇲' },
  { code: 'NA', name: 'Namibia',                       dial: '+264',  flag: '🇳🇦' },
  { code: 'NR', name: 'Nauru',                         dial: '+674',  flag: '🇳🇷' },
  { code: 'NP', name: 'Nepal',                         dial: '+977',  flag: '🇳🇵' },
  { code: 'NL', name: 'Netherlands',                   dial: '+31',   flag: '🇳🇱' },
  { code: 'NZ', name: 'New Zealand',                   dial: '+64',   flag: '🇳🇿' },
  { code: 'NI', name: 'Nicaragua',                     dial: '+505',  flag: '🇳🇮' },
  { code: 'NE', name: 'Niger',                         dial: '+227',  flag: '🇳🇪' },
  { code: 'NG', name: 'Nigeria',                       dial: '+234',  flag: '🇳🇬' },
  { code: 'KP', name: 'North Korea',                   dial: '+850',  flag: '🇰🇵' },
  { code: 'MK', name: 'North Macedonia',               dial: '+389',  flag: '🇲🇰' },
  { code: 'NO', name: 'Norway',                        dial: '+47',   flag: '🇳🇴' },
  { code: 'OM', name: 'Oman',                          dial: '+968',  flag: '🇴🇲' },
  { code: 'PK', name: 'Pakistan',                      dial: '+92',   flag: '🇵🇰' },
  { code: 'PW', name: 'Palau',                         dial: '+680',  flag: '🇵🇼' },
  { code: 'PA', name: 'Panama',                        dial: '+507',  flag: '🇵🇦' },
  { code: 'PG', name: 'Papua New Guinea',              dial: '+675',  flag: '🇵🇬' },
  { code: 'PY', name: 'Paraguay',                      dial: '+595',  flag: '🇵🇾' },
  { code: 'PE', name: 'Peru',                          dial: '+51',   flag: '🇵🇪' },
  { code: 'PH', name: 'Philippines',                   dial: '+63',   flag: '🇵🇭' },
  { code: 'PL', name: 'Poland',                        dial: '+48',   flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal',                      dial: '+351',  flag: '🇵🇹' },
  { code: 'QA', name: 'Qatar',                         dial: '+974',  flag: '🇶🇦' },
  { code: 'RO', name: 'Romania',                       dial: '+40',   flag: '🇷🇴' },
  { code: 'RU', name: 'Russia',                        dial: '+7',    flag: '🇷🇺' },
  { code: 'RW', name: 'Rwanda',                        dial: '+250',  flag: '🇷🇼' },
  { code: 'KN', name: 'Saint Kitts and Nevis',         dial: '+1869', flag: '🇰🇳' },
  { code: 'LC', name: 'Saint Lucia',                   dial: '+1758', flag: '🇱🇨' },
  { code: 'VC', name: 'Saint Vincent and Grenadines',  dial: '+1784', flag: '🇻🇨' },
  { code: 'WS', name: 'Samoa',                         dial: '+685',  flag: '🇼🇸' },
  { code: 'SM', name: 'San Marino',                    dial: '+378',  flag: '🇸🇲' },
  { code: 'ST', name: 'Sao Tome and Principe',         dial: '+239',  flag: '🇸🇹' },
  { code: 'SA', name: 'Saudi Arabia',                  dial: '+966',  flag: '🇸🇦' },
  { code: 'SN', name: 'Senegal',                       dial: '+221',  flag: '🇸🇳' },
  { code: 'RS', name: 'Serbia',                        dial: '+381',  flag: '🇷🇸' },
  { code: 'SC', name: 'Seychelles',                    dial: '+248',  flag: '🇸🇨' },
  { code: 'SL', name: 'Sierra Leone',                  dial: '+232',  flag: '🇸🇱' },
  { code: 'SG', name: 'Singapore',                     dial: '+65',   flag: '🇸🇬' },
  { code: 'SK', name: 'Slovakia',                      dial: '+421',  flag: '🇸🇰' },
  { code: 'SI', name: 'Slovenia',                      dial: '+386',  flag: '🇸🇮' },
  { code: 'SB', name: 'Solomon Islands',               dial: '+677',  flag: '🇸🇧' },
  { code: 'SO', name: 'Somalia',                       dial: '+252',  flag: '🇸🇴' },
  { code: 'ZA', name: 'South Africa',                  dial: '+27',   flag: '🇿🇦' },
  { code: 'KR', name: 'South Korea',                   dial: '+82',   flag: '🇰🇷' },
  { code: 'SS', name: 'South Sudan',                   dial: '+211',  flag: '🇸🇸' },
  { code: 'ES', name: 'Spain',                         dial: '+34',   flag: '🇪🇸' },
  { code: 'LK', name: 'Sri Lanka',                     dial: '+94',   flag: '🇱🇰' },
  { code: 'SD', name: 'Sudan',                         dial: '+249',  flag: '🇸🇩' },
  { code: 'SR', name: 'Suriname',                      dial: '+597',  flag: '🇸🇷' },
  { code: 'SE', name: 'Sweden',                        dial: '+46',   flag: '🇸🇪' },
  { code: 'CH', name: 'Switzerland',                   dial: '+41',   flag: '🇨🇭' },
  { code: 'SY', name: 'Syria',                         dial: '+963',  flag: '🇸🇾' },
  { code: 'TW', name: 'Taiwan',                        dial: '+886',  flag: '🇹🇼' },
  { code: 'TJ', name: 'Tajikistan',                    dial: '+992',  flag: '🇹🇯' },
  { code: 'TZ', name: 'Tanzania',                      dial: '+255',  flag: '🇹🇿' },
  { code: 'TH', name: 'Thailand',                      dial: '+66',   flag: '🇹🇭' },
  { code: 'TL', name: 'Timor-Leste',                   dial: '+670',  flag: '🇹🇱' },
  { code: 'TG', name: 'Togo',                          dial: '+228',  flag: '🇹🇬' },
  { code: 'TO', name: 'Tonga',                         dial: '+676',  flag: '🇹🇴' },
  { code: 'TT', name: 'Trinidad and Tobago',           dial: '+1868', flag: '🇹🇹' },
  { code: 'TN', name: 'Tunisia',                       dial: '+216',  flag: '🇹🇳' },
  { code: 'TM', name: 'Turkmenistan',                  dial: '+993',  flag: '🇹🇲' },
  { code: 'TV', name: 'Tuvalu',                        dial: '+688',  flag: '🇹🇻' },
  { code: 'UG', name: 'Uganda',                        dial: '+256',  flag: '🇺🇬' },
  { code: 'UA', name: 'Ukraine',                       dial: '+380',  flag: '🇺🇦' },
  { code: 'AE', name: 'United Arab Emirates',          dial: '+971',  flag: '🇦🇪' },
  { code: 'GB', name: 'United Kingdom',                dial: '+44',   flag: '🇬🇧' },
  { code: 'US', name: 'United States',                 dial: '+1',    flag: '🇺🇸' },
  { code: 'UY', name: 'Uruguay',                       dial: '+598',  flag: '🇺🇾' },
  { code: 'UZ', name: 'Uzbekistan',                    dial: '+998',  flag: '🇺🇿' },
  { code: 'VU', name: 'Vanuatu',                       dial: '+678',  flag: '🇻🇺' },
  { code: 'VE', name: 'Venezuela',                     dial: '+58',   flag: '🇻🇪' },
  { code: 'VN', name: 'Vietnam',                       dial: '+84',   flag: '🇻🇳' },
  { code: 'YE', name: 'Yemen',                         dial: '+967',  flag: '🇾🇪' },
  { code: 'ZM', name: 'Zambia',                        dial: '+260',  flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabwe',                      dial: '+263',  flag: '🇿🇼' },
];

// Sort by dial length descending for greedy prefix matching
const COUNTRIES_BY_DIAL_LEN = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

function parsePhone(stored: string | null): { dial: string; number: string } {
  if (!stored) return { dial: '+90', number: '' };
  const s = stored.trim();
  if (!s.startsWith('+')) return { dial: '+90', number: s };
  for (const c of COUNTRIES_BY_DIAL_LEN) {
    if (s.startsWith(c.dial)) {
      return { dial: c.dial, number: s.slice(c.dial.length) };
    }
  }
  return { dial: '+90', number: s };
}

// ─── PhoneInput ───────────────────────────────────────────────────────────────

interface PhoneInputProps {
  dial: string;
  number: string;
  onDialChange: (dial: string) => void;
  onNumberChange: (number: string) => void;
  placeholder?: string;
}

const PhoneInput: React.FC<PhoneInputProps> = ({ dial, number, onDialChange, onNumberChange, placeholder = '' }) => {
  const [open,    setOpen]    = useState(false);
  const [search,  setSearch]  = useState('');
  const [focused, setFocused] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; left: number } | null>(null);

  const triggerRef  = useRef<HTMLButtonElement>(null);
  const searchRef   = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find(c => c.dial === dial) ?? COUNTRIES[0];

  const filteredCountries = search.trim()
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.dial.includes(search)
      )
    : COUNTRIES;

  const openDropdown = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropPos({ top: rect.bottom + 4, left: rect.left });
    setSearch('');
    setOpen(true);
    setTimeout(() => searchRef.current?.focus(), 40);
  };

  const selectCountry = (c: Country) => {
    onDialChange(c.dial);
    setOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const borderColor = focused || open ? '#4ba6ea' : '#e5e7eb';

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      border: `1.5px solid ${borderColor}`,
      borderRadius: 8, background: '#fff',
      transition: 'border-color 150ms ease',
      overflow: 'hidden',
    }}>
      {/* Country selector trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '0 10px', height: 38, flexShrink: 0,
          background: '#f9fafb', border: 'none',
          borderRight: `1px solid ${borderColor}`,
          cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 13, color: '#374151', fontWeight: 500,
          transition: 'border-color 150ms ease',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{selected.flag}</span>
        <span>{selected.dial}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ color: '#9ca3af', marginLeft: 1 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Number input */}
      <input
        type="tel"
        value={number}
        onChange={e => onNumberChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1, height: 38, padding: '0 12px',
          fontSize: 14, color: '#0f1117',
          background: '#fff', border: 'none', outline: 'none',
          fontFamily: 'inherit', minWidth: 0,
        }}
      />

      {/* Dropdown portal */}
      {open && dropPos && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            width: 300,
            zIndex: 3000,
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 12px 40px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}
        >
          {/* Search */}
          <div style={{ padding: '10px 10px 6px' }}>
            <div style={{ position: 'relative' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{
                position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
                color: '#9ca3af', pointerEvents: 'none',
              }}>
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search country or code…"
                style={{
                  width: '100%', height: 34, paddingLeft: 28, paddingRight: 10,
                  fontSize: 13, color: '#0f1117',
                  background: '#f3f4f6', border: '1px solid transparent',
                  borderRadius: 7, outline: 'none', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; (e.target as HTMLInputElement).style.background = '#fff'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'transparent'; (e.target as HTMLInputElement).style.background = '#f3f4f6'; }}
              />
            </div>
          </div>

          {/* Country list */}
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: '0 6px 6px' }}>
            {filteredCountries.length === 0 ? (
              <div style={{ padding: '16px 10px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
                No countries found
              </div>
            ) : filteredCountries.map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => selectCountry(c)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                  padding: '7px 10px', border: 'none', borderRadius: 7,
                  background: c.dial === dial ? 'rgba(75,166,234,0.08)' : 'none',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  transition: 'background 80ms ease',
                }}
                onMouseEnter={e => {
                  if (c.dial !== dial) (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6';
                }}
                onMouseLeave={e => {
                  if (c.dial !== dial) (e.currentTarget as HTMLButtonElement).style.background = 'none';
                }}
              >
                <span style={{ fontSize: 17, lineHeight: 1, flexShrink: 0 }}>{c.flag}</span>
                <span style={{ flex: 1, fontSize: 13, color: '#374151', fontWeight: 450 }}>{c.name}</span>
                <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>{c.dial}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

// Toast
interface ToastState { message: string; type: 'success' | 'error'; }
const Toast: React.FC<ToastState> = ({ message, type }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: type === 'success' ? '#0f1117' : '#ef4444',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'slideUpIn 200ms ease',
    }}>
      {type === 'success'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="12" r="9" stroke="#4ade80" strokeWidth="1.8" /></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8" /><path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="1.8" strokeLinecap="round" /></svg>
      }
      {message}
    </div>,
    document.body,
  );

// Toggle switch
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}> = ({ checked, onChange, disabled = false }) => (
  <button
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={e => { e.stopPropagation(); onChange(); }}
    style={{
      width: 36, height: 20, borderRadius: 10, border: 'none',
      background: checked ? '#22c55e' : '#d1d5db',
      cursor: disabled ? 'not-allowed' : 'pointer',
      position: 'relative', padding: 0, flexShrink: 0,
      transition: 'background 200ms ease',
      opacity: disabled ? 0.6 : 1,
    }}
  >
    <span style={{
      position: 'absolute', top: 2, left: checked ? 18 : 2,
      width: 16, height: 16, borderRadius: 8, background: '#fff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.20)',
      transition: 'left 200ms ease',
      display: 'block',
    }} />
  </button>
);

// Table header cell
const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ children, style, ...rest }) => (
  <th style={{
    padding: '9px 12px', fontSize: 11, fontWeight: 700,
    color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px',
    textAlign: 'left', background: '#fff',
    borderBottom: '1.5px solid #f0f0f0',
    position: 'sticky', top: 0, zIndex: 1,
    whiteSpace: 'nowrap', userSelect: 'none',
    ...style,
  }} {...rest}>
    {children}
  </th>
);

// Skeleton row
const SkeletonRow: React.FC = () => (
  <tr>
    {[160, 130, 60, 110, 110, 160, 60, 40].map((w, i) => (
      <td key={i} style={{ padding: '13px 12px' }}>
        <div style={{ height: 13, width: w, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </td>
    ))}
  </tr>
);

// Avatar
const Avatar: React.FC<{ investor: Investor; size?: number }> = ({ investor, size = 34 }) => {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(investor.full_name);
  const color = getAvatarColor(investor.profile_id ?? investor.id);

  if (investor.avatar_url && !imgError) {
    return (
      <img
        src={investor.avatar_url}
        alt={investor.full_name ?? ''}
        onError={() => setImgError(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: size * 0.33, fontWeight: 700, color: '#fff', lineHeight: 1, userSelect: 'none' }}>
        {initials}
      </span>
    </div>
  );
};

// Field style
const FIELD_STYLE: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px',
  fontSize: 14, color: '#0f1117',
  background: '#fff', border: '1.5px solid #e5e7eb',
  borderRadius: 8, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', transition: 'border-color 150ms ease',
};

// ─── Dots menu ────────────────────────────────────────────────────────────────

const DotsMenu: React.FC<{ onEdit: () => void }> = ({ onEdit }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          width: 30, height: 30, borderRadius: 7, border: 'none',
          background: open ? '#f3f4f6' : 'transparent',
          color: open ? '#374151' : '#9ca3af',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 140ms ease', flexShrink: 0,
        }}
        onMouseEnter={e => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6';
            (e.currentTarget as HTMLButtonElement).style.color = '#374151';
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af';
          }
        }}
        title="More actions"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="5" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="19" r="1.5" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50,
          background: '#fff', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
          padding: '4px', minWidth: 130,
          animation: 'slideUpIn 120ms ease',
        }}>
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onEdit(); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 10px', borderRadius: 7, border: 'none',
              background: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 500, color: '#374151', textAlign: 'left',
              transition: 'background 100ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Edit
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Edit Investor Modal ──────────────────────────────────────────────────────

interface EditModalProps {
  investor: Investor;
  onClose: () => void;
  onSaved: () => void;
}

const EditInvestorModal: React.FC<EditModalProps> = ({ investor, onClose, onSaved }) => {
  const parsedPhone    = parsePhone(investor.phone);
  const parsedWhatsApp = parsePhone(investor.whatsapp);

  const [form, setForm] = useState<EditForm>({
    company_name:    investor.company_name    ?? '',
    phone_dial:      parsedPhone.dial,
    phone_number:    parsedPhone.number,
    whatsapp_dial:   parsedWhatsApp.dial,
    whatsapp_number: parsedWhatsApp.number,
    email:           investor.email           ?? '',
    commission_rate: investor.commission_rate != null ? String(investor.commission_rate) : '',
    is_active:       investor.is_active,
  });
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    const rate = form.commission_rate.trim() !== ''
      ? parseFloat(form.commission_rate)
      : null;

    if (rate !== null && (isNaN(rate) || rate < 0 || rate > 100)) {
      setFormError('Commission rate must be a number between 0 and 100.');
      setSaving(false);
      return;
    }

    const phone    = form.phone_number.trim()
      ? `${form.phone_dial}${form.phone_number.trim()}`
      : null;
    const whatsapp = form.whatsapp_number.trim()
      ? `${form.whatsapp_dial}${form.whatsapp_number.trim()}`
      : null;

    const { error } = await supabase
      .from('investors')
      .update({
        company_name:    form.company_name.trim() || null,
        phone,
        whatsapp,
        email:           form.email.trim()        || null,
        commission_rate: rate,
        is_active:       form.is_active,
      })
      .eq('id', investor.id);

    setSaving(false);
    if (error) { setFormError(error.message); return; }
    onSaved();
    onClose();
  };

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, animation: 'fadeIn 150ms ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 520,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
        animation: 'slideUp 180ms ease',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>
              Edit Investor
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              {investor.full_name ?? investor.company_name ?? 'Investor'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#e5e7eb'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>

            {/* Company Name — full width */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.1px' }}>
                Company Name
              </label>
              <input
                type="text"
                value={form.company_name}
                onChange={e => set('company_name', e.target.value)}
                placeholder="e.g. Acme Ventures"
                style={FIELD_STYLE}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
              />
            </div>

            {/* Phone */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.1px' }}>
                Phone
              </label>
              <PhoneInput
                dial={form.phone_dial}
                number={form.phone_number}
                onDialChange={d => set('phone_dial', d)}
                onNumberChange={n => set('phone_number', n)}
                placeholder="555 000 0000"
              />
            </div>

            {/* WhatsApp */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.1px' }}>
                WhatsApp
              </label>
              <PhoneInput
                dial={form.whatsapp_dial}
                number={form.whatsapp_number}
                onDialChange={d => set('whatsapp_dial', d)}
                onNumberChange={n => set('whatsapp_number', n)}
                placeholder="555 000 0000"
              />
            </div>

            {/* Email — full width */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.1px' }}>
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="investor@example.com"
                style={FIELD_STYLE}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
              />
            </div>

            {/* Commission Rate */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.1px' }}>
                Commission Rate (%)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.commission_rate}
                  onChange={e => set('commission_rate', e.target.value)}
                  placeholder="0"
                  style={{ ...FIELD_STYLE, paddingRight: 32 }}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
                />
                <span style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 14, color: '#9ca3af', fontWeight: 500, pointerEvents: 'none',
                }}>%</span>
              </div>
            </div>

            {/* Is Active */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 2 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, letterSpacing: '0.1px' }}>
                Status
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 40 }}>
                <ToggleSwitch
                  checked={form.is_active}
                  onChange={() => set('is_active', !form.is_active)}
                />
                <span style={{ fontSize: 13, color: form.is_active ? '#22c55e' : '#9ca3af', fontWeight: 500 }}>
                  {form.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          {/* Error */}
          {formError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginTop: 16, padding: '10px 14px',
              background: '#fef2f2', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8" /><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>
              <span style={{ fontSize: 13, color: '#ef4444' }}>{formError}</span>
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 18, borderTop: '1px solid #f3f4f6' }}>
            <button
              type="button" onClick={onClose}
              style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#9ca3af'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: saving ? '#a8d4f5' : '#4ba6ea', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 150ms ease' }}
              onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4'; }}
              onMouseLeave={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; }}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const InvestorsPage: React.FC = () => {
  const [investors,    setInvestors]    = useState<Investor[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [editing,      setEditing]      = useState<Investor | null>(null);
  const [toggling,     setToggling]     = useState<Set<number>>(new Set());
  const [toast,        setToast]        = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const fetchInvestors = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('investors')
      .select(`
        id, profile_id, company_name, total_investment, is_active,
        created_at, phone, commission_rate, whatsapp, email,
        profiles!fk_investor_profile ( full_name, avatar_url )
      `)
      .order('created_at', { ascending: false });

    if (err) { setError(err.message); setLoading(false); return; }

    const rows: Investor[] = (data ?? []).map((row: {
      id: number;
      profile_id: string | null;
      company_name: string | null;
      total_investment: number | null;
      is_active: boolean;
      created_at: string;
      phone: string | null;
      commission_rate: number | null;
      whatsapp: string | null;
      email: string | null;
      profiles: { full_name: string | null; avatar_url: string | null } | { full_name: string | null; avatar_url: string | null }[] | null;
    }) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id:               row.id,
        profile_id:       row.profile_id,
        company_name:     row.company_name,
        total_investment: row.total_investment,
        is_active:        row.is_active,
        created_at:       row.created_at,
        phone:            row.phone,
        commission_rate:  row.commission_rate,
        whatsapp:         row.whatsapp,
        email:            row.email,
        full_name:        profile?.full_name  ?? null,
        avatar_url:       profile?.avatar_url ?? null,
      };
    });

    setInvestors(rows);
    setLoading(false);
  }, []);

  useEffect(() => { fetchInvestors(); }, [fetchInvestors]);

  const handleToggle = useCallback(async (investor: Investor) => {
    if (toggling.has(investor.id)) return;
    setToggling(prev => new Set(prev).add(investor.id));

    const newVal = !investor.is_active;

    // Optimistic update
    setInvestors(prev =>
      prev.map(inv => inv.id === investor.id ? { ...inv, is_active: newVal } : inv)
    );

    const { error } = await supabase
      .from('investors')
      .update({ is_active: newVal })
      .eq('id', investor.id);

    setToggling(prev => { const s = new Set(prev); s.delete(investor.id); return s; });

    if (error) {
      // Revert on failure
      setInvestors(prev =>
        prev.map(inv => inv.id === investor.id ? { ...inv, is_active: investor.is_active } : inv)
      );
      showToast('Failed to update status.', 'error');
    } else {
      showToast(newVal ? 'Investor marked as active.' : 'Investor marked as inactive.', 'success');
    }
  }, [toggling, showToast]);

  // Filtered list
  const filtered = investors.filter(inv => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || (inv.full_name    ?? '').toLowerCase().includes(q)
      || (inv.company_name ?? '').toLowerCase().includes(q)
      || (inv.email        ?? '').toLowerCase().includes(q);
    const matchStatus =
      filterStatus === 'all'
        ? true
        : filterStatus === 'active'
          ? inv.is_active
          : !inv.is_active;
    return matchSearch && matchStatus;
  });

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>
      <style>{`
        @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideUpIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp   { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
        .inv-row:hover { background: rgba(75,166,234,0.03) !important; }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Management
          </span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.8px', margin: 0 }}>
          Investors
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
          Manage investor accounts and commission rates
        </p>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 12, padding: '12px 16px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#ef4444',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8" /><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        background: '#fff', borderRadius: 14, padding: '14px 18px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0',
        marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 160 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: '#9ca3af', pointerEvents: 'none',
          }}>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, company, or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', height: 38, paddingLeft: 34, paddingRight: 12,
              fontSize: 13, color: '#0f1117', background: '#f9fafb',
              border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 150ms ease',
            }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
            onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
          />
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as FilterStatus)}
          style={{
            height: 38, padding: '0 12px', fontSize: 13, color: '#374151',
            background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 9,
            outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
          }}
          onFocus={e => { (e.target as HTMLSelectElement).style.borderColor = '#4ba6ea'; }}
          onBlur={e => { (e.target as HTMLSelectElement).style.borderColor = '#e5e7eb'; }}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: 13, color: '#9ca3af', whiteSpace: 'nowrap' }}>
          {loading ? '…' : `${filtered.length} investor${filtered.length !== 1 ? 's' : ''}`}
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: '#fff', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr>
                <Th>Investor Name</Th>
                <Th>Company Name</Th>
                <Th>Status</Th>
                <Th>Phone</Th>
                <Th>WhatsApp</Th>
                <Th>Email</Th>
                <Th style={{ textAlign: 'right' }}>Commission</Th>
                <Th style={{ textAlign: 'right' }}>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '52px 24px', textAlign: 'center' }}>
                        <div style={{ fontSize: 14, color: '#9ca3af' }}>
                          {search || filterStatus !== 'all'
                            ? 'No investors match your search.'
                            : 'No investors found.'}
                        </div>
                      </td>
                    </tr>
                  )
                  : filtered.map((inv, idx) => (
                    <tr
                      key={inv.id}
                      className="inv-row"
                      style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', transition: 'background 100ms ease' }}
                    >
                      {/* Investor Name */}
                      <td style={{ padding: '11px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar investor={inv} size={34} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f1117' }}>
                            {inv.full_name || <span style={{ color: '#9ca3af', fontWeight: 400 }}>—</span>}
                          </span>
                        </div>
                      </td>

                      {/* Company Name */}
                      <td style={{ padding: '11px 12px' }}>
                        <span style={{ fontSize: 13, color: '#374151' }}>
                          {inv.company_name || <span style={{ color: '#d1d5db' }}>—</span>}
                        </span>
                      </td>

                      {/* Status toggle */}
                      <td style={{ padding: '11px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ToggleSwitch
                            checked={inv.is_active}
                            onChange={() => handleToggle(inv)}
                            disabled={toggling.has(inv.id)}
                          />
                          <span style={{
                            fontSize: 12, fontWeight: 600,
                            color: inv.is_active ? '#22c55e' : '#9ca3af',
                          }}>
                            {inv.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </td>

                      {/* Phone */}
                      <td style={{ padding: '11px 12px' }}>
                        {inv.phone ? (
                          <a
                            href={`tel:${inv.phone.replace(/\s/g, '')}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: '#374151', fontSize: 13 }}
                            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#4ba6ea'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#374151'; }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#9ca3af' }}>
                              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.63 19.79 19.79 0 01.12 2.18 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {inv.phone}
                          </a>
                        ) : (
                          <span style={{ color: '#d1d5db', fontSize: 13 }}>—</span>
                        )}
                      </td>

                      {/* WhatsApp */}
                      <td style={{ padding: '11px 12px' }}>
                        {inv.whatsapp ? (
                          <a
                            href={`https://wa.me/${inv.whatsapp.replace(/[\s+\-()]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: '#374151', fontSize: 13 }}
                            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#22c55e'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#374151'; }}
                          >
                            {/* WhatsApp icon */}
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#25D366' }}>
                              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {inv.whatsapp}
                          </a>
                        ) : (
                          <span style={{ color: '#d1d5db', fontSize: 13 }}>—</span>
                        )}
                      </td>

                      {/* Email */}
                      <td style={{ padding: '11px 12px' }}>
                        {inv.email ? (
                          <a
                            href={`mailto:${inv.email}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: '#374151', fontSize: 13 }}
                            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#4ba6ea'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#374151'; }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: '#9ca3af' }}>
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M22 6l-10 7L2 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {inv.email}
                          </a>
                        ) : (
                          <span style={{ color: '#d1d5db', fontSize: 13 }}>—</span>
                        )}
                      </td>

                      {/* Commission Rate */}
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        {inv.commission_rate != null ? (
                          <span style={{
                            display: 'inline-block',
                            background: 'rgba(75,166,234,0.1)', borderRadius: 6,
                            padding: '2px 8px', fontSize: 12, fontWeight: 700,
                            color: '#4ba6ea', letterSpacing: '0.1px',
                          }}>
                            {formatRate(inv.commission_rate)}
                          </span>
                        ) : (
                          <span style={{ color: '#d1d5db', fontSize: 13 }}>—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        <DotsMenu onEdit={() => setEditing(inv)} />
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        {!loading && filtered.length > 0 && (
          <div style={{
            padding: '12px 18px', borderTop: '1px solid #f5f5f5',
            fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>{filtered.length} of {investors.length} investors</span>
            {filterStatus !== 'all' && (
              <button
                onClick={() => setFilterStatus('all')}
                style={{ background: 'none', border: 'none', color: '#4ba6ea', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <EditInvestorModal
          investor={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            fetchInvestors();
            showToast('Investor updated successfully.', 'success');
          }}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
};

export default InvestorsPage;
