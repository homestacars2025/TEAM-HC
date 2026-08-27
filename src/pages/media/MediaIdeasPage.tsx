import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BODY, BRAND, EmptyState, ErrorState, Field, FlagBadge, GhostButton, INK, INPUT_STYLE,
  MEDIA_PAGE_CSS, MUTED, PageHeader, PrimaryButton, Sheet, Skeleton, TEXTAREA_STYLE,
  TaxonomyBadge, Toast, onBlur, onFocus, useToast,
} from '../../components/media/MediaUI';
import { useMediaIdeas } from '../../hooks/media/useMediaIdeas';
import { useMediaTaxonomy } from '../../hooks/media/useMediaTaxonomy';
import { nullIfBlank } from '../../lib/media/client';
import {
  IDEA_CATEGORIES, IDEA_CATEGORY_LABELS, asIdeaCategory,
  type IdeaCategory, type IdeaDraft, type MediaIdea, type MediaTaxonomyItem,
} from '../../types/media';

type Tab = 'all' | IdeaCategory;

const EMPTY_DRAFT: IdeaDraft = {
  title: '', content: '', category: 'indoor', format_key: null, goal_key: null, note: '',
};

const EXCERPT_LIMIT = 180;

const excerpt = (text: string | null): string => {
  const clean = text?.trim() ?? '';
  if (clean.length <= EXCERPT_LIMIT) return clean;
  return `${clean.slice(0, EXCERPT_LIMIT).trimEnd()}…`;
};

// ─── Idea card ────────────────────────────────────────────────────────────────

const IdeaCard: React.FC<{
  idea: MediaIdea;
  goalMap: Map<string, MediaTaxonomyItem>;
  formatMap: Map<string, MediaTaxonomyItem>;
  converting: boolean;
  onEdit: () => void;
  onConvert: () => void;
  onOpenPost: (postId: string) => void;
}> = ({ idea, goalMap, formatMap, converting, onEdit, onConvert, onOpenPost }) => {
  const body = excerpt(idea.content);
  const converted = Boolean(idea.converted_post_id);

  return (
    <article
      className="md-card md-idea"
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(); } }}
      style={{ padding: '16px 17px', display: 'flex', flexDirection: 'column', gap: 11, cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <h3 style={{
          flex: 1, minWidth: 0, fontSize: 15, fontWeight: 750, color: INK,
          letterSpacing: '-0.25px', lineHeight: 1.4, margin: 0,
        }}>
          {idea.title?.trim() || 'Untitled idea'}
        </h3>
        <span style={{
          fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase',
          letterSpacing: '0.6px', whiteSpace: 'nowrap', paddingTop: 2,
        }}>
          {IDEA_CATEGORY_LABELS[asIdeaCategory(idea.category)]}
        </span>
      </div>

      {body && (
        <p style={{ fontSize: 13, color: BODY, lineHeight: 1.65, margin: 0 }}>{body}</p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <TaxonomyBadge itemKey={idea.goal_key} map={goalMap} dot size="sm" />
        <TaxonomyBadge itemKey={idea.format_key} map={formatMap} size="sm" />
        <FlagBadge on={idea.is_approved} onLabel="Approved" offLabel="Not approved" tone="blue" />
        <FlagBadge on={idea.posted} onLabel="Posted" offLabel="Not posted" tone="green" />
      </div>

      {idea.note?.trim() && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          background: '#f9fafb', border: '1px solid #f1f3f6', borderRadius: 10,
          padding: '9px 11px', fontSize: 12.5, color: BODY, lineHeight: 1.6,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 2, color: MUTED }}>
            <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>{idea.note.trim()}</span>
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 3 }} onClick={e => e.stopPropagation()}>
        {converted ? (
          <button
            onClick={() => onOpenPost(idea.converted_post_id as string)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              minHeight: 38, padding: '0 13px', borderRadius: 9,
              border: '1px solid rgba(75,166,234,0.35)', background: 'rgba(75,166,234,0.08)',
              fontSize: 12.5, fontWeight: 700, color: '#1f6ea8',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Converted — open post
          </button>
        ) : (
          <button
            onClick={onConvert}
            disabled={converting}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              minHeight: 38, padding: '0 13px', borderRadius: 9,
              border: '1px solid #e5e7eb', background: '#fff',
              fontSize: 12.5, fontWeight: 700, color: converting ? MUTED : INK,
              cursor: converting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              transition: 'border-color 140ms ease',
            }}
            onMouseEnter={e => { if (!converting) (e.currentTarget as HTMLButtonElement).style.borderColor = BRAND; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {converting ? 'Converting…' : 'Convert to Post'}
          </button>
        )}
      </div>
    </article>
  );
};

// ─── Editor sheet ─────────────────────────────────────────────────────────────

