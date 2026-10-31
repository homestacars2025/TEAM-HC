import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import StaffAvatar from '../components/StaffAvatar';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { usePageAccess } from '../contexts/PageAccessContext';
import { DialCodePicker, parseStoredPhone } from './BookingsPage';
import { buttonClass } from '../components/Button';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIN_PASSWORD_LENGTH = 8;

const inputClass =
  'h-11 w-full min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 text-sm text-[#0f1117] outline-none transition-colors focus:border-[var(--accent)]';
const primaryClass = buttonClass('primary');
const secondaryClass = buttonClass('secondary');

type Notice = { tone: 'ok' | 'error'; text: string } | null;

const NoticeLine: React.FC<{ notice: Notice }> = ({ notice }) => (
  notice && (
    <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`text-[13px] ${notice.tone === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
      {notice.text}
    </p>
  )
);

const Field: React.FC<{ label: string; htmlFor?: string; children: React.ReactNode }> = ({ label, htmlFor, children }) => (
  <div className="min-w-0">
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-gray-600">{label}</label>
    {children}
  </div>
);

const ReadOnly: React.FC<{ label: string; value: string; latin?: boolean }> = ({ label, value, latin }) => (
  <div className="min-w-0">
    <div className="mb-1.5 text-[13px] font-medium text-gray-600">{label}</div>
    <div dir={latin ? 'ltr' : undefined} className={`flex h-11 items-center truncate rounded-xl bg-black/[0.03] px-3 text-sm text-gray-600 ${latin ? 'text-start' : ''}`}>
      {value}
    </div>
  </div>
);

const PasswordCard: React.FC = () => {
  const { t } = useTranslation('profile');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) { setNotice({ tone: 'error', text: t('password.tooShort') }); return; }
    if (password !== confirm) { setNotice({ tone: 'error', text: t('password.mismatch') }); return; }

    setSaving(true);
    setNotice(null);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { setNotice({ tone: 'error', text: t('password.failed') }); return; }
    setPassword('');
    setConfirm('');
    setNotice({ tone: 'ok', text: t('password.saved') });
  };

  return (
    <form onSubmit={submit} className="surface-depth flex flex-col gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold text-[#0f1117]">{t('password.title')}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('password.new')} htmlFor="profile-new-password">
          <input id="profile-new-password" type="password" autoComplete="new-password" dir="ltr" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <Field label={t('password.confirm')} htmlFor="profile-confirm-password">
          <input id="profile-confirm-password" type="password" autoComplete="new-password" dir="ltr" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving || !password || !confirm} className={primaryClass}>{t('password.submit')}</button>
        <NoticeLine notice={notice} />
      </div>
    </form>
  );
};

const ProfilePage: React.FC = () => {
  const { t } = useTranslation('profile');
  const { t: ts } = useTranslation('sidebar');
  const { userId, email, profile, patchProfile } = useCurrentUser();
  const { department, isDepartmentHead } = usePageAccess();

  const [fullName, setFullName] = useState('');
  const [dial, setDial] = useState('+90');
  const [local, setLocal] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNotice, setPhotoNotice] = useState<Notice>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The form starts from the loaded profile once, and is the user's after that.
  const seeded = useRef(false);
  useEffect(() => {
    if (!profile || seeded.current) return;
    seeded.current = true;
    setFullName(profile.full_name ?? '');
    const parsed = parseStoredPhone(profile.phone ?? '');
    setDial(parsed.dial);
    setLocal(parsed.local);
  }, [profile]);

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    const name = fullName.trim();
    if (!name) { setNotice({ tone: 'error', text: t('nameRequired') }); return; }
    const digits = local.replace(/[\s()-]/g, '').replace(/^0+/, '');
    if (digits && !/^\d+$/.test(digits)) { setNotice({ tone: 'error', text: t('phoneInvalid') }); return; }
    const phone = digits ? `${dial}${digits}` : null;

    setSaving(true);
    setNotice(null);
    const { error } = await supabase.from('profiles').update({ full_name: name, phone }).eq('id', userId);
    setSaving(false);
    if (error) { setNotice({ tone: 'error', text: t('saveFailed') }); return; }
    patchProfile({ full_name: name, phone });
    setNotice({ tone: 'ok', text: t('saved') });
  };

  const savePhoto = async (avatarUrl: string | null, doneMessage: string) => {
    if (!userId) return false;
    const { error } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId);
    if (error) { setPhotoNotice({ tone: 'error', text: t('photo.failed') }); return false; }
    patchProfile({ avatar_url: avatarUrl });
    setPhotoNotice({ tone: 'ok', text: doneMessage });
    return true;
  };

  const uploadPhoto = async (file: File) => {
    if (!userId) return;
    const extension = PHOTO_TYPES[file.type];
    if (!extension) { setPhotoNotice({ tone: 'error', text: t('photo.unsupported') }); return; }
    if (file.size > MAX_PHOTO_BYTES) { setPhotoNotice({ tone: 'error', text: t('photo.tooLarge') }); return; }

    setPhotoBusy(true);
    setPhotoNotice(null);
    // A new name each time: the bucket does not allow overwriting a file, and the
    // browser would otherwise keep showing its cached copy of the old photo.
    const path = `${userId}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type });
    if (error) {
      setPhotoNotice({ tone: 'error', text: t('photo.failed') });
    } else {
      await savePhoto(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl, t('photo.saved'));
    }
    setPhotoBusy(false);
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    setPhotoNotice(null);
    await savePhoto(null, t('photo.removed'));
    setPhotoBusy(false);
  };

  const hasPhoto = !!profile?.avatar_url;
  const genderLabel = profile?.gender === 'male' || profile?.gender === 'female' ? t(`gender.${profile.gender}`) : t('gender.unset');

  return (
    <div className="flex max-w-3xl flex-col gap-6 p-4 sm:p-6 lg:p-10">
      <header>
        <h1 className="text-2xl font-semibold text-[#0f1117] sm:text-[28px]">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
      </header>

      <section className="surface-depth flex flex-col items-center gap-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 text-center sm:flex-row sm:items-center sm:p-6 sm:text-start">
        <StaffAvatar profile={profile} size={96} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold text-[#0f1117]">{profile?.full_name || ts('profileFallback')}</div>
          {email && <div dir="ltr" className="truncate text-sm text-gray-500 sm:text-start">{email}</div>}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
            {department && <span className="rounded-full bg-black/[0.05] px-2.5 text-xs font-medium leading-[22px] text-gray-600">{department.label}</span>}
            {isDepartmentHead && <span className="rounded-full bg-[var(--accent-soft)] px-2.5 text-xs font-semibold leading-[22px] text-[var(--accent-strong)]">{ts('departmentHead')}</span>}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) uploadPhoto(file);
              }}
            />
            <button type="button" disabled={photoBusy} onClick={() => fileInput.current?.click()} className={secondaryClass}>
              {hasPhoto ? t('photo.replace') : t('photo.upload')}
            </button>
            {hasPhoto && (
              <button type="button" disabled={photoBusy} onClick={removePhoto} className={`${secondaryClass} hover:!text-red-600`}>
                {t('photo.remove')}
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-400">{t('photo.hint')}</p>
          <div className="mt-1"><NoticeLine notice={photoNotice} /></div>
        </div>
      </section>

      <form onSubmit={saveDetails} className="surface-depth flex flex-col gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6">
        <h2 className="text-[15px] font-semibold text-[#0f1117]">{t('details')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('fields.fullName')} htmlFor="profile-full-name">
            <input id="profile-full-name" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} className={inputClass} />
          </Field>
          <Field label={t('fields.phone')} htmlFor="profile-phone">
            <div dir="ltr" className="flex gap-2">
              <div className="shrink-0 [&_button]:!h-11">
                <DialCodePicker value={dial} onChange={setDial} />
              </div>
              <input id="profile-phone" type="tel" autoComplete="tel-national" inputMode="tel" value={local} onChange={e => setLocal(e.target.value)} className={inputClass} />
            </div>
          </Field>
          <ReadOnly label={t('fields.email')} value={email ?? '—'} latin />
          <ReadOnly label={t('fields.department')} value={department?.label ?? '—'} />
          <ReadOnly label={t('fields.gender')} value={genderLabel} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving || !profile} className={primaryClass}>{t('save')}</button>
          <NoticeLine notice={notice} />
        </div>
      </form>

      <PasswordCard />
    </div>
  );
};

export default ProfilePage;
