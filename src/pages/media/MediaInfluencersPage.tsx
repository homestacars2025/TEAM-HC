import React, { useCallback, useMemo, useState } from 'react';
import {
  BODY, BRAND, Badge, EmptyState, ErrorState, Field, GhostButton, INK, INPUT_STYLE,
  MEDIA_PAGE_CSS, MUTED, NUM, PageHeader, PrimaryButton, Sheet, Skeleton, TEXTAREA_STYLE,
  Toast, dash, ink, onBlur, onFocus, tint, useToast,
} from '../../components/media/MediaUI';
import { useMediaInfluencers } from '../../hooks/media/useMediaInfluencers';
import { nullIfBlank } from '../../lib/media/client';
import type { InfluencerDraft, MediaInfluencer } from '../../types/media';

// ─── Option palettes ──────────────────────────────────────────────────────────

interface Option { value: string; label: string; color: string }

const TYPE_OPTIONS: Option[] = [
  { value: 'influencer',   label: 'Influencer',   color: '#c9b4f8' },
  { value: 'agency',       label: 'Agency',       color: '#b4c6f8' },
  { value: 'ugc_creator',  label: 'UGC Creator',  color: '#b7e0b7' },
  { value: 'photographer', label: 'Photographer', color: '#f6d68a' },
  { value: 'blogger',      label: 'Blogger',      color: '#f8b4d9' },
];

const MESSAGING_OPTIONS: Option[] = [
  { value: 'not_contacted', label: 'Not contacted', color: '#c7ccd4' },
  { value: 'contacted',     label: 'Contacted',     color: '#b4c6f8' },
  { value: 'replied',       label: 'Replied',       color: '#b7e0b7' },
  { value: 'negotiating',   label: 'Negotiating',   color: '#f6d68a' },
  { value: 'no_reply',      label: 'No reply',      color: '#f8b4b4' },
];

const DECISION_OPTIONS: Option[] = [
  { value: 'pending',  label: 'Pending',  color: '#c7ccd4' },
  { value: 'approved', label: 'Approved', color: '#8fd9a8' },
  { value: 'rejected', label: 'Rejected', color: '#f8b4b4' },
  { value: 'on_hold',  label: 'On hold',  color: '#f6d68a' },
];

const optionFor = (options: Option[], value: string | null | undefined): Option | undefined =>
  options.find(o => o.value === value);

const labelFor = (options: Option[], value: string | null | undefined): string =>
  optionFor(options, value)?.label ?? (value?.trim() || '—');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const initialsOf = (name: string | null): string =>
  name?.trim()
    ? name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
    : '?';

/** Contacts are stored in one free-text column, so the link type is inferred. */
function contactHref(contact: string): string | null {
  const value = contact.trim();
  if (!value) return null;
  if (value.includes('@')) return `mailto:${value}`;
  if (/^[+\d][\d\s()-]{5,}$/.test(value)) return `tel:${value.replace(/[\s()-]/g, '')}`;
  return null;
}

/** Shows the host rather than a 90-character URL, but still links the whole thing. */
function prettyUrl(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}

const withProtocol = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

// ─── Coloured inline select ───────────────────────────────────────────────────

/**
 * Staff own these two columns, so they stay editable in the row — no sheet needed
 * to move someone from "contacted" to "replied".
 */
