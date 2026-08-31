import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../../../components/ui/button';
import { CountryCombobox } from '../../../../components/ui/country-combobox';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '../../../../components/ui/select';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '../../../../components/ui/sheet';
import { Textarea } from '../../../../components/ui/textarea';
import { TONE_DOTS } from '../../../../lib/media/badge-color';
import {
  FINAL_DECISIONS, INFLUENCER_TYPES, MESSAGING_STATUSES, type MediaInfluencer,
} from '../../../../lib/types/media';
import { cn } from '../../../../lib/utils';
import { saveInfluencer } from '../../_actions';

const NONE = '_none';

interface InfluencerFormSheetProps {
  open: boolean;
  onClose: () => void;
  /** null = create mode. */
  influencer: MediaInfluencer | null;
}

interface FormState {
  name: string;
  followers_count: string;
  url: string;
  email_contact: string;
  type: string;
  country: string;
  notes: string;
  messaging_status: string;
  final_decision: string;
}

export function InfluencerFormSheet({ open, onClose, influencer }: InfluencerFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(value: boolean) => { if (!value) onClose(); }}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-[480px]">
        {open && <InfluencerForm key={influencer?.id ?? 'new'} influencer={influencer} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function InfluencerForm({
  influencer, onClose,
}: { influencer: MediaInfluencer | null; onClose: () => void }) {
  const { t } = useTranslation('media');
  const { t: tc } = useTranslation('common');
  const [form, setForm] = React.useState<FormState>(() => ({
    name: influencer?.name ?? '',
    followers_count: influencer?.followers_count ?? '',
    url: influencer?.url ?? '',
    email_contact: influencer?.email_contact ?? '',
    type: influencer?.type ?? '',
    country: influencer?.country ?? '',
    notes: influencer?.notes ?? '',
    messaging_status: influencer?.messaging_status ?? '',
    final_decision: influencer?.final_decision ?? '',
  }));
  const [isPending, startTransition] = React.useTransition();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const typeOption = INFLUENCER_TYPES.find((ty) => ty.value === form.type);
  const messagingOption = MESSAGING_STATUSES.find((m) => m.value === form.messaging_status);
  const decisionOption = FINAL_DECISIONS.find((d) => d.value === form.final_decision);

  function handleSubmit() {
    if (!form.name.trim()) {
      toast.error(t('errors.nameRequired'));
      return;
    }
    startTransition(async () => {
      const result = await saveInfluencer({
        id: influencer?.id,
        name: form.name,
        followers_count: form.followers_count || null,
        url: form.url || null,
        email_contact: form.email_contact || null,
        type: form.type || null,
        country: form.country || null,
        notes: form.notes || null,
        messaging_status: form.messaging_status || null,
        final_decision: form.final_decision || null,
      });
      if (!result.ok) {
        toast.error(result.error ?? t('errors.saveInfluencer'));
        return;
      }
      toast.success(influencer ? t('influencers.toast.updated') : t('influencers.toast.added'));
      onClose();
    });
  }

  return (
    <>
      <SheetHeader className="border-b border-black/[0.06] px-6 py-5">
        <SheetTitle className="text-[16px] tracking-[-0.014em]">
          {influencer ? t('influencers.form.editTitle') : t('influencers.form.newTitle')}
        </SheetTitle>
        <SheetDescription className="text-[13px]">{t('influencers.form.subtitle')}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">
            {tc('fields.name')} <span className="text-destructive">*</span>
          </Label>
          <Input
            autoFocus
            dir="auto"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={t('influencers.form.namePlaceholder')}
            className="h-9 text-[13px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">{t('influencers.columns.followers')}</Label>
            <Input
              dir="ltr"
              value={form.followers_count}
              onChange={(e) => set('followers_count', e.target.value)}
              placeholder={t('influencers.form.followersPlaceholder')}
              className="h-9 text-[13px] tabular-nums"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">{tc('fields.type')}</Label>
            <Select
              value={form.type || NONE}
              onValueChange={(v: string | null) => set('type', v === NONE ? '' : (v ?? ''))}
            >
              <SelectTrigger className="h-9 w-full text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  {typeOption && (
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_DOTS[typeOption.tone])} />
                  )}
                  <span className={cn('truncate', form.type ? 'text-foreground' : 'text-black/35')}>
                    {form.type ? t(`influencerType.${form.type}`, { defaultValue: form.type }) : t('none')}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-black/45">{t('none')}</SelectItem>
                {INFLUENCER_TYPES.map((ty) => (
                  <SelectItem key={ty.value} value={ty.value}>
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_DOTS[ty.tone])} />
                    {t(`influencerType.${ty.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">{tc('fields.country')}</Label>
          <CountryCombobox
            value={form.country}
            onChange={(code) => set('country', code)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">{t('influencers.form.profileUrl')}</Label>
          <Input
            dir="ltr"
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder={t('influencers.form.profileUrlPlaceholder')}
            className="h-9 text-[13px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">{t('influencers.form.emailContact')}</Label>
          <Input
            dir="ltr"
            value={form.email_contact}
            onChange={(e) => set('email_contact', e.target.value)}
            placeholder={t('influencers.form.emailContactPlaceholder')}
            className="h-9 text-[13px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">{t('influencers.form.messagingStatus')}</Label>
            <Select
              value={form.messaging_status || NONE}
              onValueChange={(v: string | null) => set('messaging_status', v === NONE ? '' : (v ?? ''))}
            >
              <SelectTrigger className="h-9 w-full text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  {messagingOption && (
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_DOTS[messagingOption.tone])} />
                  )}
                  <span className={cn('truncate', form.messaging_status ? 'text-foreground' : 'text-black/35')}>
                    {form.messaging_status
                      ? t(`messagingStatus.${form.messaging_status}`, { defaultValue: form.messaging_status })
                      : t('influencers.notSet')}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-black/45">{t('influencers.notSet')}</SelectItem>
                {MESSAGING_STATUSES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_DOTS[m.tone])} />
                    {t(`messagingStatus.${m.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">{t('influencers.form.finalDecision')}</Label>
            <Select
              value={form.final_decision || NONE}
              onValueChange={(v: string | null) => set('final_decision', v === NONE ? '' : (v ?? ''))}
            >
              <SelectTrigger className="h-9 w-full text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  {decisionOption && (
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_DOTS[decisionOption.tone])} />
                  )}
                  <span className={cn('truncate', form.final_decision ? 'text-foreground' : 'text-black/35')}>
                    {form.final_decision
                      ? t(`finalDecision.${form.final_decision}`, { defaultValue: form.final_decision })
                      : t('influencers.notSet')}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-black/45">{t('influencers.notSet')}</SelectItem>
                {FINAL_DECISIONS.map((dec) => (
                  <SelectItem key={dec.value} value={dec.value}>
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_DOTS[dec.tone])} />
                    {t(`finalDecision.${dec.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">{tc('fields.notes')}</Label>
          <Textarea
            rows={4}
            dir="auto"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder={t('influencers.form.notesPlaceholder')}
            className="resize-none text-[13px] leading-relaxed"
          />
        </div>
      </div>

      <div className="flex flex-row justify-end gap-2 border-t border-black/[0.06] px-6 py-4">
        <Button variant="outline" size="lg" onClick={onClose} disabled={isPending}>{tc('actions.cancel')}</Button>
        <Button size="lg" onClick={handleSubmit} disabled={isPending}>
          {isPending ? tc('actions.saving') : influencer ? tc('actions.saveChanges') : t('influencers.form.submit')}
        </Button>
      </div>
    </>
  );
}
