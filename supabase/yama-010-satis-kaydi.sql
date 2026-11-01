-- YAMA 010 — silinen kitaplar kaydı + "satıldı mı?" (2026-11-01)
--
-- Neden: satılan kitap siteden siliniyordu ve geride iz kalmıyordu; haftada
-- kaç kitap, kaç TL sattığımızı bilmiyorduk. Artık her silme bir satır bırakır.
--
--   * kitap_sil(id, satildi)  : uygulamanın çağırdığı yol. true = satıldı,
--                               false = hatalı/mükerrer kayıt.
--   * tetikleyici             : doğrudan DELETE gelirse de kayıt düşer
--                               (satildi = NULL, "sorulmadı").
--   * geri alma               : silinen kitap aynı id ile geri konursa kayıt silinir.
--   * satislar_gunluk         : yalnız satildi = true olanlar, İstanbul gününe göre.
--
-- Güvenlik: tablo yalnız yöneticiye okunur; ziyaretçi ve anon göremez, kimse
-- doğrudan yazamaz (yazan yalnız security definer tetikleyici).
-- Tekrar çalıştırmak güvenlidir.

create table if not exists silinen_kitaplar (
  id          bigint generated always as identity primary key,
  kitap_id    uuid not null,
  ad          text,
  yazar       text,
  raf         text,
  fiyat       numeric(10,2),
  eklendi_at  timestamptz,
  silindi_at  timestamptz not null default now(),
  satildi     boolean
);

comment on column silinen_kitaplar.satildi is
  'true = satıldı, false = hatalı/mükerrer kayıt silindi, NULL = doğrudan silindi (sorulmadı).';

create index if not exists silinen_kitaplar_zaman_idx on silinen_kitaplar (silindi_at);
create index if not exists silinen_kitaplar_kitap_idx on silinen_kitaplar (kitap_id);

alter table silinen_kitaplar enable row level security;
revoke all on silinen_kitaplar from anon, public;
grant select on silinen_kitaplar to authenticated;

drop policy if exists silinen_kitaplar_select on silinen_kitaplar;
create policy silinen_kitaplar_select on silinen_kitaplar
  for select to authenticated using (yonetici_mi());

-- SİLME ANINDA KAYIT ---------------------------------------------------------
create or replace function silinen_kitap_kaydet() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into silinen_kitaplar (kitap_id, ad, yazar, raf, fiyat, eklendi_at, satildi)
  values (
    old.id, old.ad, old.yazar, old.raf, old.fiyat, old.created_at,
    nullif(current_setting('app.satildi', true), '')::boolean
  );
  return old;
end;
$$;

drop trigger if exists kitaplar_silinince_kaydet on kitaplar;
create trigger kitaplar_silinince_kaydet
  before delete on kitaplar
  for each row execute function silinen_kitap_kaydet();

-- GERİ ALMA: aynı id geri eklenince "satıldı" kaydı da geri alınır ------------
create or replace function silinen_kitap_geri_al() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from silinen_kitaplar where kitap_id = new.id;
  return new;
end;
$$;

drop trigger if exists kitaplar_eklenince_kaydi_sil on kitaplar;
create trigger kitaplar_eklenince_kaydi_sil
  after insert on kitaplar
  for each row execute function silinen_kitap_geri_al();

-- UYGULAMANIN ÇAĞIRDIĞI YOL ------------------------------------------------------
-- security invoker: RLS (kitaplar_delete = yalnız yönetici) aynen geçerli kalır.
-- set_config'in 3. argümanı true = yalnız bu işlem için geçerli.
create or replace function kitap_sil(p_id uuid, p_satildi boolean) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform set_config('app.satildi', coalesce(p_satildi::text, ''), true);
  delete from kitaplar where id = p_id;
end;
$$;

revoke all on function kitap_sil(uuid, boolean) from anon, public;
grant execute on function kitap_sil(uuid, boolean) to authenticated;

-- RAPOR ------------------------------------------------------------------------------
create or replace view satislar_gunluk with (security_invoker = true) as
  select (silindi_at at time zone 'Europe/Istanbul')::date as gun,
         count(*)::int                                   as adet,
         coalesce(sum(fiyat), 0)                         as ciro
  from silinen_kitaplar
  where satildi is true
  group by 1
  order by 1 desc;

grant select on satislar_gunluk to authenticated;
