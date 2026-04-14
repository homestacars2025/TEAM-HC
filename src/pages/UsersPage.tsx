import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRole   = 'customer' | 'staff' | 'admin' | 'investor';
type UserStatus = 'pending'  | 'active' | 'blocked' | 'inactive';

interface UserProfile {
  id: string;
  created_at: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  nationality: string | null;
  birth_date: string | null;
  identity_number: string | null;
  address: string | null;
  avatar_url: string | null;
}

interface EditForm {
  full_name: string;
  email: string;
  new_password: string;
  phone_dial: string;
  phone_number: string;
  role: UserRole;
  status: UserStatus;
  nationality: string;
  birth_date: string;
  identity_number: string;
  address: string;
  avatar_file: File | null;
  avatar_preview: string | null;
}

// ─── Country dial codes ───────────────────────────────────────────────────────

interface Country { code: string; name: string; dial: string; flag: string; }

const COUNTRIES: Country[] = [
  { code: 'TR', name: 'Turkey',               dial: '+90',  flag: '🇹🇷' },
  { code: 'US', name: 'United States',        dial: '+1',   flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom',       dial: '+44',  flag: '🇬🇧' },
  { code: 'DE', name: 'Germany',              dial: '+49',  flag: '🇩🇪' },
  { code: 'FR', name: 'France',               dial: '+33',  flag: '🇫🇷' },
  { code: 'IT', name: 'Italy',                dial: '+39',  flag: '🇮🇹' },
  { code: 'ES', name: 'Spain',                dial: '+34',  flag: '🇪🇸' },
  { code: 'NL', name: 'Netherlands',          dial: '+31',  flag: '🇳🇱' },
  { code: 'BE', name: 'Belgium',              dial: '+32',  flag: '🇧🇪' },
  { code: 'CH', name: 'Switzerland',          dial: '+41',  flag: '🇨🇭' },
  { code: 'AT', name: 'Austria',              dial: '+43',  flag: '🇦🇹' },
  { code: 'PL', name: 'Poland',               dial: '+48',  flag: '🇵🇱' },
  { code: 'RU', name: 'Russia',               dial: '+7',   flag: '🇷🇺' },
  { code: 'UA', name: 'Ukraine',              dial: '+380', flag: '🇺🇦' },
  { code: 'GR', name: 'Greece',               dial: '+30',  flag: '🇬🇷' },
  { code: 'RO', name: 'Romania',              dial: '+40',  flag: '🇷🇴' },
  { code: 'BG', name: 'Bulgaria',             dial: '+359', flag: '🇧🇬' },
  { code: 'HR', name: 'Croatia',              dial: '+385', flag: '🇭🇷' },
  { code: 'RS', name: 'Serbia',               dial: '+381', flag: '🇷🇸' },
  { code: 'SE', name: 'Sweden',               dial: '+46',  flag: '🇸🇪' },
  { code: 'NO', name: 'Norway',               dial: '+47',  flag: '🇳🇴' },
  { code: 'DK', name: 'Denmark',              dial: '+45',  flag: '🇩🇰' },
  { code: 'FI', name: 'Finland',              dial: '+358', flag: '🇫🇮' },
  { code: 'SA', name: 'Saudi Arabia',         dial: '+966', flag: '🇸🇦' },
  { code: 'AE', name: 'UAE',                  dial: '+971', flag: '🇦🇪' },
  { code: 'QA', name: 'Qatar',                dial: '+974', flag: '🇶🇦' },
  { code: 'KW', name: 'Kuwait',               dial: '+965', flag: '🇰🇼' },
  { code: 'BH', name: 'Bahrain',              dial: '+973', flag: '🇧🇭' },
  { code: 'OM', name: 'Oman',                 dial: '+968', flag: '🇴🇲' },
  { code: 'IQ', name: 'Iraq',                 dial: '+964', flag: '🇮🇶' },
  { code: 'IR', name: 'Iran',                 dial: '+98',  flag: '🇮🇷' },
  { code: 'SY', name: 'Syria',                dial: '+963', flag: '🇸🇾' },
  { code: 'JO', name: 'Jordan',               dial: '+962', flag: '🇯🇴' },
  { code: 'LB', name: 'Lebanon',              dial: '+961', flag: '🇱🇧' },
  { code: 'EG', name: 'Egypt',                dial: '+20',  flag: '🇪🇬' },
  { code: 'MA', name: 'Morocco',              dial: '+212', flag: '🇲🇦' },
  { code: 'DZ', name: 'Algeria',              dial: '+213', flag: '🇩🇿' },
  { code: 'TN', name: 'Tunisia',              dial: '+216', flag: '🇹🇳' },
  { code: 'LY', name: 'Libya',                dial: '+218', flag: '🇱🇾' },
  { code: 'PK', name: 'Pakistan',             dial: '+92',  flag: '🇵🇰' },
  { code: 'IN', name: 'India',                dial: '+91',  flag: '🇮🇳' },
  { code: 'BD', name: 'Bangladesh',           dial: '+880', flag: '🇧🇩' },
  { code: 'AF', name: 'Afghanistan',          dial: '+93',  flag: '🇦🇫' },
  { code: 'AZ', name: 'Azerbaijan',           dial: '+994', flag: '🇦🇿' },
  { code: 'KZ', name: 'Kazakhstan',           dial: '+7',   flag: '🇰🇿' },
  { code: 'UZ', name: 'Uzbekistan',           dial: '+998', flag: '🇺🇿' },
  { code: 'TM', name: 'Turkmenistan',         dial: '+993', flag: '🇹🇲' },
  { code: 'GE', name: 'Georgia',              dial: '+995', flag: '🇬🇪' },
  { code: 'AM', name: 'Armenia',              dial: '+374', flag: '🇦🇲' },
  { code: 'CN', name: 'China',                dial: '+86',  flag: '🇨🇳' },
  { code: 'JP', name: 'Japan',                dial: '+81',  flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea',          dial: '+82',  flag: '🇰🇷' },
  { code: 'AU', name: 'Australia',            dial: '+61',  flag: '🇦🇺' },
  { code: 'CA', name: 'Canada',               dial: '+1',   flag: '🇨🇦' },
  { code: 'BR', name: 'Brazil',               dial: '+55',  flag: '🇧🇷' },
  { code: 'MX', name: 'Mexico',               dial: '+52',  flag: '🇲🇽' },
  { code: 'AR', name: 'Argentina',            dial: '+54',  flag: '🇦🇷' },
  { code: 'ZA', name: 'South Africa',         dial: '+27',  flag: '🇿🇦' },
  { code: 'NG', name: 'Nigeria',              dial: '+234', flag: '🇳🇬' },
  { code: 'KE', name: 'Kenya',                dial: '+254', flag: '🇰🇪' },
  { code: 'GH', name: 'Ghana',                dial: '+233', flag: '🇬🇭' },
  { code: 'ET', name: 'Ethiopia',             dial: '+251', flag: '🇪🇹' },
  { code: 'TZ', name: 'Tanzania',             dial: '+255', flag: '🇹🇿' },
  { code: 'NZ', name: 'New Zealand',          dial: '+64',  flag: '🇳🇿' },
  { code: 'SG', name: 'Singapore',            dial: '+65',  flag: '🇸🇬' },
  { code: 'MY', name: 'Malaysia',             dial: '+60',  flag: '🇲🇾' },
  { code: 'ID', name: 'Indonesia',            dial: '+62',  flag: '🇮🇩' },
  { code: 'TH', name: 'Thailand',             dial: '+66',  flag: '🇹🇭' },
  { code: 'VN', name: 'Vietnam',              dial: '+84',  flag: '🇻🇳' },
  { code: 'PH', name: 'Philippines',          dial: '+63',  flag: '🇵🇭' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(s: string): string {
  const d = new Date(s);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function getAvatarColor(id: string): string {
  const colors = ['#4ba6ea', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#ef4444'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Parse phone: try to split dial code from stored phone string
function parsePhone(phone: string | null): { dial: string; number: string } {
  if (!phone) return { dial: '+90', number: '' };
  const country = COUNTRIES.find(c => phone.startsWith(c.dial + ' ') || phone.startsWith(c.dial));
  if (country) {
    const num = phone.startsWith(country.dial + ' ')
      ? phone.slice(country.dial.length + 1)
      : phone.slice(country.dial.length);
    return { dial: country.dial, number: num };
  }
  return { dial: '+90', number: phone };
}

// ─── Badge configs ────────────────────────────────────────────────────────────

const ROLE_CFG: Record<UserRole, { label: string; color: string; bg: string }> = {
  admin:    { label: 'Admin',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  staff:    { label: 'Staff',    color: '#4ba6ea', bg: 'rgba(75,166,234,0.12)'  },
  investor: { label: 'Investor', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  customer: { label: 'Customer', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
};

const STATUS_CFG: Record<UserStatus, { label: string; color: string; bg: string }> = {
  active:   { label: 'Active',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  pending:  { label: 'Pending',  color: '#eab308', bg: 'rgba(234,179,8,0.12)'   },
  blocked:  { label: 'Blocked',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  inactive: { label: 'Inactive', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
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

// Role badge
const RoleBadge: React.FC<{ role: UserRole }> = ({ role }) => {
  const cfg = ROLE_CFG[role];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700,
      color: cfg.color, background: cfg.bg,
      borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
};

// Status badge
const StatusBadge: React.FC<{ status: UserStatus }> = ({ status }) => {
  const cfg = STATUS_CFG[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700,
      color: cfg.color, background: cfg.bg,
      borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
};

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

// Action icon button
const ActionBtn: React.FC<{
  onClick: () => void;
  title: string;
  hoverColor: string;
  children: React.ReactNode;
}> = ({ onClick, title, hoverColor, children }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 30, height: 30, borderRadius: 7, border: 'none',
        background: hovered ? `${hoverColor}18` : 'transparent',
        color: hovered ? hoverColor : '#9ca3af',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 140ms ease', flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
};

// Avatar
const Avatar: React.FC<{ user: UserProfile; size?: number }> = ({ user, size = 32 }) => {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(user.full_name);
  const color = getAvatarColor(user.id);

  if (user.avatar_url && !imgError) {
    return (
      <img
        src={user.avatar_url}
        alt={user.full_name ?? ''}
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
      <span style={{ fontSize: size * 0.35, fontWeight: 700, color: '#fff', lineHeight: 1, userSelect: 'none' }}>
        {initials}
      </span>
    </div>
  );
};

// Skeleton row
const SkeletonRow: React.FC = () => (
  <tr>
    {[180, 160, 80, 80, 90, 60].map((w, i) => (
      <td key={i} style={{ padding: '12px 12px' }}>
        <div style={{ height: 13, width: w, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </td>
    ))}
  </tr>
);

// Field style
const FIELD_STYLE: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px',
  fontSize: 14, color: '#0f1117',
  background: '#fff', border: '1.5px solid #e5e7eb',
  borderRadius: 8, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', transition: 'border-color 150ms ease',
};

// ─── Edit User Modal ──────────────────────────────────────────────────────────

interface EditModalProps {
  user: UserProfile;
  onClose: () => void;
  onSaved: () => void;
}

const EditUserModal: React.FC<EditModalProps> = ({ user, onClose, onSaved }) => {
  const parsed = parsePhone(user.phone);

  const [form, setForm] = useState<EditForm>({
    full_name:       user.full_name       ?? '',
    email:           user.email           ?? '',
    new_password:    '',
    phone_dial:      parsed.dial,
    phone_number:    parsed.number,
    role:            user.role,
    status:          user.status,
    nationality:     user.nationality     ?? '',
    birth_date:      user.birth_date      ?? '',
    identity_number: user.identity_number ?? '',
    address:         user.address         ?? '',
    avatar_file:     null,
    avatar_preview:  user.avatar_url,
  });

  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pwVisible, setPwVisible] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Image must be under 5 MB.');
      return;
    }
    const preview = URL.createObjectURL(file);
    setForm(f => ({ ...f, avatar_file: file, avatar_preview: preview }));
  };

  const handleGeneratePassword = () => {
    const pw = generatePassword();
    set('new_password', pw);
    setPwVisible(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) {
      setFormError('Full name and email are required.');
      return;
    }
    setFormError(null);
    setSaving(true);

    try {
      // 1. Upload avatar if changed
      let avatar_url = user.avatar_url;
      if (form.avatar_file) {
        const ext  = form.avatar_file.name.split('.').pop();
        const path = `${user.id}/avatar.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(path, form.avatar_file, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        avatar_url = urlData.publicUrl;
      }

      // 2. Update profile row
      const phone = form.phone_number.trim()
        ? `${form.phone_dial} ${form.phone_number.trim()}`
        : null;

      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          full_name:       form.full_name.trim()       || null,
          email:           form.email.trim()           || null,
          phone,
          role:            form.role,
          status:          form.status,
          nationality:     form.nationality.trim()     || null,
          birth_date:      form.birth_date             || null,
          identity_number: form.identity_number.trim() || null,
          address:         form.address.trim()         || null,
          avatar_url,
        })
        .eq('id', user.id);

      if (profileErr) throw profileErr;

      // 3. Update password via admin API (requires service role key)
      if (form.new_password.trim()) {
        const serviceKey = process.env.REACT_APP_SUPABASE_SERVICE_KEY;
        const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
        if (serviceKey) {
          const adminClient = createClient(supabaseUrl, serviceKey);
          const { error: pwErr } = await adminClient.auth.admin.updateUserById(
            user.id,
            { password: form.new_password.trim() },
          );
          if (pwErr) throw pwErr;
        } else {
          // Fallback: update own password only works for current user
          const { error: pwErr } = await supabase.auth.updateUser({
            password: form.new_password.trim(),
          });
          if (pwErr) throw pwErr;
        }
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save changes.');
      setSaving(false);
    }
  };

  const dialCountry = COUNTRIES.find(c => c.dial === form.phone_dial) ?? COUNTRIES[0];

  return ReactDOM.createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, animation: 'fadeIn 150ms ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 600,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
        animation: 'slideUp 180ms ease',
      }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>
                Edit User
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                Update profile details and access settings
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
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* ── Avatar section ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 18,
            padding: '16px 18px', background: '#f9fafb', borderRadius: 12,
            border: '1px solid #f0f0f0', marginBottom: 20,
          }}>
            {/* Circle preview */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {form.avatar_preview ? (
                <img
                  src={form.avatar_preview}
                  alt=""
                  style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e5e7eb' }}
                />
              ) : (
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: getAvatarColor(user.id),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid #e5e7eb',
                }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                    {getInitials(form.full_name || user.full_name)}
                  </span>
                </div>
              )}
            </div>

            {/* Upload info */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1117', marginBottom: 4 }}>
                Profile Photo
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
                JPG, PNG or WebP · Max 5 MB
              </div>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                style={{
                  height: 32, padding: '0 14px', borderRadius: 8,
                  border: '1.5px solid #e5e7eb', background: '#fff',
                  fontSize: 12, fontWeight: 600, color: '#374151',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'border-color 140ms ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; (e.currentTarget as HTMLButtonElement).style.color = '#4ba6ea'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Upload Photo
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handleAvatarChange}
              />
            </div>
          </div>

          {/* ── Form error ── */}
          {formError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 16, padding: '10px 14px',
              background: '#fef2f2', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8" /><path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" /></svg>
              <span style={{ fontSize: 13, color: '#ef4444' }}>{formError}</span>
            </div>
          )}

          {/* ── Fields grid ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>

            {/* Email — full width */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                Email <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="email" required
                value={form.email}
                onChange={e => set('email', e.target.value)}
                style={FIELD_STYLE}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
              />
            </div>

            {/* New Password — full width */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                New Password
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type={pwVisible ? 'text' : 'password'}
                    value={form.new_password}
                    onChange={e => set('new_password', e.target.value)}
                    placeholder="Leave blank to keep current password"
                    style={{ ...FIELD_STYLE, paddingRight: 40 }}
                    onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                    onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setPwVisible(v => !v)}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0,
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    {pwVisible
                      ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M1 1l22 22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                      : <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" /></svg>
                    }
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  style={{
                    height: 40, padding: '0 14px', borderRadius: 8, flexShrink: 0,
                    border: '1.5px solid #e5e7eb', background: '#fff',
                    fontSize: 13, fontWeight: 600, color: '#374151',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 140ms ease', whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; (e.currentTarget as HTMLButtonElement).style.color = '#4ba6ea'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; }}
                >
                  Generate
                </button>
              </div>
              <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 5, lineHeight: 1.4 }}>
                Only fill this if you want to change the password
              </p>
            </div>

            {/* Full Name */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                Full Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text" required
                value={form.full_name}
                onChange={e => set('full_name', e.target.value)}
                style={FIELD_STYLE}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
              />
            </div>

            {/* Phone with country code */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                Phone
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Dial code selector */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <select
                    value={form.phone_dial}
                    onChange={e => set('phone_dial', e.target.value)}
                    style={{
                      height: 40, padding: '0 28px 0 10px',
                      fontSize: 13, color: '#0f1117',
                      background: '#fff', border: '1.5px solid #e5e7eb',
                      borderRadius: 8, outline: 'none', fontFamily: 'inherit',
                      cursor: 'pointer', appearance: 'none', minWidth: 90,
                      transition: 'border-color 150ms ease',
                    }}
                    onFocus={e => { (e.target as HTMLSelectElement).style.borderColor = '#4ba6ea'; }}
                    onBlur={e => { (e.target as HTMLSelectElement).style.borderColor = '#e5e7eb'; }}
                  >
                    {COUNTRIES.map(c => (
                      <option key={c.code} value={c.dial}>
                        {c.flag} {c.dial}
                      </option>
                    ))}
                  </select>
                  {/* Chevron */}
                  <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none"
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#9ca3af' }}
                  >
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                {/* Number input */}
                <input
                  type="tel"
                  value={form.phone_number}
                  onChange={e => set('phone_number', e.target.value)}
                  placeholder={`${dialCountry.flag} ${form.phone_dial} …`}
                  style={{ ...FIELD_STYLE, flex: 1 }}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
                />
              </div>
            </div>

            {/* Role */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                Role
              </label>
              <select
                value={form.role}
                onChange={e => set('role', e.target.value as UserRole)}
                style={{ ...FIELD_STYLE, cursor: 'pointer' }}
                onFocus={e => { (e.target as HTMLSelectElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLSelectElement).style.borderColor = '#e5e7eb'; }}
              >
                <option value="customer">Customer</option>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
                <option value="investor">Investor</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                Status
              </label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value as UserStatus)}
                style={{ ...FIELD_STYLE, cursor: 'pointer' }}
                onFocus={e => { (e.target as HTMLSelectElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLSelectElement).style.borderColor = '#e5e7eb'; }}
              >
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="blocked">Blocked</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Nationality */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                Nationality
              </label>
              <input
                type="text"
                value={form.nationality}
                onChange={e => set('nationality', e.target.value)}
                placeholder="e.g. Turkish"
                style={FIELD_STYLE}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
              />
            </div>

            {/* Birth Date */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                Birth Date
              </label>
              <input
                type="date"
                value={form.birth_date}
                onChange={e => set('birth_date', e.target.value)}
                style={FIELD_STYLE}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
              />
            </div>

            {/* Identity Number */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                Identity Number
              </label>
              <input
                type="text"
                value={form.identity_number}
                onChange={e => set('identity_number', e.target.value)}
                placeholder="TC / Passport number"
                style={FIELD_STYLE}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
              />
            </div>

            {/* Address — full width */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
                Address
              </label>
              <input
                type="text"
                value={form.address}
                onChange={e => set('address', e.target.value)}
                placeholder="Street, City, Country"
                style={FIELD_STYLE}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
              />
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            marginTop: 24, paddingTop: 18, borderTop: '1px solid #f3f4f6',
          }}>
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

const UsersPage: React.FC = () => {
  const [users,   setUsers]   = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState('');
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [toast,   setToast]   = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, created_at, full_name, email, phone, role, status, nationality, birth_date, identity_number, address, avatar_url')
      .order('created_at', { ascending: false });

    if (err) { setError(err.message); setLoading(false); return; }
    setUsers((data as UserProfile[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q
      || (u.full_name ?? '').toLowerCase().includes(q)
      || (u.email ?? '').toLowerCase().includes(q);
  });

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>
      <style>{`
        @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideUpIn{ from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
        .user-row:hover { background: rgba(75,166,234,0.03) !important; }
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
          Users
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
          Manage user profiles and access
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
        marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: '#9ca3af', pointerEvents: 'none',
          }}>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search by name or email…"
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

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: 13, color: '#9ca3af', whiteSpace: 'nowrap' }}>
          {loading ? '…' : `${filtered.length} user${filtered.length !== 1 ? 's' : ''}`}
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: '#fff', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Created At</Th>
                <Th style={{ textAlign: 'right' }}>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '52px 24px', textAlign: 'center' }}>
                        <div style={{ fontSize: 14, color: '#9ca3af' }}>
                          {search ? 'No users match your search.' : 'No users found.'}
                        </div>
                      </td>
                    </tr>
                  )
                  : filtered.map((user, idx) => (
                    <tr
                      key={user.id}
                      className="user-row"
                      style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', transition: 'background 100ms ease' }}
                    >
                      {/* Name + Avatar */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar user={user} size={34} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1117', lineHeight: 1.3 }}>
                              {user.full_name || <span style={{ color: '#9ca3af', fontWeight: 400 }}>—</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 13, color: '#374151' }}>{user.email || '—'}</span>
                      </td>

                      {/* Role */}
                      <td style={{ padding: '10px 12px' }}>
                        <RoleBadge role={user.role} />
                      </td>

                      {/* Status */}
                      <td style={{ padding: '10px 12px' }}>
                        <StatusBadge status={user.status} />
                      </td>

                      {/* Created At */}
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>
                          {formatDateTime(user.created_at)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <ActionBtn onClick={() => setEditing(user)} title="Edit user" hoverColor="#4ba6ea">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </ActionBtn>
                        </div>
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
            fontSize: 12, color: '#9ca3af',
          }}>
            {filtered.length} of {users.length} users
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            fetchUsers();
            showToast('User updated successfully.', 'success');
          }}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
};

export default UsersPage;
