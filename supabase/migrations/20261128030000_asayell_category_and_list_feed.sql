-- Asayell Round 4: goal category (夢/目標/楽しみ) and list-style feed order.
-- Run once in the Supabase SQL Editor (after the Round 3 migrations).

alter table public.asayell_goals
  add column if not exists category text not null default 'goal'
  check (category in ('dream', 'goal', 'fun'));

-- create_goal gains p_category: drop the Round 3 version first.
drop function if exists public.asayell_create_goal(text, text, text, timestamptz, text, text, boolean);

create or replace function public.asayell_create_goal(
  p_nickname text,
  p_title text,
  p_detail text,
  p_wake_at timestamptz,
  p_support_token text,
  p_owner_token text,
  p_is_public boolean default false,
  p_category text default 'goal'
) returns public.asayell_goals
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.asayell_goals;
begin
  if char_length(coalesce(p_nickname, '')) not between 1 and 20 then
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

  insert into public.asayell_goals (nickname, title, detail, wake_at, support_token, owner_token, is_public, category)
  values (p_nickname, p_title, nullif(p_detail, ''), p_wake_at, p_support_token, p_owner_token, coalesce(p_is_public, false), coalesce(p_category, 'goal'))
  returning * into g;
  return g;
end;
$$;

-- Support view now includes the category (return type changes, so drop first).
drop function if exists public.asayell_get_goal_for_support(text);

create or replace function public.asayell_get_goal_for_support(
  p_support_token text
) returns table (
  nickname text,
  title text,
  detail text,
  wake_at timestamptz,
  category text
)
language sql
security definer
set search_path = public
as $$
  select g.nickname, g.title, g.detail, g.wake_at, g.category
  from public.asayell_goals g
  where g.support_token = p_support_token;
$$;

-- Feed becomes a newest-first list and includes the category.
drop function if exists public.asayell_list_public_goals(integer);

create or replace function public.asayell_list_public_goals(
  p_limit integer default 20
) returns table (
  nickname text,
  title text,
  detail text,
  wake_at timestamptz,
  support_token text,
  message_count integer,
  category text
)
language sql
security definer
set search_path = public
as $$
  select
    g.nickname,
    g.title,
    g.detail,
    g.wake_at,
    g.support_token,
    (select count(*)::integer from public.asayell_messages m
       where m.goal_id = g.id and m.status = 'visible'),
    g.category
  from public.asayell_goals g
  where g.is_public = true
    and g.wake_at > now()
  order by g.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- Owner goal view now includes the category.
drop function if exists public.asayell_get_owner_goal(text);

create or replace function public.asayell_get_owner_goal(
  p_owner_token text
) returns table (
  nickname text,
  title text,
  detail text,
  wake_at timestamptz,
  message_count integer,
  is_unlocked boolean,
  is_public boolean,
  category text
)
language sql
security definer
set search_path = public
as $$
  select
    g.nickname,
    g.title,
    g.detail,
    g.wake_at,
    (select count(*)::integer from public.asayell_messages m
       where m.goal_id = g.id and m.status = 'visible'),
    (now() >= g.wake_at),
    g.is_public,
    g.category
  from public.asayell_goals g
  where g.owner_token = p_owner_token;
$$;

grant execute on function public.asayell_create_goal(text, text, text, timestamptz, text, text, boolean, text) to anon;
grant execute on function public.asayell_get_goal_for_support(text) to anon;
grant execute on function public.asayell_list_public_goals(integer) to anon;
grant execute on function public.asayell_get_owner_goal(text) to anon;
