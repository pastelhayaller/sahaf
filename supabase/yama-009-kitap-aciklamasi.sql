-- Yama 009 — konu tanıtımı; nüshanın fiziksel notundan ayrıdır.
-- Önce şema, sonra v018 arayüz ve statik vitrin. RLS/yetkiler değişmez.
begin;
alter table public.kitaplar add column if not exists aciklama text;
alter table public.kitaplar drop constraint if exists kitaplar_aciklama_uzunluk;
alter table public.kitaplar add constraint kitaplar_aciklama_uzunluk
  check (aciklama is null or char_length(aciklama) <= 3000);
commit;
