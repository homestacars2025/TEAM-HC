import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** The careers page the website serves for a published opening. */
export const CAREERS_BASE = 'https://homestacars.com/careers';
export const careersUrl = (slug: string, source?: 'whatsapp') => `${CAREERS_BASE}/${slug}${source ? `?src=${source}` : ''}`;

const CopyIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.9" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" stroke="currentColor" strokeWidth="1.9" /></svg>
);

/** The public link, with one button to copy it plainly and one with `?src=whatsapp` so applications from WhatsApp say so. */
export const PublicLink: React.FC<{ slug: string }> = ({ slug }) => {
  const { t } = useTranslation('hr');
  const [copied, setCopied] = useState<'plain' | 'whatsapp' | 'failed' | null>(null);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(null), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async (kind: 'plain' | 'whatsapp') => {
    try {
      await navigator.clipboard.writeText(careersUrl(slug, kind === 'whatsapp' ? 'whatsapp' : undefined));
      setCopied(kind);
    } catch {
      setCopied('failed');
    }
  };

  return (
    <div className="hc-hr-public surface-depth">
      <div className="min-w-0">
        <span className="hc-field-label">{t('publicLink.label')}</span>
        <a href={careersUrl(slug)} target="_blank" rel="noreferrer" dir="ltr" className="hc-hr-link block truncate">{careersUrl(slug)}</a>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="hc-hr-copy" onClick={() => copy('plain')}><CopyIcon />{copied === 'plain' ? t('publicLink.copied') : t('publicLink.copy')}</button>
        <button type="button" className="hc-hr-copy" onClick={() => copy('whatsapp')}><CopyIcon />{copied === 'whatsapp' ? t('publicLink.copied') : t('publicLink.copyWhatsapp')}</button>
      </div>
      <span role="status" className="sr-only">{copied === 'failed' ? t('publicLink.failed') : copied ? t('publicLink.copied') : ''}</span>
      {copied === 'failed' && <p className="text-[12px] text-[#b42318]">{t('publicLink.failed')}</p>}
    </div>
  );
};

export default PublicLink;