const IdeaSheet: React.FC<{
  idea: MediaIdea | null;
  goals: MediaTaxonomyItem[];
  formats: MediaTaxonomyItem[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (draft: IdeaDraft) => void;
}> = ({ idea, goals, formats, saving, error, onClose, onSave }) => {
  const [draft, setDraft] = useState<IdeaDraft>(() =>
    idea
      ? {
        title: idea.title ?? '',
        content: idea.content ?? '',
        category: asIdeaCategory(idea.category),
        format_key: idea.format_key,
        goal_key: idea.goal_key,
        note: idea.note ?? '',
      }
      : EMPTY_DRAFT,
  );

  const set = <K extends keyof IdeaDraft>(key: K, value: IdeaDraft[K]) =>
    setDraft(prev => ({ ...prev, [key]: value }));

  return (
    <Sheet
      title={idea ? 'Edit idea' : 'New idea'}
      subtitle={idea ? 'Changes save straight to the board.' : 'Capture it now, shape it later.'}
      onClose={onClose}
      footer={
        <>
          <PrimaryButton full onClick={() => onSave(draft)} disabled={saving}>
            {saving ? 'Saving…' : idea ? 'Save changes' : 'Add idea'}
          </PrimaryButton>
          <GhostButton onClick={onClose} disabled={saving}>Cancel</GhostButton>
        </>
      }
    >
      <Field label="Title">
        <input
          type="text"
          value={draft.title ?? ''}
          onChange={e => set('title', e.target.value)}
          placeholder="A short, memorable name"
          style={INPUT_STYLE}
          onFocus={onFocus}
          onBlur={onBlur}
          autoFocus
        />
      </Field>

      <Field label="Content">
        <textarea
          rows={6}
          value={draft.content ?? ''}
          onChange={e => set('content', e.target.value)}
          placeholder="What is the idea? Shot list, angle, hook…"
          style={TEXTAREA_STYLE}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </Field>

      <Field label="Category">
        <select
          value={draft.category}
          onChange={e => set('category', e.target.value)}
          style={{ ...INPUT_STYLE, cursor: 'pointer' }}
          onFocus={onFocus}
          onBlur={onBlur}
        >
          {IDEA_CATEGORIES.map(c => (
            <option key={c} value={c}>{IDEA_CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </Field>

      <div className="md-field-row">
        <Field label="Goal">
          <select
            value={draft.goal_key ?? ''}
            onChange={e => set('goal_key', e.target.value || null)}
            style={{ ...INPUT_STYLE, cursor: 'pointer' }}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            <option value="">No goal</option>
            {goals.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </Field>

        <Field label="Format">
          <select
            value={draft.format_key ?? ''}
            onChange={e => set('format_key', e.target.value || null)}
            style={{ ...INPUT_STYLE, cursor: 'pointer' }}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            <option value="">No format</option>
            {formats.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Note" hint="(optional)">
        <textarea
          rows={2}
          value={draft.note ?? ''}
          onChange={e => set('note', e.target.value)}
          placeholder="Anything the team should know"
          style={TEXTAREA_STYLE}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </Field>

      {idea && (
        <div style={{
          background: '#f9fafb', border: '1px solid #f1f3f6', borderRadius: 11,
          padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Set by an administrator
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <FlagBadge on={idea.is_approved} onLabel="Approved" offLabel="Not approved" tone="blue" />
            <FlagBadge on={idea.posted} onLabel="Posted" offLabel="Not posted" tone="green" />
          </div>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 14, padding: '10px 14px', background: '#fef2f2',
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

const MediaIdeasPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast, showToast } = useToast();
  const { goals, formats, goalMap, formatMap, loading: taxLoading } = useMediaTaxonomy();
  const { ideas, loading, error, reload, createIdea, updateIdea, convertToPost } = useMediaIdeas();

  const [tab, setTab] = useState<Tab>('all');
  const [sheet, setSheet] = useState<{ open: true; idea: MediaIdea | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map = new Map<Tab, number>([['all', ideas.length]]);
    for (const c of IDEA_CATEGORIES) map.set(c, 0);
    for (const idea of ideas) {
      const c = asIdeaCategory(idea.category);
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return map;
  }, [ideas]);

  const visible = useMemo(
    () => (tab === 'all' ? ideas : ideas.filter(i => asIdeaCategory(i.category) === tab)),
    [ideas, tab],
  );

  const handleSave = useCallback(async (draft: IdeaDraft) => {
    setSaving(true);
    setSheetError(null);
    const payload: IdeaDraft = {
      title: nullIfBlank(draft.title),
      content: nullIfBlank(draft.content),
      category: draft.category,
      format_key: draft.format_key,
      goal_key: draft.goal_key,
      note: nullIfBlank(draft.note),
    };

    const editing = sheet?.idea ?? null;
    const result = editing
      ? await updateIdea(editing.id, payload)
      : await createIdea(payload);

    setSaving(false);
    if (!result.ok) { setSheetError(result.message); return; }
    setSheet(null);
    showToast(result.message);
  }, [sheet, createIdea, updateIdea, showToast]);

  const handleConvert = useCallback(async (idea: MediaIdea) => {
    setConvertingId(idea.id);
    const result = await convertToPost(idea);
    setConvertingId(null);

    if (!result.ok) { showToast(result.message, 'error'); return; }
    showToast(result.message);
    // Land on the calendar with the new post already open for editing.
    navigate(`/dashboard/media/calendar?post=${result.postId}`);
  }, [convertToPost, navigate, showToast]);

  const openPost = useCallback((postId: string) => {
    navigate(`/dashboard/media/calendar?post=${postId}`);
  }, [navigate]);

  const busy = loading || taxLoading;

  return (
    <div className="md-page">
      <PageHeader
        eyebrow="Media"
        title="Ideas"
        description="The backlog of everything worth shooting. Approve and publish states are set by an administrator."
        action={
          <PrimaryButton onClick={() => { setSheetError(null); setSheet({ open: true, idea: null }); }}>
            + New idea
          </PrimaryButton>
        }
      />

      {/* ── Category tabs ── */}
      <div className="md-tabs" role="tablist">
        {(['all', ...IDEA_CATEGORIES] as Tab[]).map(key => {
          const active = tab === key;
          const label = key === 'all' ? 'All' : IDEA_CATEGORY_LABELS[key];
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                minHeight: 40, padding: '0 14px', borderRadius: 10,
                border: active ? `1.5px solid ${BRAND}` : '1.5px solid transparent',
                background: active ? 'rgba(75,166,234,0.08)' : '#fff',
                color: active ? '#1f6ea8' : BODY,
                fontSize: 13.5, fontWeight: active ? 700 : 550,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                boxShadow: active ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
                transition: 'all 140ms ease',
              }}
            >
              {label}
              <span style={{
                minWidth: 20, padding: '1px 6px', borderRadius: 20,
                background: active ? 'rgba(75,166,234,0.18)' : '#f3f4f6',
                color: active ? '#1f6ea8' : MUTED,
                fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              }}>
                {busy ? '–' : counts.get(key) ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Board ── */}
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : busy ? (
        <div className="md-grid">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="md-card" style={{ padding: '16px 17px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <Skeleton height={16} width="70%" />
              <Skeleton height={12} />
              <Skeleton height={12} width="88%" />
              <div style={{ display: 'flex', gap: 6 }}>
                <Skeleton height={20} width={70} radius={20} />
                <Skeleton height={20} width={58} radius={20} />
              </div>
              <Skeleton height={38} width={150} radius={9} />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M9 18h6M10 22h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
            </svg>
          }
          title={tab === 'all' ? 'No ideas yet' : `Nothing in ${IDEA_CATEGORY_LABELS[tab as IdeaCategory]}`}
          body={
            tab === 'all'
              ? 'The board is empty. Add the first idea and it will show up here for the whole team.'
              : 'Switch tabs to see the rest, or add an idea straight into this category.'
          }
          action={
            <PrimaryButton
              onClick={() => {
                setSheetError(null);
                setSheet({ open: true, idea: null });
              }}
            >
              + New idea
            </PrimaryButton>
          }
        />
      ) : (
        <div className="md-grid">
          {visible.map(idea => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              goalMap={goalMap}
              formatMap={formatMap}
              converting={convertingId === idea.id}
              onEdit={() => { setSheetError(null); setSheet({ open: true, idea }); }}
              onConvert={() => handleConvert(idea)}
              onOpenPost={openPost}
            />
          ))}
        </div>
      )}

      {sheet && (
        <IdeaSheet
          key={sheet.idea?.id ?? 'new'}
          idea={sheet.idea}
          goals={goals}
          formats={formats}
          saving={saving}
          error={sheetError}
          onClose={() => { setSheet(null); setSheetError(null); }}
          onSave={handleSave}
        />
      )}

      {toast && <Toast {...toast} />}

      <style>{`
        ${MEDIA_PAGE_CSS}
        .md-tabs {
          display: flex; gap: 8px; margin-bottom: 18px;
          overflow-x: auto; padding-bottom: 4px;
          scrollbar-width: none;
        }
        .md-tabs::-webkit-scrollbar { display: none; }
        .md-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
        @media (min-width: 640px)  { .md-grid { grid-template-columns: repeat(2, 1fr); gap: 16px; } }
        @media (min-width: 1180px) { .md-grid { grid-template-columns: repeat(3, 1fr); } }
        .md-idea { transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease; }
        .md-idea:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(15,17,23,0.08); border-color: rgba(75,166,234,0.4); }
        .md-idea:focus-visible { outline: 2px solid ${BRAND}; outline-offset: 2px; }
        .md-field-row { display: grid; grid-template-columns: 1fr; gap: 0 12px; }
        @media (min-width: 420px) { .md-field-row { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </div>
  );
};

export default MediaIdeasPage;
