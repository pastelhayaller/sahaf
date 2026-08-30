-- Pastelhayaller Sahaf — şema v1 (2026-08-30)
-- Supabase SQL Editor'de tek seferde çalıştır.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists kitaplar (
  id         uuid primary key default gen_random_uuid(),
  ad         text not null,
  yazar      text,
  raf        text not null,
  fiyat      numeric(10,2),
  notlar     text,
  -- Türkçe arama normalizasyonu: "Çiğdem" yazılmadan "cigdem" ile de bulunsun.
  arama      text generated always as (
               lower(translate(
                 coalesce(ad,'') || ' ' || coalesce(yazar,'') || ' ' || coalesce(raf,''),
                 'ÇĞİIÖŞÜçğıöşü',
                 'cgiiosucgiosu'
               ))
             ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kitaplar_arama_trgm on kitaplar using gin (arama gin_trgm_ops);
create index if not exists kitaplar_raf_idx    on kitaplar (raf);

-- updated_at otomatik
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists kitaplar_updated_at on kitaplar;
create trigger kitaplar_updated_at
  before update on kitaplar
  for each row execute function set_updated_at();

-- GÜVENLİK: anonim erişim yok. Sadece giriş yapmış kullanıcı (baba + eş).
alter table kitaplar enable row level security;

drop policy if exists kitaplar_select on kitaplar;
drop policy if exists kitaplar_insert on kitaplar;
drop policy if exists kitaplar_update on kitaplar;
drop policy if exists kitaplar_delete on kitaplar;

create policy kitaplar_select on kitaplar for select to authenticated using (true);
create policy kitaplar_insert on kitaplar for insert to authenticated with check (true);
create policy kitaplar_update on kitaplar for update to authenticated using (true) with check (true);
create policy kitaplar_delete on kitaplar for delete to authenticated using (true);

-- Raf önerisi için: mevcut rafların listesi (hızlı giriş)
create or replace view raflar as
  select raf, count(*)::int as adet
  from kitaplar
  group by raf
  order by raf;

-- GÜVENLİK (kritik): görünüm varsayılan olarak SAHİBİNİN yetkisiyle çalışır ve
-- kitaplar üzerindeki RLS'i ATLAR. security_invoker açık olmazsa anonim anahtarla
-- raf kodları ve raf başına kitap sayısı dışarıdan okunabilir.
alter view raflar set (security_invoker = on);
revoke all on raflar from anon;
revoke all on kitaplar from anon;
