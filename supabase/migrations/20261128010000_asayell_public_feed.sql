-- Asayell Round 3: public reel feed support.
-- Adds is_public flag, public listing RPC, owner controls (publish toggle,
-- message hide), and message ids in the owner message list.
-- Safe to run once in the Supabase SQL Editor (after the foundation SQL).

alter table public.asayell_goals
  add column if not exists is_public boolean not null default false;

-- create_goal gains p_is_public: drop the old 6-arg version first.
drop function if exists public.asayell_create_goal(text, text, text, timestamptz, text, text);

create or replace function public.asayell_create_goal(
  p_nickname text,
  p_title text,
  p_detail text,
  p_wake_at timestamptz,
  p_support_token text,
  p_owner_token text,
  p_is_public boolean default false
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

  insert into public.asayell_goals (nickname, title, detail, wake_at, support_token, owner_token, is_public)
  values (p_nickname, p_title, nullif(p_detail, ''), p_wake_at, p_support_token, p_owner_token, coalesce(p_is_public, false))
  returning * into g;
  return g;
end;
$$;

-- Public feed: only opted-in goals whose wake time is still ahead.
create or replace function public.asayell_list_public_goals(
  p_limit integer default 20
) returns table (
  nickname text,
  title text,
  detail text,
  wake_at timestamptz,
  support_token text,
  message_count integer
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
       where m.goal_id = g.id and m.status = 'visible')
  from public.asayell_goals g
  where g.is_public = true
    and g.wake_at > now()
  order by random()
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- Owner toggles public visibility of their own goal.
create or replace function public.asayell_set_public(
  p_owner_token text,
  p_is_public boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
begin
  update public.asayell_goals
  set is_public = coalesce(p_is_public, false)
  where owner_token = p_owner_token;
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

-- Owner messages now include the message id (needed for hide).
drop function if exists public.asayell_get_owner_messages(text, boolean);

create or replace function public.asayell_get_owner_messages(
  p_owner_token text,
  p_demo boolean default false
) returns table (
  id uuid,
  sender text,
  body text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select m.id, m.sender, m.body, m.created_at
  from public.asayell_goals g
  join public.asayell_messages m on m.goal_id = g.id
  where g.owner_token = p_owner_token
    and m.status = 'visible'
    and (now() >= g.wake_at or coalesce(p_demo, false))
  order by m.created_at asc;
$$;

-- Owner hides a message addressed to their own goal.
create or replace function public.asayell_hide_message(
  p_owner_token text,
  p_message_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
begin
  update public.asayell_messages m
  set status = 'hidden'
  from public.asayell_goals g
  where m.goal_id = g.id
    and g.owner_token = p_owner_token
    and m.id = p_message_id;
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

grant execute on function public.asayell_create_goal(text, text, text, timestamptz, text, text, boolean) to anon;
grant execute on function public.asayell_list_public_goals(integer) to anon;
grant execute on function public.asayell_set_public(text, boolean) to anon;
grant execute on function public.asayell_get_owner_messages(text, boolean) to anon;
grant execute on function public.asayell_hide_message(text, uuid) to anon;
