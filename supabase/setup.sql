-- Run once in the Supabase SQL editor. Safe to rerun; existing photos are retained.
begin;
create table if not exists public.photo_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.photo_admins enable row level security;
revoke all on public.photo_admins from anon, authenticated;
grant select on public.photo_admins to authenticated;
drop policy if exists "Admins can see their own membership" on public.photo_admins;
create policy "Admins can see their own membership" on public.photo_admins for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_photo_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.photo_admins where user_id = auth.uid());
$$;
revoke all on function public.is_photo_admin() from public;
grant execute on function public.is_photo_admin() to anon, authenticated;

create table if not exists public.photos (
  id uuid primary key,
  storage_path text unique,
  local_path text,
  title text not null check (length(trim(title)) between 1 and 160),
  alt text not null check (length(trim(alt)) between 1 and 500),
  caption text not null default '' check (length(caption) <= 2000),
  visible boolean not null default true,
  homepage boolean not null default false,
  aspect text not null default 'portrait' check (aspect in ('portrait','landscape','square','original')),
  focal_x integer not null default 50 check (focal_x between 0 and 100),
  focal_y integer not null default 50 check (focal_y between 0 and 100),
  sort_order integer not null default 0 check (sort_order >= 0),
  check ((storage_path is not null and local_path is null) or (storage_path is null and local_path is not null)),
  check (local_path is null or local_path in ('assets/photo-1.jpg','assets/photo-2.jpg','assets/photo-4.jpg','assets/photo-6.jpg')),
  check (storage_path is null or storage_path ~ '^[a-f0-9-]{36}\.(jpg|png|webp|avif)$')
);
create table if not exists public.photo_settings (
  id integer primary key default 1 check (id = 1),
  layout text not null default 'editorial' check (layout in ('editorial','grid')),
  columns integer not null default 3 check (columns between 2 and 4),
  hero_id uuid references public.photos(id) on delete set null,
  revision integer not null default 0
);
alter table public.photos enable row level security;
alter table public.photo_settings enable row level security;
revoke all on public.photos, public.photo_settings from anon, authenticated;
grant select on public.photos, public.photo_settings to anon, authenticated;
drop policy if exists "Read published photos or own studio" on public.photos;
create policy "Read published photos or own studio" on public.photos for select to anon, authenticated using (visible or (select public.is_photo_admin()));
drop policy if exists "Read gallery settings" on public.photo_settings;
create policy "Read gallery settings" on public.photo_settings for select to anon, authenticated using (true);
-- Writes go through the transactional RPC below; direct table writes have no grants.

insert into public.photos (id,local_path,title,alt,homepage,aspect,sort_order)
select seed.id::uuid, seed.local_path, seed.title, seed.alt, seed.homepage, seed.aspect, seed.sort_order from (values
('00000000-0000-4000-8000-000000000001','assets/photo-1.jpg','Water & stone','A waterfall cascading down a granite cliff into clouds of mist',true,'portrait',0),
('00000000-0000-4000-8000-000000000002','assets/photo-2.jpg','Looking up','Warm sandstone cliffs and trees under a vivid blue sky',true,'landscape',1),
('00000000-0000-4000-8000-000000000006','assets/photo-6.jpg','The quiet between','A tall waterfall framed by trees and weathered grey rock',true,'portrait',2),
('00000000-0000-4000-8000-000000000004','assets/photo-4.jpg','Winter light','Snow-dusted red sandstone cliffs beneath a pale blue sky',false,'landscape',3)
) as seed(id,local_path,title,alt,homepage,aspect,sort_order)
where not exists(select 1 from public.photo_settings where id=1)
on conflict (id) do nothing;
insert into public.photo_settings (id,hero_id) values (1,'00000000-0000-4000-8000-000000000004') on conflict (id) do nothing;

create or replace function public.read_photo_gallery() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'photos', coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order,p.id) from public.photos p where p.visible), '[]'::jsonb),
    'settings', (select to_jsonb(s) from public.photo_settings s where s.id = 1)
  );
$$;
revoke all on function public.read_photo_gallery() from public;
grant execute on function public.read_photo_gallery() to anon, authenticated;

