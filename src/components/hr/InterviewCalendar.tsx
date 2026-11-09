import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import { useDateLocale } from '../../hooks/useDateLocale';
import { istanbulDate } from '../../lib/istanbulTime';
import {
  clearOpenSlots,
  generateSlots,
  saveInterviewSettings,
  setSlotBlocked,
  type Applicant,
  type HrSlot,
  type Interview,
  type InterviewSettings,
  type Opening,
} from '../../lib/recruitment/hr';
import {
  DEFAULT_SLOT_MINUTES,
  INTERVIEW_LOCATIONS,
  SLOT_MINUTE_CHOICES,
  formatDayLabel,
  formatTime,
  istanbulDay,
  istanbulInstant,
  weightedScore,
} from '../../lib/recruitment/model';
import { ConfirmationChip, StageChip } from './HrParts';

const minutesOf = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * An opening's interview calendar for HR: where and how long, a day's window turned
 * into slots by `recruitment_generate_slots`, and the slots by day with who is in
 * each. Booking itself happens on the Interviews screen. Below, the scored interviews
 * ranked out of 100.
 */
export const InterviewCalendar: React.FC<{
  opening: Opening;
  settings: InterviewSettings | null;
  slots: HrSlot[];
  applicants: Applicant[];
  interviews: Interview[];
  profileId: string | null;
  onChanged: (message?: string) => void;
  onError: (message: string) => void;
  onOpenApplicant: (id: string) => void;
}> = ({ opening, settings, slots, applicants, interviews, profileId, onChanged, onError, onOpenApplicant }) => {
  const { t } = useTranslation('hr');
  const locale = useDateLocale();
  const [location, setLocation] = useState<string>(settings?.location ?? '');
  const [minutes, setMinutes] = useState<number>(settings?.slotMinutes ?? DEFAULT_SLOT_MINUTES);
  const [notes, setNotes] = useState(settings?.notes ?? '');
  const [day, setDay] = useState(istanbulDate());
  const [from, setFrom] = useState('10:00');
  const [to, setTo] = useState('14:00');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLocation(settings?.location ?? '');
    setMinutes(settings?.slotMinutes ?? DEFAULT_SLOT_MINUTES);
    setNotes(settings?.notes ?? '');
  }, [settings]);

  const byId = useMemo(() => new Map(applicants.map(a => [a.id, a])), [applicants]);
  const days = useMemo(() => {
    const map = new Map<string, HrSlot[]>();
    for (const slot of slots) {
      const key = istanbulDay(slot.startsAt);
      map.set(key, [...(map.get(key) ?? []), slot]);
    }
    return Array.from(map).sort(([a], [b]) => a.localeCompare(b));
  }, [slots]);

  const ranked = useMemo(() => applicants
    .map(applicant => {
      const best = interviews.filter(i => i.applicantId === applicant.id)
        .map(i => weightedScore(opening.interviewCriteria, i.scores))
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => b.total - a.total)[0];
      return best ? { applicant, score: best } : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.score.total - a.score.total), [applicants, interviews, opening.interviewCriteria]);

  const run = async (work: () => Promise<string | undefined>) => {
    setBusy(true);
    try { onChanged(await work()); } catch (reason) { onError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
  };

  const windowOk = /^\d{4}-\d{2}-\d{2}$/.test(day) && minutesOf(to) - minutesOf(from) >= minutes;

  return (
    <div className="hc-hr-calendar">
      <section className="hc-ce-section surface-depth">
        <header className="hc-ce-section-head"><div className="hc-ce-section-title"><h3>{t('calendar.settings')}</h3></div></header>
        <div className="hc-ce-grid">
          <label className="hc-ce-field">
            <span className="hc-field-label">{t('calendar.location')}</span>
            <select className="hc-input" value={location} onChange={e => setLocation(e.target.value)}>
              <option value="">{t('calendar.noLocation')}</option>
              {INTERVIEW_LOCATIONS.map(place => <option key={place} value={place}>{place}</option>)}
              {location && !(INTERVIEW_LOCATIONS as readonly string[]).includes(location) && <option value={location}>{location}</option>}
            </select>
          </label>
          <label className="hc-ce-field">
            <span className="hc-field-label">{t('calendar.slotMinutes')}</span>
            <select className="hc-input" value={minutes} onChange={e => setMinutes(Number(e.target.value))}>
              {SLOT_MINUTE_CHOICES.map(n => <option key={n} value={n}>{t('calendar.minutes', { count: n })}</option>)}
            </select>
          </label>
          <label className="hc-ce-field sm:col-span-2">
            <span className="hc-field-label">{t('calendar.notes')}</span>
            <input dir="auto" className="hc-input" value={notes} onChange={e => setNotes(e.target.value)} />
          </label>
        </div>
        <Button variant="secondary" className="hc-mg-small mt-3" disabled={busy}
          onClick={() => run(async () => { await saveInterviewSettings(opening.id, { slotMinutes: minutes, location: location || null, notes }, profileId); return t('common.saved'); })}>
          {t('calendar.saveSettings')}
        </Button>
      </section>

      <section className="hc-ce-section surface-depth">
        <header className="hc-ce-section-head"><div className="hc-ce-section-title"><h3>{t('calendar.addDay')}</h3></div></header>
        <div className="hc-hr-window">
          <label className="hc-ce-field"><span className="hc-field-label">{t('calendar.date')}</span><input type="date" dir="ltr" className="hc-input" value={day} min={istanbulDate()} onChange={e => setDay(e.target.value)} /></label>
          <label className="hc-ce-field"><span className="hc-field-label">{t('calendar.from')}</span><input type="time" dir="ltr" className="hc-input" value={from} step={300} onChange={e => setFrom(e.target.value)} /></label>
          <label className="hc-ce-field"><span className="hc-field-label">{t('calendar.to')}</span><input type="time" dir="ltr" className="hc-input" value={to} step={300} onChange={e => setTo(e.target.value)} /></label>
          <Button disabled={busy || !windowOk}
            onClick={() => run(async () => { const n = await generateSlots(opening.id, istanbulInstant(day, from), istanbulInstant(day, to), minutes); return t('calendar.generated', { count: n }); })}>
            {t('calendar.generate')}
          </Button>
        </div>
        {!windowOk && <p className="mt-2 text-[12px] text-[#B45309]">{t('calendar.windowError')}</p>}
      </section>

      {days.length === 0 ? (
        <div className="hc-ce-state rounded-[20px] border border-dashed border-black/[0.12] text-center">
          <p className="text-[15px] font-medium text-foreground">{t('calendar.noSlots')}</p>
          <p className="max-w-[340px] text-[13px] text-black/50">{t('calendar.noSlotsBody')}</p>
        </div>
      ) : days.map(([key, list]) => (
        <section key={key} className="hc-ce-section surface-depth">
          <header className="hc-ce-section-head">
            <div className="hc-ce-section-title"><h3>{formatDayLabel(key, locale, { weekday: 'long', day: 'numeric', month: 'long' })}</h3></div>
            {list.some(s => s.status === 'open') && (
              <Button variant="secondary" className="hc-mg-small ms-auto" disabled={busy}
                onClick={() => run(async () => { await clearOpenSlots(opening.id, istanbulInstant(key, '00:00'), istanbulInstant(nextDay(key), '00:00')); return t('calendar.cleared'); })}>
                {t('calendar.clearDay')}
              </Button>
            )}
          </header>
          <ul className="hc-hr-slotlist">
            {list.map(slot => {
              const who = slot.applicantId ? byId.get(slot.applicantId) : undefined;
              return (
                <li key={slot.id} className={`is-${slot.status}`}>
                  <span className="hc-num font-semibold" dir="ltr">{formatTime(slot.startsAt, locale)}–{formatTime(slot.endsAt, locale)}</span>
                  {who ? (
                    <button type="button" className="hc-hr-link min-w-0 truncate" onClick={() => onOpenApplicant(who.id)}><bdi dir="auto">{who.fullName}</bdi></button>
                  ) : <span className="text-black/45">{t(`slotStatus.${slot.status}`, { defaultValue: slot.status })}</span>}
                  {who && <ConfirmationChip status={who.confirmation} />}
                  {slot.status !== 'booked' && (
                    <button type="button" className="hc-hr-link ms-auto" disabled={busy} onClick={() => run(async () => { await setSlotBlocked(slot.id, slot.status === 'open'); return undefined; })}>
                      {slot.status === 'open' ? t('calendar.block') : t('calendar.unblock')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="hc-ce-section surface-depth">
        <header className="hc-ce-section-head"><div className="hc-ce-section-title"><h3>{t('calendar.leaderboard')}</h3></div></header>
        {ranked.length === 0 ? <p className="text-[13px] text-black/50">{t('calendar.leaderboardEmpty')}</p> : (
          <ol className="hc-hr-board">
            {ranked.map(({ applicant, score }, index) => (
              <li key={applicant.id}>
                <span className="hc-num w-6 text-black/40">{index + 1}</span>
                <button type="button" className="hc-hr-link min-w-0 flex-1 truncate text-start" onClick={() => onOpenApplicant(applicant.id)}><bdi dir="auto">{applicant.fullName}</bdi></button>
                <StageChip stage={applicant.stage} />
                <span className="hc-hr-meter" aria-hidden="true"><i style={{ width: `${score.total}%` }} /></span>
                <strong className="hc-num w-16 text-end">{score.total}/100</strong>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
};

export default InterviewCalendar;
