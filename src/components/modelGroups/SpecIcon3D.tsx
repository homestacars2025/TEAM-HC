import React, { useId } from 'react';

export type SpecIconName = 'transmission' | 'fuel' | 'seats' | 'luggage';

/**
 * Small 3D-style icons for a car's specs, in the blue of the app's 3D set: a lit
 * gradient body, a soft top highlight and a contact shadow. Drawn rather than
 * rendered so they stay sharp at chip size. Decorative: the chip says the same.
 */
export const SpecIcon3D: React.FC<{ name: SpecIconName; size?: number; className?: string }> = ({ name, size = 22, className }) => {
  const id = useId().replace(/:/g, '');
  const body = `spec-body-${id}`;
  const shine = `spec-shine-${id}`;
  const metal = `spec-metal-${id}`;

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className} style={{ flex: 'none', display: 'block' }}>
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#9CCBF7" />
          <stop offset="0.55" stopColor="#5C9BE6" />
          <stop offset="1" stopColor="#3A74C2" />
        </linearGradient>
        <linearGradient id={shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={metal} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F4F6F9" />
          <stop offset="1" stopColor="#B7C0CC" />
        </linearGradient>
      </defs>
      <ellipse cx="16" cy="29" rx="10" ry="1.8" fill="#0F172A" opacity="0.12" />
      {name === 'transmission' && (
        <>
          <rect x="6" y="20" width="20" height="7" rx="3.5" fill={`url(#${metal})`} />
          <rect x="14.6" y="11" width="2.8" height="11" rx="1.4" fill="#8A95A5" />
          <circle cx="16" cy="9" r="6.5" fill={`url(#${body})`} />
          <ellipse cx="14.4" cy="6.4" rx="3.8" ry="2.2" fill={`url(#${shine})`} />
          <path d="M13.4 7.2v3.6M16 7.2v3.6M18.6 7.2v3.6M13.4 9h5.2" stroke="#FFFFFF" strokeWidth="1.1" strokeLinecap="round" opacity="0.9" />
        </>
      )}
      {name === 'fuel' && (
        <>
          <rect x="6" y="5" width="14" height="22" rx="3.2" fill={`url(#${body})`} />
          <rect x="8.6" y="8" width="8.8" height="6" rx="1.6" fill="#EAF3FD" />
          <rect x="7.2" y="5.8" width="5" height="9" rx="2.5" fill={`url(#${shine})`} opacity="0.7" />
          <path d="M20 10h2.4a2 2 0 0 1 2 2v9.5a1.6 1.6 0 0 0 3.2 0V12.5L25 9.5" fill="none" stroke="#8A95A5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="5" y="25" width="16" height="2.6" rx="1.3" fill="#2F64AD" />
        </>
      )}
      {name === 'seats' && (
        <>
          <path d="M9.5 5.5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v12h-10z" fill={`url(#${body})`} />
          <path d="M7 18.5a2.5 2.5 0 0 1 2.5-2.5h12a2.5 2.5 0 0 1 2.5 2.5v3.5a2.5 2.5 0 0 1-2.5 2.5h-12A2.5 2.5 0 0 1 7 22z" fill={`url(#${body})`} />
          <rect x="11" y="3.6" width="4" height="10" rx="2" fill={`url(#${shine})`} opacity="0.75" />
          <rect x="9" y="17" width="9" height="2.2" rx="1.1" fill="#FFFFFF" opacity="0.45" />
          <rect x="10.5" y="24.5" width="2.4" height="3.2" rx="1" fill="#8A95A5" />
          <rect x="19" y="24.5" width="2.4" height="3.2" rx="1" fill="#8A95A5" />
        </>
      )}
      {name === 'luggage' && (
        <>
          <path d="M12.5 8V5.6a1.6 1.6 0 0 1 1.6-1.6h3.8a1.6 1.6 0 0 1 1.6 1.6V8" fill="none" stroke="#8A95A5" strokeWidth="1.9" strokeLinecap="round" />
          <rect x="7" y="8" width="18" height="18" rx="3.6" fill={`url(#${body})`} />
          <rect x="8.4" y="9.2" width="7" height="8" rx="2.6" fill={`url(#${shine})`} opacity="0.7" />
          <path d="M12 11.5v11M20 11.5v11" stroke="#2F64AD" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
          <circle cx="10.5" cy="27.4" r="1.4" fill="#4B5563" />
          <circle cx="21.5" cy="27.4" r="1.4" fill="#4B5563" />
        </>
      )}
    </svg>
  );
};

export default SpecIcon3D;
