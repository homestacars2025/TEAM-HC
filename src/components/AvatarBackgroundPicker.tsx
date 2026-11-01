import React from 'react';
import { useTranslation } from 'react-i18next';
import StaffAvatar from './StaffAvatar';
import { AVATAR_BACKGROUND_KEYS, getAvatarBackground, type AvatarBackground, type StaffAvatarProfile } from '../lib/staffAvatar';

interface AvatarBackgroundPickerProps {
  profile: StaffAvatarProfile;
  onChoose: (background: AvatarBackground) => void;
}

/** One swatch per color, each previewing this person's own picture in that color. */
const AvatarBackgroundPicker: React.FC<AvatarBackgroundPickerProps> = ({ profile, onChoose }) => {
  const { t } = useTranslation('profile');
  const current = getAvatarBackground(profile);

  return (
    <div role="group" aria-labelledby="avatar-background-label" className="hc-avatar-bg">
      <div id="avatar-background-label" className="hc-avatar-bg-label">{t('background.title')}</div>
      <div className="hc-avatar-bg-swatches">
        {AVATAR_BACKGROUND_KEYS.map(key => (
          <button
            key={key}
            type="button"
            aria-pressed={key === current}
            aria-label={t(`background.${key}`)}
            title={t(`background.${key}`)}
            onClick={() => onChoose(key)}
            className={`hc-avatar-bg-swatch ${key === current ? 'is-active' : ''}`}
          >
            <StaffAvatar profile={{ ...profile, avatar_bg: key }} size={40} />
            {key === current && (
              <span aria-hidden="true" className="hc-avatar-bg-check">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default AvatarBackgroundPicker;
