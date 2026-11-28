-- The owner inbox needs the current visibility even in a different browser.
drop function if exists public.asayell_get_owner_goal(text);

create function public.asayell_get_owner_goal(
  p_owner_token text
) returns table (
  nickname text,
  title text,
  detail text,
  wake_at timestamptz,
  message_count integer,
  is_unlocked boolean,
  is_public boolean
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
    g.is_public
  from public.asayell_goals g
  where g.owner_token = p_owner_token;
$$;

grant execute on function public.asayell_get_owner_goal(text) to anon;
