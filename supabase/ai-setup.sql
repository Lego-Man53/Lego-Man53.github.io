-- Additional AI usage limits. Existing gallery data and admin access are unchanged.
begin;
create table if not exists public.photo_ai_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hour_started timestamptz not null default now(),
  hour_count integer not null default 0,
  day_started timestamptz not null default now(),
  day_count integer not null default 0
);
alter table public.photo_ai_usage enable row level security;
revoke all on public.photo_ai_usage from public, anon, authenticated;

create or replace function public.reserve_photo_ai_request() returns boolean
language plpgsql security definer set search_path = '' as $$
declare usage public.photo_ai_usage; request_time timestamptz := now();
begin
  if not public.is_photo_admin() then raise exception 'Admin access required'; end if;
  insert into public.photo_ai_usage(user_id) values (auth.uid()) on conflict do nothing;
  select * into usage from public.photo_ai_usage where user_id = auth.uid() for update;
  if usage.hour_started <= request_time - interval '1 hour' then usage.hour_started := request_time; usage.hour_count := 0; end if;
  if usage.day_started <= request_time - interval '24 hours' then usage.day_started := request_time; usage.day_count := 0; end if;
  if usage.hour_count >= 30 or usage.day_count >= 100 then return false; end if;
  update public.photo_ai_usage set hour_started=usage.hour_started, hour_count=usage.hour_count+1,
    day_started=usage.day_started, day_count=usage.day_count+1 where user_id=auth.uid();
  return true;
end;
$$;
revoke all on function public.reserve_photo_ai_request() from public, anon, authenticated;
grant execute on function public.reserve_photo_ai_request() to authenticated;
commit;
