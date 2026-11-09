import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { interviewCounts, matchesInterviewFilter, openSlots, slotDays, sortShortlist, type InterviewSlot, type ShortlistRow } from './interviews';
import { openingProblem, slugify, toOpeningDraft } from './hr';
import { istanbulDay, istanbulInstant, nextKey, parseAttachments, parseCriteria, parseFormSchema, readConfirmation, weightedScore } from './model';

let mockAllowed = new Set<string>();
jest.mock('../../contexts/PageAccessContext', () => ({
  usePageAccess: () => ({
    loading: false,
    error: null,
    allowedPages: mockAllowed,
    pages: [{ key: 'home', route: '/dashboard/home' }],
    canAccessPage: (key: string) => mockAllowed.has(key),
    firstAllowedRoute: '/dashboard/home',
    refresh: () => {},
  }),
}));
// eslint-disable-next-line import/first
import RequirePage from '../../components/RequirePage';

const SRC = path.join(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(SRC, file), 'utf8');

describe('the interviews-only screen sees only what the team view gives it', () => {
  const files = ['pages/hr/InterviewsPage.tsx', 'lib/recruitment/interviews.ts', 'components/hr/HrParts.tsx'];

  test('never reads applicants, scores or files directly', () => {
    for (const file of files) {
      const source = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect({ file, hits: source.match(/recruitment_applicants|recruitment_interview_scores|recruitment_interviews\b|recruitment_activities|recruitment_files|cv_url|\.phone\b|answers/g) }).toEqual({ file, hits: null });
    }
  });

  test('never imports the HR data layer or the applicant drawer', () => {
    const page = read('pages/hr/InterviewsPage.tsx');
    expect(page).not.toMatch(/recruitment\/hr'|ApplicantDrawer|InterviewCalendar/);
    expect(read('lib/recruitment/interviews.ts')).not.toMatch(/from '\.\/hr'/);
  });

  test('reads the shortlist from the team view, and acts only through the two RPCs', () => {
    const source = read('lib/recruitment/interviews.ts');
    expect(source).toContain("from('recruitment_shortlist_for_team')");
    expect(source.match(/\.rpc\('([a-z_]+)'/g)).toEqual([".rpc('recruitment_book_slot'", ".rpc('recruitment_set_confirmation'"]);
    expect(source).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });
});

describe('the routes are guarded, not only the sidebar', () => {
  const app = read('App.tsx');

  test('interviews opens for either key; everything else under /hr needs the HR page; both send others home', () => {
    expect(app).toMatch(/path="hr\/interviews" element=\{<RequirePage page=\{INTERVIEW_PAGES\} redirect>/);
    expect(app).toContain("const INTERVIEW_PAGES = ['interviews', 'hr'] as const;");
    for (const route of ['hr', 'hr/openings/new', 'hr/openings/:id', 'hr/openings/:id/edit']) {
      expect(app).toContain(`path="${route}" element={<RequirePage page="hr" redirect>`);
    }
  });

  const guard = (page: string | readonly string[]) => render(
    <MemoryRouter initialEntries={['/dashboard/hr/interviews']}>
      <Routes>
        <Route path="/dashboard/hr/interviews" element={<RequirePage page={page} redirect><p>scheduling</p></RequirePage>} />
        <Route path="/dashboard/home" element={<p>home</p>} />
      </Routes>
    </MemoryRouter>,
  );

  test('the interviews page alone opens the scheduling screen', () => {
    mockAllowed = new Set(['home', 'interviews']);
    guard(['interviews', 'hr']);
    expect(screen.getByText('scheduling')).toBeInTheDocument();
  });

  test('the HR page opens it too', () => {
    mockAllowed = new Set(['home', 'hr']);
    guard(['interviews', 'hr']);
    expect(screen.getByText('scheduling')).toBeInTheDocument();
  });

  test('without either, home', () => {
    mockAllowed = new Set(['home', 'cars']);
    guard(['interviews', 'hr']);
    expect(screen.getByText('home')).toBeInTheDocument();
    expect(screen.queryByText('scheduling')).not.toBeInTheDocument();
  });

  test('the interviews page does not open full HR', () => {
    mockAllowed = new Set(['home', 'interviews']);
    guard('hr');
    expect(screen.getByText('home')).toBeInTheDocument();
  });
});

describe('scheduling helpers', () => {
  const row = (over: Partial<ShortlistRow>): ShortlistRow => ({
    id: 'a', openingId: 'o', openingTitle: 'Driver', fullName: 'Ali', age: 30, nationality: 'TR', district: 'Şişli',
    confirmation: 'pending', createdAt: '', slotId: null, slotStartsAt: null, slotEndsAt: null, location: null, ...over,
  });
  const slot = (startsAt: string, status = 'open'): InterviewSlot => ({ id: startsAt, openingId: 'o', startsAt, endsAt: startsAt, status, applicantId: null });

  test('tiles count the shortlist, the booked, and who is or is not coming', () => {
    const rows = [row({ id: '1', slotId: 's', confirmation: 'coming' }), row({ id: '2', confirmation: 'not_coming' }), row({ id: '3' })];
    expect(interviewCounts(rows)).toEqual({ all: 3, booked: 1, coming: 1, not_coming: 1 });
    expect(rows.filter(r => matchesInterviewFilter(r, 'booked')).map(r => r.id)).toEqual(['1']);
  });

  test('booked first by time, then by name', () => {
    const rows = [row({ id: 'z', fullName: 'Zeynep' }), row({ id: 'late', slotStartsAt: '2026-11-12T09:00:00Z' }), row({ id: 'early', slotStartsAt: '2026-11-12T07:00:00Z' }), row({ id: 'a', fullName: 'Ahmet' })];
    expect(sortShortlist(rows).map(r => r.id)).toEqual(['early', 'late', 'a', 'z']);
  });

  test('only open, future slots can be booked; days are Istanbul days', () => {
    const now = Date.parse('2026-11-10T09:00:00Z');
    const slots = [slot('2026-11-10T08:00:00Z'), slot('2026-11-10T10:00:00Z'), slot('2026-11-10T11:00:00Z', 'booked'), slot('2026-11-10T22:30:00Z')];
    expect(openSlots(slots, now).map(s => s.id)).toEqual(['2026-11-10T10:00:00Z', '2026-11-10T22:30:00Z']);
    // 22:30 UTC is already the 11th in Istanbul.
    expect(slotDays(slots)).toEqual(['2026-11-10', '2026-11-11']);
    expect(istanbulDay('2026-11-10T22:30:00Z')).toBe('2026-11-11');
    expect(istanbulInstant('2026-11-12', '10:00')).toBe('2026-11-12T07:00:00.000Z');
  });

  test('the confirmation is the enum, whatever arrives', () => {
    expect(readConfirmation('no_response')).toBe('no_response');
    expect(readConfirmation('no_answer')).toBe('pending');
  });
});

describe('openings and scoring', () => {
  test('a malformed form or scorecard entry is dropped, not rendered', () => {
    expect(parseFormSchema([{ key: 'q1', type: 'weird', label: ' Age ' }, { label: 'no key' }, null])).toEqual([{ key: 'q1', type: 'short_text', label: 'Age', required: false, options: [] }]);
    expect(parseCriteria([{ key: 'c1', label: 'Driving', weight: 60 }, { key: 'c2', label: '', weight: -1 }])).toEqual([{ key: 'c1', label: 'Driving', weight: 60 }, { key: 'c2', label: '#2', weight: null }]);
    expect(parseAttachments(['cv/a.pdf', { path: 'x/b.png', name: 'Licence' }, 5])).toEqual([{ path: 'cv/a.pdf', name: 'a.pdf' }, { path: 'x/b.png', name: 'Licence' }]);
  });

  test('keys are never reused', () => {
    expect(nextKey([{ key: 'q1' }, { key: 'q4' }], 'q')).toBe('q5');
  });

  test('weighted out of 100, evenly when no weights, and partial scorecards say so', () => {
    const criteria = [{ key: 'a', label: 'A', weight: 60 }, { key: 'b', label: 'B', weight: 40 }];
    expect(weightedScore(criteria, [{ criterion: 'a', score: 5 }, { criterion: 'b', score: 3 }])?.total).toBe(84);
    expect(weightedScore(criteria, [{ criterion: 'a', score: 5 }])).toMatchObject({ total: 60, scoredCount: 1, criteriaCount: 2 });
    expect(weightedScore([{ key: 'a', label: 'A', weight: null }, { key: 'b', label: 'B', weight: null }], [{ criterion: 'a', score: 5 }, { criterion: 'b', score: 5 }])?.total).toBe(100);
    expect(weightedScore(criteria, [])).toBeNull();
  });

  test('an opening needs a title, real choice options, and weights that add to 100', () => {
    const draft = toOpeningDraft(null);
    expect(openingProblem(draft)).toBe('title');
    expect(openingProblem({ ...draft, title: 'Driver', formSchema: [{ key: 'q1', type: 'single_choice', label: 'Licence?', required: true, options: ['Yes'] }] })).toBe('options');
    expect(openingProblem({ ...draft, title: 'Driver', interviewCriteria: [{ key: 'c1', label: 'A', weight: 50 }, { key: 'c2', label: 'B', weight: null }] })).toBe('weights');
    expect(openingProblem({ ...draft, title: 'Driver', interviewCriteria: [{ key: 'c1', label: 'A', weight: 70 }, { key: 'c2', label: 'B', weight: 30 }] })).toBeNull();
  });

  test('public link names fold Turkish letters', () => {
    expect(slugify('Şoför — Kayaşehir Şubesi')).toBe('sofor-kayasehir-subesi');
  });
});
