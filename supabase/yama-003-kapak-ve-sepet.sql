-- YAMA 003 — kitap kapağı fotoğrafları (2026-09-04)
-- SQL Editor'de bir kez çalıştır. Sepet tarayıcıda tutulur; veritabanına
-- sipariş veya müşteri bilgisi yazmaz.

alter table kitaplar add column if not exists foto_url text;

-- Ürün kapakları katalogda herkese gösterilir. Yükleme, değiştirme ve silme
-- yalnız yöneticidir; bucket'ın public oluşu yalnızca görüntüleme içindir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kitap-kapaklari', 'kitap-kapaklari', true, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists kitap_kapaklari_yukle on storage.objects;
drop policy if exists kitap_kapaklari_sil on storage.objects;

create policy kitap_kapaklari_yukle on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kitap-kapaklari' and yonetici_mi());

create policy kitap_kapaklari_sil on storage.objects
  for delete to authenticated
  using (bucket_id = 'kitap-kapaklari' and yonetici_mi());
