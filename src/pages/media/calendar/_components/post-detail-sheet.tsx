import * as React from 'react';
import { format, parseISO } from 'date-fns';
import { ExternalLink, Hash } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '../../../../components/ui/select';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '../../../../components/ui/sheet';
import { Textarea } from '../../../../components/ui/textarea';
import { dotStyle } from '../../../../lib/media/badge-color';
import type { MediaFormat, MediaGoal, MediaPost } from '../../../../lib/types/media';
import { cn } from '../../../../lib/utils';
import { PostedBadge } from '../../_components/media-badges';
import { ReferenceField } from '../../_components/reference-link';
import { savePost } from '../../_actions';

const NONE = '_none';

interface PostDetailSheetProps {
  open: boolean;
  onClose: () => void;
  /** null = create mode. */
  post: MediaPost | null;
  /** Prefilled when creating from a day cell. */
  defaultDate?: string;
  goals: MediaGoal[];
  formats: MediaFormat[];
}

interface FormState {
  post_date: string;
  week_label: string;
  goal_key: string;
  format_key: string;
  objective: string;
  visual_script: string;
  caption: string;
  cta: string;
  media_link: string;
  reference_url: string;
}

export function PostDetailSheet({
  open, onClose, post, defaultDate, goals, formats,
}: PostDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(value: boolean) => { if (!value) onClose(); }}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-[520px]">
        {open && (
          <PostForm
            key={post?.id ?? `new:${defaultDate ?? ''}`}
            post={post}
            defaultDate={defaultDate}
            goals={goals}
            formats={formats}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/** The column is a `date`, but PostgREST may hand back a longer string. */
const day = (value: string | null | undefined) => value?.slice(0, 10) ?? '';

function PostForm({
  post, defaultDate, goals, formats, onClose,
}: Omit<PostDetailSheetProps, 'open'>) {
  const [form, setForm] = React.useState<FormState>(() => ({
    post_date: day(post?.post_date) || defaultDate || '',
    week_label: post?.week_label ?? '',
    goal_key: post?.goal_key ?? '',
    format_key: post?.format_key ?? '',
    objective: post?.objective ?? '',
    visual_script: post?.visual_script ?? '',
    caption: post?.caption ?? '',
    cta: post?.cta ?? '',
    media_link: post?.media_link ?? '',
    reference_url: post?.reference_url ?? '',
  }));
  const [isPending, startTransition] = React.useTransition();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const goal = goals.find((g) => g.key === form.goal_key);
  // Named `formatRow` so it does not shadow date-fns' `format`.
  const formatRow = formats.find((f) => f.key === form.format_key);

  // Every post field is optional — there is nothing to validate client-side.
  function handleSubmit() {
    startTransition(async () => {
      const result = await savePost({
        id: post?.id,
        post_date: form.post_date || null,
        week_label: form.week_label || null,
        goal_key: form.goal_key || null,
        format_key: form.format_key || null,
        objective: form.objective || null,
        visual_script: form.visual_script || null,
        caption: form.caption || null,
        cta: form.cta || null,
        media_link: form.media_link || null,
        reference_url: form.reference_url || null,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't save the post");
        return;
      }
      toast.success(post ? 'Post updated' : 'Post created');
      onClose();
    });
  }

  const headerDate = post?.post_date
    ? format(parseISO(day(post.post_date)), 'EEEE, d MMMM yyyy')
    : 'Schedule a piece of content on the calendar.';

  return (
    <>
      <SheetHeader className="flex-row items-start justify-between gap-3 border-b border-black/[0.06] px-6 py-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <SheetTitle className="text-[16px] tracking-[-0.014em]">
            {post ? 'Post details' : 'New post'}
          </SheetTitle>
          <SheetDescription className="text-[13px]">{headerDate}</SheetDescription>
        </div>
        {post && (
          <div className="mr-8 flex shrink-0 flex-col items-end gap-1">
            <PostedBadge posted={post.posted} />
            {typeof post.week_no === 'number' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-black/35">
                <Hash size={10} strokeWidth={2} />
                Week {post.week_no}
              </span>
            )}
          </div>
        )}
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">Date</Label>
            <Input
              type="date"
              value={form.post_date}
              onChange={(e) => set('post_date', e.target.value)}
              className="h-9 text-[13px] tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">Week label</Label>
            <Input
              value={form.week_label}
              onChange={(e) => set('week_label', e.target.value)}
              placeholder="e.g. Launch week"
              className="h-9 text-[13px]"
            />
          </div>
        </div>

        {post && typeof post.week_no === 'number' && (
          <p className="-mt-2 text-[11.5px] text-black/35">
            Week number is calculated from the date by the database.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">Goal</Label>
            <Select
              value={form.goal_key || NONE}
              onValueChange={(v: string | null) => set('goal_key', v === NONE ? '' : (v ?? ''))}
            >
              <SelectTrigger className="h-9 w-full text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  {goal && <span aria-hidden className="size-2 shrink-0 rounded-full" style={dotStyle(goal.color)} />}
                  <span className={cn('truncate', form.goal_key ? 'text-foreground' : 'text-black/35')}>
                    {goal?.label ?? form.goal_key ?? 'None'}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-black/45">None</SelectItem>
                {goals.map((g) => (
                  <SelectItem key={g.key} value={g.key}>
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={dotStyle(g.color)} />
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">Format</Label>
            <Select
              value={form.format_key || NONE}
              onValueChange={(v: string | null) => set('format_key', v === NONE ? '' : (v ?? ''))}
            >
              <SelectTrigger className="h-9 w-full text-[13px]">
                <span className={cn('truncate', form.format_key ? 'text-foreground' : 'text-black/35')}>
                  {formatRow?.label ?? form.format_key ?? 'None'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-black/45">None</SelectItem>
                {formats.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">Objective</Label>
          <Input
            value={form.objective}
            onChange={(e) => set('objective', e.target.value)}
            placeholder="What should this post achieve?"
            className="h-9 text-[13px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">Text on visual / video script</Label>
          <Textarea
            rows={4}
            value={form.visual_script}
            onChange={(e) => set('visual_script', e.target.value)}
            placeholder="On-screen copy, shot list, or voiceover script."
            className="resize-none text-[13px] leading-relaxed"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">Caption</Label>
          <Textarea
            rows={5}
            value={form.caption}
            onChange={(e) => set('caption', e.target.value)}
            placeholder="The caption as it will be published."
            className="resize-none text-[13px] leading-relaxed"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="post-reference" className="text-[13px]">Reference</Label>
          <ReferenceField
            id="post-reference"
            value={form.reference_url}
            onChange={(v) => set('reference_url', v)}
          />
          <p className="text-[11.5px] text-black/35">
            Optional — the trend or example this is based on. Opens in a new tab.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">CTA</Label>
          <Input
            value={form.cta}
            onChange={(e) => set('cta', e.target.value)}
            placeholder="e.g. Book now via the link in bio"
            className="h-9 text-[13px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">Media link</Label>
          <div className="flex items-center gap-2">
            <Input
              value={form.media_link}
              onChange={(e) => set('media_link', e.target.value)}
              placeholder="https://…"
              className="h-9 text-[13px]"
            />
            {form.media_link.trim() && (
              <a
                href={form.media_link.trim()}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open media link in a new tab"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-black/[0.08] text-black/45 transition-colors hover:bg-black/[0.03] hover:text-black/70"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>

        {post?.source_idea_id && (
          <p className="rounded-xl bg-black/[0.025] px-3 py-2.5 text-[12px] text-black/45">
            Created from an idea in the Ideas board.
          </p>
        )}
      </div>

      <div className="flex flex-row justify-end gap-2 border-t border-black/[0.06] px-6 py-4">
        <Button variant="outline" size="lg" onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button size="lg" onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Saving…' : post ? 'Save changes' : 'Create post'}
        </Button>
      </div>
    </>
  );
}
