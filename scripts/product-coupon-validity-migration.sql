-- Adds seller-defined coupon validity per product.
-- The production Supabase project was also updated through the Supabase MCP so
-- register_payment_intent snapshots this value and issue_coupon_for_payment uses it.

alter table public.products
  add column if not exists coupon_valid_hours integer not null default 24;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_coupon_valid_hours_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_coupon_valid_hours_check
      check (coupon_valid_hours between 1 and 720);
  end if;
end $$;

update public.products
set coupon_valid_hours = 24
where coupon_valid_hours is null;
