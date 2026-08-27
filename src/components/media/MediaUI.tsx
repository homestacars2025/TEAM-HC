import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import type { MediaTaxonomyItem, TaxonomyMap } from '../../types/media';

/**
 * Shared building blocks for the Media pages. Kept in one file for the same reason
 * the pages are single-file: the section owns its own look, and splitting six tiny
 * presentational pieces across six files would only add imports.
 */

// ─── Tokens ───────────────────────────────────────────────────────────────────

export const BRAND = '#4ba6ea';
export const BRAND_DARK = '#2e8fd4';
export const INK = '#0f1117';
export const MUTED = '#9ca3af';
export const BODY = '#6b7280';
export const LINE = '#ebebeb';

/** Figures stay column-aligned across rows. */
export const NUM: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

export const INPUT_STYLE: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 12px',
  fontSize: 14, color: INK,
  background: '#fff', border: '1.5px solid #e5e7eb',
  borderRadius: 9, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', transition: 'border-color 150ms ease',
};

export const TEXTAREA_STYLE: React.CSSProperties = {
  ...INPUT_STYLE, height: 'auto', padding: '10px 12px',
  resize: 'vertical', lineHeight: 1.6,
};

type AnyFocusEvent = React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

export const onFocus = (e: AnyFocusEvent) => { (e.target as HTMLElement).style.borderColor = BRAND; };
export const onBlur = (e: AnyFocusEvent) => { (e.target as HTMLElement).style.borderColor = '#e5e7eb'; };

export const dash = (v: string | null | undefined): string => (v?.trim() ? (v as string).trim() : '—');

// ─── Colour helpers ───────────────────────────────────────────────────────────

/** Badge colours come from the database as pastels, so text needs its own darker ink. */
function toRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return Number.isNaN(n) ? [107, 114, 128] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function tint(hex: string | null | undefined, alpha: number): string {
  const [r, g, b] = toRgb(hex || '#9ca3af');
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Pulls a pastel toward black until it reads cleanly on a light chip. */
export function ink(hex: string | null | undefined, factor = 0.45): string {
  const [r, g, b] = toRgb(hex || '#9ca3af');
  const f = (c: number) => Math.round(c * factor);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ─── Badges ───────────────────────────────────────────────────────────────────

export const Badge: React.FC<{
  label: string;
  color?: string | null;
  dot?: boolean;
  title?: string;
  size?: 'sm' | 'md';
}> = ({ label, color, dot = false, title, size = 'md' }) => (
  <span
    title={title}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: size === 'sm' ? '2px 8px' : '3px 10px',
      borderRadius: 20,
      fontSize: size === 'sm' ? 11 : 12,
      fontWeight: 700,
      color: ink(color),
      background: tint(color, 0.22),
      border: `1px solid ${tint(color, 0.45)}`,
      whiteSpace: 'nowrap',
      lineHeight: 1.5,
    }}
  >
    {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: ink(color, 0.7), flexShrink: 0 }} />}
    {label}
  </span>
);

/** Resolves a goal/format key through its taxonomy map; unknown keys still render. */
export const TaxonomyBadge: React.FC<{
  itemKey: string | null | undefined;
  map: TaxonomyMap;
  dot?: boolean;
  size?: 'sm' | 'md';
}> = ({ itemKey, map, dot, size }) => {
  if (!itemKey) return null;
  const item: MediaTaxonomyItem | undefined = map.get(itemKey);
  return <Badge label={item?.label ?? itemKey} color={item?.color} dot={dot} size={size} />;
};

/**
 * `posted` and `is_approved` are admin-only — the server rejects staff writes — so
 * they are shown as state, never as a control someone can click and fail at.
 */
export const FlagBadge: React.FC<{
  on: boolean;
  onLabel: string;
  offLabel: string;
  tone: 'green' | 'blue';
}> = ({ on, onLabel, offLabel, tone }) => {
  const active = tone === 'green'
    ? { color: '#15803d', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)' }
    : { color: '#1d4ed8', bg: 'rgba(37,99,235,0.12)', border: 'rgba(37,99,235,0.28)' };
  const idle = { color: MUTED, bg: '#f9fafb', border: '#ebebeb' };
  const s = on ? active : idle;
  return (
    <span
      title="Set by an administrator"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
        color: s.color, background: s.bg, border: `1px solid ${s.border}`,
        whiteSpace: 'nowrap', lineHeight: 1.5,
      }}
    >
      {on ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: 0.55 }} />
      )}
      {on ? onLabel : offLabel}
    </span>
  );
};

// ─── Toast ────────────────────────────────────────────────────────────────────

export interface ToastState { message: string; kind: 'success' | 'error' }

export const Toast: React.FC<ToastState> = ({ message, kind }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: kind === 'success' ? INK : '#ef4444',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'mdSlideUp 200ms ease',
      maxWidth: 'calc(100vw - 56px)',
    }}>
      {message}
    </div>,
    document.body,
  );

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    if (!message) return;
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, kind });
    timer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { toast, showToast };
}

// ─── Sheet ────────────────────────────────────────────────────────────────────

/**
 * A right-hand sheet on desktop, a bottom sheet on phones — the forms are tall and
 * a centred dialog would clip on small screens. Escape and backdrop both close it.
 */
