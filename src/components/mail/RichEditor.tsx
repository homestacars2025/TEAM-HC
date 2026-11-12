import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bold, Italic, Link, List, ListOrdered, Quote, RemoveFormatting, Underline, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { escapeHtml } from '../../lib/mail/mailThreads';

/**
 * A small rich-text editor that writes HTML: contentEditable and the browser's own
 * formatting commands. Uncontrolled — `initialHtml` is read once. What it produces
 * is sanitised again before it is sent.
 */

type Command = 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList' | 'removeFormat' | 'quote';

const TOOLS: Array<{ command: Command; labelKey: string; Icon: LucideIcon }> = [
  { command: 'bold', labelKey: 'editor.bold', Icon: Bold },
  { command: 'italic', labelKey: 'editor.italic', Icon: Italic },
  { command: 'underline', labelKey: 'editor.underline', Icon: Underline },
  { command: 'insertUnorderedList', labelKey: 'editor.bullets', Icon: List },
  { command: 'insertOrderedList', labelKey: 'editor.numbers', Icon: ListOrdered },
  { command: 'quote', labelKey: 'editor.quote', Icon: Quote },
  { command: 'removeFormat', labelKey: 'editor.clear', Icon: RemoveFormatting },
];

const TOOL = 'grid size-11 place-items-center rounded-md text-black/55 transition-colors hover:bg-black/[0.05] hover:text-black/85 lg:size-8';

export const RichEditor: React.FC<{
  initialHtml: string;
  onChange: (html: string) => void;
  autoFocus?: boolean;
}> = ({ initialHtml, onChange, autoFocus }) => {
  const { t } = useTranslation('mail');
  const ref = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [empty, setEmpty] = useState(!initialHtml);
  const [linking, setLinking] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = initialHtml || '<p><br></p>';
    setEmpty(!el.textContent?.trim());
    if (autoFocus) {
      el.focus();
      const range = document.createRange();
      range.setStart(el, 0);
      range.collapse(true);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
    // Read once: the editor owns its content from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = () => {
    const el = ref.current;
    if (!el) return;
    setEmpty(!el.textContent?.trim() && !el.querySelector('img'));
    onChange(el.innerHTML);
  };

  const run = (command: Command) => {
    ref.current?.focus();
    if (command === 'quote') document.execCommand('formatBlock', false, 'blockquote');
    else document.execCommand(command, false);
    report();
  };

  const startLink = () => {
    const selection = window.getSelection();
    savedRange.current = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
    setLinkUrl('https://');
    setLinking(true);
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    setLinking(false);
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return;
    ref.current?.focus();
    const selection = window.getSelection();
    if (savedRange.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
    }
    if (selection && !selection.isCollapsed) document.execCommand('createLink', false, url);
    else {
      const safe = escapeHtml(url);
      document.execCommand('insertHTML', false, `<a href="${safe}">${safe}</a>&nbsp;`);
    }
    report();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-black/[0.12] focus-within:border-[#6ea4e7] focus-within:ring-[3px] focus-within:ring-[#6ea4e7]/20">
      <div role="toolbar" aria-label={t('editor.toolbar')} className="flex flex-wrap items-center gap-0.5 border-b border-black/[0.06] px-1.5 py-1">
        {TOOLS.map(({ command, labelKey, Icon }) => (
          <button key={command} type="button" title={t(labelKey)} aria-label={t(labelKey)} onMouseDown={(e) => e.preventDefault()} onClick={() => run(command)} className={TOOL}>
            <Icon className="size-4" />
          </button>
        ))}
        <button type="button" title={t('editor.link')} aria-label={t('editor.link')} onMouseDown={(e) => e.preventDefault()} onClick={startLink} className={TOOL}>
          <Link className="size-4" />
        </button>
        {linking && (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 ps-1">
            <input
              autoFocus
              dir="ltr"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setLinking(false); }
              }}
              aria-label={t('editor.linkAddress')}
              className="h-11 min-w-0 flex-1 rounded-md border border-black/[0.12] px-2 text-[12.5px] outline-none focus:border-[#6ea4e7] lg:h-8"
            />
            <button type="button" onClick={applyLink} className="h-11 rounded-md px-2.5 text-[12.5px] font-medium text-[var(--accent-strong)] hover:bg-[var(--accent-soft)] lg:h-8">{t('editor.addLink')}</button>
          </div>
        )}
      </div>
      <div className="relative min-h-[220px] flex-1">
        {empty && (
          <div aria-hidden="true" className="pointer-events-none absolute start-4 top-3 text-[14px] text-black/30">{t('compose.placeholder')}</div>
        )}
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label={t('compose.message')}
          contentEditable
          suppressContentEditableWarning
          dir="auto"
          onInput={report}
          onBlur={report}
          className={cn(
            'h-full min-h-[220px] overflow-y-auto px-4 py-3 text-[14px] leading-[1.65] text-[#0f1117] outline-none',
            '[&_blockquote]:ms-1 [&_blockquote]:border-s-2 [&_blockquote]:border-black/15 [&_blockquote]:ps-3 [&_blockquote]:text-black/60',
            '[&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6 [&_a]:text-[var(--accent-strong)] [&_a]:underline [&_p]:min-h-[1em]',
          )}
        />
      </div>
    </div>
  );
};