const StatusSelect: React.FC<{
  value: string | null;
  options: Option[];
  onChange: (next: string) => void;
}> = ({ value, options, onChange }) => {
  const current = optionFor(options, value);
  const color = current?.color ?? '#c7ccd4';

  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      style={{
        height: 34, padding: '0 8px', borderRadius: 8,
        border: `1px solid ${tint(color, 0.5)}`,
        background: tint(color, 0.2),
        color: ink(color),
        fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
        cursor: 'pointer', outline: 'none', minWidth: 132,
        transition: 'filter 140ms ease',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLSelectElement).style.filter = 'brightness(0.97)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLSelectElement).style.filter = 'none'; }}
    >
      {!current && <option value="">—</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
};

// ─── Editor sheet ─────────────────────────────────────────────────────────────

const EMPTY_DRAFT: InfluencerDraft = {
  name: '', followers_count: '', url: '', email_contact: '',
  type: 'influencer', country: '', notes: '',
  messaging_status: 'not_contacted', final_decision: 'pending',
};

const InfluencerSheet: React.FC<{
  influencer: MediaInfluencer | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (draft: InfluencerDraft) => void;
}> = ({ influencer, saving, error, onClose, onSave }) => {
  const [draft, setDraft] = useState<InfluencerDraft>(() =>
    influencer
      ? {
        name: influencer.name ?? '',
        followers_count: influencer.followers_count ?? '',
        url: influencer.url ?? '',
        email_contact: influencer.email_contact ?? '',
        type: influencer.type ?? 'influencer',
        country: influencer.country ?? '',
        notes: influencer.notes ?? '',
        messaging_status: influencer.messaging_status ?? 'not_contacted',
        final_decision: influencer.final_decision ?? 'pending',
      }
      : EMPTY_DRAFT,
  );

  const set = <K extends keyof InfluencerDraft>(key: K, value: InfluencerDraft[K]) =>
    setDraft(prev => ({ ...prev, [key]: value }));

  return (
    <Sheet
      title={influencer ? 'Edit contact' : 'New contact'}
      subtitle="Creators, agencies and everyone else worth reaching out to."
      onClose={onClose}
      footer={
        <>
          <PrimaryButton full onClick={() => onSave(draft)} disabled={saving}>
            {saving ? 'Saving…' : influencer ? 'Save changes' : 'Add contact'}
          </PrimaryButton>
          <GhostButton onClick={onClose} disabled={saving}>Cancel</GhostButton>
        </>
      }
    >
      <Field label="Name">
        <input
          type="text"
          value={draft.name ?? ''}
          onChange={e => set('name', e.target.value)}
          placeholder="Full name or handle"
          style={INPUT_STYLE}
          onFocus={onFocus}
          onBlur={onBlur}
          autoFocus
        />
      </Field>

      <div className="md-field-row">
        <Field label="Type">
          <select
            value={draft.type ?? ''}
            onChange={e => set('type', e.target.value || null)}
            style={{ ...INPUT_STYLE, cursor: 'pointer' }}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        <Field label="Followers" hint="(free text)">
          <input
            type="text"
            value={draft.followers_count ?? ''}
            onChange={e => set('followers_count', e.target.value)}
            placeholder="e.g. 120K"
            style={{ ...INPUT_STYLE, ...NUM }}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </Field>
      </div>

      <Field label="Profile URL">
        <input
          type="url"
          value={draft.url ?? ''}
          onChange={e => set('url', e.target.value)}
          placeholder="https://instagram.com/…"
          style={INPUT_STYLE}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </Field>

      <div className="md-field-row">
        <Field label="Contact" hint="(email or phone)">
          <input
            type="text"
            value={draft.email_contact ?? ''}
            onChange={e => set('email_contact', e.target.value)}
            placeholder="name@example.com"
            style={INPUT_STYLE}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </Field>

        <Field label="Country">
          <input
            type="text"
            value={draft.country ?? ''}
            onChange={e => set('country', e.target.value)}
            placeholder="Türkiye"
            style={INPUT_STYLE}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </Field>
      </div>

      <div className="md-field-row">
        <Field label="Messaging">
          <select
            value={draft.messaging_status ?? ''}
            onChange={e => set('messaging_status', e.target.value || null)}
            style={{ ...INPUT_STYLE, cursor: 'pointer' }}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            {MESSAGING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        <Field label="Final decision">
          <select
            value={draft.final_decision ?? ''}
            onChange={e => set('final_decision', e.target.value || null)}
            style={{ ...INPUT_STYLE, cursor: 'pointer' }}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            {DECISION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Notes" hint="(optional)">
        <textarea
          rows={3}
          value={draft.notes ?? ''}
          onChange={e => set('notes', e.target.value)}
          placeholder="Rates, past collaborations, anything useful"
          style={TEXTAREA_STYLE}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </Field>

      {error && (
        <div style={{
          padding: '10px 14px', background: '#fef2f2',
          border: '1px solid rgba(239,68,68,0.2)', borderRadius: 9,
          fontSize: 13, color: '#ef4444', lineHeight: 1.6,
        }}>
          {error}
        </div>
      )}
    </Sheet>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const MediaInfluencersPage: React.FC = () => {
  const { toast, showToast } = useToast();
  const { influencers, loading, error, reload, createInfluencer, updateInfluencer } = useMediaInfluencers();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [messagingFilter, setMessagingFilter] = useState('all');

  const [sheet, setSheet] = useState<{ influencer: MediaInfluencer | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  /** Countries are free text, so the filter is built from what is actually stored. */
  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const row of influencers) {
      const c = row.country?.trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [influencers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return influencers.filter(row => {
      if (typeFilter !== 'all' && (row.type ?? '') !== typeFilter) return false;
      if (countryFilter !== 'all' && (row.country?.trim() ?? '') !== countryFilter) return false;
      if (messagingFilter !== 'all' && (row.messaging_status ?? '') !== messagingFilter) return false;
      if (!q) return true;
      return (
        (row.name ?? '').toLowerCase().includes(q) ||
        (row.url ?? '').toLowerCase().includes(q) ||
        (row.email_contact ?? '').toLowerCase().includes(q) ||
        (row.country ?? '').toLowerCase().includes(q) ||
        (row.notes ?? '').toLowerCase().includes(q)
      );
    });
  }, [influencers, search, typeFilter, countryFilter, messagingFilter]);

  const handleSave = useCallback(async (draft: InfluencerDraft) => {
    setSaving(true);
    setSheetError(null);
    const payload: InfluencerDraft = {
      name: nullIfBlank(draft.name),
      followers_count: nullIfBlank(draft.followers_count),
      url: nullIfBlank(draft.url),
      email_contact: nullIfBlank(draft.email_contact),
      type: draft.type,
      country: nullIfBlank(draft.country),
      notes: nullIfBlank(draft.notes),
      messaging_status: draft.messaging_status,
      final_decision: draft.final_decision,
    };

    const editing = sheet?.influencer ?? null;
    const result = editing
      ? await updateInfluencer(editing.id, payload)
      : await createInfluencer(payload);

    setSaving(false);
    if (!result.ok) { setSheetError(result.message); return; }
    setSheet(null);
    showToast(result.message);
  }, [sheet, createInfluencer, updateInfluencer, showToast]);

  const handleInline = useCallback(async (id: string, patch: Partial<InfluencerDraft>) => {
    const result = await updateInfluencer(id, patch);
    if (!result.ok) showToast(result.message, 'error');
  }, [updateInfluencer, showToast]);

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '11px 14px', fontSize: 11, fontWeight: 700,
    color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px',
    whiteSpace: 'nowrap', borderBottom: '1px solid #f0f2f5', background: '#fafbfc',
  };
  const td: React.CSSProperties = {
    padding: '12px 14px', fontSize: 13.5, color: '#374151',
    borderBottom: '1px solid #f7f8fa', verticalAlign: 'middle',
  };

  const filtersActive = search.trim() !== '' || typeFilter !== 'all' || countryFilter !== 'all' || messagingFilter !== 'all';

  return (
    <div className="md-page">
      <PageHeader
        eyebrow="Media"
        title="Influencers"
        description="Creators, agencies and partners — who has been contacted, and where each conversation stands."
        action={
          <PrimaryButton onClick={() => { setSheetError(null); setSheet({ influencer: null }); }}>
            + New contact
          </PrimaryButton>
        }
      />

      {/* ── Filters ── */}
      <div className="md-card" style={{
        padding: '12px 14px', marginBottom: 16,
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, link, contact, country…"
            style={INPUT_STYLE}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </div>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{ ...INPUT_STYLE, width: 'auto', minWidth: 150, cursor: 'pointer', flex: '0 1 auto' }}
          onFocus={onFocus} onBlur={onBlur}
        >
          <option value="all">All types</option>
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={countryFilter}
          onChange={e => setCountryFilter(e.target.value)}
          style={{ ...INPUT_STYLE, width: 'auto', minWidth: 140, cursor: 'pointer', flex: '0 1 auto' }}
          onFocus={onFocus} onBlur={onBlur}
        >
          <option value="all">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={messagingFilter}
          onChange={e => setMessagingFilter(e.target.value)}
          style={{ ...INPUT_STYLE, width: 'auto', minWidth: 160, cursor: 'pointer', flex: '0 1 auto' }}
          onFocus={onFocus} onBlur={onBlur}
        >
          <option value="all">All messaging</option>
          {MESSAGING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* ── Table ── */}
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="md-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} height={46} radius={10} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.9" />
              <path d="M2.5 20a6.5 6.5 0 0113 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M16.5 5.5a3.2 3.2 0 010 6M18 14.5a6 6 0 013.5 5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          }
          title={filtersActive ? 'No matches' : 'No contacts yet'}
          body={
            filtersActive
              ? 'Nothing fits those filters. Clear them to see the full list again.'
              : 'Add the creators and agencies you are talking to, and track every conversation in one place.'
          }
          action={
            filtersActive ? (
              <GhostButton
                onClick={() => { setSearch(''); setTypeFilter('all'); setCountryFilter('all'); setMessagingFilter('all'); }}
              >
                Clear filters
              </GhostButton>
            ) : (
              <PrimaryButton onClick={() => { setSheetError(null); setSheet({ influencer: null }); }}>
                + New contact
              </PrimaryButton>
            )
          }
        />
      ) : (
        <div className="md-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Type</th>
                  <th style={th}>Followers</th>
                  <th style={th}>Link</th>
                  <th style={th}>Contact</th>
                  <th style={th}>Country</th>
                  <th style={th}>Messaging</th>
                  <th style={th}>Decision</th>
                  <th style={{ ...th, textAlign: 'right' }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => {
                  const type = optionFor(TYPE_OPTIONS, row.type);
                  const href = row.email_contact ? contactHref(row.email_contact) : null;

                  return (
                    <tr key={row.id} className="md-trow">
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                            background: `linear-gradient(135deg, ${BRAND} 0%, #2e8fd4 100%)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11.5, fontWeight: 700, color: '#fff', letterSpacing: '0.2px',
                          }}>
                            {initialsOf(row.name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 650, color: INK, lineHeight: 1.35 }}>
                              {dash(row.name)}
                            </div>
                            {row.notes?.trim() && (
                              <div style={{
                                fontSize: 12, color: MUTED, lineHeight: 1.4,
                                maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {row.notes.trim()}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td style={td}>
                        {row.type ? <Badge label={type?.label ?? row.type} color={type?.color} size="sm" /> : '—'}
                      </td>

                      <td style={{ ...td, ...NUM, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {dash(row.followers_count)}
                      </td>

                      <td style={td}>
                        {row.url?.trim() ? (
                          <a
                            href={withProtocol(row.url.trim())}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: '#1f6ea8', fontWeight: 600, textDecoration: 'none',
                              display: 'inline-block', maxWidth: 200,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              verticalAlign: 'bottom',
                            }}
                          >
                            {prettyUrl(row.url.trim())}
                          </a>
                        ) : '—'}
                      </td>

                      <td style={td}>
                        {href ? (
                          <a href={href} style={{ color: '#1f6ea8', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            {row.email_contact?.trim()}
                          </a>
                        ) : dash(row.email_contact)}
                      </td>

                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{dash(row.country)}</td>

                      <td style={td}>
                        <StatusSelect
                          value={row.messaging_status}
                          options={MESSAGING_OPTIONS}
                          onChange={next => handleInline(row.id, { messaging_status: next })}
                        />
                      </td>

                      <td style={td}>
                        <StatusSelect
                          value={row.final_decision}
                          options={DECISION_OPTIONS}
                          onChange={next => handleInline(row.id, { final_decision: next })}
                        />
                      </td>

                      <td style={{ ...td, textAlign: 'right' }}>
                        <button
                          onClick={() => { setSheetError(null); setSheet({ influencer: row }); }}
                          title={`Edit ${labelFor(TYPE_OPTIONS, row.type)}`}
                          style={{
                            minHeight: 36, padding: '0 13px', borderRadius: 9,
                            border: '1px solid #e5e7eb', background: '#fff',
                            fontSize: 12.5, fontWeight: 700, color: INK,
                            cursor: 'pointer', fontFamily: 'inherit',
                            transition: 'border-color 140ms ease',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = BRAND; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '10px 14px', borderTop: '1px solid #f0f2f5', fontSize: 12, color: MUTED }}>
            Showing <strong style={{ ...NUM, color: BODY }}>{filtered.length}</strong> of{' '}
            <strong style={{ ...NUM, color: BODY }}>{influencers.length}</strong> contacts
          </div>
        </div>
      )}

      {sheet && (
        <InfluencerSheet
          key={sheet.influencer?.id ?? 'new'}
          influencer={sheet.influencer}
          saving={saving}
          error={sheetError}
          onClose={() => { setSheet(null); setSheetError(null); }}
          onSave={handleSave}
        />
      )}

      {toast && <Toast {...toast} />}

      <style>{`
        ${MEDIA_PAGE_CSS}
        .md-trow:last-child td { border-bottom: none; }
        .md-trow:hover td { background: #fcfdfe; }
        .md-field-row { display: grid; grid-template-columns: 1fr; gap: 0 12px; }
        @media (min-width: 420px) { .md-field-row { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </div>
  );
};

export default MediaInfluencersPage;
