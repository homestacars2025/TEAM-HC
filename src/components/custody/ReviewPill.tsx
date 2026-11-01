import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ReviewStatus } from '../../lib/expenseReview';

const TONE: Record<ReviewStatus, string> = { pending: 'is-amber', approved: 'is-green', rejected: 'is-red' };

/** Where finance has got to with an expense. A refusal keeps its reason on hover. */
const ReviewPill: React.FC<{ status: ReviewStatus; note?: string | null; legacy?: boolean }> = ({ status, note, legacy = false }) => {
  const { t } = useTranslation('finance');
  return <span className={`hc-pill ${legacy ? 'is-old' : TONE[status]}`} title={status === 'rejected' ? note ?? undefined : undefined}>{t(legacy ? 'review.status.legacy' : `review.status.${status}`)}</span>;
};

export default ReviewPill;
