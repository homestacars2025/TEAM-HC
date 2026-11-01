import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { EXPENSE_CATEGORIES } from '../../lib/custodyExpense';
import { categoryLabel } from '../../pages/AccountingPage';

/** The expense's own wording where it has one: custody says بنزين, finance says وقود. */
export function useExpenseCategoryLabel() {
  const { t } = useTranslation('custody');
  const { t: ta } = useTranslation('accounting');
  return useCallback((value: string | null) => {
    const own = [...EXPENSE_CATEGORIES.car, ...EXPENSE_CATEGORIES.company].find(option => option.value === value);
    return own ? t(`expense.categories.${own.key}`) : categoryLabel(ta, value);
  }, [t, ta]);
}
