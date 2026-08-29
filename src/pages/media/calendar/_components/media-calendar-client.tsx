import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  addMonths, format, isSameMonth, parseISO, startOfMonth, subMonths,
} from 'date-fns';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, List, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../../components/ui/button';
import { dotStyle } from '../../../../lib/media/badge-color';
import type { EditablePostField, MediaFormat, MediaGoal, MediaPost } from '../../../../lib/types/media';
import { cn } from '../../../../lib/utils';
import { MediaEmptyState } from '../../_components/media-empty-state';
import { savePost, updatePostField } from '../../_actions';
import { PostDetailSheet } from './post-detail-sheet';
import { PostsListView } from './posts-list-view';
import { PostsMonthView } from './posts-month-view';

type ViewMode = 'list' | 'month';

const VIEWS = [
  { value: 'list' as const, label: 'List', icon: List },
  { value: 'month' as const, label: 'Calendar', icon: CalendarDays },
];

const day = (value: string | null | undefined) => value?.slice(0, 10) ?? '';

interface MediaCalendarClientProps {
  posts: MediaPost[];
  goals: MediaGoal[];
  formats: MediaFormat[];
  initialPostId?: string;
}

export function MediaCalendarClient({
  posts: initialPosts, goals, formats, initialPostId,
}: MediaCalendarClientProps) {
  const [, setSearchParams] = useSearchParams();

  const arrivalTarget = initialPostId
    ? initialPosts.find((p) => p.id === initialPostId) ?? null
    : null;

  const [posts, setPosts] = React.useState(initialPosts);
  const [view, setView] = React.useState<ViewMode>('month');
  const [month, setMonth] = React.useState(() =>
    startOfMonth(arrivalTarget?.post_date ? parseISO(day(arrivalTarget.post_date)) : new Date()),
  );
  const [sheetOpen, setSheetOpen] = React.useState(Boolean(arrivalTarget));
  const [activePostId, setActivePostId] = React.useState<string | null>(arrivalTarget?.id ?? null);
  const [draftDate, setDraftDate] = React.useState<string | undefined>(undefined);

  /**
   * Server state reconciled during render, not in an effect — an effect would
   * paint the stale list for one frame after every revalidation.
   */
  const [seed, setSeed] = React.useState(initialPosts);
  if (seed !== initialPosts) {
    setSeed(initialPosts);
    setPosts(initialPosts);
  }

  /** Held by id, not by value, so the panel follows the post through a refetch. */
  const activePost = activePostId ? posts.find((p) => p.id === activePostId) ?? null : null;

  const monthPosts = React.useMemo(
    () => posts.filter((p) => p.post_date && isSameMonth(parseISO(day(p.post_date)), month)),
    [posts, month],
  );

  // Undated posts belong to no month, so they ride along in the List view rather
  // than becoming unreachable.
  const undatedPosts = React.useMemo(() => posts.filter((p) => !p.post_date), [posts]);
  const listPosts = React.useMemo(() => [...monthPosts, ...undatedPosts], [monthPosts, undatedPosts]);

  const activeGoals = React.useMemo(
    () => goals.filter((g) => monthPosts.some((p) => p.goal_key === g.key)),
    [goals, monthPosts],
  );

  const saveField = React.useCallback(
    async (postId: string, field: EditablePostField, value: string | null): Promise<boolean> => {
      const before = posts;
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, [field]: value } : p)));
      const result = await updatePostField(postId, field, value);
      if (!result.ok) {
        setPosts(before);
        toast.error(result.error ?? "Couldn't save that change");
        return false;
      }
      return true;
    },
    [posts],
  );

  const movePost = React.useCallback(
    async (postId: string, date: string) => {
      const ok = await saveField(postId, 'post_date', date);
      if (ok) toast.success(`Moved to ${format(parseISO(date), 'd MMM')}`);
    },
    [saveField],
  );

  const openPost = React.useCallback((post: MediaPost) => {
    setActivePostId(post.id);
    setDraftDate(undefined);
    setSheetOpen(true);
  }, []);

  const openCreate = React.useCallback((date?: string) => {
    setActivePostId(null);
    setDraftDate(date ?? format(month, 'yyyy-MM-dd'));
    setSheetOpen(true);
  }, [month]);

  const closeSheet = React.useCallback(() => {
    setSheetOpen(false);
    setActivePostId(null);
    setDraftDate(undefined);
    // Drop `?post=` so a refresh doesn't reopen a panel the user just closed.
    if (initialPostId) setSearchParams({}, { replace: true });
  }, [initialPostId, setSearchParams]);

  /** Creating from a day cell needs the row to exist before the panel can edit it. */
  const createAt = React.useCallback(async (date: string) => {
    const result = await savePost({
      id: undefined,
      post_date: date,
      week_label: null, goal_key: null, format_key: null,
      objective: null, visual_script: null, caption: null, cta: null,
      media_link: null, reference_url: null,
    });
    if (!result.ok || !result.id) {
      toast.error(result.error ?? "Couldn't create the post");
      return;
    }
    setActivePostId(result.id);
    setDraftDate(undefined);
    setSheetOpen(true);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5 rounded-lg border border-black/[0.07] bg-white p-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous month"
              onClick={() => setMonth((m) => subMonths(m, 1))}
            >
              <ChevronLeft size={15} strokeWidth={1.75} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next month"
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight size={15} strokeWidth={1.75} />
            </Button>
          </div>

          <h2 className="text-[15px] font-semibold tracking-[-0.014em] text-black/85">
            {format(month, 'MMMM yyyy')}
          </h2>

          {!isSameMonth(month, new Date()) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-black/50"
              onClick={() => setMonth(startOfMonth(new Date()))}
            >
              Today
            </Button>
          )}

          <span className="rounded-full bg-black/[0.045] px-2 py-0.5 text-[11.5px] font-medium tabular-nums text-black/45">
            {monthPosts.length} {monthPosts.length === 1 ? 'post' : 'posts'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div
            role="group"
            aria-label="Calendar view"
            className="inline-flex items-center gap-0.5 rounded-lg border border-black/[0.07] bg-black/[0.02] p-0.5"
          >
            {VIEWS.map((v) => {
              const isActive = view === v.value;
              const Icon = v.icon;
              return (
                <button
                  key={v.value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setView(v.value)}
                  className={cn(
                    'relative inline-flex h-[30px] items-center gap-1.5 rounded-[7px] px-3 text-[12.5px] transition-colors duration-150',
                    isActive ? 'font-semibold text-black/85' : 'font-medium text-black/45 hover:text-black/70',
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="media-view-toggle"
                      aria-hidden
                      className="absolute inset-0 rounded-[7px] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.07)] ring-1 ring-black/[0.05]"
                      transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                    />
                  )}
                  <Icon size={13} strokeWidth={isActive ? 2 : 1.6} className="relative" />
                  <span className="relative">{v.label}</span>
                </button>
              );
            })}
          </div>

          <Button size="lg" onClick={() => openCreate()} className="shrink-0">
            <Plus size={15} strokeWidth={2} data-icon="inline-start" />
            New post
          </Button>
        </div>
      </div>

      {/* Goal legend — month view only, and only for goals actually in use. */}
      {view === 'month' && activeGoals.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {activeGoals.map((g) => (
            <span key={g.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-black/45">
              <span aria-hidden className="size-2 rounded-full" style={dotStyle(g.color)} />
              {g.label}
            </span>
          ))}
        </div>
      )}

      {view === 'list' ? (
        listPosts.length === 0 ? (
          <MediaEmptyState
            icon={CalendarPlus}
            title={`Nothing scheduled in ${format(month, 'MMMM')}`}
            description="Add a post for this month, or convert an approved idea from the Ideas board straight into the calendar."
            action={
              <Button size="lg" onClick={() => openCreate()}>
                <Plus size={15} strokeWidth={2} data-icon="inline-start" />
                Schedule a post
              </Button>
            }
          />
        ) : (
          <PostsListView
            posts={listPosts}
            goals={goals}
            formats={formats}
            onSaveField={saveField}
            onOpen={openPost}
          />
        )
      ) : (
        // The grid renders leading and trailing days from neighbouring months, so
        // it receives every post rather than just this month's.
        <PostsMonthView
          month={month}
          posts={posts}
          goals={goals}
          formats={formats}
          onOpen={openPost}
          onCreateAt={createAt}
          onMovePost={movePost}
        />
      )}

      <PostDetailSheet
        open={sheetOpen}
        onClose={closeSheet}
        post={activePost}
        defaultDate={draftDate}
        goals={goals}
        formats={formats}
      />
    </div>
  );
}
