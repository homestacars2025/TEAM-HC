-- "Add HGS from portal" in the customer wallet (Team and Admin call the same functions).
--
-- A booking's portal transits are charged to the customer once: one
-- customer_accounting_ledger line per transit, and the transit marked with the booking.
-- Transits outside a booking stay the investor's (trg_portal_transit_autopost, unchanged:
-- it already skips any transit inside a confirmed or completed booking).
--
-- NOT APPLIED YET. Apply with the Supabase SQL editor or `supabase db push`.

alter table public.hgs_portal_transits
  add column if not exists posted_to_customer_booking_id bigint references public.bookings(id) on delete set null;

comment on column public.hgs_portal_transits.posted_to_customer_booking_id is
  'The booking this transit was charged to in customer_accounting_ledger, by post_booking_portal_hgs. Null = not charged to a customer.';

create index if not exists hgs_portal_transits_unposted_customer_idx
  on public.hgs_portal_transits (car_id, transit_datetime)
  where posted_to_customer_booking_id is null;

-- Who may post: admins, and staff with a page that opens the customer wallet.
create or replace function public.can_post_customer_hgs()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_admin()
      or public.user_has_page('accounting')
      or public.user_has_page('customer_wallets')
      or public.user_has_page('bookings')
$$;

-- Read only. The booking's car's transits whose Istanbul day falls in [from, to], clamped to
-- the booking's own dates, not yet charged to a customer and not charged to the investor.
create or replace function public.booking_portal_hgs_preview(p_booking_id bigint, p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  b record;
  v_from date;
  v_to date;
  v_result jsonb;
begin
  if not public.can_post_customer_hgs() then raise exception 'forbidden' using errcode = '42501'; end if;

  select bk.id, bk.car_id, bk.customer_id, bk.status::text as status, bk.start_date, bk.end_date, c.plate_number
    into b
    from bookings bk left join cars c on c.id = bk.car_id
   where bk.id = p_booking_id;
  if not found then raise exception 'booking not found'; end if;

  v_from := greatest(coalesce(p_from, b.start_date), b.start_date);
  v_to := least(coalesce(p_to, b.end_date), b.end_date);

  with car_rows as (
    select t.*, (t.transit_datetime at time zone 'Europe/Istanbul') as local_at
      from hgs_portal_transits t
     where t.car_id = b.car_id
  ), in_range as (
    select * from car_rows
     where local_at::date between v_from and v_to
  ), chargeable as (
    select * from in_range
     where posted_to_customer_booking_id is null and posted_to_investor_at is null
     order by transit_datetime
  )
  select jsonb_build_object(
    'booking_id', b.id,
    'car_id', b.car_id,
    'plate', b.plate_number,
    'status', b.status,
    'start_date', b.start_date,
    'end_date', b.end_date,
    'from', v_from,
    'to', v_to,
    'last_upload', (select to_char(max(created_at) at time zone 'Europe/Istanbul', 'YYYY-MM-DD"T"HH24:MI') from car_rows),
    'last_transit', (select to_char(max(local_at), 'YYYY-MM-DD"T"HH24:MI') from car_rows),
    'rate_hint', (select l.exchange_rate_at_entry from customer_accounting_ledger l
                   where l.booking_id = b.id and l.exchange_rate_at_entry > 0
                   order by l.created_at desc limit 1),
    'count', (select count(*) from chargeable),
    'total', coalesce((select sum(amount) from chargeable), 0),
    'transits', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id,
        'at', to_char(local_at, 'YYYY-MM-DD HH24:MI'),
        'date', local_at::date,
        'amount', amount,
        'road_type', road_type,
        'entry_location', nullif(entry_location, '*'),
        'exit_location', nullif(exit_location, '*'),
        'otoyol', otoyol,
        'note', to_char(local_at, 'DD-MM-YYYY HH24:MI') || ' ' || coalesce(nullif(entry_location, '*'), '?')
                || ' → ' || coalesce(nullif(exit_location, '*'), otoyol, '?')
      ) order by transit_datetime) from chargeable), '[]'::jsonb),
    'investor_count', (select count(*) from in_range where posted_to_investor_at is not null and posted_to_customer_booking_id is null),
    'investor_total', coalesce((select sum(amount) from in_range where posted_to_investor_at is not null and posted_to_customer_booking_id is null), 0),
    'posted_count', (select count(*) from in_range where posted_to_customer_booking_id = b.id)
  ) into v_result;

  return v_result;
end
$$;

-- Writes. One ledger line per chargeable transit and the mark on the transit, in one
-- transaction. The rows are locked first, so two clicks (or the two apps) can never
-- charge the same transit twice: the second call finds them already marked.
create or replace function public.post_booking_portal_hgs(p_booking_id bigint, p_from date, p_to date, p_rate numeric)
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  b record;
  r record;
  v_from date;
  v_to date;
  v_count int := 0;
  v_total numeric := 0;
begin
  if not public.can_post_customer_hgs() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_rate is null or p_rate < 1 or p_rate > 1000 then raise exception 'exchange rate out of range'; end if;

  select bk.id, bk.car_id, bk.customer_id, bk.status::text as status, bk.start_date, bk.end_date
    into b
    from bookings bk
   where bk.id = p_booking_id
   for update;
  if not found then raise exception 'booking not found'; end if;
  if b.status = 'cancelled' then raise exception 'booking is cancelled'; end if;
  if b.car_id is null or b.customer_id is null then raise exception 'booking has no car or customer'; end if;

  v_from := greatest(coalesce(p_from, b.start_date), b.start_date);
  v_to := least(coalesce(p_to, b.end_date), b.end_date);
  if v_from > v_to then raise exception 'empty period'; end if;

  for r in
    select t.id, t.amount, t.transit_datetime, t.entry_location, t.exit_location, t.otoyol
      from hgs_portal_transits t
     where t.car_id = b.car_id
       and (t.transit_datetime at time zone 'Europe/Istanbul')::date between v_from and v_to
       and t.posted_to_customer_booking_id is null
       and t.posted_to_investor_at is null
     order by t.transit_datetime
       for update
  loop
    insert into customer_accounting_ledger
      (booking_id, customer_id, car_id, type, description, amount, direction, exchange_rate_at_entry, created_by)
    values
      (b.id, b.customer_id, b.car_id::int, 'hgs',
       '[AUTO-HGS] ' || to_char(r.transit_datetime at time zone 'Europe/Istanbul', 'DD-MM-YYYY HH24:MI') || ' '
         || coalesce(nullif(r.entry_location, '*'), '?') || ' → ' || coalesce(nullif(r.exit_location, '*'), r.otoyol, '?'),
       r.amount, 'OUT', p_rate, auth.uid());

    update hgs_portal_transits set posted_to_customer_booking_id = b.id where id = r.id;
    v_count := v_count + 1;
    v_total := v_total + r.amount;
  end loop;

  return jsonb_build_object('posted', v_count, 'total', v_total, 'from', v_from, 'to', v_to);
end
$$;

revoke all on function public.booking_portal_hgs_preview(bigint, date, date) from public, anon;
revoke all on function public.post_booking_portal_hgs(bigint, date, date, numeric) from public, anon;
revoke all on function public.can_post_customer_hgs() from public, anon;
grant execute on function public.booking_portal_hgs_preview(bigint, date, date) to authenticated;
grant execute on function public.post_booking_portal_hgs(bigint, date, date, numeric) to authenticated;
grant execute on function public.can_post_customer_hgs() to authenticated;
