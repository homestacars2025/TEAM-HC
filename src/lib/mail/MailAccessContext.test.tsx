import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MailAccessProvider, useHasMail, useMailAccess } from './MailAccessContext';

const mockUser = { userId: 'u1', profile: { role: 'staff' } as { role: string } | null, ready: true };

jest.mock('../../contexts/CurrentUserContext', () => ({
  useCurrentUser: () => mockUser,
}));

const accounts = [
  { id: 'a-info', slug: 'homestacars-info', emailAddress: 'info@homestacars.com', label: 'Info', color: '#9aa5b1', isDefault: true, sortOrder: 1 },
  { id: 'a-partners', slug: 'homestacars-partners', emailAddress: 'partners@homestacars.com', label: 'Partners', color: '#6ea4e7', isDefault: false, sortOrder: 2 },
  { id: 'a-sales', slug: 'homestacars-sales', emailAddress: 'sales@homestacars.com', label: 'Sales', color: '#22a06b', isDefault: false, sortOrder: 3 },
];
const mockGrants = jest.fn();

jest.mock('./mailApi', () => ({
  listAccounts: () => Promise.resolve(accounts),
  myMailboxGrants: (id: string) => mockGrants(id),
  unreadByAccount: (ids: string[]) => Promise.resolve(Object.fromEntries(ids.map((id) => [id, 2]))),
  subscribeToMail: () => () => undefined,
}));

const Probe: React.FC = () => {
  const access = useMailAccess();
  const hasMail = useHasMail();
  if (access.loading) return <p>loading</p>;
  return (
    <dl>
      <dd data-testid="visible">{access.accountIds.join(',')}</dd>
      <dd data-testid="sendable">{access.sendableAccounts.map((a) => a.id).join(',')}</dd>
      <dd data-testid="send-info">{String(access.canSendFrom('a-info'))}</dd>
      <dd data-testid="send-other">{String(access.canSendFrom('a-sales'))}</dd>
      <dd data-testid="has">{String(hasMail)}</dd>
      <dd data-testid="unread">{access.unreadTotal}</dd>
    </dl>
  );
};

const renderProbe = () => render(<MailAccessProvider><Probe /></MailAccessProvider>);

beforeEach(() => {
  mockGrants.mockReset();
  mockUser.profile = { role: 'staff' };
});

test('a member sees only granted mailboxes, and sends only where can_send is on', async () => {
  mockGrants.mockResolvedValue([
    { accountId: 'a-info', canSend: false },
    { accountId: 'a-partners', canSend: true },
  ]);
  renderProbe();
  await waitFor(() => expect(screen.getByTestId('visible')).toHaveTextContent('a-info,a-partners'));
  expect(mockGrants).toHaveBeenCalledWith('u1');
  expect(screen.getByTestId('sendable')).toHaveTextContent('a-partners');
  expect(screen.getByTestId('send-info')).toHaveTextContent('false');
  expect(screen.getByTestId('send-other')).toHaveTextContent('false');
  expect(screen.getByTestId('has')).toHaveTextContent('true');
  // The badge counts only their own mailboxes.
  await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('4'));
});

test('a member with no grant has no Inbox', async () => {
  mockGrants.mockResolvedValue([]);
  renderProbe();
  await waitFor(() => expect(screen.getByTestId('has')).toHaveTextContent('false'));
  expect(screen.getByTestId('visible')).toHaveTextContent('');
});

test('an admin sees and sends from every mailbox without a grant', async () => {
  mockUser.profile = { role: 'admin' };
  renderProbe();
  await waitFor(() => expect(screen.getByTestId('visible')).toHaveTextContent('a-info,a-partners,a-sales'));
  expect(mockGrants).not.toHaveBeenCalled();
  expect(screen.getByTestId('sendable')).toHaveTextContent('a-info,a-partners,a-sales');
  expect(screen.getByTestId('send-other')).toHaveTextContent('true');
});