create or replace function public.read_photo_admin() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_photo_admin() then raise exception 'Admin access required'; end if;
  return jsonb_build_object(
    'photos', coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order,p.id) from public.photos p), '[]'::jsonb),
    'settings', (select to_jsonb(s) from public.photo_settings s where s.id = 1)
  );
end;
$$;
revoke all on function public.read_photo_admin() from public;
grant execute on function public.read_photo_admin() to authenticated;

create or replace function public.save_photo_gallery(photo_rows jsonb, gallery_settings jsonb, expected_revision integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_revision integer; cover uuid;
begin
  if not public.is_photo_admin() then raise exception 'Admin access required'; end if;
  select revision into current_revision from public.photo_settings where id = 1 for update;
  if expected_revision is null or expected_revision <> current_revision then
    raise exception 'Changes were saved by another session. Reload before saving.';
  end if;
  if photo_rows is null or jsonb_typeof(photo_rows) <> 'array' then
    raise exception 'Invalid photo list';
  end if;
  if jsonb_array_length(photo_rows) > 1000 then
    raise exception 'Invalid photo list';
  end if;
  if exists(select 1 from jsonb_array_elements(photo_rows) p where p->>'id' is null) or
     (select count(*) from jsonb_array_elements(photo_rows)) <> (select count(distinct p->>'id') from jsonb_array_elements(photo_rows) p) then
    raise exception 'Every photo needs a unique ID';
  end if;
  delete from public.photos where id not in (select (p->>'id')::uuid from jsonb_array_elements(photo_rows) p);
  insert into public.photos(id,storage_path,local_path,title,alt,caption,visible,homepage,aspect,focal_x,focal_y,sort_order)
  select (p->>'id')::uuid, p->>'storage_path', p->>'local_path', trim(p->>'title'), trim(p->>'alt'),
    coalesce(p->>'caption',''), (p->>'visible')::boolean, (p->>'homepage')::boolean,
    p->>'aspect', (p->>'focal_x')::integer, (p->>'focal_y')::integer, (ordinality - 1)::integer
  from jsonb_array_elements(photo_rows) with ordinality as rows(p,ordinality)
  on conflict(id) do update set storage_path=excluded.storage_path,local_path=excluded.local_path,
    title=excluded.title,alt=excluded.alt,caption=excluded.caption,visible=excluded.visible,
    homepage=excluded.homepage,aspect=excluded.aspect,focal_x=excluded.focal_x,focal_y=excluded.focal_y,sort_order=excluded.sort_order;
  cover := nullif(gallery_settings->>'hero_id','')::uuid;
  if cover is not null and not exists(select 1 from public.photos where id=cover and visible) then
    raise exception 'Choose a visible photo for the homepage cover';
  end if;
  update public.photo_settings set layout=gallery_settings->>'layout',columns=(gallery_settings->>'columns')::integer,
    hero_id=cover,revision=current_revision+1 where id=1;
  return jsonb_build_object('revision',current_revision+1);
end;
$$;
revoke all on function public.save_photo_gallery(jsonb,jsonb,integer) from public;
grant execute on function public.save_photo_gallery(jsonb,jsonb,integer) to authenticated;

-- Private bucket: hidden uploads do not have publicly downloadable URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('photos','photos',false,15728640,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Read published photo files or admin files" on storage.objects;
create policy "Read published photo files or admin files" on storage.objects for select to anon, authenticated
using (bucket_id='photos' and ((select public.is_photo_admin()) or exists(select 1 from public.photos p where p.storage_path=name and p.visible)));
drop policy if exists "Admin uploads" on storage.objects;
create policy "Admin uploads" on storage.objects for insert to authenticated
with check (bucket_id='photos' and (select public.is_photo_admin()) and name ~ '^[a-f0-9-]{36}\.(jpg|png|webp|avif)$');
drop policy if exists "Admin deletes" on storage.objects;
create policy "Admin deletes" on storage.objects for delete to authenticated
using (bucket_id='photos' and (select public.is_photo_admin()));
commit;