export const Sheet: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, footer, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      className="md-sheet-backdrop"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="md-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div style={{
          padding: '18px 22px 14px', borderBottom: '1px solid #f3f4f6',
          display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: INK, letterSpacing: '-0.3px' }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 1.6 }}>{subtitle}</div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              border: '1px solid #e5e7eb', background: '#fff',
              cursor: 'pointer', color: MUTED,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 22px 22px' }}>
          {children}
        </div>

        {footer && (
          <div style={{
            padding: '14px 22px', borderTop: '1px solid #f3f4f6',
            display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0, background: '#fff',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

// ─── Buttons ──────────────────────────────────────────────────────────────────

export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { full?: boolean }> =
  ({ full, style, disabled, ...rest }) => (
    <button
      {...rest}
      disabled={disabled}
      style={{
        minHeight: 44, padding: '0 18px', borderRadius: 9, border: 'none',
        background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
        color: '#fff', fontSize: 14, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'inherit', transition: 'opacity 140ms ease, filter 140ms ease',
        flex: full ? 1 : undefined, whiteSpace: 'nowrap',
        boxShadow: '0 2px 10px rgba(75,166,234,0.28)',
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.06)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'none'; }}
    />
  );

export const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> =
  ({ style, disabled, ...rest }) => (
    <button
      {...rest}
      disabled={disabled}
      style={{
        minHeight: 44, padding: '0 18px', borderRadius: 9,
        border: '1px solid #e5e7eb', background: '#fff',
        fontSize: 14, fontWeight: 600, color: BODY,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'inherit', transition: 'border-color 140ms ease',
        whiteSpace: 'nowrap',
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.borderColor = '#c9ced6'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
    />
  );

// ─── Field ────────────────────────────────────────────────────────────────────

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> =
  ({ label, hint, children }) => (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
        {label}
        {hint && <span style={{ color: MUTED, fontWeight: 400 }}> {hint}</span>}
      </span>
      {children}
    </label>
  );

// ─── Loading / empty / error ──────────────────────────────────────────────────

export const Skeleton: React.FC<{ height?: number; width?: string | number; radius?: number; style?: React.CSSProperties }> =
  ({ height = 14, width = '100%', radius = 7, style }) => (
    <div
      className="md-skeleton"
      style={{ height, width, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}> = ({ icon, title, body, action }) => (
  <div style={{
    background: '#fff', borderRadius: 16, border: `1px dashed ${'#dfe3e8'}`,
    padding: '46px 26px', textAlign: 'center',
  }}>
    <div style={{
      width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
      background: 'linear-gradient(135deg, rgba(75,166,234,0.14) 0%, rgba(75,166,234,0.06) 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: BRAND,
    }}>
      {icon}
    </div>
    <div style={{ fontSize: 16, fontWeight: 800, color: INK, letterSpacing: '-0.3px', marginBottom: 7 }}>{title}</div>
    <div style={{ fontSize: 13.5, color: BODY, lineHeight: 1.65, maxWidth: 400, margin: '0 auto' }}>{body}</div>
    {action && <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>{action}</div>}
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div style={{
    background: '#fff', borderRadius: 16, border: '1px solid #fecdd3',
    padding: '30px 22px', textAlign: 'center',
  }}>
    <div style={{ fontSize: 14, color: '#ef4444', marginBottom: 16, lineHeight: 1.6 }}>{message}</div>
    <GhostButton onClick={onRetry}>Try again</GhostButton>
  </div>
);

// ─── Page chrome ──────────────────────────────────────────────────────────────

export const PageHeader: React.FC<{
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ eyebrow, title, description, action }) => (
  <div style={{
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: 16, flexWrap: 'wrap', marginBottom: 22,
  }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: BRAND }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: BRAND, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
          {eyebrow}
        </span>
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: INK, lineHeight: 1.1, marginBottom: 6 }}>
        {title}
      </h1>
      <p style={{ fontSize: 15, color: BODY, lineHeight: 1.6, margin: 0, maxWidth: 640 }}>{description}</p>
    </div>
    {action}
  </div>
);

/** Shared page background, paddings and keyframes. Injected once per Media page. */
export const MEDIA_PAGE_CSS = `
  .md-page { min-height: 100%; padding: 24px 16px; background: linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%); }
  @media (min-width: 640px)  { .md-page { padding: 32px 24px; } }
  @media (min-width: 1024px) { .md-page { padding: 44px 40px; } }

  .md-card { background: #fff; border: 1px solid ${LINE}; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }

  .md-skeleton {
    background: linear-gradient(90deg, #eef1f5 25%, #f6f8fa 37%, #eef1f5 63%);
    background-size: 400% 100%;
    animation: mdShimmer 1.3s ease-in-out infinite;
  }

  .md-sheet-backdrop {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(15,17,23,0.5); backdrop-filter: blur(4px);
    display: flex; align-items: flex-end; justify-content: center;
    animation: mdFade 150ms ease;
  }
  .md-sheet {
    background: #fff; width: 100%; max-height: 92vh;
    border-radius: 20px 20px 0 0;
    display: flex; flex-direction: column;
    box-shadow: 0 -12px 60px rgba(0,0,0,0.22);
    animation: mdSheetUp 220ms cubic-bezier(0.22,1,0.36,1);
  }
  @media (min-width: 768px) {
    .md-sheet-backdrop { align-items: stretch; justify-content: flex-end; }
    .md-sheet {
      width: 480px; max-width: 100%; max-height: 100vh; height: 100%;
      border-radius: 0;
      animation: mdSheetIn 220ms cubic-bezier(0.22,1,0.36,1);
    }
    html[dir="rtl"] .md-sheet-backdrop { justify-content: flex-start; }
  }

  @keyframes mdFade    { from { opacity: 0 } to { opacity: 1 } }
  @keyframes mdSlideUp { from { transform: translateY(10px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
  @keyframes mdSheetUp { from { transform: translateY(24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
  @keyframes mdSheetIn { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
  @keyframes mdShimmer { 0% { background-position: 100% 50% } 100% { background-position: 0 50% } }
`;
