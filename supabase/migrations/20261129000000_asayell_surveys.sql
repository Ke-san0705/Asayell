-- Asayell Round 6: hypothesis validation surveys.
-- Run once in the Supabase SQL Editor (after the Round 5 migration).

create table if not exists public.asayell_survey_responses (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.asayell_goals (id) on delete cascade,
  phase text not null check (phase in ('pre', 'post')),
  is_demo boolean not null default false,
  q1 integer not null check (q1 between 1 and 5),
  q2 integer not null check (q2 between 1 and 5),
  q3 integer not null check (q3 between 1 and 5),
  continue_intent integer check (continue_intent between 1 and 5),
  consent boolean not null default false,
  created_at timestamptz not null default now(),
  unique (goal_id, phase)
);

alter table public.asayell_survey_responses enable row level security;
-- No direct policies for anon: all access goes through the RPC functions below.

create or replace function public.asayell_save_survey_response(
  p_owner_token text,
  p_phase text,
  p_is_demo boolean,
  p_q1 integer,
  p_q2 integer,
  p_q3 integer,
  p_continue_intent integer,
  p_consent boolean
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal_id uuid;
begin
  if coalesce(p_consent, false) is not true then
    raise exception 'consent is required';
  end if;
  if p_phase not in ('pre', 'post') then
    raise exception 'phase is invalid';
  end if;
  select g.id into v_goal_id
  from public.asayell_goals g
  where g.owner_token = p_owner_token;
  if v_goal_id is null then
    raise exception 'goal not found';
  end if;
  insert into public.asayell_survey_responses
    (goal_id, phase, is_demo, q1, q2, q3, continue_intent, consent)
  values
    (v_goal_id, p_phase, coalesce(p_is_demo, false), p_q1, p_q2, p_q3,
     case when p_phase = 'post' then p_continue_intent else null end, true)
  on conflict (goal_id, phase) do nothing;
  return 'ok';
end;
$$;

create or replace function public.asayell_get_survey_status(
  p_owner_token text
) returns table (
  phase text
)
language sql
security definer
set search_path = public
as $$
  select r.phase
  from public.asayell_survey_responses r
  join public.asayell_goals g on g.id = r.goal_id
  where g.owner_token = p_owner_token;
$$;

create or replace function public.asayell_get_message_count(
  p_owner_token text
) returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce((
    select count(*)::integer
    from public.asayell_messages m
    join public.asayell_goals g on g.id = m.goal_id
    where g.owner_token = p_owner_token and m.status = 'visible'
  ), 0);
$$;

-- Aggregated export for validation analysis.
-- Never include names, message bodies, or tokens here.
create or replace function public.asayell_list_survey_responses()
returns table (
  goal_id uuid,
  phase text,
  is_demo boolean,
  q1 integer,
  q2 integer,
  q3 integer,
  continue_intent integer,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.goal_id, r.phase, r.is_demo, r.q1, r.q2, r.q3,
         r.continue_intent, r.created_at
  from public.asayell_survey_responses r
  order by r.created_at asc;
$$;
