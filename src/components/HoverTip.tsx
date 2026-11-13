import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom';

/** A floating label over its child, on hover or keyboard focus. Text only; the child keeps its own accessible name. */
const HoverTip: React.FC<{ content: string; children: React.ReactNode; className?: string }> = ({ content, children, className }) => {
  const wrap = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const show = () => {
    const rect = wrap.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 });
  };
  const hide = () => setPos(null);
  return (
    <>
      <span ref={wrap} className={className ?? 'inline-flex'} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>{children}</span>
      {pos && ReactDOM.createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[10003] max-w-[260px] -translate-x-1/2 -translate-y-full rounded-md bg-[#0f1117] px-2.5 py-1.5 text-center text-xs text-white shadow-md"
          style={{ top: pos.top, left: pos.left }}
        >
          <bdi dir="auto">{content}</bdi>
        </div>,
        document.body,
      )}
    </>
  );
};

export default HoverTip;
