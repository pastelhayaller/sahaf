// Veri katmanı. İki mod, tek sözleşme:
//   config.js doluysa  -> Supabase
//   boşsa              -> localStorage (deneme modu)
import {
  SUPABASE_URL, SUPABASE_ANON_KEY,
  ZIYARETCI_EPOSTA, ZIYARETCI_SIFRE,
} from './config.js';

export const denemeModu = !SUPABASE_URL || !SUPABASE_ANON_KEY;
export const ziyaretciGirisiVar = !denemeModu && !!ZIYARETCI_EPOSTA && !!ZIYARETCI_SIFRE;

const TABLO = 'kitaplar';
const YEREL_ANAHTAR = 'pastelhayaller_kitaplar';
const KAPAK_BUCKET = 'kitap-kapaklari';
const TEKLIF_BUCKET = 'alim-teklifleri';
export const TEKLIF_FOTO_SINIRI = 20;
const AZAMI_FOTO_BOYUTU = 6 * 1024 * 1024;

export const SAYFA_BOYU = 20;

// Sıralama seçenekleri. Anahtarlar arayüzdeki <select> değerleriyle birebir.
export const SIRALAMALAR = {
  yeni:         { etiket: 'Son eklenenler',      kolon: 'created_at', artan: false },
  ad:           { etiket: 'Ada göre (A→Z)',      kolon: 'ad',         artan: true  },
  fiyat_artan:  { etiket: 'Fiyat — önce ucuz',   kolon: 'fiyat',      artan: true  },
  fiyat_azalan: { etiket: 'Fiyat — önce pahalı', kolon: 'fiyat',      artan: false },
};
export const VARSAYILAN_SIRALAMA = 'yeni';

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

