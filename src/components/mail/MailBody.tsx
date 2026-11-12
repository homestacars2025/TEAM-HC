import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { escapeHtml } from '../../lib/mail/mailThreads';
import { sanitizeEmailHtml } from '../../lib/mail/mailSanitize';

/**
 * A message body, safely: DOMPurify first, then an iframe whose sandbox runs no
 * scripts. Same-origin is allowed only so the frame can size itself (safe
 * without allow-scripts), and popups so a link opens in a new tab.
 */
export const MailBody: React.FC<{ html: string | null; text: string | null }> = ({ html, text }) => {
  const { t } = useTranslation('mail');
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  const srcDoc = useMemo(() => {
    const clean = html ? sanitizeEmailHtml(html) : '';
    const content = clean || `<div style="white-space:pre-wrap">${escapeHtml(text ?? '')}</div>`;
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<style>
  html,body{margin:0;padding:0;background:#fff}
  body{padding:2px 1px;font:14px/1.65 system-ui,-apple-system,'Segoe UI','IBM Plex Sans Arabic',sans-serif;color:#1a1a1a;word-break:break-word;overflow-wrap:anywhere}
  img{max-width:100%;height:auto} table{max-width:100%!important} pre{white-space:pre-wrap}
  a{color:#3A74C2}
  blockquote{margin:0 0 0 .8ex;border-left:2px solid #d6dbe1;padding-left:1ex;color:#555}
</style></head><body dir="auto">${content}</body></html>`;
  }, [html, text]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return undefined;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const body = frame.contentDocument?.body;
      if (body) setHeight(Math.min(Math.max(body.scrollHeight + 8, 60), 6000));
    };
    const onLoad = () => {
      measure();
      const body = frame.contentDocument?.body;
      if (body && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure);
        observer.observe(body);
      }
      frame.contentDocument?.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure));
    };
    frame.addEventListener('load', onLoad);
    return () => {
      frame.removeEventListener('load', onLoad);
      observer?.disconnect();
    };
  }, [srcDoc]);

  if (!html && !text) return <div className="py-4 text-[13px] text-black/35">{t('reader.noBody')}</div>;

  return (
    <iframe
      ref={ref}
      title={t('reader.bodyTitle')}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      style={{ height }}
      className="block w-full border-0 bg-white"
    />
  );
};
