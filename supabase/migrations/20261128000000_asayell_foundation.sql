-- Asayell foundation (Round 2): goals + messages, RPC-only access.
-- Shares the Ke-sangame Supabase project. All objects are prefixed asayell_.
-- Safe to run once in the Supabase SQL Editor.

create table if not exists public.asayell_goals (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(nickname) between 1 and 20),
  title text not null check (char_length(title) between 1 and 100),
  detail text check (detail is null or char_length(detail) <= 300),
  wake_at timestamptz not null,
  support_token text not null unique,
  owner_token text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.asayell_messages (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.asayell_goals(id) on delete cascade,
  sender text check (sender is null or char_length(sender) <= 20),
  body text not null check (char_length(body) between 1 and 150),
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now()
);

create index if not exists asayell_messages_goal_idx
  on public.asayell_messages (goal_id, created_at);

alter table public.asayell_goals enable row level security;
alter table public.asayell_messages enable row level security;
-- No policies for anon/authenticated: direct table access is denied.
-- All access goes through the security definer RPC functions below.

create or replace function public.asayell_create_goal(
  p_nickname text,
  p_title text,
  p_detail text,
  p_wake_at timestamptz,
  p_support_token text,
  p_owner_token text
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

  insert into public.asayell_goals (nickname, title, detail, wake_at, support_token, owner_token)
  values (p_nickname, p_title, nullif(p_detail, ''), p_wake_at, p_support_token, p_owner_token)
  returning * into g;
  return g;
end;
$$;

create or replace function public.asayell_get_goal_for_support(
  p_support_token text
) returns table (
  nickname text,
  title text,
  detail text,
  wake_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select g.nickname, g.title, g.detail, g.wake_at
  from public.asayell_goals g
  where g.support_token = p_support_token;
$$;

create or replace function public.asayell_post_message(
  p_support_token text,
  p_sender text,
  p_body text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if char_length(coalesce(p_body, '')) not between 1 and 150 then
    raise exception 'body must be 1..150 chars';
  end if;
  if p_sender is not null and char_length(p_sender) > 20 then
    raise exception 'sender must be <= 20 chars';
  end if;

  select g.id into gid
  from public.asayell_goals g
  where g.support_token = p_support_token;
  if gid is null then
    raise exception 'goal not found';
  end if;

  insert into public.asayell_messages (goal_id, sender, body)
  values (gid, nullif(p_sender, ''), p_body);
  return true;
end;
$$;

create or replace function public.asayell_get_owner_goal(
  p_owner_token text
) returns table (
  nickname text,
  title text,
  detail text,
  wake_at timestamptz,
  message_count integer,
  is_unlocked boolean
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
    (now() >= g.wake_at)
  from public.asayell_goals g
  where g.owner_token = p_owner_token;
$$;

create or replace function public.asayell_get_owner_messages(
  p_owner_token text,
  p_demo boolean default false
) returns table (
  sender text,
  body text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select m.sender, m.body, m.created_at
  from public.asayell_goals g
  join public.asayell_messages m on m.goal_id = g.id
  where g.owner_token = p_owner_token
    and m.status = 'visible'
    and (now() >= g.wake_at or coalesce(p_demo, false))
  order by m.created_at asc;
$$;

grant execute on function public.asayell_create_goal(text, text, text, timestamptz, text, text) to anon;
grant execute on function public.asayell_get_goal_for_support(text) to anon;
grant execute on function public.asayell_post_message(text, text, text) to anon;
grant execute on function public.asayell_get_owner_goal(text) to anon;
grant execute on function public.asayell_get_owner_messages(text, boolean) to anon;
