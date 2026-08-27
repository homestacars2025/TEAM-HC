import * as React from 'react';
import { PageHeader } from '../../../components/layout/page-header';
import { getInfluencers } from '../../../lib/queries/media';
import { MediaNav } from '../_components/media-nav';
import { useMediaData } from '../use-media-data';
import { InfluencersClient } from './_components/influencers-client';
import { InfluencersLoading } from './loading';

export default function MediaInfluencersPage() {
  const { data, loading } = useMediaData(getInfluencers);

  if (loading || !data) return <InfluencersLoading />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Creator Outreach"
        title="Influencers"
        subtitle="Every creator on the radar — audience size, contact details, and where the conversation stands."
      />
      <MediaNav />
      <InfluencersClient influencers={data} />
    </div>
  );
}
