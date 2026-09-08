-- Yama 007 — baskı bilgileri: yayınevi, basım yılı, durum
-- Supabase SQL Editor'de tek seferde çalıştır. Var olan veriye dokunmaz.
--
-- Neden: ikinci el kitap adı ve fiyatıyla satılmaz. Müşteri hangi baskı ve
-- kitabın ne halde olduğunu sorar. Bu üç alan olmadan ne vitrin sayfası
-- ne de bir pazaryeri ilanı ciddiye alınır.

alter table kitaplar add column if not exists yayinevi   text;
alter table kitaplar add column if not exists basim_yili integer;
alter table kitaplar add column if not exists durum      text;

-- Durum serbest metin DEĞİL: seçmeli. Yazım farkları ("iyi" / "İyi" / "iyi.")
-- filtrelemeyi ve ilan kalitesini bozar.
-- ⚠️ Bu liste index.html'deki <select> ile AYNI olmalı. Birini değiştirirsen
-- diğerini de değiştir; aksi halde kayıt sessizce reddedilir.
alter table kitaplar drop constraint if exists kitaplar_durum_gecerli;
alter table kitaplar add constraint kitaplar_durum_gecerli
  check (durum is null or durum in (
    'Sıfır', 'Yeni gibi', 'Çok iyi', 'İyi', 'Orta', 'Yıpranmış'
  ));

-- Basım yılı elle giriliyor; parmak kayması 20026 gibi değerleri sessizce kabul
-- etmesin. Alt sınır matbaanın Osmanlı'ya girişinden öncesini elemeye yeter.
alter table kitaplar drop constraint if exists kitaplar_basim_yili_makul;
alter table kitaplar add constraint kitaplar_basim_yili_makul
  check (basim_yili is null or basim_yili between 1400 and 2100);

-- Vitrin ve personel ekranı "eksik bilgiyi" sık soracak; kısmi indeks ucuz.
create index if not exists kitaplar_eksik_durum_idx on kitaplar (id) where durum is null;

-- Arama alanı yayınevini de kapsasın: "iletişim yayınları" diye aranabilsin.
-- generated kolon doğrudan değiştirilemez, düşürüp yeniden kuruyoruz.
alter table kitaplar drop column if exists arama;
alter table kitaplar add column arama text generated always as (
  lower(translate(
    coalesce(ad,'') || ' ' || coalesce(yazar,'') || ' ' ||
    coalesce(raf,'') || ' ' || coalesce(yayinevi,''),
    'ÇĞİIÖŞÜçğıöşü',
    'cgiiosucgiosu'
  ))
) stored;

create index if not exists kitaplar_arama_trgm on kitaplar using gin (arama gin_trgm_ops);

-- Yayınevi önerisi: 1500 kitap elle girilirken aynı yayınevi defalarca yazılıyor.
-- `raflar` görünümünün birebir aynısı.
create or replace view yayinevleri as
  select yayinevi, count(*)::int as adet
  from kitaplar
  where yayinevi is not null and yayinevi <> ''
  group by yayinevi
  order by yayinevi;

-- ⚠️ KRİTİK (yama-001'in dersi): görünüm varsayılan olarak SAHİBİNİN yetkisiyle
-- çalışır ve kitaplar üzerindeki RLS'i ATLAR. Bu iki satır olmadan yayınevi
-- listesi ve kitap sayıları anonim anahtarla dışarıdan okunabilir.
alter view yayinevleri set (security_invoker = on);
revoke all on yayinevleri from anon;
