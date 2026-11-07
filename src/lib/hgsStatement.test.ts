import {
  STATEMENT_LANGS, STATEMENT_TEXT, bookingWindow, defaultStatementLang, statementAmount, statementDay, statementFileName,
  statementNumber, statementRows, statementSummary, windowBounds, type StatementSource,
} from './hgsStatement';

const item = (id: number, at: string, amount: number, road: string | null = 'public', extra: Partial<StatementSource> = {}): StatementSource =>
  ({ id, transit_datetime: at, entry_location: 'MAHMUTBEY', exit_location: 'KINALI', otoyol: 'KMO AVRUPA KESIMI', road_type: road, amount, ...extra });

test('statement number and file name: Istanbul issue date, plate without spaces', () => {
  expect(statementNumber('34 hzy 380', '2026-11-07')).toBe('HGS-261107-34HZY380');
  expect(statementFileName('34 HZY 380', { from: '2026-11-01', to: '2026-11-06' }, 'tr')).toBe('HGS-34HZY380-2026-11-01_2026-11-06-tr.pdf');
});

test('the customer\'s language when it is one of the four, else Arabic', () => {
  expect([defaultStatementLang('tr'), defaultStatementLang('EN'), defaultStatementLang('fr-FR'), defaultStatementLang('de'), defaultStatementLang(null), defaultStatementLang('')]).toEqual(['tr', 'en', 'fr', 'ar', 'ar', 'ar']);
});

test('a booking keeps only the days it shares with the range', () => {
  const range = { from: '2026-11-01', to: '2026-11-06' };
  expect(bookingWindow(range, { start: '2026-10-28', end: '2026-11-04' })).toEqual({ from: '2026-11-01', to: '2026-11-04' });
  expect(bookingWindow(range, { start: '2026-11-03', end: '2026-11-20' })).toEqual({ from: '2026-11-03', to: '2026-11-06' });
  expect(bookingWindow(range, { start: '2026-11-07', end: '2026-11-09' })).toBeNull();
  expect(windowBounds({ from: '2026-11-01', to: '2026-11-04' })).toEqual({ from: '2026-11-01T00:00:00+03:00', to: '2026-11-05T00:00:00+03:00' });
});

test('rows: inside the window by Istanbul day, oldest first, private roads optional', () => {
  const items = [
    item(3, '2026-11-02T20:40:00+00:00', 41, 'private'),
    item(1, '2026-10-31T21:30:00+00:00', 59, 'public', { entry_location: '*', exit_location: 'FSM', otoyol: null }),
    item(2, '2026-10-31T20:30:00+00:00', 10),
    item(4, '2026-11-02T06:05:00+00:00', 16.5, null, { otoyol: '*' }),
  ];
  const window = { from: '2026-11-01', to: '2026-11-02' };
  const rows = statementRows(items, window, true);
  // 20:30 UTC on 31 Oct is 23:30 in Istanbul: still October, left out.
  expect(rows.map(row => [row.id, row.date, row.time, row.route, row.road, row.type])).toEqual([
    [1, '2026-11-01', '00:30', 'FSM', '—', 'public'],
    [4, '2026-11-02', '09:05', 'MAHMUTBEY → KINALI', '—', null],
    [3, '2026-11-02', '23:40', 'MAHMUTBEY → KINALI', 'KMO AVRUPA KESIMI', 'private'],
  ]);
  expect(statementSummary(rows)).toEqual({ total: 116.5, passes: 3, days: 2 });
  const publicOnly = statementRows(items, window, false);
  expect(publicOnly.map(row => row.id)).toEqual([1, 4]);
  expect(statementSummary(publicOnly)).toEqual({ total: 75.5, passes: 2, days: 2 });
});

test('formats, and every language has every line with the legal note', () => {
  expect(statementDay('2026-11-06')).toBe('06.11.2026');
  expect(statementAmount(1234.5)).toBe('₺1.234,50');
  const keys = Object.keys(STATEMENT_TEXT.en).sort();
  for (const lang of STATEMENT_LANGS) {
    expect(Object.keys(STATEMENT_TEXT[lang]).sort()).toEqual(keys);
    expect(Object.values(STATEMENT_TEXT[lang]).every(text => text.trim().length > 0)).toBe(true);
    expect(STATEMENT_TEXT[lang].page).toMatch(/\{x\}.*\{y\}/);
  }
  expect(STATEMENT_TEXT.ar.legal.startsWith('تم استخراج هذه البيانات من سجل نظام HGS الرسمي')).toBe(true);
  expect(STATEMENT_TEXT.tr.legal.endsWith('tahsil etme hakkına sahiptir.')).toBe(true);
  expect(STATEMENT_TEXT.fr.legal.startsWith('Ces données proviennent')).toBe(true);
});
