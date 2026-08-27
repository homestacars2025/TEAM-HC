import * as React from 'react';
import { PageHeader } from '../../../components/layout/page-header';
import { getFormats, getGoals, getIdeas } from '../../../lib/queries/media';
import type { MediaFormat, MediaGoal, MediaIdea } from '../../../lib/types/media';
import { MediaNav } from '../_components/media-nav';
import { useMediaData } from '../use-media-data';
import { IdeasClient } from './_components/ideas-client';
import { IdeasLoading } from './loading';

interface IdeasData {
  ideas: MediaIdea[];
  goals: MediaGoal[];
  formats: MediaFormat[];
}

const loadIdeasData = async (): Promise<IdeasData> => {
  const [ideas, goals, formats] = await Promise.all([getIdeas(), getGoals(), getFormats()]);
  return { ideas, goals, formats };
};

export default function MediaIdeasPage() {
  const { data, loading } = useMediaData(loadIdeasData);

  if (loading || !data) return <IdeasLoading />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Content Ideas"
        title="Ideas"
        subtitle="The backlog of concepts — capture them here, then convert the good ones into scheduled posts."
      />
      <MediaNav />
      <IdeasClient ideas={data.ideas} goals={data.goals} formats={data.formats} />
    </div>
  );
}
