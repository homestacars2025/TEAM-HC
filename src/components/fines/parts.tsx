import React from 'react';

const icon = (children: React.ReactNode) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

export const FINE_ICONS = {
  fine: icon(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M12 12v3M12 18h.01" /></>),
  car: icon(<><path d="M5 17H3a2 2 0 01-2-2v-4a2 2 0 012-2h1l2-4h10l2 4h1a2 2 0 012 2v4a2 2 0 01-2 2h-2" /><circle cx="7.5" cy="17.5" r="2.5" /><circle cx="16.5" cy="17.5" r="2.5" /></>),
  money: icon(<><circle cx="12" cy="12" r="9" /><path d="M10 7v9l5-3M8 11.5l6-3" /></>),
  document: icon(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></>),
  image: icon(<><rect x="3" y="4.5" width="18" height="15" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17l5-4 3.5 2.6L16 12l4 3.5" /></>),
  receipt: icon(<><path d="M5 3v18l2.5-1.5L10 21l2-1.5L14 21l2.5-1.5L19 21V3z" /><path d="M9 8h6M9 12h6" /></>),
  timeline: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
};
