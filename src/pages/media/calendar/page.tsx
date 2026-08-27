import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/page-header';
import { getFormats, getGoals, getPosts } from '../../../lib/queries/media';
import type { MediaFormat, MediaGoal, MediaPost } from '../../../lib/types/media';
import { MediaNav } from '../_components/media-nav';
import { useMediaData } from '../use-media-data';
import { MediaCalendarClient } from './_components/media-calendar-client';
import { CalendarLoading } from './loading';

interface CalendarData {
  posts: MediaPost[];
  goals: MediaGoal[];
  formats: MediaFormat[];
}

const loadCalendarData = async (): Promise<CalendarData> => {
  const [posts, goals, formats] = await Promise.all([getPosts(), getGoals(), getFormats()]);
  return { posts, goals, formats };
};

export default function MediaCalendarPage() {
  const [searchParams] = useSearchParams();
  const { data, loading } = useMediaData(loadCalendarData);

  if (loading || !data) return <CalendarLoading />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Content Plan"
        title="Calendar"
        subtitle="Everything scheduled to go out — switch between the week-by-week list and the month grid."
      />
      <MediaNav />
      <MediaCalendarClient
        posts={data.posts}
        goals={data.goals}
        formats={data.formats}
        initialPostId={searchParams.get('post') ?? undefined}
      />
    </div>
  );
}
