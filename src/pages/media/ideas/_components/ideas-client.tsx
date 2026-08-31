import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Lightbulb, Plus, Search, SearchX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { IDEA_CATEGORIES, type MediaFormat, type MediaGoal, type MediaIdea } from '../../../../lib/types/media';
import { cn } from '../../../../lib/utils';
import { ColorModeToggle, useColorMode } from '../../_components/color-mode-toggle';
import { MediaEmptyState } from '../../_components/media-empty-state';
import { convertIdeaToPost } from '../../_actions';
import { IdeaCard } from './idea-card';
import { IdeaFormSheet } from './idea-form-sheet';

const ALL = '__all__';

interface IdeasClientProps {
  ideas: MediaIdea[];
  goals: MediaGoal[];
  formats: MediaFormat[];
}

export function IdeasClient({ ideas, goals, formats }: IdeasClientProps) {
  const { t } = useTranslation('media');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();

  const [category, setCategory] = React.useState<string>(ALL);
  // Its own key: the board and the calendar are read at different moments, and
  // a shared preference would surprise whichever page you did not just change.
  const [colorMode, setColorMode] = useColorMode('media_ideas_color_mode');
  const [search, setSearch] = React.useState('');
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MediaIdea | null>(null);
  const [convertingId, setConvertingId] = React.useState<string | null>(null);
  const [isConverting, startConvert] = React.useTransition();

  // O(1) lookups per card instead of a scan.
  const goalMap = React.useMemo(() => new Map(goals.map((g) => [g.key, g])), [goals]);
  const formatMap = React.useMemo(() => new Map(formats.map((f) => [f.key, f])), [formats]);

  /**
   * The six known categories plus any other value already present in the data —
   * a category an admin typed by hand must never make its ideas unreachable.
   */
  const categories = React.useMemo(() => {
    const known = new Set<string>(IDEA_CATEGORIES);
    const extra = ideas
      .map((i) => i.category)
      .filter((c): c is string => typeof c === 'string' && c.length > 0 && !known.has(c));
    return [...IDEA_CATEGORIES, ...Array.from(new Set(extra))];
  }, [ideas]);

  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const idea of ideas) {
      if (!idea.category) continue;
      map.set(idea.category, (map.get(idea.category) ?? 0) + 1);
    }
    return map;
  }, [ideas]);

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return ideas.filter((idea) => {
      if (category !== ALL && idea.category !== category) return false;
      if (!q) return true;
      return (
        idea.title.toLowerCase().includes(q) ||
        (idea.content ?? '').toLowerCase().includes(q) ||
        (idea.note ?? '').toLowerCase().includes(q)
      );
    });
  }, [ideas, category, search]);

  const isFiltered = category !== ALL || search.trim() !== '';

  const openCreate = React.useCallback(() => {
    setEditing(null);
    setSheetOpen(true);
  }, []);

  const openEdit = React.useCallback((idea: MediaIdea) => {
    setEditing(idea);
    setSheetOpen(true);
  }, []);

  const handleConvert = React.useCallback((idea: MediaIdea) => {
    setConvertingId(idea.id);
    startConvert(async () => {
      const result = await convertIdeaToPost(idea.id);
      setConvertingId(null);
      if (!result.ok) {
        toast.error(result.error ?? t('errors.convertIdea'));
        return;
      }
      if (result.warning) toast.warning(result.warning);
      else toast.success(t('ideas.toast.postCreated'));
      // Land on the calendar with the new post's panel already open.
      navigate(`/dashboard/media/calendar?post=${result.postId}`);
    });
  }, [navigate, t]);

  /**
   * `key` is the value stored in `media.ideas.category` and must never be
   * translated — only `label` is. An admin-typed category has no locale entry,
   * so it falls back to what they typed rather than showing a raw key.
   */
  const tabs: { key: string; label: string; count: number }[] = [
    { key: ALL, label: t('ideas.allCategories'), count: ideas.length },
    ...categories.map((c) => ({
      key: c,
      label: t(`category.${c}`, { defaultValue: c }),
      count: counts.get(c) ?? 0,
    })),
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-black/30"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('ideas.searchPlaceholder')}
            aria-label={t('ideas.searchAria')}
            className="h-9 ps-8 text-[13px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ColorModeToggle
            value={colorMode}
            onChange={setColorMode}
            layoutId="media-ideas-color-mode"
          />
          <Button size="lg" onClick={openCreate} className="shrink-0">
            <Plus size={15} strokeWidth={2} data-icon="inline-start" />
            {t('ideas.newIdea')}
          </Button>
        </div>
      </div>

      {/* Category tabs */}
      <div role="tablist" aria-label={t('ideas.categoriesAria')} className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map(({ key, label, count }) => {
          const isActive = category === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setCategory(key)}
              className={cn(
                'relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors duration-150',
                isActive
                  ? 'font-semibold text-white'
                  : 'font-medium text-black/55 hover:bg-black/[0.04] hover:text-black/80',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="idea-category-pill"
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-[#6ea4e7]"
                  transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                />
              )}
              <span className="relative">{label}</span>
              <span
                className={cn(
                  'relative rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                  isActive ? 'bg-white/20 text-white' : 'bg-black/[0.05] text-black/45',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Board */}
      {visible.length === 0 ? (
        isFiltered ? (
          <MediaEmptyState
            icon={SearchX}
            title={t('ideas.empty.filteredTitle')}
            description={t('ideas.empty.filteredBody')}
            action={
              <Button
                variant="outline"
                size="lg"
                onClick={() => { setSearch(''); setCategory(ALL); }}
              >
                {tc('actions.clearFilters')}
              </Button>
            }
          />
        ) : (
          <MediaEmptyState
            icon={Lightbulb}
            title={t('ideas.empty.noneTitle')}
            description={t('ideas.empty.noneBody')}
            action={
              <Button size="lg" onClick={openCreate}>
                <Plus size={15} strokeWidth={2} data-icon="inline-start" />
                {t('ideas.empty.addFirst')}
              </Button>
            }
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              goal={idea.goal_key ? goalMap.get(idea.goal_key) : undefined}
              format={idea.format_key ? formatMap.get(idea.format_key) : undefined}
              colorMode={colorMode}
              isConverting={isConverting && convertingId === idea.id}
              onEdit={openEdit}
              onConvert={handleConvert}
            />
          ))}
        </div>
      )}

      <IdeaFormSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setEditing(null); }}
        idea={editing}
        goals={goals}
        formats={formats}
        defaultCategory={category === ALL ? undefined : category}
      />
    </div>
  );
}
