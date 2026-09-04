-- YAMA 004 — ziyaretçiden ikinci el kitap alım teklifi (2026-09-04)
-- Teklifler ve fotoğrafları kataloğa KARIŞMAZ; yalnız yönetici görür.

create table if not exists alim_teklifleri (
  id              uuid primary key default gen_random_uuid(),
  ad_soyad        text not null check (char_length(ad_soyad) between 2 and 120),
  iletisim        text not null check (char_length(iletisim) between 5 and 160),
  kitap_aciklama  text not null check (char_length(kitap_aciklama) between 3 and 3000),
  foto_yollari    text[] not null default '{}',
  durum           text not null default 'yeni'
                    check (durum in ('yeni', 'inceleniyor', 'teklif_verildi', 'anlasildi', 'uygun_degil')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists alim_teklifleri_durum_tarih_idx
  on alim_teklifleri (durum, created_at desc);

drop trigger if exists alim_teklifleri_updated_at on alim_teklifleri;
create trigger alim_teklifleri_updated_at before update on alim_teklifleri
  for each row execute function set_updated_at();

alter table alim_teklifleri enable row level security;
revoke all on table alim_teklifleri from anon, authenticated;
grant insert, select, update on table alim_teklifleri to authenticated;

-- Ziyaretçi yalnız yeni teklif bırakır. Telefon ve fotoğraflara geri dönüp
-- bakamaz; ortak ziyaretçi hesabında gizliliği bu korur.
drop policy if exists alim_teklifleri_ziyaretci_ekle on alim_teklifleri;
create policy alim_teklifleri_ziyaretci_ekle on alim_teklifleri
  for insert to authenticated with check (not yonetici_mi());

drop policy if exists alim_teklifleri_yonetici_oku on alim_teklifleri;
create policy alim_teklifleri_yonetici_oku on alim_teklifleri
  for select to authenticated using (yonetici_mi());

drop policy if exists alim_teklifleri_yonetici_guncelle on alim_teklifleri;
create policy alim_teklifleri_yonetici_guncelle on alim_teklifleri
  for update to authenticated using (yonetici_mi()) with check (yonetici_mi());

-- Ziyaretçi fotoğrafları özel bucket'ta. Katalog kapağından farklı olarak
-- public DEĞİL: yalnız yönetici imzalı URL ile görüntüleyebilir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('alim-teklifleri', 'alim-teklifleri', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists alim_teklifleri_ziyaretci_yukle on storage.objects;
drop policy if exists alim_teklifleri_yonetici_oku on storage.objects;
drop policy if exists alim_teklifleri_yonetici_sil on storage.objects;

create policy alim_teklifleri_ziyaretci_yukle on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'alim-teklifleri'
    and (storage.foldername(name))[1] = 'teklifler'
    and not yonetici_mi()
  );

create policy alim_teklifleri_yonetici_oku on storage.objects
  for select to authenticated
  using (bucket_id = 'alim-teklifleri' and yonetici_mi());

create policy alim_teklifleri_yonetici_sil on storage.objects
  for delete to authenticated
  using (bucket_id = 'alim-teklifleri' and yonetici_mi());
