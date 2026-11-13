-- Add compressed website images and thumbnails without changing existing photos.
-- Preserves published/hidden states, private originals, admin access, and revision checks.
begin;
-- Optional optimized variants; older clients and existing photos remain valid.
alter table public.photos add column if not exists preview_path text unique
  check (preview_path is null or preview_path ~ '^[a-f0-9-]{36}\.(jpg|png|webp|avif)$');
alter table public.photos add column if not exists source_path text unique
  check (source_path is null or source_path ~ '^[a-f0-9-]{36}\.(jpg|png|webp|avif)$');
alter table public.photos add column if not exists pixel_width integer check (pixel_width between 1 and 20000);
alter table public.photos add column if not exists pixel_height integer check (pixel_height between 1 and 20000);


create or replace function public.read_photo_gallery() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'photos', coalesce((select jsonb_agg(to_jsonb(p) - 'source_path' order by p.sort_order,p.id) from public.photos p where p.visible), '[]'::jsonb),
    'settings', (select to_jsonb(s) from public.photo_settings s where s.id = 1)
  );
$$;

create or replace function public.read_photo_admin() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_photo_admin() then raise exception 'Admin access required'; end if;
  return jsonb_build_object(
    'image_variants', true,
    'photos', coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order,p.id) from public.photos p), '[]'::jsonb),
    'settings', (select to_jsonb(s) from public.photo_settings s where s.id = 1)
  );
end;
$$;

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
  insert into public.photos(id,storage_path,local_path,title,alt,caption,visible,homepage,aspect,focal_x,focal_y,sort_order,preview_path,source_path,pixel_width,pixel_height)
  select (p->>'id')::uuid, p->>'storage_path', p->>'local_path', trim(p->>'title'), trim(p->>'alt'),
    coalesce(p->>'caption',''), (p->>'visible')::boolean, (p->>'homepage')::boolean,
    p->>'aspect', (p->>'focal_x')::integer, (p->>'focal_y')::integer, (ordinality - 1)::integer,
    p->>'preview_path', p->>'source_path', (p->>'pixel_width')::integer, (p->>'pixel_height')::integer
  from jsonb_array_elements(photo_rows) with ordinality as rows(p,ordinality)
  on conflict(id) do update set storage_path=excluded.storage_path,local_path=excluded.local_path,
    title=excluded.title,alt=excluded.alt,caption=excluded.caption,visible=excluded.visible,
    homepage=excluded.homepage,aspect=excluded.aspect,focal_x=excluded.focal_x,focal_y=excluded.focal_y,sort_order=excluded.sort_order,
    preview_path=excluded.preview_path,source_path=excluded.source_path,pixel_width=excluded.pixel_width,pixel_height=excluded.pixel_height;
  cover := nullif(gallery_settings->>'hero_id','')::uuid;
  if cover is not null and not exists(select 1 from public.photos where id=cover and visible) then
    raise exception 'Choose a visible photo for the homepage cover';
  end if;
  update public.photo_settings set layout=gallery_settings->>'layout',columns=(gallery_settings->>'columns')::integer,
    hero_id=cover,revision=current_revision+1 where id=1;
  return jsonb_build_object('revision',current_revision+1);
end;
$$;

drop policy if exists "Read published photo files or admin files" on storage.objects;
create policy "Read published photo files or admin files" on storage.objects for select to anon, authenticated
using (bucket_id='photos' and ((select public.is_photo_admin()) or exists(select 1 from public.photos p where (p.storage_path=name or p.preview_path=name) and p.visible)));

commit;
