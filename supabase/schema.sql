-- Pastelhayaller Sahaf — şema v2 (2026-08-30, roller 2026-09-02)
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
  foto_url   text,
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

-- ROLLER: satırı olmayan kullanıcı ziyaretçidir (varsayılan reddetme).
create table if not exists roller (
  kullanici_id uuid primary key references auth.users(id) on delete cascade,
  rol          text not null default 'ziyaretci' check (rol in ('yonetici','ziyaretci')),
  eklendi      timestamptz not null default now()
);

alter table roller enable row level security;

drop policy if exists roller_kendi_satiri on roller;
-- Kullanıcı yalnız kendi rolünü okur; rol ataması sadece SQL Editor'den yapılır.
create policy roller_kendi_satiri on roller
  for select to authenticated using (kullanici_id = auth.uid());

revoke all on roller from anon;

-- security definer: politika içinden çağrılınca roller'in kendi RLS'ine takılmasın.
-- search_path pinlenmezse definer fonksiyonlar ele geçirilebilir.
create or replace function yonetici_mi() returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from roller
    where kullanici_id = auth.uid() and rol = 'yonetici'
  );
$$;

revoke all on function yonetici_mi() from anon, public;
grant execute on function yonetici_mi() to authenticated;

-- OKUMA: giriş yapmış herkes (ziyaretçi dahil).
-- YAZMA: yalnız yönetici. Ziyaretçinin ekleyememesi burada durur, arayüzde değil.
create policy kitaplar_select on kitaplar for select to authenticated using (true);
create policy kitaplar_insert on kitaplar for insert to authenticated with check (yonetici_mi());
create policy kitaplar_update on kitaplar for update to authenticated using (yonetici_mi()) with check (yonetici_mi());
create policy kitaplar_delete on kitaplar for delete to authenticated using (yonetici_mi());

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

-- Kurulumdan sonra: baba + eş kullanıcılarını oluştur, sonra onları yönetici yap.
--   insert into roller (kullanici_id, rol)
--   select id, 'yonetici' from auth.users where email in ('...','...')
--   on conflict (kullanici_id) do nothing;
-- Ziyaretçi hesabına satır AÇMA — satırı olmayan zaten salt-okunurdur.