// RLS reddi ham haliyle "row-level security policy" diye gelir — dükkândaki
// kişiye bir anlam ifade etmiyor. Sebebi söyleyen bir cümleye çeviriyoruz.
function yetkiHatasi(e) {
  const m = (e && e.message) || '';
  if (e && (e.code === '42501' || /row-level security/i.test(m))) {
    return new Error('Ziyaretçi hesabı değişiklik yapamaz. Personel hesabıyla giriş yap.');
  }
  return e;
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
// Rol her girişte bir kez okunur; her liste isteğinde tekrar sorulmaz.
let _rol = null;

// Yama-002 çalıştırılmamışsa arayüz bunu uyarı olarak gösterir.
export const durum = { yamaEksik: false };

export async function oturumVarMi() {
  if (denemeModu) return true;
  try {
    const { data } = await (await sb()).auth.getSession();
    return !!(data && data.session);
  } catch { return false; }
}

export async function girisYap(eposta, sifre) {
  if (denemeModu) return true;
  _rol = null;
  const { error } = await (await sb()).auth.signInWithPassword({ email: eposta, password: sifre });
  if (error) throw hata(error);
  return true;
}

export async function ziyaretciGirisiYap() {
  if (!ziyaretciGirisiVar) throw new Error('Ziyaretçi girişi bu kurulumda tanımlı değil.');
  return girisYap(ZIYARETCI_EPOSTA, ZIYARETCI_SIFRE);
}

export async function cikisYap() {
  _rol = null;
  if (denemeModu) return;
  await (await sb()).auth.signOut();
}

/**
 * Giriş yapan kullanıcının rolü: 'yonetici' (baba + eş) veya 'ziyaretci'.
 *
 * Rol satırı YOKSA ziyaretçidir — varsayılan reddetme. Bu, güvenliğin asıl
 * dayandığı yer değil (o RLS'te); arayüzün neyi göstereceğini belirler.
 *
 * `roller` tablosu hiç yoksa (yama-002 henüz çalıştırılmamış) yönetici kabul
 * edilir: o aşamada ziyaretçi hesabı da yoktur, yani kaybedilen bir yetki
 * sınırı yok — ama tablo yokken ziyaretçi varsaymak dükkânı çalışamaz hale
 * getirirdi. Bunun yerine `durum.yamaEksik` ile açıkça uyarılıyor.
 */
export async function rolGetir() {
  if (denemeModu) return 'yonetici';
  if (_rol) return _rol;
  try {
    const istemci = await sb();
    const { data: oturum } = await istemci.auth.getUser();
    const kimlik = oturum && oturum.user && oturum.user.id;
    if (!kimlik) return 'ziyaretci';

    const { data, error } = await istemci
      .from('roller').select('rol').eq('kullanici_id', kimlik).maybeSingle();

    if (error) {
      const tabloYok = error.code === '42P01' ||
        /relation .*roller.* does not exist|could not find the table/i.test(error.message || '');
      if (tabloYok) {
        durum.yamaEksik = true;
        _rol = 'yonetici';
      } else {
        _rol = 'ziyaretci';
      }
      return _rol;
    }

    _rol = data && data.rol === 'yonetici' ? 'yonetici' : 'ziyaretci';
    return _rol;
  } catch {
    return 'ziyaretci';
  }
}

// --- Kitaplar -----------------------------------------------------------
function kayitTemizle(k) {
  return {
    ad: (k.ad || '').trim(),
    yazar: (k.yazar || '').trim() || null,
    raf: (k.raf || '').trim(),
    fiyat: k.fiyat === '' || k.fiyat == null ? null : Number(k.fiyat),
    notlar: (k.notlar || '').trim() || null,
    foto_url: (k.foto_url || '').trim() || null,
  };
}

function yerelSirala(liste, sirala) {
  // Eklenme sırası dizinin kendi sırasıdır; created_at yerel kayıtta yok.
  const s = SIRALAMALAR[sirala] || SIRALAMALAR[VARSAYILAN_SIRALAMA];
  const damgali = liste.map((k, i) => ({ k, i }));
  damgali.sort((a, b) => {
    if (s.kolon === 'created_at') return b.i - a.i;
    if (s.kolon === 'ad') return (a.k.ad || '').localeCompare(b.k.ad || '', 'tr');
    // Fiyat: boş fiyat her iki yönde de en sona.
    const af = a.k.fiyat, bf = b.k.fiyat;
    if (af == null && bf == null) return a.i - b.i;
    if (af == null) return 1;
    if (bf == null) return -1;
    return s.artan ? af - bf : bf - af;
  });
  return damgali.map(d => d.k);
}

/**
 * Tek liste kapısı: arama + sıralama + sayfalama. Arama terimi boşsa TÜM
 * envanter listelenir — eskiden ana ekranda yalnız "son 20" görünüyordu.
 * Döner: { kayitlar, toplam, sayfa, sayfaSayisi }
 */
export async function listele({ terim = '', sirala = VARSAYILAN_SIRALAMA, sayfa = 1 } = {}) {
  const s = SIRALAMALAR[sirala] || SIRALAMALAR[VARSAYILAN_SIRALAMA];
  const t = normalize(terim);
  const istenen = Math.max(1, Math.floor(sayfa) || 1);

  if (denemeModu) {
    const tumu = t
      ? yerelOku().filter(k => normalize(`${k.ad} ${k.yazar || ''} ${k.raf}`).includes(t))
      : yerelOku();
    const sirali = yerelSirala(tumu, sirala);
    const toplam = sirali.length;
    const sayfaSayisi = Math.max(1, Math.ceil(toplam / SAYFA_BOYU));
    const aktif = Math.min(istenen, sayfaSayisi);
    const bas = (aktif - 1) * SAYFA_BOYU;
    return { kayitlar: sirali.slice(bas, bas + SAYFA_BOYU), toplam, sayfa: aktif, sayfaSayisi };
  }

  const istemci = await sb();
  const sorgula = (sayfaNo) => {
    let q = istemci.from(TABLO).select('id,ad,yazar,raf,fiyat,notlar,foto_url', { count: 'exact' });
    if (t) q = q.ilike('arama', `%${t}%`);
    // nullsFirst:false — fiyatı girilmemiş kitap her iki yönde de en sonda.
    q = q.order(s.kolon, { ascending: s.artan, nullsFirst: false });
    // İkincil sıra: eşit fiyat/ad'da sayfalar arası kayma olmasın.
    q = q.order('id', { ascending: true });
    const bas = (sayfaNo - 1) * SAYFA_BOYU;
    return q.range(bas, bas + SAYFA_BOYU - 1);
  };

  const { data, error, count } = await sorgula(istenen);
  if (error) throw hata(error);

  const toplam = count || 0;
  const sayfaSayisi = Math.max(1, Math.ceil(toplam / SAYFA_BOYU));
  // Silmeden sonra son sayfa yok olmuş olabilir: aralık dışına düşersek geri çekil.
  if (istenen > sayfaSayisi && toplam > 0) {
    const tekrar = await sorgula(sayfaSayisi);
    if (tekrar.error) throw hata(tekrar.error);
    return { kayitlar: tekrar.data || [], toplam, sayfa: sayfaSayisi, sayfaSayisi };
  }
  return { kayitlar: data || [], toplam, sayfa: istenen, sayfaSayisi };
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
  if (error) throw hata(yetkiHatasi(error));
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
  if (error) throw hata(yetkiHatasi(error));
  return data;
}

export async function sil(id) {
  if (denemeModu) {
    yerelYaz(yerelOku().filter(k => k.id !== id));
    return;
  }
  const { error } = await (await sb()).from(TABLO).delete().eq('id', id);
  if (error) throw hata(yetkiHatasi(error));
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
  if (error) throw hata(yetkiHatasi(error));
  return data;
}

// Telefonla çekilen kapak fotoğrafı. İki modda da aynı sözleşme korunur:
// denemede data URL, gerçek kullanımda Storage'ın herkese açık katalog URL'si.
export async function kapakYukle(dosya) {
  if (!dosya) return null;
  if (!/^image\/(jpeg|png|webp)$/.test(dosya.type)) {
    throw new Error('Yalnız JPG, PNG veya WEBP fotoğraf yüklenebilir.');
  }
  if (dosya.size > 6 * 1024 * 1024) throw new Error('Fotoğraf 6 MB’dan küçük olmalı.');

  if (denemeModu) {
    return new Promise((resolve, reject) => {
      const okuyucu = new FileReader();
      okuyucu.onload = () => resolve(okuyucu.result);
      okuyucu.onerror = () => reject(new Error('Fotoğraf okunamadı.'));
      okuyucu.readAsDataURL(dosya);
    });
  }

  const uzanti = dosya.type === 'image/png' ? 'png' : dosya.type === 'image/webp' ? 'webp' : 'jpg';
  const yol = `${crypto.randomUUID()}.${uzanti}`;
  const istemci = await sb();
  const { error } = await istemci.storage.from(KAPAK_BUCKET).upload(yol, dosya, {
    contentType: dosya.type,
    cacheControl: '31536000',
  });
  if (error) throw hata(yetkiHatasi(error));
  const { data } = istemci.storage.from(KAPAK_BUCKET).getPublicUrl(yol);
  return data.publicUrl;
}

function fotografDogrula(dosya) {
  if (!/^image\/(jpeg|png|webp)$/.test(dosya.type)) throw new Error('Yalnız JPG, PNG veya WEBP fotoğraf yüklenebilir.');
}

export async function fotografiKucult(dosya) {
  const bitmap = await createImageBitmap(dosya, { imageOrientation: 'from-image' });
  try {
    const uzunKenar = Math.max(bitmap.width, bitmap.height);
    const oran = Math.min(1, 1600 / uzunKenar);
    const genislik = Math.max(1, Math.round(bitmap.width * oran));
    const yukseklik = Math.max(1, Math.round(bitmap.height * oran));
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(genislik, yukseklik)
      : Object.assign(document.createElement('canvas'), { width: genislik, height: yukseklik });
    const baglam = canvas.getContext('2d');
    if (!baglam) throw new Error('Fotoğraf küçültülemedi.');
    baglam.drawImage(bitmap, 0, 0, genislik, yukseklik);

    const blob = 'convertToBlob' in canvas
      ? await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 })
      : await new Promise((resolve, reject) => canvas.toBlob(sonuc => {
        if (sonuc) resolve(sonuc);
        else reject(new Error('Fotoğraf küçültülemedi.'));
      }, 'image/jpeg', 0.82));
    if (blob.size >= dosya.size) return dosya;
    const ad = dosya.name.replace(/\.[^.]+$/, '') || 'fotograf';
    return new File([blob], `${ad}.jpg`, { type: 'image/jpeg', lastModified: dosya.lastModified });
  } finally {
    bitmap.close();
  }
}

