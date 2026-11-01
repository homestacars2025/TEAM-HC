import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ReviewStatus } from '../../lib/expenseReview';

const TONE: Record<ReviewStatus, string> = { pending: 'is-amber', approved: 'is-green', rejected: 'is-red' };

/** Where finance has got to with an expense. A refusal keeps its reason on hover. */
const ReviewPill: React.FC<{ status: ReviewStatus; note?: string | null }> = ({ status, note }) => {
  const { t } = useTranslation('finance');
  return <span className={`hc-pill ${TONE[status]}`} title={status === 'rejected' ? note ?? undefined : undefined}>{t(`review.status.${status}`)}</span>;
};

export default ReviewPill;
