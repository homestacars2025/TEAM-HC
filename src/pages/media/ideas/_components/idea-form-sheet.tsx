import * as React from 'react';
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
import { IDEA_CATEGORIES, type MediaFormat, type MediaGoal, type MediaIdea } from '../../../../lib/types/media';
import { cn } from '../../../../lib/utils';
import { saveIdea } from '../../_actions';

/** A Select cannot hold `""`, so "no choice" is a sentinel mapped back to null. */
const NONE = '_none';

interface IdeaFormSheetProps {
  open: boolean;
  onClose: () => void;
  /** null = create mode. */
  idea: MediaIdea | null;
  goals: MediaGoal[];
  formats: MediaFormat[];
  /** Preselected when opened from a category tab. */
  defaultCategory?: string;
}

interface FormState {
  title: string;
  content: string;
  category: string;
  goal_key: string;
  format_key: string;
  note: string;
}

export function IdeaFormSheet({
  open, onClose, idea, goals, formats, defaultCategory,
}: IdeaFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(value: boolean) => { if (!value) onClose(); }}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-[480px]">
        {/* Mounted only while open and keyed by target: the form seeds its state
            once per opening, so there is no stale draft to reconcile. */}
        {open && (
          <IdeaForm
            key={idea?.id ?? `new:${defaultCategory ?? ''}`}
            idea={idea}
            goals={goals}
            formats={formats}
            defaultCategory={defaultCategory}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function IdeaForm({
  idea, goals, formats, defaultCategory, onClose,
}: Omit<IdeaFormSheetProps, 'open'>) {
  const [form, setForm] = React.useState<FormState>(() => ({
    title: idea?.title ?? '',
    content: idea?.content ?? '',
    category: idea?.category ?? defaultCategory ?? '',
    goal_key: idea?.goal_key ?? '',
    format_key: idea?.format_key ?? '',
    note: idea?.note ?? '',
  }));
  const [isPending, startTransition] = React.useTransition();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const goal = goals.find((g) => g.key === form.goal_key);
  const format = formats.find((f) => f.key === form.format_key);

  function handleSubmit() {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    startTransition(async () => {
      const result = await saveIdea({
        id: idea?.id,
        title: form.title,
        content: form.content || null,
        category: form.category || null,
        goal_key: form.goal_key || null,
        format_key: form.format_key || null,
        note: form.note || null,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't save the idea");
        return;
      }
      toast.success(idea ? 'Idea updated' : 'Idea added');
      onClose();
    });
  }

  return (
    <>
      <SheetHeader className="border-b border-black/[0.06] px-6 py-5">
        <SheetTitle className="text-[16px] tracking-[-0.014em]">
          {idea ? 'Edit idea' : 'New idea'}
        </SheetTitle>
        <SheetDescription className="text-[13px]">
          {idea
            ? 'Update the concept. Posted and Approved stay with the admin.'
            : 'Capture the concept — you can turn it into a scheduled post later.'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">
            Title <span className="text-destructive">*</span>
          </Label>
          <Input
            autoFocus
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Sunrise terrace tour"
            className="h-9 text-[13px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">Content</Label>
          <Textarea
            rows={5}
            value={form.content}
            onChange={(e) => set('content', e.target.value)}
            placeholder="What is the piece about? This becomes the first draft of the caption."
            className="resize-none text-[13px] leading-relaxed"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">Category</Label>
            <Select
              value={form.category || NONE}
              onValueChange={(v: string | null) => set('category', v === NONE ? '' : (v ?? ''))}
            >
              <SelectTrigger className="h-9 w-full text-[13px]">
                <span className={cn('truncate', form.category ? 'text-foreground' : 'text-black/35')}>
                  {form.category || 'None'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-black/45">None</SelectItem>
                {IDEA_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
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
                  {format?.label ?? form.format_key ?? 'None'}
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
          <Label className="text-[13px]">Note</Label>
          <Textarea
            rows={3}
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="Internal reminder — props needed, location, who shoots it…"
            className="resize-none text-[13px] leading-relaxed"
          />
        </div>
      </div>

      <div className="flex flex-row justify-end gap-2 border-t border-black/[0.06] px-6 py-4">
        <Button variant="outline" size="lg" onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button size="lg" onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Saving…' : idea ? 'Save changes' : 'Add idea'}
        </Button>
      </div>
    </>
  );
}
