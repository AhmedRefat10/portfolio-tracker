-- ============================================================
-- Run this in Supabase -> SQL Editor
-- Safe to re-run: it creates missing tables/columns without
-- deleting existing portfolio data.
-- ============================================================

create extension if not exists pgcrypto;

-- POSITIONS
create table if not exists positions (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  ticker       text not null,
  shares       numeric not null default 0,
  price        numeric not null default 0,
  entry_price  numeric not null default 0,
  target_pct   numeric not null default 0,
  is_cash      boolean not null default false,
  sort_order   integer not null default 0,
  opened_at    timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table positions add column if not exists opened_at timestamptz default now();
alter table positions add column if not exists updated_at timestamptz default now();

alter table positions enable row level security;
drop policy if exists "own positions only" on positions;
create policy "own positions only" on positions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- SNAPSHOTS
create table if not exists snapshots (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  total_value   numeric not null,
  positions     jsonb not null,
  note          text,
  created_at    timestamptz default now()
);

alter table snapshots enable row level security;
drop policy if exists "own snapshots only" on snapshots;
create policy "own snapshots only" on snapshots for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- CLOSED TRADES
create table if not exists closed_trades (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references auth.users(id) on delete cascade not null,
  ticker          text not null,
  shares          numeric not null default 0,
  entry_price     numeric not null default 0,
  exit_price      numeric not null default 0,
  invested_value  numeric not null default 0,
  exit_value      numeric not null default 0,
  profit_value    numeric not null default 0,
  profit_pct      numeric not null default 0,
  duration_days   integer not null default 0,
  opened_at       timestamptz,
  closed_at       timestamptz default now(),
  notes           text,
  position_data   jsonb
);

alter table closed_trades enable row level security;
drop policy if exists "own closed trades only" on closed_trades;
create policy "own closed trades only" on closed_trades for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
