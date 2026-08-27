import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BODY, BRAND, EmptyState, ErrorState, Field, FlagBadge, GhostButton, INK, INPUT_STYLE,
  MEDIA_PAGE_CSS, MUTED, NUM, PageHeader, PrimaryButton, Sheet, Skeleton, TEXTAREA_STYLE,
  TaxonomyBadge, Toast, ink, onBlur, onFocus, tint, useToast,
} from '../../components/media/MediaUI';
import { useMediaPosts } from '../../hooks/media/useMediaPosts';
import { useMediaTaxonomy } from '../../hooks/media/useMediaTaxonomy';
import { nullIfBlank } from '../../lib/media/client';
import type { MediaPost, MediaTaxonomyItem, PostDraft } from '../../types/media';

type View = 'list' | 'calendar';

// ─── Date helpers ─────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Local-time ISO date. `toISOString` would shift the day for anyone east of UTC. */
function toISODate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** `post_date` is a bare date — parsing it without a time makes it UTC midnight. */
function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

const monthLabel = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const dayLabel = (iso: string) =>
  parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });

const sameMonth = (iso: string, cursor: Date) => {
  const d = parseISODate(iso);
  return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();
};

/** Six rows of seven days, Monday-first, so the grid height never jumps between months. */
function monthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Sunday(0) -> 6
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

const postTitle = (post: MediaPost): string =>
  post.objective?.trim() || post.caption?.trim() || 'Untitled post';

// ─── Post editor ──────────────────────────────────────────────────────────────

