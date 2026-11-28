-- Asayell Round 5: device-based accounts (profiles) and goal ownership.
-- Run once in the Supabase SQL Editor (after the Round 4 migration).

create table if not exists public.asayell_profiles (
  device_id text primary key,
  account_name text not null check (char_length(account_name) between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.asayell_profiles enable row level security;
-- No direct policies for anon: all access goes through the RPC functions below.

alter table public.asayell_goals
  add column if not exists owner_device_id text;

create or replace function public.asayell_upsert_profile(
  p_device_id text,
  p_account_name text
) returns public.asayell_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.asayell_profiles;
begin
  if p_device_id is null or char_length(p_device_id) < 16 then
    raise exception 'device id is invalid';
  end if;
  if char_length(coalesce(p_account_name, '')) not between 1 and 20 then
    raise exception 'account name must be 1..20 chars';
  end if;
  insert into public.asayell_profiles (device_id, account_name)
  values (p_device_id, p_account_name)
  on conflict (device_id) do update
    set account_name = excluded.account_name, updated_at = now()
  returning * into pr;
  return pr;
end;
$$;

create or replace function public.asayell_get_profile(
  p_device_id text
) returns table (
  account_name text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.account_name, p.created_at
  from public.asayell_profiles p
  where p.device_id = p_device_id;
$$;

create or replace function public.asayell_list_my_goals(
  p_device_id text
) returns table (
  title text,
  wake_at timestamptz,
  is_public boolean,
  category text,
  message_count integer,
  support_token text,
  owner_token text
)
language sql
security definer
set search_path = public
as $$
  select
    g.title,
    g.wake_at,
    g.is_public,
    g.category,
    (select count(*)::integer from public.asayell_messages m
       where m.goal_id = g.id and m.status = 'visible'),
    g.support_token,
    g.owner_token
  from public.asayell_goals g
  where g.owner_device_id = p_device_id
  order by g.created_at desc
  limit 50;
$$;

-- create_goal gains p_device_id: when given, the profile account name is used.
drop function if exists public.asayell_create_goal(text, text, text, timestamptz, text, text, boolean, text);

create or replace function public.asayell_create_goal(
  p_nickname text,
  p_title text,
  p_detail text,
  p_wake_at timestamptz,
  p_support_token text,
  p_owner_token text,
  p_is_public boolean default false,
  p_category text default 'goal',
  p_device_id text default null
) returns public.asayell_goals
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.asayell_goals;
  v_name text;
begin
  v_name := p_nickname;
  if p_device_id is not null then
    select account_name into v_name
    from public.asayell_profiles
    where device_id = p_device_id;
    if v_name is null then
      raise exception 'profile not found for device';
    end if;
  end if;
  if char_length(coalesce(v_name, '')) not between 1 and 20 then
    raise exception 'nickname must be 1..20 chars';
  end if;
  if char_length(coalesce(p_title, '')) not between 1 and 100 then
    raise exception 'title must be 1..100 chars';
  end if;
  if p_detail is not null and char_length(p_detail) > 300 then
    raise exception 'detail must be <= 300 chars';
  end if;
  if p_support_token is null or p_owner_token is null
     or p_support_token = p_owner_token then
    raise exception 'tokens are invalid';
  end if;
  if coalesce(p_category, 'goal') not in ('dream', 'goal', 'fun') then
    raise exception 'category is invalid';
  end if;

  insert into public.asayell_goals (nickname, title, detail, wake_at, support_token, owner_token, is_public, category, owner_device_id)
  values (v_name, p_title, nullif(p_detail, ''), p_wake_at, p_support_token, p_owner_token, coalesce(p_is_public, false), coalesce(p_category, 'goal'), p_device_id)
  returning * into g;
  return g;
end;
$$;

grant execute on function public.asayell_upsert_profile(text, text) to anon;
grant execute on function public.asayell_get_profile(text) to anon;
grant execute on function public.asayell_list_my_goals(text) to anon;
grant execute on function public.asayell_create_goal(text, text, text, timestamptz, text, text, boolean, text, text) to anon;
