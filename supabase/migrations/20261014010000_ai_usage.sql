-- Hard daily limit on AI calls (PROMPT: "a hard daily call limit").
--
-- Users can read their own counter but never write it; the only way to bump it
-- is ai_consume(), which runs as the table owner and checks the limit
-- atomically. The server routes call it before every Anthropic request.

create table public.ai_usage (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

create policy ai_usage_select_own on public.ai_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Returns the number of calls used today after this one, or -1 when the limit
-- is already reached (nothing is consumed then). "Today" is UTC.
create function public.ai_consume(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  used integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 0 then
    raise exception 'invalid limit' using errcode = '22023';
  end if;

  insert into public.ai_usage as u (user_id, day, count)
  values (uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set count = u.count + 1
    where u.count < p_limit
  returning u.count into used;

  -- No row returned: the conflict update's WHERE failed, so the limit is reached.
  -- (A first call with p_limit = 0 inserts 1 > 0; treat that as over the limit too.)
  if used is null or used > p_limit then
    if used is not null then
      update public.ai_usage set count = count - 1
      where user_id = uid and day = (now() at time zone 'utc')::date;
    end if;
    return -1;
  end if;
  return used;
end;
$$;

revoke all on function public.ai_consume(integer) from public, anon;
grant execute on function public.ai_consume(integer) to authenticated;

create function public.ai_used_today()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select count from public.ai_usage
     where user_id = (select auth.uid()) and day = (now() at time zone 'utc')::date),
    0)
$$;

revoke all on function public.ai_used_today() from public, anon;
grant execute on function public.ai_used_today() to authenticated;
