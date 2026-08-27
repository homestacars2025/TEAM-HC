import * as React from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek,
} from 'date-fns';
import { Plus } from 'lucide-react';
import { chipStyle } from '../../../../lib/media/badge-color';
import type { MediaFormat, MediaGoal, MediaPost } from '../../../../lib/types/media';
import { cn } from '../../../../lib/utils';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday-first, so the grid lines up with the ISO week numbers the DB computes. */
const WEEK_OPTS = { weekStartsOn: 1 as const };

const day = (value: string | null | undefined) => value?.slice(0, 10) ?? '';

const postTitle = (post: MediaPost): string =>
  post.objective?.trim() || post.caption?.trim() || 'Untitled post';

interface PostsMonthViewProps {
  month: Date;
  posts: MediaPost[];
  goals: MediaGoal[];
  formats: MediaFormat[];
  onOpen: (post: MediaPost) => void;
  onCreateAt: (date: string) => void;
  onMovePost: (postId: string, date: string) => void;
}

export function PostsMonthView({
  month, posts, goals, formats, onOpen, onCreateAt, onMovePost,
}: PostsMonthViewProps) {
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
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-black/40"
            >
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d[0]}</span>
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
              onOpen={onOpen}
              onCreateAt={onCreateAt}
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
              goal={dragging.goal_key ? goalMap.get(dragging.goal_key) : undefined}
              className="shadow-[0_10px_28px_-10px_rgb(0_0_0/0.35)]"
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Day cell ─────────────────────────────────────────────────────────────────

function DayCell({
  date, inMonth, isToday, posts, goalMap, formatMap, onOpen, onCreateAt,
}: {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  posts: MediaPost[];
  goalMap: Map<string, MediaGoal>;
  formatMap: Map<string, MediaFormat>;
  onOpen: (post: MediaPost) => void;
  onCreateAt: (date: string) => void;
}) {
  const iso = format(date, 'yyyy-MM-dd');
  const { setNodeRef, isOver } = useDroppable({ id: iso });
  const label = `Add a post on ${format(date, 'd MMMM yyyy')}`;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/day relative flex min-h-[124px] flex-col gap-1.5 border-b border-r border-black/[0.05] p-2 transition-colors duration-150',
        '[&:nth-child(7n)]:border-r-0',
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
          {format(date, 'd')}
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
          goal={post.goal_key ? goalMap.get(post.goal_key) : undefined}
          format={post.format_key ? formatMap.get(post.format_key) : undefined}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function PostChip({
  post, goal, format: formatRow, onOpen,
}: {
  post: MediaPost;
  goal?: MediaGoal;
  format?: MediaFormat;
  onOpen: (post: MediaPost) => void;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: post.id });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onOpen(post)}
      title={`${postTitle(post)}${formatRow ? ` — ${formatRow.label}` : ''}`}
      className={cn(
        'relative z-[1] block w-full rounded-md text-left focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/40 focus-visible:ring-offset-1',
        isDragging && 'opacity-30',
      )}
      {...listeners}
      {...attributes}
    >
      <ChipBody post={post} goal={goal} />
    </button>
  );
}

function ChipBody({
  post, goal, className,
}: { post: MediaPost; goal?: MediaGoal; className?: string }) {
  return (
    <div
      style={chipStyle(goal?.color)}
      className={cn(
        // `bg-clip-padding` keeps the tint from bleeding under the 3px goal rail.
        'rounded-md border-s-[3px] bg-clip-padding px-2 py-1.5',
        'transition-transform duration-150 hover:-translate-y-px',
        className,
      )}
    >
      <p className="line-clamp-2 text-[11.5px] font-medium leading-tight">{postTitle(post)}</p>
      <div className="mt-1 flex items-center gap-1">
        {post.posted && (
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-700">
            Posted
          </span>
        )}
        {goal && <span className="truncate text-[10px] font-medium opacity-70">{goal.label}</span>}
      </div>
    </div>
  );
}
