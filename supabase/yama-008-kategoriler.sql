-- Yama 008 — birincil kitap kategorisi. Uygulama yayını ÖNCESİNDE uygulanır.
-- Hazırlanmış SQL; bu dosyanın oluşturulması canlı şemayı değiştirmez.
-- NULL: inceleme bekleyen. Diğer: bilinen, diğer raflara girmeyen konu.
begin;
alter table public.kitaplar add column if not exists kategori text;
alter table public.kitaplar drop constraint if exists kitaplar_kategori_gecerli;
alter table public.kitaplar add constraint kitaplar_kategori_gecerli
  check (kategori is null or kategori in (
    'roman', 'cizgi-roman', 'oyku', 'siir', 'edebiyat', 'tarih', 'felsefe', 'cocuk', 'bilim', 'sanat', 'psikoloji', 'din', 'egitim', 'kisisel-gelisim', 'dil', 'teknik', 'siyaset-toplum', 'saglik-yasam', 'ekonomi-is', 'biyografi-ani', 'diger'
  ));
create index if not exists kitaplar_kategori_idx on public.kitaplar (kategori);
commit;
