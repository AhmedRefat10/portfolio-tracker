-- ============================================================
-- Run this in Supabase → SQL Editor
-- Drop old tables first if re-running
-- ============================================================

drop table if exists snapshots;
drop table if exists positions;

-- POSITIONS
create table positions (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  ticker       text not null,
  shares       numeric not null default 0,
  price        numeric not null default 0,
  entry_price  numeric not null default 0,
  target_pct   numeric not null default 0,
  is_cash      boolean not null default false,
  sort_order   integer not null default 0,
  updated_at   timestamptz default now()
);

alter table positions enable row level security;
create policy "own positions only" on positions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- SNAPSHOTS
create table snapshots (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  total_value   numeric not null,
  positions     jsonb not null,
  note          text,
  created_at    timestamptz default now()
);

alter table snapshots enable row level security;
create policy "own snapshots only" on snapshots for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
