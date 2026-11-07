import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import { OptionSwitch } from '../booking/OptionCards';
import { useBlockedPage } from '../../hooks/useBlockedPage';
import {
  BASIC_FIELDS,
  CATEGORIES,
  EMPTY_FORM,
  FUELS,
  TRANSMISSIONS,
  changedFields,
  discounted,
  editableFields,
  formPayload,
  imageProblem,
  listPriceTry,
  parseNumber,
  saveModelGroup,
  saveTierChanges,
  tierChangeCount,
  tierChanges,
  tierDraftChangeCount,
  toForm,
  toTierDrafts,
  uploadGroupImage,
  validateForm,
  validateTiers,
  type FormField,
  type ModelGroupAccess,
  type ModelGroupForm,
  type ModelGroupRow,
  type PricingTier,
  type TierDraft,
} from '../../lib/modelGroups';
import { GroupImage, lira, usd, useSpecLabel } from './ModelGroupCard';
import { SpecIcon3D } from './SpecIcon3D';

const ICON_DIR = '/icons/3d/cars';

const CloseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);
const LockIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2" stroke="currentColor" strokeWidth="2" /><path d="M8 10.5V7.5a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);
const TrashIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const PlusIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);
const PriceTag: React.FC = () => (
  <span className="grid h-10 w-10 flex-none place-items-center rounded-[12px] bg-[linear-gradient(160deg,#9CCBF7,#3A74C2)] text-white shadow-[0_6px_14px_-6px_rgba(58,116,194,0.6)]" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 12V4.5A1.5 1.5 0 014.5 3H12l9 9-9 9-9-9z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" /></svg>
  </span>
);
const RulesIcon: React.FC = () => (
  <span className="grid h-10 w-10 flex-none place-items-center rounded-[12px] bg-[linear-gradient(160deg,#A7F3D0,#059669)] text-white shadow-[0_6px_14px_-6px_rgba(5,150,105,0.55)]" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3L4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);
const Img3D: React.FC<{ name: string }> = ({ name }) => <img className="hc-ce-icon" src={`${ICON_DIR}/${name}.png`} alt="" width={40} height={40} decoding="async" />;

const Section: React.FC<{ id: string; icon: React.ReactNode; title: string; locked?: boolean; action?: React.ReactNode; children: React.ReactNode }> = ({ id, icon, title, locked, action, children }) => {
  const { t } = useTranslation('modelGroups');
  return (
    <section className="hc-ce-section surface-depth" aria-labelledby={id}>
      <header className="hc-ce-section-head">
        {icon}
        <div className="hc-ce-section-title">
          <h3 id={id}>{title}</h3>
          {locked && <span className="hc-ce-lock" title={t('sheet.lockedHint')}><LockIcon />{t('sheet.locked')}</span>}
        </div>
        {action && <div className="ms-auto">{action}</div>}
      </header>
      {children}
    </section>
  );
};

const Field: React.FC<{ label: string; changed?: boolean; error?: string; hint?: React.ReactNode; span?: boolean; children: React.ReactNode }> = ({ label, changed, error, hint, span, children }) => (
  <label className={`hc-ce-field ${span ? 'sm:col-span-2' : ''}`} data-field-error={error ? 'true' : undefined}>
    <span className="hc-field-label">
      {label}
      {changed && <span aria-hidden="true" className="ms-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#F59E0B] align-middle" />}
    </span>
    {children}
    {error ? <span className="hc-field-error" role="alert">{error}</span> : hint ? <span className="mt-1 text-[12px] text-black/45">{hint}</span> : null}
  </label>
);

const Locked: React.FC<{ label: string; value: React.ReactNode; span?: boolean }> = ({ label, value, span }) => (
  <div className={`hc-ce-field ${span ? 'sm:col-span-2' : ''}`}>
    <div className="hc-field-label">{label}</div>
    <div className="hc-ce-locked" aria-readonly="true">{value}</div>
  </div>
);

let newTierKey = 0;

/** A failure already worded for the person: the tiers, after the group itself may have saved. */
class TierSaveError extends Error {}

/**
 * Add or edit a model group. Admins change everything; staff with the Model Groups
 * page change the specs and the photo, and see the rest locked. Only the columns
 * this person may change are ever sent.
 */
