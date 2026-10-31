import fs from 'fs';
import path from 'path';
import i18n from '../i18n';
import { notificationBodyKey } from '../components/NotificationRow';
import { classifyCompletion, proofPath } from './queries/tasks';
import { formatDue } from './relative-time';
import { addDays, dueTone, groupTasks, taskGroup, weekBounds, weekProgress } from './taskGroups';
import { renderNotifText } from './notifications/renderI18n';
import type { MyTask } from './types/tasks';

const SRC = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(SRC, file), 'utf8');
const t = i18n.t.bind(i18n);

const hoursFromNow = (n: number) => new Date(Date.now() + n * 3_600_000 + 1000).toISOString();

beforeEach(async () => { await i18n.changeLanguage('en'); });

describe('grouping the active list', () => {
  const now = new Date('2026-10-28T09:00:00Z'); // Wednesday, 12:00 in Istanbul
  const task = (due_at: string | null, is_overdue = false) => ({ due_at, is_overdue } as MyTask);

  test('no due date stands alone', () => {
    expect(taskGroup(task(null), now)).toBe('noDue');
  });

  test('days turn over at Istanbul midnight', () => {
    expect(taskGroup(task('2026-10-28T20:59:00Z'), now)).toBe('today');
    expect(taskGroup(task('2026-10-28T21:00:00Z'), now)).toBe('tomorrow');
  });

  test('this week runs to Sunday, then it is later', () => {
    expect(taskGroup(task('2026-10-30T09:00:00Z'), now)).toBe('week');
    expect(taskGroup(task('2026-11-01T20:00:00Z'), now)).toBe('week');
    expect(taskGroup(task('2026-11-01T21:00:00Z'), now)).toBe('later');
  });

  test('on a Sunday, tomorrow is next week and still reads as tomorrow', () => {
    const sunday = new Date('2026-11-01T09:00:00Z');
    expect(weekBounds(sunday)).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(taskGroup(task('2026-11-02T09:00:00Z'), sunday)).toBe('tomorrow');
  });

  test('overdue wins, even over a stale server flag', () => {
    expect(taskGroup(task('2026-10-28T08:00:00Z'), now)).toBe('overdue');
    expect(taskGroup(task('2026-11-05T08:00:00Z', true), now)).toBe('overdue');
  });

  test('keeps the server order inside each group', () => {
    const a = task('2026-10-28T10:00:00Z');
    const b = task('2026-10-28T11:00:00Z');
    expect(groupTasks([a, b], now).today).toEqual([a, b]);
  });

  test('crosses a month and a year by the calendar', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });
});

describe('due tone', () => {
  const now = new Date('2026-10-28T09:00:00Z');
  test('overdue, then amber inside two hours, then calm', () => {
    expect(dueTone('2026-10-28T08:59:00Z', now)).toBe('overdue');
    expect(dueTone('2026-10-28T10:59:00Z', now)).toBe('soon');
    expect(dueTone('2026-10-28T11:00:00Z', now)).toBe('calm');
  });
});

describe('the week bar', () => {
  const now = new Date('2026-10-28T09:00:00Z');
  const t2 = (over: Partial<MyTask>) => ({ due_at: null, is_overdue: false, completed_at: null, ...over } as MyTask);

  test('counts finished, still due this week, overdue and missed', () => {
    const active = [
      t2({ due_at: '2026-10-29T09:00:00Z' }),               // tomorrow
      t2({ due_at: '2026-10-20T09:00:00Z' }),               // overdue from last week
      t2({ due_at: '2026-11-10T09:00:00Z' }),               // not this week
      t2({}),                                                // no date, no week
    ];
    const done = [t2({ completed_at: '2026-10-27T09:00:00Z' }), t2({ completed_at: '2026-10-20T09:00:00Z' })];
    const missed = [t2({ due_at: '2026-10-26T09:00:00Z' }), t2({ due_at: '2026-10-10T09:00:00Z' })];
    expect(weekProgress(active, done, missed, now)).toEqual({ done: 1, total: 4 });
  });

  test('a finished task with no due date still counts', () => {
    expect(weekProgress([], [t2({ completed_at: '2026-10-28T08:00:00Z' })], [], now)).toEqual({ done: 1, total: 1 });
  });
});

describe('due wording', () => {
  test('reads in the largest natural unit', () => {
    expect(formatDue(t, hoursFromNow(2)).text).toBe('Due in 2 hours');
    expect(formatDue(t, hoursFromNow(0.5)).text).toBe('Due in 30 minutes');
    expect(formatDue(t, hoursFromNow(-3)).text).toBe('3 hours overdue');
    expect(formatDue(t, hoursFromNow(-48)).text).toBe('2 days overdue');
    expect(formatDue(t, hoursFromNow(-3)).overdue).toBe(true);
    expect(formatDue(t, hoursFromNow(2)).overdue).toBe(false);
  });

  test('matches the brief in Arabic', async () => {
    await i18n.changeLanguage('ar');
    expect(formatDue(t, hoursFromNow(2)).text).toBe('بعد ساعتين');
    expect(formatDue(t, hoursFromNow(-24)).text).toBe('متأخرة يوم');
    expect(formatDue(t, hoursFromNow(-5)).text).toBe('متأخرة 5 ساعات');
  });
});

describe('a refused completion', () => {
  test('each server message becomes its own code', () => {
    expect(classifyCompletion('Task is not open').code).toBe('not_open');
    expect(classifyCompletion('Proof photo required').code).toBe('proof_required');
    expect(classifyCompletion('Task not found').code).toBe('forbidden');
    expect(classifyCompletion('something else')).toEqual({ ok: false, error: 'something else' });
  });
});

