import * as React from 'react';
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

  const typeOption = INFLUENCER_TYPES.find((t) => t.value === form.type);
  const messagingOption = MESSAGING_STATUSES.find((m) => m.value === form.messaging_status);
  const decisionOption = FINAL_DECISIONS.find((d) => d.value === form.final_decision);

  function handleSubmit() {
    if (!form.name.trim()) {
      toast.error('Name is required');
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
        toast.error(result.error ?? "Couldn't save the influencer");
        return;
      }
      toast.success(influencer ? 'Influencer updated' : 'Influencer added');
      onClose();
    });
  }

  return (
    <>
      <SheetHeader className="border-b border-black/[0.06] px-6 py-5">
        <SheetTitle className="text-[16px] tracking-[-0.014em]">
          {influencer ? 'Edit influencer' : 'New influencer'}
        </SheetTitle>
        <SheetDescription className="text-[13px]">
          Creator contacts and where each one stands in the outreach pipeline.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            autoFocus
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Creator or account name"
            className="h-9 text-[13px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">Followers</Label>
            <Input
              value={form.followers_count}
              onChange={(e) => set('followers_count', e.target.value)}
              placeholder="e.g. 124K"
              className="h-9 text-[13px] tabular-nums"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">Type</Label>
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
                    {typeOption?.label ?? form.type ?? 'None'}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-black/45">None</SelectItem>
                {INFLUENCER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_DOTS[t.tone])} />
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">Country</Label>
          <CountryCombobox
            value={form.country}
            onChange={(code) => set('country', code)}
            placeholder="Select country"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">Profile URL</Label>
          <Input
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder="https://instagram.com/…"
            className="h-9 text-[13px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">Email / contact</Label>
          <Input
            value={form.email_contact}
            onChange={(e) => set('email_contact', e.target.value)}
            placeholder="name@example.com or a WhatsApp number"
            className="h-9 text-[13px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">Messaging status</Label>
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
                    {messagingOption?.label ?? form.messaging_status ?? 'Not set'}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-black/45">Not set</SelectItem>
                {MESSAGING_STATUSES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_DOTS[m.tone])} />
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px]">Final decision</Label>
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
                    {decisionOption?.label ?? form.final_decision ?? 'Not set'}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-black/45">Not set</SelectItem>
                {FINAL_DECISIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_DOTS[d.tone])} />
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[13px]">Notes</Label>
          <Textarea
            rows={4}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Rates, audience fit, past collaborations…"
            className="resize-none text-[13px] leading-relaxed"
          />
        </div>
      </div>

      <div className="flex flex-row justify-end gap-2 border-t border-black/[0.06] px-6 py-4">
        <Button variant="outline" size="lg" onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button size="lg" onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Saving…' : influencer ? 'Save changes' : 'Add influencer'}
        </Button>
      </div>
    </>
  );
}
