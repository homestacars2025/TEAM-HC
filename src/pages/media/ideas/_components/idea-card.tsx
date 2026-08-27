import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Pencil, Sparkles, StickyNote } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { ApprovedBadge, FormatBadge, GoalBadge, PostedBadge } from '../../_components/media-badges';
import type { MediaFormat, MediaGoal, MediaIdea } from '../../../../lib/types/media';

interface IdeaCardProps {
  idea: MediaIdea;
  goal?: MediaGoal;
  format?: MediaFormat;
  isConverting: boolean;
  onEdit: (idea: MediaIdea) => void;
  onConvert: (idea: MediaIdea) => void;
}

export function IdeaCard({ idea, goal, format, isConverting, onEdit, onConvert }: IdeaCardProps) {
  const hasTaxonomy = Boolean(goal || idea.goal_key || format || idea.format_key);

  return (
    <article className="group/idea relative flex flex-col gap-3.5 rounded-2xl border border-black/[0.07] bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-black/[0.1] hover:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.16)]">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug tracking-[-0.012em] text-black/88">
          {idea.title}
        </h3>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${idea.title}`}
          onClick={() => onEdit(idea)}
          className="-mt-0.5 -mr-1.5 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/idea:opacity-100"
        >
          <Pencil size={14} strokeWidth={1.75} />
        </Button>
      </div>

      {idea.content && (
        <p className="line-clamp-3 text-[13px] leading-relaxed text-black/50">{idea.content}</p>
      )}

      {hasTaxonomy && (
        <div className="flex flex-wrap items-center gap-1.5">
          <GoalBadge goal={goal} fallback={idea.goal_key} />
          <FormatBadge format={format} fallback={idea.format_key} />
        </div>
      )}

      {idea.note && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/[0.06] px-3 py-2.5 ring-1 ring-amber-500/[0.12]">
          <StickyNote size={13} strokeWidth={1.75} className="mt-px shrink-0 text-amber-600/80" />
          <p className="text-[12.5px] leading-relaxed text-amber-900/70">{idea.note}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <PostedBadge posted={idea.posted} />
        <ApprovedBadge approved={idea.is_approved} />
      </div>

      <div className="mt-auto border-t border-black/[0.05] pt-3.5">
        {idea.converted_post_id ? (
          // The Convert button is replaced, not disabled — an idea can never be
          // converted twice from the UI.
          <Link
            to={`/dashboard/media/calendar?post=${idea.converted_post_id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500/[0.08] px-3 text-[12.5px] font-semibold text-emerald-700 transition-colors duration-150 hover:bg-emerald-500/[0.14]"
          >
            Converted — open post
            <ArrowUpRight size={13} strokeWidth={2} />
          </Link>
        ) : (
          <Button size="lg" onClick={() => onConvert(idea)} disabled={isConverting} className="w-full">
            <Sparkles size={14} strokeWidth={1.75} data-icon="inline-start" />
            {isConverting ? 'Converting…' : 'Convert to Post'}
          </Button>
        )}
      </div>
    </article>
  );
}