describe('proof photos', () => {
  test('live under the person, then the task', () => {
    expect(proofPath('u1', 't1', { name: 'IMG_1.HEIC', type: 'image/jpeg' }, 123)).toBe('u1/t1/123.jpg');
    expect(proofPath('u1', 't1', { name: 'shot.PNG', type: '' }, 123)).toBe('u1/t1/123.png');
    expect(proofPath('u1', 't1', { name: 'photo', type: '' }, 123)).toBe('u1/t1/123.jpg');
  });
});

describe('task notifications', () => {
  const render = (key: string | null, vars: Record<string, unknown>, fallback: string) => renderNotifText(t, i18n, key, vars, fallback);

  test('render in the active language rather than the stored Arabic', async () => {
    expect(render('task.assigned.title', { title: 'Wash 34HZY380', due: null }, 'مهمة جديدة')).toBe('New task: Wash 34HZY380');
    expect(render('task.due_soon.title', { title: 'Wash' }, 'x')).toBe('Due soon: Wash');
    expect(render('task.overdue.title', { title: 'Wash' }, 'x')).toBe('Overdue: Wash');
    await i18n.changeLanguage('ar');
    expect(render('task.overdue.title', { title: 'Wash' }, 'x')).toBe('مهمة متأخرة: Wash');
  });

  test('pick a body the server did not send a key for', () => {
    const body = (event_key: string, vars: Record<string, unknown>) => notificationBodyKey({ body_i18n_key: null, event_key, vars });
    expect(body('task.assigned', { title: 'x', due: '2026-11-01 10:00' })).toBe('task.assigned.body');
    expect(body('task.assigned', { title: 'x', due: null })).toBe('task.assigned.noDue');
    expect(body('task.due_soon', {})).toBe('task.due_soon.body');
    expect(body('task.overdue', {})).toBe('task.overdue.body');
    expect(body('kabis_pending', {})).toBeNull();
  });
});

describe('both languages', () => {
  const dynamic = [
    ...['active', 'done', 'missed'].flatMap(k => [`tabs.${k}`, `empty.${k}Title`, `empty.${k}Body`]),
    ...['overdue', 'today', 'tomorrow', 'week', 'later', 'noDue'].map(k => `groups.${k}`),
    'card.more', 'card.less', 'card.complete', 'card.completeWithProof',
  ];

  test.each(['en', 'ar'])('%s has every key the page asks for', lng => {
    const has = (key: string) => i18n.exists(`tasks:${key}`, { lng, fallbackLng: [] }) || i18n.exists(`tasks:${key}_other`, { lng, fallbackLng: [] });
    const source = ['pages/TasksPage.tsx', 'components/tasks/TaskCard.tsx', 'components/tasks/TaskProofSheet.tsx'].map(read).join('\n');
    const used = Array.from(source.matchAll(/[^\w.]t\('([^']+)'/g)).map(m => m[1]).filter(k => !k.startsWith('common:'));
    expect([...used, ...dynamic].filter(k => !has(k))).toEqual([]);
  });

  test('the summary reads like the brief', () => {
    const ar = i18n.getFixedT('ar', 'tasks');
    expect(ar('summary.joined', { today: ar('summary.today', { count: 3 }), overdue: ar('summary.overdue', { count: 1 }) }))
      .toBe('عندك 3 مهام اليوم، وحدة متأخرة');
    expect(ar('progress', { done: 5, total: 7 })).toBe('أنجزت 5 من 7 هذا الأسبوع');
  });
});

test('nothing calls the retired RPCs or knows about claiming', () => {
  const files = ['pages/TasksPage.tsx', 'pages/HomePage.tsx', 'lib/queries/tasks.ts', 'lib/types/tasks.ts'];
  for (const file of files) {
    expect(read(file)).not.toMatch(/claim_task|cancel_task|claimTask|claimed_by|i18n_key: string \| null;\n {2}body_i18n_key.*\n {2}vars.*\n {2}category/);
  }
  expect(JSON.stringify(require('../locales/en/tasks.json'))).not.toMatch(/claim/i);
});

test('a task that needs proof cannot go through without a photo', () => {
  const sheet = read('components/tasks/TaskProofSheet.tsx');
  expect(sheet).toContain("if (!file) { setError(t('proof.missing')); return; }");
  // The camera button may force the camera because the drop zone never does.
  expect(sheet.match(/type="file"/g)).toHaveLength(2);
  expect(sheet.match(/capture="environment"/g)).toHaveLength(1);
});

describe('realtime', () => {
  const inbox = read('lib/InboxContext.tsx');

  test('listens only for this person', () => {
    expect(inbox).toContain("table: 'notification_recipients', filter: `profile_id=eq.${userId}`");
  });

  test('keeps polling while connected, because section notifications never reach the channel', () => {
    expect(inbox).toContain('connected ? CONNECTED_POLL_MS : POLL_MS');
  });

  test('the channel is closed on the way out', () => {
    expect(inbox).toContain('supabase.removeChannel(channel)');
  });
});

test('undo works by waiting, so leaving the page has to send what is waiting', () => {
  const page = read('pages/TasksPage.tsx');
  expect(page).toContain("window.addEventListener('pagehide', onPageHide);");
  expect(page).toContain('completeTaskOnExit(id, entry.notes, entry.proofUrl, entry.accessToken)');
  // An ordinary request would be cancelled as the page unloads.
  expect(read('lib/queries/tasks.ts')).toContain('keepalive: true');
});
