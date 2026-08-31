import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../../components/layout/page-header';
import { getInfluencers } from '../../../lib/queries/media';
import { MediaNav } from '../_components/media-nav';
import { useMediaData } from '../use-media-data';
import { InfluencersClient } from './_components/influencers-client';
import { InfluencersLoading } from './loading';

export default function MediaInfluencersPage() {
  const { t } = useTranslation('media');
  const { data, loading } = useMediaData(getInfluencers);

  if (loading || !data) return <InfluencersLoading />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('influencers.eyebrow')}
        title={t('influencers.title')}
        subtitle={t('influencers.subtitle')}
      />
      <MediaNav />
      <InfluencersClient influencers={data} />
    </div>
  );
}