export const ModelGroupSheet: React.FC<{
  group: ModelGroupRow | null;
  tiers: PricingTier[];
  usdRate: number | null;
  access: ModelGroupAccess;
  onClose: () => void;
  /** After any write, with what to tell the person; the page reloads what changed. */
  onSaved: (message: string | null) => void;
}> = ({ group, tiers, usdRate, access, onClose, onSaved }) => {
  const { t } = useTranslation(['modelGroups', 'common']);
  const specLabel = useSpecLabel();
  useBlockedPage();
  const ids = useId();
  const fields = useMemo(() => editableFields(access), [access]);
  const canAll = access.canEditAll;

  const [savedGroup, setSavedGroup] = useState<ModelGroupRow | null>(group);
  const [baseline, setBaseline] = useState<ModelGroupForm>(() => (group ? toForm(group) : EMPTY_FORM));
  const [form, setForm] = useState<ModelGroupForm>(baseline);
  const [tierBase] = useState<PricingTier[]>(tiers);
  const [drafts, setDrafts] = useState<TierDraft[]>(() => toTierDrafts(tiers));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [imageError, setImageError] = useState<'badType' | 'tooBig' | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const nameTouched = useRef(Boolean(group && group.name.trim() !== [group.brand, group.model].filter(Boolean).join(' ').trim()));
  const fileInput = useRef<HTMLInputElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => { sheet.current?.focus(); }, []);

  useEffect(() => {
    if (!imageFile) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(imageFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const changed = changedFields(form, baseline).filter((key) => fields.has(key));
  const tierCount = canAll ? tierDraftChangeCount(tierBase, drafts) : 0;
  const imageChanged = imageFile !== null || imageRemoved;
  const unsaved = changed.length + tierCount + (imageChanged ? 1 : 0);
  const dirty = unsaved > 0;
  const errors = validateForm(form, fields);
  const tierErrors = canAll ? validateTiers(drafts) : {};
  const visibleErrors = showErrors ? errors : {};
  const visibleTierErrors = showErrors ? tierErrors : {};
  const isNew = savedGroup === null;
  const listTry = listPriceTry(parseNumber(form.price) ?? null, usdRate);
  const currentImage = imageRemoved ? null : preview ?? savedGroup?.image_url ?? null;
  const changedSet = new Set<FormField>(changed);
  const errorText = (key: FormField) => (visibleErrors[key] ? t(`errors.${visibleErrors[key]}`) : undefined);

  const set = (key: FormField, value: string) => {
    setSaveError(null);
    setForm((current) => {
      const next = { ...current, [key]: value };
      if ((key === 'brand' || key === 'model') && !nameTouched.current) next.name = `${next.brand} ${next.model}`.replace(/\s+/g, ' ').trim();
      return next;
    });
  };

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    const problem = imageProblem(file);
    setImageError(problem);
    if (problem) return;
    setImageFile(file);
    setImageRemoved(false);
  };

  const editTier = (key: string, patch: Partial<TierDraft>) => setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  const addTier = () => setDrafts((current) => {
    const last = current.reduce((max, draft) => Math.max(max, parseNumber(draft.max_days) ?? 0), 0);
    newTierKey += 1;
    return [...current, { key: `new-${newTierKey}`, id: null, min_days: String(last + 1), max_days: String(last + 30), discount_percent: '', is_active: true }];
  });

  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty) setConfirm(true);
    else onClose();
  }, [dirty, saving, onClose]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (confirm) setConfirm(false);
    else requestClose();
  };

  const save = async () => {
    if (!dirty || saving) return;
    setShowErrors(true);
    setSaveError(null);
    if (Object.keys(errors).length > 0 || Object.keys(tierErrors).length > 0) {
      window.requestAnimationFrame(() => sheet.current?.querySelector('[data-field-error="true"], [data-tier-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    setSaving(true);
    let wroteGroup = false;
    const name = form.name.trim() || `${form.brand} ${form.model}`.trim();
    try {
      if (changed.length > 0 || imageChanged || isNew) {
        let imageUrl = savedGroup?.image_url ?? null;
        if (imageFile) imageUrl = await uploadGroupImage(name, imageFile);
        else if (imageRemoved) imageUrl = null;
        const payload = { ...formPayload(form, isNew ? fields : new Set(changed)), ...(imageChanged ? { image_url: imageUrl } : {}) };
        const id = await saveModelGroup(savedGroup?.id ?? null, payload);
        wroteGroup = true;
        setSavedGroup((current) => ({ ...(current ?? { id, ...toRowDefaults() }), id, image_url: imageUrl }));
        setBaseline(form);
        setImageFile(null);
        setImageRemoved(false);
      }
      if (canAll) {
        const changes = tierChanges(tierBase, drafts);
        if (tierChangeCount(changes) > 0) {
          try {
            await saveTierChanges(changes);
          } catch (reason) {
            const detail = reason instanceof Error ? reason.message : String(reason);
            throw new TierSaveError(wroteGroup ? t('sheet.tiersFailed', { reason: detail }) : t('sheet.tiersOnlyFailed', { reason: detail }));
          }
        }
      }
      onSaved(isNew ? t('sheet.addedToast', { name }) : t('sheet.saved'));
      onClose();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setSaveError(reason instanceof TierSaveError ? message : t('sheet.saveFailed', { reason: message }));
      if (wroteGroup) onSaved(null);
    } finally {
      setSaving(false);
    }
  };

  const field = (key: FormField, label: string, input: React.ReactNode, options: { hint?: React.ReactNode; span?: boolean; locked?: React.ReactNode } = {}) => (
    fields.has(key)
      ? <Field key={key} label={label} changed={changedSet.has(key)} error={errorText(key)} hint={options.hint} span={options.span}>{input}</Field>
      : <Locked key={key} label={label} span={options.span} value={options.locked ?? (form[key].trim() || '—')} />
  );
  const numberInput = (key: FormField, label: string, placeholder: string, mode: 'numeric' | 'decimal' = 'numeric', prefix?: string) => (
    <div className="relative" dir="ltr">
      {prefix && <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[15px] text-black/40">{prefix}</span>}
      <input dir="ltr" className={`hc-input tabular-nums ${prefix ? '!ps-7' : ''} ${visibleErrors[key] ? 'is-invalid' : ''}`} inputMode={mode} aria-label={label} value={form[key]} placeholder={placeholder}
        aria-invalid={Boolean(visibleErrors[key])} onChange={(event) => set(key, event.target.value)} />
    </div>
  );
  const shown = (value: string, render: (n: number) => string) => { const parsed = parseNumber(value); return parsed === null || Number.isNaN(parsed) ? '—' : render(parsed); };
  const basicLocked = !BASIC_FIELDS.some((key) => fields.has(key));

  return ReactDOM.createPortal(
    <div className="hc-ce-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <div ref={sheet} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`${ids}-title`} className="hc-ce hc-mg-sheet surface-float" onKeyDown={onKeyDown}>
        <header className="hc-ce-head">
          <div className="hc-ce-head-text">
            <h2 id={`${ids}-title`} dir="auto">{isNew ? t('sheet.newTitle') : form.name || t('sheet.editTitle')}</h2>
            <p className="mt-0.5 text-[13px] text-black/50">{isNew ? t('sheet.newSubtitle') : savedGroup?.category ? specLabel('category', savedGroup.category) : t('sheet.editTitle')}</p>
          </div>
          <button type="button" className="hc-ce-close" aria-label={t('common:actions.close')} onClick={requestClose} disabled={saving}><CloseIcon /></button>
        </header>

        <div className="hc-ce-body">
          {!canAll && <p className="rounded-[12px] border border-[#4ba6ea]/25 bg-[#4ba6ea]/[0.07] px-3.5 py-2.5 text-[13px] text-[#1E4E8C]">{t('sheet.staffNote')}</p>}
          {saveError && <p role="alert" className="rounded-[12px] border border-[#dc2626]/20 bg-[#fef2f2] px-3.5 py-2.5 text-[13px] text-[#b42318]">{saveError}</p>}

          <Section id={`${ids}-basic`} icon={<Img3D name="info" />} title={t('sheet.sections.basic')} locked={basicLocked}>
            <div className="hc-ce-grid">
              {field('brand', t('sheet.fields.brand'), <input dir="auto" className={`hc-input ${visibleErrors.brand ? 'is-invalid' : ''}`} value={form.brand} placeholder="Renault" onChange={(event) => set('brand', event.target.value)} />)}
              {field('model', t('sheet.fields.model'), <input dir="auto" className={`hc-input ${visibleErrors.model ? 'is-invalid' : ''}`} value={form.model} placeholder="Clio" onChange={(event) => set('model', event.target.value)} />)}
              {field('name', t('sheet.fields.name'), (
                <input dir="auto" className={`hc-input ${visibleErrors.name ? 'is-invalid' : ''}`} value={form.name} placeholder="Renault Clio" onChange={(event) => { nameTouched.current = true; set('name', event.target.value); }} />
              ), { span: true, hint: nameTouched.current ? undefined : t('sheet.fields.nameHint') })}
              {fields.has('category') ? (
                <Field label={t('sheet.fields.category')} changed={changedSet.has('category')} span>
                  <span className="flex flex-wrap gap-1.5" role="group" aria-label={t('sheet.fields.category')}>
                    {CATEGORIES.map((category) => (
                      <button key={category} type="button" aria-pressed={form.category === category} onClick={() => set('category', category)}
                        className={`min-h-[44px] rounded-full border px-3.5 text-[13px] font-medium transition-colors md:min-h-[36px] ${form.category === category ? 'border-[#4ba6ea] bg-[#4ba6ea]/[0.12] text-[#1E4E8C]' : 'border-[var(--border-subtle)] bg-white text-black/60 hover:bg-black/[0.03]'}`}>
                        {specLabel('category', category)}
                      </button>
                    ))}
                  </span>
                </Field>
              ) : <Locked label={t('sheet.fields.category')} value={specLabel('category', form.category)} span />}
            </div>
          </Section>

          <Section id={`${ids}-specs`} icon={<span className="grid h-10 w-10 flex-none place-items-center"><SpecIcon3D name="transmission" size={34} /></span>} title={t('sheet.sections.specs')}>
            <div className="hc-ce-grid">
              {field('transmission', t('sheet.fields.transmission'), (
                <span role="group" aria-label={t('sheet.fields.transmission')} className="hc-seg hc-seg-full">
                  {TRANSMISSIONS.map((value) => (
                    <button key={value} type="button" aria-pressed={form.transmission === value} onClick={() => set('transmission', value)} className="!min-h-[40px]">{specLabel('transmission', value)}</button>
                  ))}
                </span>
              ), { locked: specLabel('transmission', form.transmission) })}
              {field('fuel', t('sheet.fields.fuel'), (
                <select className="hc-input" aria-label={t('sheet.fields.fuel')} value={form.fuel} onChange={(event) => set('fuel', event.target.value)}>
                  {FUELS.map((fuel) => <option key={fuel} value={fuel}>{specLabel('fuel', fuel)}</option>)}
                  {!(FUELS as readonly string[]).includes(form.fuel) && <option value={form.fuel}>{form.fuel}</option>}
                </select>
              ), { locked: specLabel('fuel', form.fuel) })}
              {field('seats', t('sheet.fields.seats'), numberInput('seats', t('sheet.fields.seats'), '5'))}
              {field('luggage', t('sheet.fields.luggage'), numberInput('luggage', t('sheet.fields.luggage'), '2'))}
            </div>
          </Section>

          <Section id={`${ids}-pricing`} icon={<PriceTag />} title={t('sheet.sections.pricing')} locked={!canAll}
            action={canAll ? <Button variant="secondary" className="hc-mg-small" onClick={addTier}><PlusIcon /> {t('sheet.tiers.add')}</Button> : undefined}>
            <div className="hc-ce-grid">
              {field('price', t('sheet.fields.price'), numberInput('price', t('sheet.fields.price'), '45', 'decimal', '$'), {
                span: true,
                hint: listTry !== null ? t('sheet.fields.priceHint', { price: `⁦${lira(listTry)}⁩` }) : t('sheet.fields.priceHintNoRate'),
                locked: <bdi className="hc-num">{shown(form.price, usd)}{listTry !== null ? ` · ≈ ${lira(listTry)}` : ''}</bdi>,
              })}
            </div>
            <div className="mt-4">
              <div className="mb-2 text-[12.5px] font-medium text-black/65">{t('sheet.tiers.title')}</div>
              {canAll && <p className="mb-2 text-[12px] text-black/50">{t('sheet.tiers.shared')}</p>}
              <div className="overflow-x-auto rounded-[12px] border border-[var(--border-subtle)] bg-white">
                <table className="w-full min-w-[460px] text-[13px]">
                  <thead>
                    <tr className="text-[11.5px] text-black/45">
                      <th scope="col" className="px-3 py-2 text-start font-medium">{t('sheet.tiers.from')}</th>
                      <th scope="col" className="px-3 py-2 text-start font-medium">{t('sheet.tiers.to')}</th>
                      <th scope="col" className="px-3 py-2 text-start font-medium">{t('sheet.tiers.discount')}</th>
                      <th scope="col" className="px-3 py-2 text-end font-medium" title={t('sheet.tiers.perDayHint')}>{t('sheet.tiers.perDay')}</th>
                      <th scope="col" className="px-3 py-2 text-center font-medium">{t('sheet.tiers.on')}</th>
                      {canAll && <th scope="col" className="w-12 px-2 py-2"><span className="sr-only">{t('common:actions.remove')}</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.length === 0 && (
                      <tr><td colSpan={canAll ? 6 : 5} className="px-3 py-4 text-center text-[12.5px] text-black/45">{t('sheet.tiers.none')}</td></tr>
                    )}
                    {drafts.map((draft) => {
                      const pct = parseNumber(draft.discount_percent);
                      const tierError = visibleTierErrors[draft.key];
                      const range = { from: draft.min_days, to: draft.max_days };
                      const perDay = listTry !== null && pct !== null && !Number.isNaN(pct) ? lira(discounted(listTry, pct)) : '—';
                      return (
                        <React.Fragment key={draft.key}>
                          {canAll ? (
                            <tr className="border-t border-black/[0.05]" data-tier-error={tierError ? 'true' : undefined}>
                              <td className="px-2 py-1.5"><input dir="ltr" aria-label={t('sheet.tiers.from')} className="hc-input !min-h-[40px] w-20 tabular-nums" inputMode="numeric" value={draft.min_days} onChange={(event) => editTier(draft.key, { min_days: event.target.value })} /></td>
                              <td className="px-2 py-1.5"><input dir="ltr" aria-label={t('sheet.tiers.to')} className="hc-input !min-h-[40px] w-20 tabular-nums" inputMode="numeric" value={draft.max_days} onChange={(event) => editTier(draft.key, { max_days: event.target.value })} /></td>
                              <td className="px-2 py-1.5">
                                <div className="relative w-24" dir="ltr">
                                  <input dir="ltr" aria-label={t('sheet.tiers.discount')} className="hc-input !min-h-[40px] !pe-7 tabular-nums" inputMode="decimal" value={draft.discount_percent} placeholder="0" onChange={(event) => editTier(draft.key, { discount_percent: event.target.value })} />
                                  <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-black/40">%</span>
                                </div>
                              </td>
                              <td className="hc-num px-3 py-1.5 text-end font-medium tabular-nums text-foreground"><bdi>{perDay}</bdi></td>
                              <td className="px-3 py-1.5 text-center"><OptionSwitch checked={draft.is_active} onChange={(next) => editTier(draft.key, { is_active: next })} label={t('sheet.tiers.toggle', range)} /></td>
                              <td className="px-2 py-1.5 text-center">
                                <button type="button" aria-label={t('sheet.tiers.remove', range)} onClick={() => setDrafts((current) => current.filter((item) => item.key !== draft.key))}
                                  className="grid h-11 w-11 place-items-center rounded-[10px] text-black/40 hover:bg-[#DC2626]/[0.07] hover:text-[#B91C1C] md:h-9 md:w-9">
                                  <TrashIcon />
                                </button>
                              </td>
                            </tr>
                          ) : (
                            <tr className="border-t border-black/[0.05] tabular-nums">
                              <td className="hc-num px-3 py-2">{draft.min_days}</td>
                              <td className="hc-num px-3 py-2">{draft.max_days}</td>
                              <td className="hc-num px-3 py-2"><bdi>{draft.discount_percent}%</bdi></td>
                              <td className="hc-num px-3 py-2 text-end font-medium"><bdi>{perDay}</bdi></td>
                              <td className="px-3 py-2 text-center">{draft.is_active ? '✓' : '—'}</td>
                            </tr>
                          )}
                          {tierError && <tr><td colSpan={6} className="px-3 pb-2 text-[12px] text-[#B91C1C]" role="alert">{t(`tierErrors.${tierError.code}`, { from: tierError.from, to: tierError.to })}</td></tr>}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>

          <Section id={`${ids}-rules`} icon={<RulesIcon />} title={t('sheet.sections.rules')} locked={!canAll}>
            <div className="hc-ce-grid">
              {field('deposit', t('sheet.fields.deposit'), numberInput('deposit', t('sheet.fields.deposit'), '8000', 'decimal', '₺'), { locked: <bdi className="hc-num">{shown(form.deposit, lira)}</bdi> })}
              {field('min_age', t('sheet.fields.minAge'), numberInput('min_age', t('sheet.fields.minAge'), '21'))}
              {field('daily_km', t('sheet.fields.dailyKm'), numberInput('daily_km', t('sheet.fields.dailyKm'), '300'), { hint: t('sheet.fields.kmHint'), locked: form.daily_km.trim() || t('card.unlimited') })}
              {field('monthly_km', t('sheet.fields.monthlyKm'), numberInput('monthly_km', t('sheet.fields.monthlyKm'), '6000'), { hint: t('sheet.fields.kmHint'), locked: form.monthly_km.trim() || t('card.unlimited') })}
            </div>
          </Section>

          <Section id={`${ids}-image`} icon={<Img3D name="photos" />} title={t('sheet.sections.image')}
            action={currentImage ? (
              <Button variant="secondary" className="hc-mg-small !text-[#B91C1C]" onClick={() => { setImageFile(null); setImageRemoved(true); setImageError(null); }}>
                <TrashIcon /> {t('sheet.image.remove')}
              </Button>
            ) : undefined}>
            <div
              role="button"
              tabIndex={0}
              aria-label={currentImage ? t('sheet.image.replace') : t('sheet.image.upload')}
              onClick={() => fileInput.current?.click()}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.current?.click(); } }}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); pickImage(event.dataTransfer.files?.[0]); }}
              className={`group/drop relative cursor-pointer rounded-[16px] border-2 border-dashed p-2 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[#4ba6ea]/40 ${dragging ? 'border-[#4ba6ea] bg-[#4ba6ea]/[0.06]' : 'border-black/[0.10] hover:border-[#4ba6ea]/60'}`}
            >
              {currentImage ? (
                <GroupImage src={currentImage} alt={t('sheet.image.alt')}>
                  <span className="absolute inset-x-0 bottom-0 flex justify-center pb-3 opacity-100 transition-opacity md:opacity-0 md:group-hover/drop:opacity-100 md:group-focus-visible/drop:opacity-100">
                    <span className="rounded-full bg-[#0F1117]/75 px-3 py-1.5 text-[12.5px] font-medium text-white">{t('sheet.image.dropReplace')}</span>
                  </span>
                </GroupImage>
              ) : (
                <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-[12px] bg-[linear-gradient(160deg,#F7F9FC_0%,#EEF3F9_100%)] px-4 text-center">
                  <img src={`${ICON_DIR}/photos.png`} alt="" width={64} height={64} decoding="async" />
                  <p className="text-[14px] font-medium text-foreground">{dragging ? t('sheet.image.drop') : t('sheet.image.choose')}</p>
                  <p className="text-[12px] text-black/45">{t('sheet.image.formats')}</p>
                </div>
              )}
            </div>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { pickImage(event.target.files?.[0]); event.target.value = ''; }} />
            {imageError && <p role="alert" className="hc-field-error">{t(`sheet.image.${imageError}`)}</p>}
            {imageFile && <p className="mt-1.5 text-[12px] text-black/50">{t('sheet.image.newFile', { name: imageFile.name })}</p>}
            {imageRemoved && <p className="mt-1.5 text-[12px] text-black/50">{t('sheet.image.removed')}</p>}
          </Section>
        </div>

        <footer className="hc-ce-foot">
          {dirty
            ? <p className="hc-ce-foot-hint is-dirty">{t('sheet.unsaved', { count: unsaved })}</p>
            : <p className="hc-ce-foot-hint is-auto">{isNew ? t('sheet.nothingYet') : t('sheet.allSaved')}</p>}
          <Button variant="secondary" disabled={saving} onClick={requestClose}>{dirty ? t('common:actions.cancel') : t('common:actions.close')}</Button>
          <Button onClick={save} disabled={!dirty || saving} aria-busy={saving}>{saving ? t('common:actions.saving') : isNew ? t('sheet.add') : t('sheet.save')}</Button>
        </footer>

        {confirm && (
          <div className="hc-ce-confirm-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirm(false); }}>
            <div role="alertdialog" aria-modal="true" aria-labelledby={`${ids}-confirm`} aria-describedby={`${ids}-confirm-body`} className="hc-ce-confirm surface-depth surface-float">
              <h3 id={`${ids}-confirm`}>{t('sheet.discard.title')}</h3>
              <p id={`${ids}-confirm-body`}>{t('sheet.discard.body')}</p>
              <div className="hc-ce-confirm-actions">
                {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                <Button variant="secondary" autoFocus onClick={() => setConfirm(false)}>{t('sheet.discard.keep')}</Button>
                <Button variant="destructive" onClick={onClose}>{t('sheet.discard.discard')}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

/** The columns of a group that was only just added, before the page reloads it. */
function toRowDefaults(): Omit<ModelGroupRow, 'id'> {
  return { name: '', brand: null, model: null, category: null, transmission: null, fuel: null, seats: null, luggage: null, daily_km: null, monthly_km: null, deposit: null, min_age: null, price: null, image_url: null };
}
