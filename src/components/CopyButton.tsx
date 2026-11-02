import React, { useEffect, useRef, useState } from 'react';

export const CopyMark: React.FC<{ done: boolean }> = ({ done }) => (done ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" /><path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
));

const SHOW_MS = 1800;

/** Copies, and says so for a moment. */
export function useCopy(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), SHOW_MS);
    } catch {
      setCopied(false);
    }
  };

  return [copied, copy];
}

const CopyButton: React.FC<{ text: string; label: string; className?: string }> = ({ text, label, className }) => {
  const [copied, copy] = useCopy();
  return (
    <button type="button" aria-label={label} title={label} className={className} onClick={() => void copy(text)}>
      <CopyMark done={copied} />
    </button>
  );
};

export default CopyButton;
