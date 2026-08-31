import * as React from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek,
} from 'date-fns';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { chipStyle } from '../../../../lib/media/badge-color';
import { useMediaDates, type MediaDates } from '../../../../lib/media/media-dates';
import { accentFor, type ColorMode } from '../../../../lib/media/color-mode';
import type { MediaFormat, MediaGoal, MediaLookup, MediaPost } from '../../../../lib/types/media';
import { cn } from '../../../../lib/utils';
import { ReferenceIconLink } from '../../_components/reference-link';

/** Monday-first, so the grid lines up with the ISO week numbers the DB computes. */
const WEEK_OPTS = { weekStartsOn: 1 as const };

const day = (value: string | null | undefined) => value?.slice(0, 10) ?? '';

const postTitle = (post: MediaPost, t: TFunction): string =>
  post.objective?.trim() || post.caption?.trim() || t('calendar.grid.untitled');

interface PostsMonthViewProps {
  month: Date;
  posts: MediaPost[];
  goals: MediaGoal[];
  formats: MediaFormat[];
  colorMode: ColorMode;
  onOpen: (post: MediaPost) => void;
  onCreateAt: (date: string) => void;
  onMovePost: (postId: string, date: string) => void;
}

export function PostsMonthView({
  month, posts, goals, formats, colorMode, onOpen, onCreateAt, onMovePost,
}: PostsMonthViewProps) {
  const { t } = useTranslation('media');
  const d = useMediaDates();
  const [draggingId, setDraggingId] = React.useState<string | null>(null);

  // 5 px keeps chips clickable: a tap opens the panel, only a real drag moves.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const days = React.useMemo(
    () => eachDayOfInterval({
      start: startOfWeek(startOfMonth(month), WEEK_OPTS),
      end: endOfWeek(endOfMonth(month), WEEK_OPTS),
    }),
    [month],
  );

  const goalMap = React.useMemo(() => new Map(goals.map((g) => [g.key, g])), [goals]);
  const formatMap = React.useMemo(() => new Map(formats.map((f) => [f.key, f])), [formats]);

  /** Bucketed once, by canonical yyyy-MM-dd. */
  const byDay = React.useMemo(() => {
    const map = new Map<string, MediaPost[]>();
    for (const post of posts) {
      const key = day(post.post_date);
      if (!key) continue;
      const bucket = map.get(key);
      if (bucket) bucket.push(post);
      else map.set(key, [post]);
    }
    return map;
  }, [posts]);

  const dragging = draggingId ? posts.find((p) => p.id === draggingId) ?? null : null;

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDraggingId(null);
    if (!over) return;
    const post = posts.find((p) => p.id === active.id);
    const nextDate = String(over.id);
    // Dropped where it already is — nothing to save.
    if (!post || day(post.post_date) === nextDate) return;
    onMovePost(String(active.id), nextDate);
  }

  const today = new Date();

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }: DragStartEvent) => setDraggingId(String(active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
        <div className="grid grid-cols-7 border-b border-black/[0.06] bg-black/[0.015]">
          {d.weekdaysShort.map((name, i) => (
            <div
              key={name}
              className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-black/40"
            >
              <span className="hidden sm:inline">{name}</span>
              {/* Narrow rather than `name[0]`: an Arabic weekday has its own one-letter form. */}
              <span className="sm:hidden">{d.weekdaysNarrow[i]}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((date) => (
            <DayCell
              key={date.toISOString()}
              date={date}
              inMonth={isSameMonth(date, month)}
              isToday={isSameDay(date, today)}
              posts={byDay.get(format(date, 'yyyy-MM-dd')) ?? []}
              goalMap={goalMap}
              formatMap={formatMap}
              colorMode={colorMode}
              onOpen={onOpen}
              onCreateAt={onCreateAt}
              t={t}
              dates={d}
            />
          ))}
        </div>
      </div>

      {/* The optimistic update has already moved the chip, so no snap-back. */}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="pointer-events-none w-[168px] rotate-2">
            <ChipBody
              post={dragging}
              accent={accentFor(
                colorMode,
                dragging.goal_key ? goalMap.get(dragging.goal_key) : undefined,
                dragging.format_key ? formatMap.get(dragging.format_key) : undefined,
              )}
              className="shadow-[0_10px_28px_-10px_rgb(0_0_0/0.35)]"
              t={t}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Day cell ─────────────────────────────────────────────────────────────────

function DayCell({
  date, inMonth, isToday, posts, goalMap, formatMap, colorMode, onOpen, onCreateAt, t, dates,
}: {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  posts: MediaPost[];
  goalMap: Map<string, MediaGoal>;
  formatMap: Map<string, MediaFormat>;
  colorMode: ColorMode;
  onOpen: (post: MediaPost) => void;
  onCreateAt: (date: string) => void;
  t: TFunction;
  dates: MediaDates;
}) {
  // Still date-fns: this is the droppable's id and the bucket key, never read.
  const iso = format(date, 'yyyy-MM-dd');
  const { setNodeRef, isOver } = useDroppable({ id: iso });
  const label = t('calendar.grid.addOnAria', { date: dates.full(date) });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/day relative flex min-h-[124px] flex-col gap-1.5 border-b border-e border-black/[0.05] p-2 transition-colors duration-150',
        '[&:nth-child(7n)]:border-e-0',
        !inMonth && 'bg-black/[0.012]',
        isOver && 'bg-[#6ea4e7]/[0.06] ring-1 ring-inset ring-[#6ea4e7]/30',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'inline-flex size-[22px] items-center justify-center rounded-full text-[12px] font-semibold tabular-nums transition-colors',
            isToday ? 'bg-[#6ea4e7] text-white' : inMonth ? 'text-black/65' : 'text-black/25',
          )}
        >
          {date.getDate()}
        </span>
        <button
          type="button"
          aria-label={label}
          onClick={() => onCreateAt(iso)}
          className="relative z-[2] rounded-md p-0.5 text-black/25 opacity-0 transition-all duration-150 hover:bg-black/[0.06] hover:text-black/60 focus-visible:opacity-100 group-hover/day:opacity-100"
        >
          <Plus size={13} strokeWidth={2} />
        </button>
      </div>

      {/* An empty day is one big click target, below the header row. */}
      {posts.length === 0 && (
        <button
          type="button"
          aria-label={label}
          onClick={() => onCreateAt(iso)}
          className="absolute inset-0 top-8 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6ea4e7]/40"
        />
      )}

      {posts.map((post) => (
        <PostChip
          key={post.id}
          post={post}
          accent={accentFor(
            colorMode,
            post.goal_key ? goalMap.get(post.goal_key) : undefined,
            post.format_key ? formatMap.get(post.format_key) : undefined,
          )}
          format={post.format_key ? formatMap.get(post.format_key) : undefined}
          onOpen={onOpen}
          t={t}
        />
      ))}
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function PostChip({
  post, accent, format: formatRow, onOpen, t,
}: {
  post: MediaPost;
  /** The row driving the colour — a goal or a format, per the Color by switch. */
  accent?: MediaLookup;
  format?: MediaFormat;
  onOpen: (post: MediaPost) => void;
  t: TFunction;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: post.id });

  return (
    // The reference link sits *beside* the draggable button, never inside it: an
    // anchor nested in a button is invalid markup, and the drag sensor would eat
    // the tap before the browser ever followed the href.
    <div className={cn('relative z-[1]', isDragging && 'opacity-30')}>
      <button
        ref={setNodeRef}
        type="button"
        onClick={() => onOpen(post)}
        title={`${postTitle(post, t)}${formatRow ? ` — ${formatRow.label}` : ''}`}
        className={cn(
          'block w-full rounded-md text-start focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/40 focus-visible:ring-offset-1',
        )}
        {...listeners}
        {...attributes}
      >
        <ChipBody post={post} accent={accent} hasReference={Boolean(post.reference_url)} t={t} />
      </button>

      <ReferenceIconLink
        url={post.reference_url}
        ariaLabel={t('calendar.grid.openReferenceAria', { title: postTitle(post, t) })}
        className="absolute end-0.5 top-0.5 z-[2] bg-white/70 backdrop-blur-[2px]"
      />
    </div>
  );
}

function ChipBody({
  post, accent, hasReference, className, t,
}: { post: MediaPost; accent?: MediaLookup; hasReference?: boolean; className?: string; t: TFunction }) {
  return (
    <div
      style={chipStyle(accent?.color)}
      className={cn(
        // `bg-clip-padding` keeps the tint from bleeding under the 3px goal rail.
        'rounded-md border-s-[3px] bg-clip-padding px-2 py-1.5',
        'transition-transform duration-150 hover:-translate-y-px',
        className,
      )}
    >
      <p className={cn('line-clamp-2 text-[11.5px] font-medium leading-tight', hasReference && 'pe-4')}>
        <span dir="auto">{postTitle(post, t)}</span>
      </p>
      <div className="mt-1 flex items-center gap-1">
        {post.posted && (
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-700">
            {t('badges.posted')}
          </span>
        )}
        {accent && <span dir="auto" className="truncate text-[10px] font-medium opacity-70">{accent.label}</span>}
      </div>
    </div>
  );
}
