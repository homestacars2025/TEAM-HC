import * as React from 'react';
import { useTranslation } from 'react-i18next';
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
import { ReferenceField } from '../../_components/reference-link';
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
  reference_url: string;
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
  const { t } = useTranslation('media');
  const { t: tc } = useTranslation('common');
  const [form, setForm] = React.useState<FormState>(() => ({
    title: idea?.title ?? '',
    content: idea?.content ?? '',
    category: idea?.category ?? defaultCategory ?? '',
    goal_key: idea?.goal_key ?? '',
    format_key: idea?.format_key ?? '',
    note: idea?.note ?? '',
    reference_url: idea?.reference_url ?? '',
  }));
  const [isPending, startTransition] = React.useTransition();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const goal = goals.find((g) => g.key === form.goal_key);
  const format = formats.find((f) => f.key === form.format_key);

  function handleSubmit() {
    if (!form.title.trim()) {
      toast.error(t('errors.titleRequired'));
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
        reference_url: form.reference_url || null,
      });
      if (!result.ok) {
        toast.error(result.error ?? t('errors.saveIdea'));
        return;
      }
      toast.success(idea ? t('ideas.toast.updated') : t('ideas.toast.added'));
      onClose();
    });
  }

  return (
    <>
      <SheetHeader className="border-b border-black/[0.06] px-6 py-5">
        <SheetTitle className="text-[16px] tracking-[-0.014em]">
          {idea ? t('ideas.form.editTitle') : t('ideas.form.newTitle')}
        </SheetTitle>
        <SheetDescription className="text-[13px]">
          {idea ? t('ideas.form.editSubtitle') : t('ideas.form.newSubtitle')}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">
            {t('ideas.form.title')} <span className="text-destructive">*</span>
          </Label>
          <Input
            autoFocus
            dir="auto"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder={t('ideas.form.titlePlaceholder')}
            className="h-9 text-[13px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">{t('ideas.form.content')}</Label>
          <Textarea
            rows={5}
            dir="auto"
            value={form.content}
            onChange={(e) => set('content', e.target.value)}
            placeholder={t('ideas.form.contentPlaceholder')}
            className="resize-none text-[13px] leading-relaxed"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="idea-reference" className="text-[13px]">{t('reference.label')}</Label>
          <ReferenceField
            id="idea-reference"
            value={form.reference_url}
            onChange={(v) => set('reference_url', v)}
          />
          <p className="text-[11.5px] text-black/35">{t('reference.hint')}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">{t('ideas.form.category')}</Label>
            <Select
              value={form.category || NONE}
              onValueChange={(v: string | null) => set('category', v === NONE ? '' : (v ?? ''))}
            >
              <SelectTrigger className="h-9 w-full text-[13px]">
                <span className={cn('truncate', form.category ? 'text-foreground' : 'text-black/35')}>
                  {form.category ? t(`category.${form.category}`, { defaultValue: form.category }) : t('none')}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-black/45">{t('none')}</SelectItem>
                {/* `value` is what lands in the column — English, always. */}
                {IDEA_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{t(`category.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">{t('colorMode.format')}</Label>
            <Select
              value={form.format_key || NONE}
              onValueChange={(v: string | null) => set('format_key', v === NONE ? '' : (v ?? ''))}
            >
              <SelectTrigger className="h-9 w-full text-[13px]">
                <span className={cn('truncate', form.format_key ? 'text-foreground' : 'text-black/35')}>
                  {format?.label ?? form.format_key ?? t('none')}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-black/45">{t('none')}</SelectItem>
                {formats.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">{t('colorMode.goal')}</Label>
          <Select
            value={form.goal_key || NONE}
            onValueChange={(v: string | null) => set('goal_key', v === NONE ? '' : (v ?? ''))}
          >
            <SelectTrigger className="h-9 w-full text-[13px]">
              <span className="flex min-w-0 items-center gap-2">
                {goal && <span aria-hidden className="size-2 shrink-0 rounded-full" style={dotStyle(goal.color)} />}
                <span className={cn('truncate', form.goal_key ? 'text-foreground' : 'text-black/35')}>
                  {goal?.label ?? form.goal_key ?? t('none')}
                </span>
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} className="text-black/45">{t('none')}</SelectItem>
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
          <Label className="text-[13px]">{t('ideas.form.note')}</Label>
          <Textarea
            rows={3}
            dir="auto"
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder={t('ideas.form.notePlaceholder')}
            className="resize-none text-[13px] leading-relaxed"
          />
        </div>
      </div>

      <div className="flex flex-row justify-end gap-2 border-t border-black/[0.06] px-6 py-4">
        <Button variant="outline" size="lg" onClick={onClose} disabled={isPending}>{tc('actions.cancel')}</Button>
        <Button size="lg" onClick={handleSubmit} disabled={isPending}>
          {isPending ? tc('actions.saving') : idea ? tc('actions.saveChanges') : t('ideas.form.submit')}
        </Button>
      </div>
    </>
  );
}
