// Veri katmanı. İki mod, tek sözleşme:
//   config.js doluysa  -> Supabase
//   boşsa              -> localStorage (deneme modu)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const denemeModu = !SUPABASE_URL || !SUPABASE_ANON_KEY;

const TABLO = 'kitaplar';
const YEREL_ANAHTAR = 'pastelhayaller_kitaplar';

// --- Türkçe arama normalizasyonu ---------------------------------------
// Sunucudaki `arama` kolonu ile birebir aynı dönüşüm. "cigdem" -> "Çiğdem" bulunur.
const HARF = { 'Ç':'c','Ğ':'g','İ':'i','I':'i','Ö':'o','Ş':'s','Ü':'u',
               'ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u' };
export function normalize(metin) {
  return (metin || '').replace(/[ÇĞİIÖŞÜçğıöşü]/g, h => HARF[h]).toLowerCase().trim();
}

// --- Supabase istemcisi (yalnız gerektiğinde yüklenir) -----------------
let _sb = null;
async function sb() {
  if (!_sb) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _sb;
}

function hata(e) {
  const m = (e && e.message) || String(e);
  if (/Invalid login credentials/i.test(m)) return new Error('E-posta veya şifre hatalı.');
  if (/Failed to fetch|NetworkError/i.test(m)) return new Error('İnternete bağlanılamadı. Bağlantını kontrol et.');
  return new Error(m);
}

// --- Yerel depo (deneme modu) ------------------------------------------
function yerelOku() {
  try { return JSON.parse(localStorage.getItem(YEREL_ANAHTAR) || '[]'); }
  catch { return []; }
}
function yerelYaz(liste) {
  localStorage.setItem(YEREL_ANAHTAR, JSON.stringify(liste));
}
function yeniId() {
  return 'y' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// --- Oturum -------------------------------------------------------------
export async function oturumVarMi() {
  if (denemeModu) return true;
  try {
    const { data } = await (await sb()).auth.getSession();
    return !!(data && data.session);
  } catch { return false; }
}

export async function girisYap(eposta, sifre) {
  if (denemeModu) return true;
  const { error } = await (await sb()).auth.signInWithPassword({ email: eposta, password: sifre });
  if (error) throw hata(error);
  return true;
}

export async function cikisYap() {
  if (denemeModu) return;
  await (await sb()).auth.signOut();
}

// --- Kitaplar -----------------------------------------------------------
function kayitTemizle(k) {
  return {
    ad: (k.ad || '').trim(),
    yazar: (k.yazar || '').trim() || null,
    raf: (k.raf || '').trim(),
    fiyat: k.fiyat === '' || k.fiyat == null ? null : Number(k.fiyat),
    notlar: (k.notlar || '').trim() || null,
  };
}

export async function ara(terim) {
  const t = normalize(terim);
  if (!t) return sonEklenenler();
  if (denemeModu) {
    return yerelOku()
      .filter(k => normalize(`${k.ad} ${k.yazar || ''} ${k.raf}`).includes(t))
      .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
      .slice(0, 100);
  }
  const { data, error } = await (await sb())
    .from(TABLO).select('id,ad,yazar,raf,fiyat,notlar')
    .ilike('arama', `%${t}%`).order('ad').limit(100);
  if (error) throw hata(error);
  return data || [];
}

export async function sonEklenenler(limit = 20) {
  if (denemeModu) {
    return yerelOku().slice().reverse().slice(0, limit);
  }
  const { data, error } = await (await sb())
    .from(TABLO).select('id,ad,yazar,raf,fiyat,notlar')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw hata(error);
  return data || [];
}

export async function ekle(kitap) {
  const k = kayitTemizle(kitap);
  if (!k.ad) throw new Error('Kitap adı boş olamaz.');
  if (!k.raf) throw new Error('Raf boş olamaz.');
  if (denemeModu) {
    const liste = yerelOku();
    const kayit = { id: yeniId(), ...k };
    liste.push(kayit); yerelYaz(liste);
    return kayit;
  }
  const { data, error } = await (await sb()).from(TABLO).insert(k).select().single();
  if (error) throw hata(error);
  return data;
}

export async function guncelle(id, kitap) {
  const k = kayitTemizle(kitap);
  if (!k.ad) throw new Error('Kitap adı boş olamaz.');
  if (!k.raf) throw new Error('Raf boş olamaz.');
  if (denemeModu) {
    const liste = yerelOku();
    const i = liste.findIndex(x => x.id === id);
    if (i < 0) throw new Error('Kitap bulunamadı.');
    liste[i] = { ...liste[i], ...k }; yerelYaz(liste);
    return liste[i];
  }
  const { data, error } = await (await sb()).from(TABLO).update(k).eq('id', id).select().single();
  if (error) throw hata(error);
  return data;
}

export async function sil(id) {
  if (denemeModu) {
    yerelYaz(yerelOku().filter(k => k.id !== id));
    return;
  }
  const { error } = await (await sb()).from(TABLO).delete().eq('id', id);
  if (error) throw hata(error);
}

// Silmeyi geri almak için: aynı kaydı geri koyar.
export async function geriKoy(kitap) {
  if (denemeModu) {
    const liste = yerelOku();
    if (!liste.some(k => k.id === kitap.id)) liste.push(kitap);
    yerelYaz(liste);
    return kitap;
  }
  const { data, error } = await (await sb()).from(TABLO).insert(kitap).select().single();
  if (error) throw hata(error);
  return data;
}

export async function raflar() {
  if (denemeModu) {
    return [...new Set(yerelOku().map(k => k.raf).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  }
  const { data, error } = await (await sb()).from('raflar').select('raf');
  if (error) return [];
  return (data || []).map(r => r.raf);
}
