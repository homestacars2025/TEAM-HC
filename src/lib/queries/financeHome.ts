import { supabase } from '../supabase';

/** `YYYY-MM` of the month after. */
const nextMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 7);

const sum = (rows: { amount: number }[] | null) => (rows ?? []).reduce((total, row) => total + Number(row.amount), 0);

/** Through the staff view, which leaves commissions out. */
export async function getMonthSheetExpenses(month: string): Promise<number> {
  const { data, error } = await supabase.from('team_car_transactions').select('amount').eq('month_key', month).eq('direction', 'OUT');
  if (error) throw error;
  return sum(data);
}

export async function getMonthCompanyExpenses(month: string): Promise<number> {
  const { data, error } = await supabase.from('company_expenses').select('amount').eq('direction', 'OUT').gte('expense_date', `${month}-01`).lt('expense_date', `${nextMonth(month)}-01`);
  if (error) throw error;
  return sum(data);
}

export async function getUnpaidFines(): Promise<{ count: number; total: number }> {
  const { data, error } = await supabase.from('traffic_fines').select('amount').eq('status', 'unpaid');
  if (error) throw error;
  return { count: data?.length ?? 0, total: sum(data) };
}
