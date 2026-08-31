import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '../../../../components/ui/select';
import { dotStyle } from '../../../../lib/media/badge-color';
import { cn } from '../../../../lib/utils';

/**
 * The List view's inline editors.
 *
 * Every one commits through a caller-supplied `onSave` that resolves to a boolean.
 * `false` (server refused, RLS, network) leaves the parent's value untouched, so
 * the grid never shows a change the database didn't accept.
 */

const NONE = '_none';

const CELL_IDLE =
  'w-full rounded-md px-2 py-1.5 text-start text-[12.5px] leading-snug transition-colors duration-150 ' +
  'hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/40';

// ─── InlineText ───────────────────────────────────────────────────────────────

interface InlineTextProps {
  value: string | null;
  placeholder: string;
  multiline?: boolean;
  onSave: (next: string | null) => Promise<boolean>;
  className?: string;
  ariaLabel: string;
}

export function InlineText({
  value, placeholder, multiline, onSave, className, ariaLabel,
}: InlineTextProps) {
  const { t } = useTranslation('common');
  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const ref = React.useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  // Seeded when editing starts rather than kept in sync with the prop, so there
  // is nothing to reconcile while the cell sits idle.
  function startEditing() {
    setDraft(value ?? '');
    setIsEditing(true);
  }

  React.useEffect(() => {
    if (!isEditing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [isEditing]);

  async function commit() {
    const next = draft.trim();
    setIsEditing(false);
    if (next === (value ?? '')) return;
    setIsSaving(true);
    await onSave(next || null);
    setIsSaving(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === 'Escape') { setIsEditing(false); return; }
    if (e.key !== 'Enter') return;
    // Multiline keeps Enter for newlines; ⌘/Ctrl+Enter commits.
    if (multiline && !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    commit();
  }

  if (isEditing) {
    const shared = {
      ref,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: handleKeyDown,
      'aria-label': ariaLabel,
      // Follows what is being typed, not the page it is typed on.
      dir: 'auto' as const,
      className: cn(
        'w-full rounded-md border border-[#6ea4e7]/40 bg-white px-2 py-1.5 text-[12.5px] leading-snug',
        'outline-none ring-2 ring-[#6ea4e7]/15',
      ),
    };
    return multiline ? <textarea rows={3} {...shared} /> : <input type="text" {...shared} />;
  }

  return (
    <button type="button" aria-label={ariaLabel} onClick={startEditing} className={cn(CELL_IDLE, className)}>
      {isSaving ? (
        <span className="inline-flex items-center gap-1.5 text-black/40">
          <Loader2 size={11} className="animate-spin" />
          {t('actions.saving')}
        </span>
      ) : value ? (
        <span dir="auto" className={cn('block text-black/75', multiline && 'line-clamp-3')}>{value}</span>
      ) : (
        <span className="text-black/25">{placeholder}</span>
      )}
    </button>
  );
}

// ─── InlineDate ───────────────────────────────────────────────────────────────

export function InlineDate({
  value, onSave, ariaLabel,
}: { value: string | null; onSave: (next: string | null) => Promise<boolean>; ariaLabel: string }) {
  const [isSaving, setIsSaving] = React.useState(false);

  async function handleChange(next: string) {
    setIsSaving(true);
    await onSave(next || null);
    setIsSaving(false);
  }

  return (
    <input
      type="date"
      value={value ?? ''}
      disabled={isSaving}
      aria-label={ariaLabel}
      onChange={(e) => handleChange(e.target.value)}
      className={cn(
        'w-[132px] rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[12.5px]',
        'tabular-nums text-black/75 transition-colors duration-150',
        'hover:border-black/[0.08] hover:bg-black/[0.03]',
        'focus-visible:border-[#6ea4e7]/40 focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-[#6ea4e7]/15 disabled:opacity-50',
      )}
    />
  );
}

// ─── InlineSelect ─────────────────────────────────────────────────────────────

interface InlineSelectProps {
  value: string | null;
  options: { key: string; label: string; color: string | null }[];
  placeholder: string;
  onSave: (next: string | null) => Promise<boolean>;
  ariaLabel: string;
  showDot?: boolean;
}

export function InlineSelect({
  value, options, placeholder, onSave, ariaLabel, showDot,
}: InlineSelectProps) {
  const [isSaving, setIsSaving] = React.useState(false);
  const selected = options.find((o) => o.key === value);

  async function handleChange(raw: string | null) {
    const next = !raw || raw === NONE ? null : raw;
    if (next === (value ?? null)) return;
    setIsSaving(true);
    await onSave(next);
    setIsSaving(false);
  }

  return (
    <Select value={value || NONE} onValueChange={handleChange} disabled={isSaving}>
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        className="w-full max-w-[160px] border-transparent bg-transparent text-[12.5px] hover:bg-black/[0.03]"
      >
        <span className="flex min-w-0 items-center gap-2">
          {showDot && selected && (
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={dotStyle(selected.color)} />
          )}
          <span dir="auto" className={cn('truncate', selected || value ? 'text-black/75' : 'text-black/25')}>
            {selected?.label ?? value ?? placeholder}
          </span>
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="text-black/45">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.key} value={o.key}>
            {showDot && <span aria-hidden className="size-2 shrink-0 rounded-full" style={dotStyle(o.color)} />}
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
