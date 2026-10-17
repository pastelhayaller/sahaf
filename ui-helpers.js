import { KATEGORILER } from './kategori.js';
export { KATEGORILER, kategoriGecerli } from './kategori.js';
// Ham Storage kapağının kapak-kucult.py ile üretilen ~25 KB WebP kopyası. Kopya
// henüz yoksa (yeni yüklenen kapak) img'nin data-asil yedeğine düşülür.
export function kucukKapakUrl(url) {
  const m = /\/kitap-kapaklari\/([0-9a-f-]{36})\.(?:jpg|png|webp)$/.exec(url || '');
  return m ? `https://pastelhayaller.com/kapak/${m[1]}.webp` : url;
}

// Width descriptors match the actual files produced by kapak_boyutlari.py.
export function kapakSrcset(url) {
  const small = kucukKapakUrl(url);
  return small !== url ? [160, 320, 480].map(w => small.replace('https://pastelhayaller.com', '').replace('.webp', '-' + w + '.webp') + ' ' + w + 'w').join(', ') : '';
}

export function buyukKapakUrl(url) {
  const m = /\/kitap-kapaklari\/([0-9a-f-]{36})\.(?:jpg|png|webp)$/.exec(url || '');
  return m ? `https://pastelhayaller.com/kapak/${m[1]}.jpg` : url;
}

// TR cep telefonu: "+90 532 ...", "532...", "0532-..." hepsi "05321234567" olur.
// Cep değilse (05 ile başlamıyorsa) null; ayırtmada WhatsApp'tan dönülecek numara bu.
export function telefonDuzenle(metin) {
  let r = String(metin || '').replace(/\D/g, '');
  if (r.length === 12 && r.startsWith('90')) r = r.slice(2);
  if (r.length === 10 && r.startsWith('5')) r = '0' + r;
  return /^05\d{9}$/.test(r) ? r : null;
}

// Customer cards and detail share these small display decisions.
export function kitapKunye(k) {
  return [k.yayinevi, k.basim_yili, k.durum]
    .filter(v => v != null && String(v).trim() !== '');
}

export function kitapFiyatEtiketi(k, paraYaz) {
  return fiyatVar(k) ? paraYaz(k.fiyat) : 'Fiyat için sor';
}

export function fiyatVar(k) {
  return k.fiyat != null && k.fiyat !== '';
}

export function sepetOzeti(kitaplar) {
  const fiyatli = kitaplar.filter(fiyatVar);
  return {
    toplam: fiyatli.reduce((t, k) => t + Number(k.fiyat), 0),
    bilinen: fiyatli.length,
    bilinmeyen: kitaplar.length - fiyatli.length,
  };
}

export function rezervasyonMetni(kitaplar, paraYaz) {
  const satirlar = kitaplar.map(k => `• ${k.ad}${k.yazar ? ` — ${k.yazar}` : ''} (${kitapFiyatEtiketi(k, paraYaz)})`);
  const { toplam, bilinen, bilinmeyen } = sepetOzeti(kitaplar);
  const tutar = bilinmeyen
    ? `${bilinen ? `Bilinen ara toplam: ${paraYaz(toplam)}. ` : ''}${bilinmeyen} kitabın fiyatını da öğrenmek istiyorum.`
    : `Toplam: ${paraYaz(toplam)}`;
  return `Merhaba, aşağıdaki kitaplar için rezervasyon talep ediyorum:\n\n${satirlar.join('\n')}\n\n${tutar}\nStok durumunu ve kesin tutarı teyit edebilir misiniz?`;
}


const BOLUMLER = ['ana', 'kitaplar', 'yeni-gelenler', 'yeni-basimlar', 'arama', 'yazarlar', 'yayinevleri', 'yazar', 'yayinevi', 'kategori'];
const SIRALAR = ['yeni', 'ad', 'fiyat_artan', 'fiyat_azalan', 'basim'];
export function rotaOku(query = '') {
  const p = new URLSearchParams(query);
  const bolum = BOLUMLER.includes(p.get('bolum')) ? p.get('bolum') : 'ana';
  const varsayilan = ['kitaplar', 'yazar', 'yayinevi'].includes(bolum) ? 'ad' : bolum === 'yeni-basimlar' ? 'basim' : 'yeni';
  const no = Number(p.get('sayfa'));
  return { bolum, deger: p.get('ad') || '', terim: p.get('q') || '',
    sirala: SIRALAR.includes(p.get('sira')) ? p.get('sira') : varsayilan,
    sayfa: Number.isSafeInteger(no) && no > 0 ? no : 1 };
}
export function rotaUrl(rota) {
  const p = new URLSearchParams();
  if (rota.bolum !== 'ana') p.set('bolum', rota.bolum);
  if (rota.deger) p.set('ad', rota.deger);
  if (rota.terim) p.set('q', rota.terim);
  p.set('sira', rota.sirala);
  if (rota.sayfa > 1) p.set('sayfa', rota.sayfa);
  return './' + (p.size ? '?' + p.toString() : '');
}
export function rotaBasligi(r) {
  const adlar = { ana: 'Raflara yeni gelenler', kitaplar: 'Tüm kitaplar', 'yeni-gelenler': 'Yeni gelenler',
    'yeni-basimlar': 'Basım yılına göre kitaplar', arama: 'Arama sonuçları', yazarlar: 'Yazarlar', yayinevleri: 'Yayınevleri' };
  return adlar[r.bolum] || (r.bolum === 'kategori' ? Object.hasOwn(KATEGORILER, r.deger) ? KATEGORILER[r.deger] : 'Kategori bulunamadı' : r.deger || 'Kayıt seçilmedi');
}