const PostSheet: React.FC<{
  post: MediaPost;
  goals: MediaTaxonomyItem[];
  formats: MediaTaxonomyItem[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (draft: Partial<PostDraft>) => void;
}> = ({ post, goals, formats, saving, error, onClose, onSave }) => {
  const [draft, setDraft] = useState<Partial<PostDraft>>({
    post_date: post.post_date,
    week_label: post.week_label ?? '',
    goal_key: post.goal_key,
    format_key: post.format_key,
    objective: post.objective ?? '',
    visual_script: post.visual_script ?? '',
    caption: post.caption ?? '',
    cta: post.cta ?? '',
    media_link: post.media_link ?? '',
  });

  const set = <K extends keyof PostDraft>(key: K, value: PostDraft[K]) =>
    setDraft(prev => ({ ...prev, [key]: value }));

  return (
    <Sheet
      title="Post"
      subtitle={post.post_date ? dayLabel(post.post_date) : 'Not scheduled yet'}
      onClose={onClose}
      footer={
        <>
          <PrimaryButton full onClick={() => onSave(draft)} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </PrimaryButton>
          <GhostButton onClick={onClose} disabled={saving}>Close</GhostButton>
        </>
      }
    >
      <div className="md-field-row">
        <Field label="Date">
          <input
            type="date"
            value={draft.post_date ?? ''}
            onChange={e => set('post_date', e.target.value || null)}
            style={{ ...INPUT_STYLE, ...NUM }}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </Field>

        <Field label="Week label" hint="(optional)">
          <input
            type="text"
            value={draft.week_label ?? ''}
            onChange={e => set('week_label', e.target.value)}
            placeholder="e.g. Launch week"
            style={INPUT_STYLE}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </Field>
      </div>

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

      <Field label="Objective">
        <input
          type="text"
          value={draft.objective ?? ''}
          onChange={e => set('objective', e.target.value)}
          placeholder="What this post is meant to achieve"
          style={INPUT_STYLE}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </Field>

      <Field label="Visual script">
        <textarea
          rows={4}
          value={draft.visual_script ?? ''}
          onChange={e => set('visual_script', e.target.value)}
          placeholder="Shots, order, on-screen text…"
          style={TEXTAREA_STYLE}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </Field>

      <Field label="Caption">
        <textarea
          rows={4}
          value={draft.caption ?? ''}
          onChange={e => set('caption', e.target.value)}
          placeholder="The copy that ships with the post"
          style={TEXTAREA_STYLE}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </Field>

      <div className="md-field-row">
        <Field label="CTA">
          <input
            type="text"
            value={draft.cta ?? ''}
            onChange={e => set('cta', e.target.value)}
            placeholder="Book now, DM us…"
            style={INPUT_STYLE}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </Field>

        <Field label="Media link">
          <input
            type="url"
            value={draft.media_link ?? ''}
            onChange={e => set('media_link', e.target.value)}
            placeholder="https://…"
            style={INPUT_STYLE}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </Field>
      </div>

      <div style={{
        background: '#f9fafb', border: '1px solid #f1f3f6', borderRadius: 11,
        padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>
            Set by an administrator
          </div>
          <FlagBadge on={post.posted} onLabel="Posted" offLabel="Not posted" tone="green" />
        </div>
        {post.week_no != null && (
          <div style={{ marginLeft: 'auto', fontSize: 12, color: MUTED, ...NUM }}>
            Week {post.week_no}
          </div>
        )}
      </div>

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

// ─── List row ─────────────────────────────────────────────────────────────────

/**
 * The fields worth changing in passing — date, goal, format, objective — are edited
 * in place; everything longer opens the sheet. Text commits on blur so a half-typed
 * objective never hits the server.
 */
const ListRow: React.FC<{
  post: MediaPost;
  goals: MediaTaxonomyItem[];
  formats: MediaTaxonomyItem[];
  goalMap: Map<string, MediaTaxonomyItem>;
  onInline: (patch: Partial<PostDraft>) => void;
  onOpen: () => void;
}> = ({ post, goals, formats, goalMap, onInline, onOpen }) => {
  const [objective, setObjective] = useState(post.objective ?? '');

  // A save from elsewhere (or a rollback) has to win over the local draft.
  useEffect(() => { setObjective(post.objective ?? ''); }, [post.objective]);

  const goalColor = post.goal_key ? goalMap.get(post.goal_key)?.color ?? null : null;

  const commitObjective = () => {
    const next = nullIfBlank(objective);
    if (next === (post.objective ?? null)) return;
    onInline({ objective: next });
  };

  const cell: React.CSSProperties = {
    ...INPUT_STYLE, height: 38, fontSize: 13, borderColor: '#eef0f3', background: '#fbfcfd',
  };

  return (
    <div
      className="md-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '11px 14px', borderBottom: '1px solid #f5f6f8',
        borderLeft: `3px solid ${goalColor ? tint(goalColor, 0.9) : 'transparent'}`,
      }}
    >
      <input
        type="date"
        value={post.post_date ?? ''}
        onChange={e => onInline({ post_date: e.target.value || null })}
        style={{ ...cell, ...NUM, width: 150, flex: '0 0 auto' }}
        onFocus={onFocus}
        onBlur={e => { (e.target as HTMLElement).style.borderColor = '#eef0f3'; }}
      />

      <input
        type="text"
        value={objective}
        onChange={e => setObjective(e.target.value)}
        onBlur={e => { (e.target as HTMLElement).style.borderColor = '#eef0f3'; commitObjective(); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="Objective…"
        style={{ ...cell, flex: '1 1 220px', minWidth: 160 }}
        onFocus={onFocus}
      />

      <select
        value={post.goal_key ?? ''}
        onChange={e => onInline({ goal_key: e.target.value || null })}
        style={{
          ...cell, width: 'auto', minWidth: 128, flex: '0 1 auto', cursor: 'pointer',
          color: goalColor ? ink(goalColor) : BODY,
          background: goalColor ? tint(goalColor, 0.14) : '#fbfcfd',
          fontWeight: goalColor ? 700 : 400,
        }}
        onFocus={onFocus}
        onBlur={e => { (e.target as HTMLElement).style.borderColor = '#eef0f3'; }}
      >
        <option value="">No goal</option>
        {goals.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
      </select>

      <select
        value={post.format_key ?? ''}
        onChange={e => onInline({ format_key: e.target.value || null })}
        style={{ ...cell, width: 'auto', minWidth: 118, flex: '0 1 auto', cursor: 'pointer' }}
        onFocus={onFocus}
        onBlur={e => { (e.target as HTMLElement).style.borderColor = '#eef0f3'; }}
      >
        <option value="">No format</option>
        {formats.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>

      <FlagBadge on={post.posted} onLabel="Posted" offLabel="Not posted" tone="green" />

      <button
        onClick={onOpen}
        style={{
          minHeight: 38, padding: '0 13px', borderRadius: 9,
          border: '1px solid #e5e7eb', background: '#fff',
          fontSize: 12.5, fontWeight: 700, color: INK,
          cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto',
          transition: 'border-color 140ms ease',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = BRAND; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
      >
        Details
      </button>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const MediaCalendarPage: React.FC = () => {
  const { toast, showToast } = useToast();
  const { goals, formats, goalMap, formatMap, loading: taxLoading } = useMediaTaxonomy();
  const { posts, loading, error, reload, createPost, updatePost } = useMediaPosts();

  const [view, setView] = useState<View>('list');
  const [cursor, setCursor] = useState(() => new Date());
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Arriving from Ideas → Convert to Post: open that post and jump to its month.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = searchParams.get('post');

  useEffect(() => {
    if (!requestedId || loading) return;
    const post = posts.find(p => p.id === requestedId);
    if (!post) return;
    setOpenId(requestedId);
    if (post.post_date) setCursor(parseISODate(post.post_date));
    const next = new URLSearchParams(searchParams);
    next.delete('post');
    setSearchParams(next, { replace: true });
  }, [requestedId, loading, posts, searchParams, setSearchParams]);

  const openPost = useMemo(
    () => (openId ? posts.find(p => p.id === openId) ?? null : null),
    [openId, posts],
  );

  const monthPosts = useMemo(
    () => posts.filter(p => p.post_date && sameMonth(p.post_date, cursor)),
    [posts, cursor],
  );

  const unscheduled = useMemo(() => posts.filter(p => !p.post_date), [posts]);

  /** Weeks come from the generated `week_no`, so the grouping matches the database. */
  const weekGroups = useMemo(() => {
    const groups = new Map<number, MediaPost[]>();
    for (const post of monthPosts) {
      const week = post.week_no ?? 0;
      const bucket = groups.get(week);
      if (bucket) bucket.push(post);
      else groups.set(week, [post]);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [monthPosts]);

  const postsByDay = useMemo(() => {
    const map = new Map<string, MediaPost[]>();
    for (const post of monthPosts) {
      if (!post.post_date) continue;
      const bucket = map.get(post.post_date);
      if (bucket) bucket.push(post);
      else map.set(post.post_date, [post]);
    }
    return map;
  }, [monthPosts]);

  const shiftMonth = useCallback((delta: number) => {
    setCursor(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }, []);

  const handleInline = useCallback(async (id: string, patch: Partial<PostDraft>) => {
    const result = await updatePost(id, patch);
    if (!result.ok) showToast(result.message, 'error');
  }, [updatePost, showToast]);

  const handleSave = useCallback(async (draft: Partial<PostDraft>) => {
    if (!openPost) return;
    setSaving(true);
    setSheetError(null);
    const result = await updatePost(openPost.id, {
      ...draft,
      week_label: nullIfBlank(draft.week_label),
      objective: nullIfBlank(draft.objective),
      visual_script: nullIfBlank(draft.visual_script),
      caption: nullIfBlank(draft.caption),
      cta: nullIfBlank(draft.cta),
      media_link: nullIfBlank(draft.media_link),
    });
    setSaving(false);
    if (!result.ok) { setSheetError(result.message); return; }
    setOpenId(null);
    showToast(result.message);
  }, [openPost, updatePost, showToast]);

  /** Used by the New Post button and by clicking an empty day in the grid. */
  const handleCreate = useCallback(async (date: string | null) => {
    if (creating) return;
    setCreating(true);
    const result = await createPost({ post_date: date });
    setCreating(false);

    if (!result.ok || !result.post) { showToast(result.message, 'error'); return; }
    setSheetError(null);
    setOpenId(result.post.id);
    // Clicking a trailing day of the grid plans into the next month — follow it there,
    // otherwise the new post would vanish from the view the moment the sheet closes.
    if (date) setCursor(parseISODate(date));
    showToast(date ? `Post added on ${dayLabel(date)}` : 'Draft post added');
  }, [creating, createPost, showToast]);

  const busy = loading || taxLoading;
  const todayISO = toISODate(new Date());
  const grid = useMemo(() => monthGrid(cursor), [cursor]);

  return (
    <div className="md-page">
      <PageHeader
        eyebrow="Media"
        title="Calendar"
        description="The publishing plan, week by week. Whether a post has gone live is set by an administrator."
        action={
          <PrimaryButton onClick={() => handleCreate(null)} disabled={creating}>
            {creating ? 'Adding…' : '+ New post'}
          </PrimaryButton>
        }
      />

      {/* ── Month nav + view switch ── */}
      <div className="md-card" style={{
        padding: '10px 12px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month" style={navBtn}>
            <svg className="hc-flip" width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div style={{
            minWidth: 168, textAlign: 'center', fontSize: 15, fontWeight: 750,
            color: INK, letterSpacing: '-0.3px',
          }}>
            {monthLabel(cursor)}
          </div>
          <button onClick={() => shiftMonth(1)} aria-label="Next month" style={navBtn}>
            <svg className="hc-flip" width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <GhostButton
          onClick={() => setCursor(new Date())}
          style={{ minHeight: 36, padding: '0 13px', fontSize: 12.5 }}
        >
          Today
        </GhostButton>

        <div style={{
          marginLeft: 'auto', display: 'flex', gap: 3, padding: 3,
          background: '#f3f4f6', borderRadius: 10,
        }}>
          {(['list', 'calendar'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                minHeight: 34, padding: '0 15px', borderRadius: 8, border: 'none',
                background: view === v ? '#fff' : 'transparent',
                color: view === v ? INK : BODY,
                fontSize: 13, fontWeight: view === v ? 700 : 550,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 140ms ease', textTransform: 'capitalize',
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : busy ? (
        <div className="md-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} height={44} radius={10} />)}
        </div>
      ) : view === 'list' ? (
        <ListView
          weekGroups={weekGroups}
          unscheduled={unscheduled}
          goals={goals}
          formats={formats}
          goalMap={goalMap}
          monthName={monthLabel(cursor)}
          onInline={handleInline}
          onOpen={id => { setSheetError(null); setOpenId(id); }}
          onCreate={() => handleCreate(null)}
        />
      ) : (
        <CalendarView
          grid={grid}
          cursor={cursor}
          todayISO={todayISO}
          postsByDay={postsByDay}
          goalMap={goalMap}
          formatMap={formatMap}
          creating={creating}
          onCreate={handleCreate}
          onOpen={id => { setSheetError(null); setOpenId(id); }}
        />
      )}

      {openPost && (
        <PostSheet
          key={openPost.id}
          post={openPost}
          goals={goals}
          formats={formats}
          saving={saving}
          error={sheetError}
          onClose={() => { setOpenId(null); setSheetError(null); }}
          onSave={handleSave}
        />
      )}

      {toast && <Toast {...toast} />}

      <style>{`
        ${MEDIA_PAGE_CSS}
        .md-row:last-child { border-bottom: none; }
        .md-row:hover { background: #fcfdfe; }
        .md-field-row { display: grid; grid-template-columns: 1fr; gap: 0 12px; }
        @media (min-width: 420px) { .md-field-row { grid-template-columns: 1fr 1fr; } }

        .md-cal-scroll { overflow-x: auto; }
        .md-cal { min-width: 720px; }
        .md-cal-head, .md-cal-body { display: grid; grid-template-columns: repeat(7, 1fr); }
        .md-day {
          min-height: 104px; padding: 6px; border-right: 1px solid #f2f4f7; border-bottom: 1px solid #f2f4f7;
          display: flex; flex-direction: column; gap: 4px; background: #fff;
          cursor: pointer; transition: background 140ms ease;
        }
        .md-day:nth-child(7n) { border-right: none; }
        .md-day:hover { background: rgba(75,166,234,0.05); }
        .md-day--out { background: #fbfcfd; }
        .md-day--out:hover { background: #f6f8fa; }
        @media (min-width: 1024px) { .md-day { min-height: 122px; } }
      `}</style>
    </div>
  );
};

const navBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 9,
  border: '1px solid #e5e7eb', background: '#fff',
  cursor: 'pointer', color: BODY,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

// ─── List view ────────────────────────────────────────────────────────────────

const ListView: React.FC<{
  weekGroups: [number, MediaPost[]][];
  unscheduled: MediaPost[];
  goals: MediaTaxonomyItem[];
  formats: MediaTaxonomyItem[];
  goalMap: Map<string, MediaTaxonomyItem>;
  monthName: string;
  onInline: (id: string, patch: Partial<PostDraft>) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
}> = ({ weekGroups, unscheduled, goals, formats, goalMap, monthName, onInline, onOpen, onCreate }) => {
  if (weekGroups.length === 0 && unscheduled.length === 0) {
    return (
      <EmptyState
        icon={
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
            <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        }
        title={`Nothing planned for ${monthName}`}
        body="Add a post and it will appear here, grouped by the week it falls in."
        action={<PrimaryButton onClick={onCreate}>+ New post</PrimaryButton>}
      />
    );
  }

  const groupHeader = (title: string, count: number, hint?: string) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap',
      padding: '11px 14px', background: '#fafbfc', borderBottom: '1px solid #f0f2f5',
    }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: INK, letterSpacing: '0.2px' }}>{title}</span>
      {hint && <span style={{ fontSize: 12, color: MUTED }}>{hint}</span>}
      <span style={{
        marginLeft: 'auto', minWidth: 20, padding: '1px 7px', borderRadius: 20,
        background: '#eef1f4', color: BODY, fontSize: 11, fontWeight: 700, ...NUM,
      }}>
        {count}
      </span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {weekGroups.map(([week, group]) => {
        // week_label is per post; the first one that has one names the group.
        const label = group.find(p => p.week_label?.trim())?.week_label?.trim();
        return (
          <div key={week} className="md-card" style={{ overflow: 'hidden' }}>
            {groupHeader(`Week ${week}`, group.length, label)}
            {group.map(post => (
              <ListRow
                key={post.id}
                post={post}
                goals={goals}
                formats={formats}
                goalMap={goalMap}
                onInline={patch => onInline(post.id, patch)}
                onOpen={() => onOpen(post.id)}
              />
            ))}
          </div>
        );
      })}

      {unscheduled.length > 0 && (
        <div className="md-card" style={{ overflow: 'hidden', borderStyle: 'dashed' }}>
          {groupHeader('Unscheduled', unscheduled.length, 'No date yet — pick one to slot it into a week')}
          {unscheduled.map(post => (
            <ListRow
              key={post.id}
              post={post}
              goals={goals}
              formats={formats}
              goalMap={goalMap}
              onInline={patch => onInline(post.id, patch)}
              onOpen={() => onOpen(post.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Calendar view ────────────────────────────────────────────────────────────

const CalendarView: React.FC<{
  grid: Date[];
  cursor: Date;
  todayISO: string;
  postsByDay: Map<string, MediaPost[]>;
  goalMap: Map<string, MediaTaxonomyItem>;
  formatMap: Map<string, MediaTaxonomyItem>;
  creating: boolean;
  onCreate: (date: string) => void;
  onOpen: (id: string) => void;
}> = ({ grid, cursor, todayISO, postsByDay, goalMap, formatMap, creating, onCreate, onOpen }) => (
  <div className="md-card" style={{ overflow: 'hidden' }}>
    <div className="md-cal-scroll">
      <div className="md-cal">
        <div className="md-cal-head">
          {WEEKDAYS.map(d => (
            <div key={d} style={{
              padding: '10px 8px', fontSize: 11, fontWeight: 700, color: MUTED,
              textTransform: 'uppercase', letterSpacing: '0.6px', textAlign: 'center',
              borderBottom: '1px solid #f0f2f5', background: '#fafbfc',
            }}>
              {d}
            </div>
          ))}
        </div>

        <div className="md-cal-body">
          {grid.map(date => {
            const iso = toISODate(date);
            const inMonth = date.getMonth() === cursor.getMonth();
            const dayPosts = postsByDay.get(iso) ?? [];
            const isToday = iso === todayISO;

            return (
              <div
                key={iso}
                className={`md-day${inMonth ? '' : ' md-day--out'}`}
                // Only a click on the day itself creates — chips stop propagation.
                onClick={() => { if (!creating) onCreate(iso); }}
                role="button"
                tabIndex={-1}
                title={`Add a post on ${dayLabel(iso)}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{
                    ...NUM,
                    width: 22, height: 22, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11.5, fontWeight: isToday ? 800 : 600,
                    color: isToday ? '#fff' : inMonth ? INK : '#c7ccd4',
                    background: isToday ? BRAND : 'transparent',
                  }}>
                    {date.getDate()}
                  </span>
                </div>

                {dayPosts.map(post => {
                  const color = post.goal_key ? goalMap.get(post.goal_key)?.color ?? null : null;
                  return (
                    <button
                      key={post.id}
                      onClick={e => { e.stopPropagation(); onOpen(post.id); }}
                      title={`${postTitle(post)}${post.format_key ? ` — ${formatMap.get(post.format_key)?.label ?? post.format_key}` : ''}`}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '4px 7px', borderRadius: 7,
                        border: `1px solid ${tint(color, 0.45)}`,
                        background: tint(color, 0.2),
                        color: ink(color),
                        fontSize: 11.5, fontWeight: 650, lineHeight: 1.35,
                        cursor: 'pointer', fontFamily: 'inherit',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        opacity: post.posted ? 1 : 0.92,
                      }}
                    >
                      {post.posted && '✓ '}
                      {postTitle(post)}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>

    <div style={{
      padding: '10px 14px', borderTop: '1px solid #f0f2f5',
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      fontSize: 12, color: MUTED,
    }}>
      <span>Click any day to add a post there.</span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {[...goalMap.values()].map(goal => (
          <TaxonomyBadge key={goal.key} itemKey={goal.key} map={goalMap} dot size="sm" />
        ))}
      </span>
    </div>
  </div>
);

export default MediaCalendarPage;
