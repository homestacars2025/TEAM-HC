import React, { useMemo } from 'react';

const COLORS = ['#16A34A', '#6EA4E7', '#F59E0B', '#7C3AED'];

/** A brief fall of paper inside whatever `relative` parent it sits in. */
const Confetti: React.FC<{ pieces: number }> = ({ pieces }) => {
  const scattered = useMemo(() => Array.from({ length: pieces }, (_, i) => ({
    left: `${(i * 97) % 100}%`,
    delay: `${(i % 7) * 90}ms`,
    color: COLORS[i % COLORS.length],
  })), [pieces]);

  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {scattered.map((piece, i) => (
        <span key={i} className="hc-confetti" style={{ left: piece.left, animationDelay: piece.delay, background: piece.color }} />
      ))}
    </span>
  );
};

export default Confetti;
