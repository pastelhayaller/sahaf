-- YAMA 002 — ziyaretçi rolü (2026-09-02)
--
-- Amaç: dükkândaki müşteri kitapları GÖREBİLSİN, ekleme/düzenleme/silme
-- YAPAMASIN. Arayüzde butonu gizlemek güvenlik değildir — anon anahtar herkese
-- açık olduğu için yetkiyi burada, veritabanında kesiyoruz.
--
-- ÇALIŞTIRMA SIRASI ÖNEMLİ:
--   1) Bu dosyayı SQL Editor'de çalıştır.
--   2) SONRA Authentication → Users'tan ziyaretçi kullanıcısını oluştur.
--   3) config.js'e o hesabın e-posta/şifresini yaz.
-- Ziyaretçi hesabını bu dosyadan ÖNCE oluşturduysan, en alttaki "geri al"
-- satırını çalıştır — yoksa ziyaretçi de yönetici olarak işaretlenir.

-- 1. Rol tablosu ---------------------------------------------------------
-- Satırı OLMAYAN kullanıcı ziyaretçidir. Varsayılan reddetme bilinçli:
-- ileride elle açılan bir hesap kazara yazma yetkisi almasın.
create table if not exists roller (
  kullanici_id uuid primary key references auth.users(id) on delete cascade,
  rol          text not null default 'ziyaretci' check (rol in ('yonetici','ziyaretci')),
  eklendi      timestamptz not null default now()
);

alter table roller enable row level security;

drop policy if exists roller_kendi_satiri on roller;
-- Kullanıcı yalnız KENDİ rolünü okuyabilir; kimse rol yazamaz.
-- Rol ataması sadece buradan (SQL Editor) yapılır.
create policy roller_kendi_satiri on roller
  for select to authenticated using (kullanici_id = auth.uid());

revoke all on roller from anon;

-- 2. Yetki sorgusu -------------------------------------------------------
-- security definer: politikanın içinden çağrıldığında roller tablosunun kendi
-- RLS'ine takılmasın. search_path sabitlenmezse definer fonksiyonlar
-- ele geçirilebilir — bu yüzden açıkça pinleniyor.
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

-- 3. Mevcut kullanıcılar yönetici olsun ----------------------------------
-- Şu an sistemde yalnızca baba + eş var (Project.md 2026-08-30).
-- on conflict: yama ikinci kez çalışırsa rolleri ezmesin.
insert into roller (kullanici_id, rol)
select id, 'yonetici' from auth.users
on conflict (kullanici_id) do nothing;

-- 4. Yazma politikalarını role bağla -------------------------------------
-- SELECT değişmiyor: giriş yapmış herkes (ziyaretçi dahil) okuyabilir.
drop policy if exists kitaplar_insert on kitaplar;
drop policy if exists kitaplar_update on kitaplar;
drop policy if exists kitaplar_delete on kitaplar;

create policy kitaplar_insert on kitaplar
  for insert to authenticated with check (yonetici_mi());
create policy kitaplar_update on kitaplar
  for update to authenticated using (yonetici_mi()) with check (yonetici_mi());
create policy kitaplar_delete on kitaplar
  for delete to authenticated using (yonetici_mi());

-- 5. Kontrol -------------------------------------------------------------
-- Bunu çalıştırıp listeye bak: yönetici olması gerekenler baba + eş, hepsi bu.
--   select u.email, coalesce(r.rol, 'ziyaretci (rol satırı yok)') as rol
--   from auth.users u left join roller r on r.kullanici_id = u.id
--   order by rol, u.email;

-- Ziyaretçi hesabını bu yamadan ÖNCE oluşturduysan (e-postayı değiştir):
--   update roller set rol = 'ziyaretci'
--   where kullanici_id = (select id from auth.users where email = 'ziyaretci@ornek.com');