async function yuklemeyeHazirla(dosya) {
  let hazir = dosya;
  try {
    hazir = await fotografiKucult(dosya);
  } catch { /* küçültme tutmadıysa orijinali dene */ }
  // Küçültme başarısız olabilir ya da dosyayı büyüttüğü için orijinal geri dönmüş
  // olabilir. Bucket 6 MB üstünü reddediyor; ham depo hatası yerine anlaşılır cümle.
  if (hazir.size > AZAMI_FOTO_BOYUTU) {
    throw new Error(`“${dosya.name}” çok büyük, küçültülemedi.`);
  }
  return hazir;
}

// Alım teklifi fotoğrafları özel bucket'a gider. Ziyaretçi yükler ama geri
// okuyamaz; sadece yönetici imzalı URL ile görür.
export async function teklifFotograflariYukle(dosyalar, ilerlemeYaz) {
  const liste = Array.from(dosyalar || []);
  if (!liste.length) throw new Error('En az bir kitap fotoğrafı ekle.');
  if (liste.length > TEKLIF_FOTO_SINIRI) throw new Error(`Bir teklife en fazla ${TEKLIF_FOTO_SINIRI} fotoğraf eklenebilir.`);
  liste.forEach(fotografDogrula);
  if (denemeModu) {
    const sonuc = [];
    for (let i = 0; i < liste.length; i += 1) {
      const dosya = await yuklemeyeHazirla(liste[i]);
      if (ilerlemeYaz) ilerlemeYaz(i + 1, liste.length);
      const veri = await new Promise((resolve, reject) => {
      const okuyucu = new FileReader();
      okuyucu.onload = () => resolve(okuyucu.result);
      okuyucu.onerror = () => reject(new Error('Fotoğraf okunamadı.'));
      okuyucu.readAsDataURL(dosya);
      });
      sonuc.push(veri);
    }
    return sonuc;
  }
  const istemci = await sb();
  const sonuc = [];
  for (let i = 0; i < liste.length; i += 1) {
    const dosya = await yuklemeyeHazirla(liste[i]);
    const uzanti = dosya.type === 'image/png' ? 'png' : dosya.type === 'image/webp' ? 'webp' : 'jpg';
    const yol = `teklifler/${crypto.randomUUID()}.${uzanti}`;
    if (ilerlemeYaz) ilerlemeYaz(i + 1, liste.length);
    const { error } = await istemci.storage.from(TEKLIF_BUCKET).upload(yol, dosya, {
      contentType: dosya.type, cacheControl: '31536000',
    });
    if (error) throw hata(yetkiHatasi(error));
    sonuc.push(yol);
  }
  return sonuc;
}

