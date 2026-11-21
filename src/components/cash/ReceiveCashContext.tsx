import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import ReceiveCashSheet from './ReceiveCashSheet';

/**
 * One "Receive cash" sheet for the whole dashboard. Anywhere can open it, empty or
 * started from a customer or a booking. `version` goes up after each receipt, so
 * what shows a wallet or the envelopes held can read again.
 */

export interface ReceiveCashPrefill {
  customer?: { id: string; name: string };
  bookingId?: number;
}

interface ReceiveCashValue {
  /** False outside the provider (a test, a page rendered on its own): the buttons stay hidden. */
  available: boolean;
  open: (prefill?: ReceiveCashPrefill) => void;
  isOpen: boolean;
  version: number;
}

const ReceiveCashContext = createContext<ReceiveCashValue>({ available: false, open: () => {}, isOpen: false, version: 0 });

export const useReceiveCash = (): ReceiveCashValue => useContext(ReceiveCashContext);

export const ReceiveCashProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // A fresh key per opening, so every opening starts from its own prefill.
  const [session, setSession] = useState<{ key: number; prefill: ReceiveCashPrefill } | null>(null);
  const [version, setVersion] = useState(0);

  const open = useCallback((prefill: ReceiveCashPrefill = {}) => setSession(current => ({ key: (current?.key ?? 0) + 1, prefill })), []);
  const close = useCallback(() => setSession(null), []);
  const received = useCallback(() => setVersion(value => value + 1), []);

  const value = useMemo(() => ({ available: true, open, isOpen: session !== null, version }), [open, session, version]);

  return (
    <ReceiveCashContext.Provider value={value}>
      {children}
      {session && <ReceiveCashSheet key={session.key} prefill={session.prefill} onClose={close} onReceived={received} />}
    </ReceiveCashContext.Provider>
  );
};
