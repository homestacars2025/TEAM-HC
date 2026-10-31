import fs from 'fs';
import path from 'path';
import i18n from '../i18n';
import { notificationBodyKey } from '../components/NotificationRow';
import { classifyCompletion, proofPath } from './queries/tasks';
import { formatDue } from './relative-time';
import { groupTasks, taskGroup } from './taskGroups';
import { renderNotifText } from './notifications/renderI18n';
import type { MyTask } from './types/tasks';

const SRC = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(SRC, file), 'utf8');
const t = i18n.t.bind(i18n);

const hoursFromNow = (n: number) => new Date(Date.now() + n * 3_600_000 + 1000).toISOString();

beforeEach(async () => { await i18n.changeLanguage('en'); });

describe('grouping the active list', () => {
  const now = new Date('2026-10-31T09:00:00Z'); // 12:00 in Istanbul
  const task = (due_at: string | null, is_overdue = false) => ({ due_at, is_overdue } as MyTask);

  test('no due date stands alone', () => {
    expect(taskGroup(task(null), now)).toBe('noDue');
  });

  test('today is the Istanbul day, and runs up to its midnight', () => {
    expect(taskGroup(task('2026-10-31T20:59:00Z'), now)).toBe('today');
    expect(taskGroup(task('2026-10-31T21:00:00Z'), now)).toBe('upcoming');
  });

  test('overdue wins, whatever the server flag says about a stale list', () => {
    expect(taskGroup(task('2026-10-31T08:00:00Z'), now)).toBe('overdue');
    expect(taskGroup(task('2026-11-05T08:00:00Z', true), now)).toBe('overdue');
  });

  test('keeps the server order inside each group', () => {
    const a = task('2026-10-31T10:00:00Z');
    const b = task('2026-10-31T11:00:00Z');
    expect(groupTasks([a, b], now).today).toEqual([a, b]);
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
    ...['overdue', 'today', 'upcoming', 'noDue'].map(k => `groups.${k}`),
    ...['urgent', 'high', 'normal', 'low'].map(k => `priority.${k}`),
  ];

  test.each(['en', 'ar'])('%s has every key the page asks for', lng => {
    const has = (key: string) => i18n.exists(`tasks:${key}`, { lng, fallbackLng: [] });
    const used = Array.from(read('pages/TasksPage.tsx').matchAll(/[^\w.]t\('([^']+)'/g)).map(m => m[1]).filter(k => !k.startsWith('common:'));
    expect([...used, ...dynamic].filter(k => !has(k))).toEqual([]);
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
  const page = read('pages/TasksPage.tsx');
  expect(page).toContain("if (task.requires_proof && !file) { setError(t('dialog.proofMissing')); return; }");
  // No `capture`: phones still offer the camera, and the gallery stays available.
  expect(page).toContain('accept="image/*"');
});
