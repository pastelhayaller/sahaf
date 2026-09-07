-- YAMA 006 — silinen teklifler 24 saat beklesin (2026-09-07)
--
-- İstek: "silinenler 24 saat 'silinen teklifler' kısmında dursun."
-- yama-005 silmeyi açtı ama silme anında kalıcıydı; yanlış karta basmanın
-- geri dönüşü yoktu. Artık silme iki adımlı:
--   1) Sil  -> satır durur, `silindi_at` damgalanır, listeden çöp kutusuna düşer.
--   2) 24 saat sonra -> satır ve fotoğrafları gerçekten yok edilir.
-- Bu pencerede "Geri al" ile teklif olduğu gibi geri gelir.

alter table alim_teklifleri add column if not exists silindi_at timestamptz;

-- Kısmi indeks: çöp kutusu her zaman küçük olacak, aktif listeyi
-- (silindi_at is null) tarayan sorguyu şişirmesin diye yalnız damgalı
-- satırları indeksliyoruz.
create index if not exists alim_teklifleri_silindi_idx
  on alim_teklifleri (silindi_at) where silindi_at is not null;

comment on column alim_teklifleri.silindi_at is
  'Çöp kutusuna atılma anı. NULL = aktif teklif. 24 saatten eskisi, yönetici '
  'Teklifler ekranını açtığında kalıcı olarak (fotoğraflarıyla) silinir.';

-- YENİ POLİTİKA GEREKMİYOR, bilinçli olarak:
--   * Yumuşak silme ve geri alma birer UPDATE — yama-004'teki
--     alim_teklifleri_yonetici_guncelle zaten yalnız yöneticiye açık.
--   * 24 saat sonraki kalıcı temizlik bir DELETE — yama-005'teki
--     alim_teklifleri_yonetici_sil onu karşılıyor.
-- Yani bu yama şemayı büyütüyor, yetki yüzeyini büyütmüyor.