export async function alimTeklifiGonder(teklif) {
  const kayit = {
    ad_soyad: (teklif.ad_soyad || '').trim(),
    iletisim: (teklif.iletisim || '').trim(),
    kitap_aciklama: (teklif.kitap_aciklama || '').trim(),
    foto_yollari: teklif.foto_yollari || [],
  };
  if (!kayit.ad_soyad || !kayit.iletisim || !kayit.kitap_aciklama) throw new Error('Adın, iletişim bilgin ve kitap açıklaması gerekli.');
  if (denemeModu) return { ok: true };
  const { error } = await (await sb()).from('alim_teklifleri').insert(kayit);
  if (error) throw hata(yetkiHatasi(error));
  return { ok: true };
}

export async function alimTeklifleriniListele() {
  if (denemeModu) return [];
  const istemci = await sb();
  const { data, error } = await istemci.from('alim_teklifleri')
    .select('id,ad_soyad,iletisim,kitap_aciklama,foto_yollari,durum,created_at')
    .order('created_at', { ascending: false });
  if (error) throw hata(yetkiHatasi(error));
  return Promise.all((data || []).map(async teklif => {
    const urls = await Promise.all((teklif.foto_yollari || []).map(async yol => {
      const { data: imza } = await istemci.storage.from(TEKLIF_BUCKET).createSignedUrl(yol, 3600);
      return imza && imza.signedUrl;
    }));
    return { ...teklif, foto_urlari: urls.filter(Boolean) };
  }));
}

export async function alimTeklifiDurumGuncelle(id, durum) {
  const gecerli = ['yeni', 'inceleniyor', 'teklif_verildi', 'anlasildi', 'uygun_degil'];
  if (!gecerli.includes(durum)) throw new Error('Geçersiz teklif durumu.');
  if (denemeModu) return;
  const { error } = await (await sb()).from('alim_teklifleri').update({ durum }).eq('id', id);
  if (error) throw hata(yetkiHatasi(error));
}

export async function raflar() {
  if (denemeModu) {
    return [...new Set(yerelOku().map(k => k.raf).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  }
  const { data, error } = await (await sb()).from('raflar').select('raf');
  if (error) return [];
  return (data || []).map(r => r.raf);
}
