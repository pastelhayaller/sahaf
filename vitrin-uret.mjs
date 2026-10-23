// Pastelhayaller Sahaf — vitrin üretici
//
// Supabase'deki kitapları çekip GitHub Pages'in servis edeceği DÜZ HTML sayfalara
// çevirir. Sebep: uygulama veriyi tarayıcıda, oturum arkasından çekiyor —
// Googlebot tek kitap göremiyor. Buradan çıkan sayfalarda metin HTML'in içinde,
// yani aranınca bulunur.
//
// Çalıştır:  node vitrin-uret.mjs
// Çıktı:     vitrin/index.html, vitrin/kitap/<slug>.html, sitemap.xml, robots.txt
//
// Bağımlılık yok (Node 18+ yerleşik fetch). Uygulamaya hiç dokunmaz.

import { writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { kucukKapakUrl, buyukKapakUrl } from './ui-helpers.js';
import { fileURLToPath } from 'node:url';
import {
  SUPABASE_URL, SUPABASE_ANON_KEY, ZIYARETCI_EPOSTA, ZIYARETCI_SIFRE
} from './config.js';
import { KATEGORILER, kategoriGecerli } from './kategori.js';
import { kategoriRehberi, ilgiliKitaplar } from './kesif.js';

const KOK = dirname(fileURLToPath(import.meta.url));
const CIKTI = join(KOK, 'vitrin');
const SITE = 'https://pastelhayaller.com';
const WHATSAPP = '905320668219';

// Google İşletme Profili ile birebir aynı olmalı (ad/adres/telefon tutarlılığı yerel sıralamayı etkiler).
// index.html'deki JSON-LD de aynı bilgiyi taşır; birini değiştirirsen ötekini de değiştir.
const ADRES = 'Piribaba Çamlığı, Bahçelievler Mah., Sanat Sk. No:18, 19200 Çorum Merkez/Çorum';
const SAATLER = 'Pazartesi–Cumartesi 10:00–17:00 · Pazar kapalı';
const HARITA = 'https://maps.google.com/?cid=4502818142900572789';
export const ISLETME = {
  '@type': 'BookStore',
  '@id': 'https://pastelhayaller.com/#isletme',
  name: 'Pastelhayaller Sahaf',
  url: 'https://pastelhayaller.com/',
  telephone: '+90 532 066 82 19',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Piribaba Çamlığı, Bahçelievler Mah., Sanat Sk. No:18',
    addressLocality: 'Çorum', addressRegion: 'Çorum', postalCode: '19200', addressCountry: 'TR'
  },
  geo: { '@type': 'GeoCoordinates', latitude: 40.5481191, longitude: 34.9945967 },
  hasMap: HARITA,
  openingHoursSpecification: [{
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    opens: '10:00', closes: '17:00'
  }]
};

// ——— veri ———————————————————————————————————————————————

async function kitaplariGetir() {
  const giris = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: ZIYARETCI_EPOSTA, password: ZIYARETCI_SIFRE })
  });
  if (!giris.ok) throw new Error(`Ziyaretçi girişi başarısız: ${giris.status} ${await giris.text()}`);
  const { access_token } = await giris.json();

  // PostgREST tek istekte en fazla 1000 satır döndürür ve fazlasını SESSİZCE keser.
  // İlk denemede tam 1000 geldi; sayfalama şart.
  const ADIM = 1000;
  const hepsi = [];
  for (let bas = 0; ; bas += ADIM) {
    const cevap = await fetch(
      `${SUPABASE_URL}/rest/v1/kitaplar?select=id,ad,yazar,raf,fiyat,notlar,foto_url,yayinevi,basim_yili,durum,kategori,aciklama&order=id.asc`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          authorization: `Bearer ${access_token}`,
          range: `${bas}-${bas + ADIM - 1}`
        }
      }
    );
    if (!cevap.ok) throw new Error(`Kitaplar okunamadı: ${cevap.status} ${await cevap.text()}`);
    const dilim = await cevap.json();
    hepsi.push(...dilim);
    if (dilim.length < ADIM) break;
  }
  // Sayfalama id'ye göre yapıldı (kararlı sıra); gösterim sırasını burada kuruyoruz.
  return hepsi.sort((a, b) => String(a.ad ?? '').localeCompare(String(b.ad ?? ''), 'tr'));
}

// ——— yardımcılar —————————————————————————————————————————

const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', I: 'i', Ö: 'o', Ş: 's', Ü: 'u' };

export function slugla(metin, id) {
  const govde = [...String(metin ?? '')]
    .map(h => TR[h] ?? h)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  // id son eki çakışmayı imkânsız kılar: aynı adlı iki kitap birbirini ezmez.
  return `${govde || 'kitap'}-${String(id).slice(0, 8)}`;
}

// Mevcut kitap URL'si başlık/yazar temizliğinde değişmez. Eşleştirme belirsizse
// eski çıktıyı silmeden dururuz; kısa ID'yi yanlış kitaba bağlamayız.
export function slugHaritasi(kitaplar, dosyalar = []) {
  const eskiler = new Map();
  for (const dosya of dosyalar) {
    const m = /^(.+)-([a-z0-9]{8})\.html$/.exec(dosya);
    if (!m) continue;
    if (eskiler.has(m[2])) throw new Error(`Birden çok eski URL aynı kısa ID'ye bağlı: ${m[2]}`);
    eskiler.set(m[2], dosya.slice(0, -5));
  }
  const kisaIdler = new Set(), kullanilan = new Set(), sonuc = new Map();
  for (const k of kitaplar) {
    const id = String(k.id), kisa = id.slice(0, 8);
    if (sonuc.has(id)) throw new Error(`Tekrarlanan kitap ID: ${id}`);
    if (kisaIdler.has(kisa)) throw new Error(`Eski URL için belirsiz kısa ID: ${kisa}`);
    kisaIdler.add(kisa);
    const slug = eskiler.get(kisa) || slugla(`${k.ad} ${k.yazar ?? ''}`, id);
    if (kullanilan.has(slug)) throw new Error(`Kitap URL çakışması: ${slug}`);
    kullanilan.add(slug); sonuc.set(id, slug);
  }
  return sonuc;
}

const kac = s => String(s ?? '').replace(/[&<>"']/g, h =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[h]));

// Detayda 800px JPEG, listede ~480px WebP kullanılır; eksik kopya ham kapağa düşer.
const gosterimKapagi = url => {
  const buyuk = buyukKapakUrl(url);
  return buyuk !== url && existsSync(join(KOK, 'kapak', basename(buyuk))) ? buyuk : url;
};
const gosterimKucukKapagi = url => {
  const kucuk = kucukKapakUrl(url);
  return kucuk !== url && existsSync(join(KOK, 'kapak', basename(kucuk))) ? kucuk : gosterimKapagi(url);
};

const fiyatYaz = f =>
  f == null || f === '' ? null : `${Number(f).toLocaleString('tr-TR', { minimumFractionDigits: 0 })} TL`;

// ——— şablon ——————————————————————————————————————————————

// Müşteri uygulamasının (index.html, ziyaretçi teması) renk ve yazı dili; iki yüz tek mağaza.
const STIL = `
/* Category guides and lightweight discovery links share the storefront language. */
.sayfalama{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:24px 0}.sayfalama a,.sayfalama [aria-current]{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:6px 12px;border:1px solid #d6dfe5;border-radius:5px;text-decoration:none}.sayfalama [aria-current]{background:#19344a;color:#fff}
.kategori-rehber{margin:18px 0 24px;max-width:850px;color:#455866;font-size:15px;line-height:1.65}
.kategori-rehber p{margin:0 0 10px}
.kategori-rehber nav{display:flex;gap:8px;flex-wrap:wrap}
.kategori-rehber nav a{display:inline-flex;align-items:center;min-height:44px;padding:6px 12px;border:1px solid #d6dfe5;border-radius:5px;color:#19344a;text-decoration:none}
.kitap-kesfi{margin-top:36px}.kitap-kesfi section{margin:28px 0}.kitap-kesfi h2{font-size:21px;color:#19344a;margin:0 0 14px}
.kesif-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}
.kesif-kitap{display:flex;flex-direction:column;gap:7px;min-width:0;padding:16px;border:1px solid #d6dfe5;border-radius:5px;background:#fff;color:#19344a;text-align:left;text-decoration:none;font:inherit;cursor:pointer;overflow-wrap:anywhere}
.kesif-kitap span{font-size:14px;color:#455866}.kesif-kitap:hover{border-color:#19344a}.kesif-kitap:focus-visible{outline:2px solid #19344a;outline-offset:3px}


:root{--lacivert:#19344a;--gri:#64717c;--gri-2:#455866;--zemin:#f4f6f8;--cizgi:#e3e8ed;
--kirmizi:#c44454;--kirmizi-koyu:#a43140}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:var(--lacivert);
font:16px/1.6 "Inter Tight",Inter,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--lacivert);text-underline-offset:3px}
a:hover{color:var(--kirmizi-koyu)}
a:focus-visible{outline:2px solid var(--lacivert);outline-offset:3px}
.sar{max-width:1240px;margin:0 auto;padding:0 24px 56px}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;
padding:22px 0;border-bottom:1px solid var(--cizgi);margin-bottom:28px}
.marka{font:600 27px/1.1 Fraunces,"Iowan Old Style",Georgia,serif;text-decoration:none;color:var(--lacivert)}
.marka span{display:block;margin-top:5px;font:600 12px/1 "Inter Tight",sans-serif;letter-spacing:.12em;color:var(--kirmizi)}
.ust-eylem{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.ust-eylem a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border:1px solid #c8d0d8;
border-radius:5px;font-size:14px;font-weight:600;text-decoration:none}
.ust-eylem a.ana{background:var(--lacivert);border-color:var(--lacivert);color:#fff}
h1{font:600 clamp(26px,4vw,34px)/1.2 Fraunces,"Iowan Old Style",Georgia,serif;margin:0 0 6px;overflow-wrap:anywhere}
.yazar{font-size:17px;color:var(--gri-2);margin:0 0 18px}
.izgara{display:grid;gap:24px 18px;grid-template-columns:repeat(5,minmax(0,1fr))}
.kart{display:flex;flex-direction:column;min-width:0;padding:12px;border:1px solid var(--cizgi);border-radius:5px;
background:#fff;text-decoration:none;color:inherit}
.kart:hover{border-color:#b4c1cb;color:inherit}
.kart-kapak{display:grid;place-items:center;height:188px;border-radius:3px;background:var(--zemin);color:var(--gri);font-size:13px;overflow:hidden}
.kart-kapak img{width:100%;height:100%;object-fit:contain}
.kart b{display:block;margin-top:14px;font-size:16px;font-weight:600;line-height:1.35;overflow-wrap:anywhere}
.kart .kart-yazar{display:block;margin-top:6px;font-size:13px;line-height:1.4;color:var(--gri)}
.kart .kart-kunye{display:block;margin-top:6px;font-size:12px;line-height:1.4;color:var(--gri)}
.kart .fiyat{margin-top:auto;padding-top:12px}
.fiyat{display:block;font-weight:700;font-size:20px;line-height:1.2;color:var(--lacivert)}
.kategori-nav{margin:24px 0;padding:14px 16px;border:1px solid var(--cizgi);border-radius:5px;background:var(--zemin);font-size:14px}
.kategori-nav b{margin-right:10px}
.kategori-nav a{display:inline-block;margin:3px 10px 3px 0}
.urun{display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:40px;align-items:start}
.kapak{display:block;width:100%;border-radius:5px;background:var(--zemin)}
.kapak-yok{display:grid;place-items:center;aspect-ratio:3/4;border-radius:5px;background:var(--zemin);color:var(--gri);font-size:14px}
.urun .fiyat{font-size:28px;margin:18px 0 0}
.dugme{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;margin-top:14px;
border-radius:5px;background:var(--kirmizi);color:#fff;font-weight:600;text-decoration:none}
.dugme:hover{background:var(--kirmizi-koyu);color:#fff}
.stok-notu{margin-top:16px;color:var(--gri-2);font-size:14px}
.kunye{display:grid;grid-template-columns:auto 1fr;gap:6px 18px;margin:0;font-size:15px;align-items:baseline}
.kunye dt{font-size:13px;color:var(--gri)}
.kunye dd{margin:0}
.not{background:var(--zemin);border-left:3px solid var(--kirmizi);padding:11px 14px;margin:14px 0 0}
.kitap-hakkinda,.nusha{margin-top:28px;padding-top:22px;border-top:1px solid var(--cizgi)}
.kitap-hakkinda h2,.nusha h2{font-size:19px;margin:0 0 12px}
.kitap-hakkinda p{white-space:pre-line;overflow-wrap:anywhere;line-height:1.7;margin:0}
footer{margin-top:56px;padding:28px;border-radius:5px;background:var(--zemin);font-size:14px;color:var(--gri-2)}
.geri{display:inline-block;margin-bottom:20px;font-size:14px}
@media(max-width:1000px){.izgara{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:700px){
.sar{padding:0 16px 40px}
header{padding:14px 0;margin-bottom:20px}
.marka{font-size:23px}
.ust-eylem a:not(.ana){display:none}
.izgara{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.kart{padding:8px}
.kart-kapak{height:150px}
.urun{grid-template-columns:1fr;gap:20px}
.urun .kapak,.urun .kapak-yok{max-width:240px}
footer{padding:20px}
}
`;

function sayfa({ baslik, aciklama, govde, kanonik, jsonld, gorsel }) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${kac(baslik)}</title>
<meta name="description" content="${kac(aciklama)}">
<link rel="canonical" href="${kac(kanonik)}">
<meta property="og:title" content="${kac(baslik)}">
<meta property="og:description" content="${kac(aciklama)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${kac(kanonik)}">
${gorsel ? `<meta property="og:image" content="${kac(gorsel)}">\n` : ''}
<link rel="stylesheet" href="/fonts.min.css?v=030">
<style>${STIL}</style>
<link rel="stylesheet" href="/bilgilendirme.min.css?v=030">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<div class="sar">
<header>
  <a class="marka" href="${SITE}/">Pastelhayaller<span>SAHAF · ÇORUM</span></a>
  <nav class="ust-eylem" aria-label="Mağaza">
    <a href="${SITE}/vitrin/">Tüm kitaplar</a>
    <a class="ana" href="${SITE}/">Kitap ara</a>
  </nav>
</header>
${govde}
<footer>
  <b>Pastelhayaller Sahaf</b> · Çorum<br>
  <a href="${HARITA}">${ADRES}</a><br>
  ${SAATLER} · <a href="https://wa.me/${WHATSAPP}">0532 066 82 19 (WhatsApp)</a><br>
  <a href="${SITE}/">Kitap ara ve sepete ekle</a> · <a href="${SITE}/vitrin/">Tüm kitaplar</a>
<nav class="bilgi-baglantilari" aria-label="Bilgilendirme">
  <a href="/gizlilik.html">Gizlilik ve kişisel veriler</a>
  <a href="/cerez-politikasi.html">Çerezler ve tarayıcı depolaması</a>
  <a href="/islem-rehberi.html">İşlem rehberi</a>
  <a href="/iletisim.html">İletişim</a>
</nav>
<p class="sosyal-baglantilar"><a href="https://www.instagram.com/pastelhayallersanat/" target="_blank" rel="noopener noreferrer">Instagram · @pastelhayallersanat</a></p>
<button type="button" data-analiz-tercihi>Çerez tercihleri</button>
</footer>
</div>
<script src="/analiz.js?v=001" defer></script>
</body>
</html>`;
}

// Baskı künyesi: ikinci el kitabın satın alma kararı bu üç satırda veriliyor.
function kunye(k) {
  const satirlar = [
    ['Yayınevi', k.yayinevi],
    ['Basım yılı', k.basim_yili],
    ['Durum', k.durum]
  ].filter(([, d]) => d != null && d !== '');
  if (!satirlar.length) return '';
  return `<dl class="kunye">${satirlar
    .map(([b, d]) => `<dt>${kac(b)}</dt><dd>${kac(d)}</dd>`).join('')}</dl>`;
}

export function kitapKesfi(k, kayitlar) {
  const adaylar = kayitlar.map(r => r.k);
  const yazar = ilgiliKitaplar(k, adaylar, 'yazar');
  const kategori = ilgiliKitaplar(k, adaylar, 'kategori', yazar);
  const bolumler = [['Aynı yazardan',yazar],['Aynı kategoriden',kategori]].filter(([,kitaplar]) => kitaplar.length);
  if (!bolumler.length) return '';
  const sluglar = new Map(kayitlar.map(r => [String(r.k.id),r.slug]));
  return '<div class="kitap-kesfi">' + bolumler.map(([baslik,kitaplar]) => '<section><h2>' + baslik + '</h2><div class="kesif-grid">' + kitaplar.map(k =>
    '<a class="kesif-kitap" href="' + SITE + '/vitrin/kitap/' + kac(sluglar.get(String(k.id))) + '.html"><strong>' + kac(k.ad) + '</strong><span>' + kac(k.yazar) + '</span>' + (fiyatYaz(k.fiyat) ? '<span>' + kac(fiyatYaz(k.fiyat)) + '</span>' : '') + '</a>'
  ).join('') + '</div></section>').join('') + '</div>';
}

export function kategoriRehberiHtml(key, mevcut = Object.keys(KATEGORILER)) {
  const rehber = kategoriRehberi(key);
  if (!rehber) return '';
  return '<section class="kategori-rehber" aria-label="Kategori rehberi"><p>' + kac(rehber[0]) + '</p><nav aria-label="İlgili kategoriler">' + rehber[1].filter(k => mevcut.includes(k)).map(k => '<a href="' + SITE + '/vitrin/kategori/' + k + '.html">' + kac(KATEGORILER[k]) + '</a>').join('') + '</nav></section>';
}

// Aynı baskı iddiası yok: yalnız aynı başlık ve bilinen yazar eşleşen kayıtlar.
export function digerNushalar(k, kayitlar) {
  const anahtar = value => String(value ?? '').trim().toLocaleLowerCase('tr-TR');
  const ad = anahtar(k.ad), yazar = anahtar(k.yazar);
  if (!ad || !yazar || /^(anonim|kolektif|komisyon|bilinmiyor|belirtilmemiş|yazar (bilinmiyor|belli değil|belirtilmemiş)|[-?])$/.test(yazar)) return '';
  const gorulen = new Set([String(k.id)]);
  const digerleri = kayitlar.filter(r => {
    const id = String(r.k.id);
    if (gorulen.has(id) || anahtar(r.k.ad) !== ad || anahtar(r.k.yazar) !== yazar) return false;
    gorulen.add(id); return true;
  });
  if (!digerleri.length) return '';
  return '<section class="diger-nushalar kitap-kesfi"><h2>Diğer nüshalar</h2><p>Aynı başlık ve yazara ait diğer kayıtlar. Yayınevi, basım yılı ve durum bilgilerini karşılaştır; aynı baskı olmayabilir.</p><div class="kesif-grid">' + digerleri.map(({ k: d, slug }) => {
    const bilgiler = [d.yayinevi, d.basim_yili ? `${d.basim_yili} basımı` : null, d.durum].filter(Boolean).join(' · ');
    return `<a class="kesif-kitap" href="${SITE}/vitrin/kitap/${kac(slug)}.html"><strong>${kac(d.ad)}</strong><span>Nüsha kodu: ${kac(String(d.id).slice(0, 8))}</span><span>${kac(bilgiler || 'Ek bilgi için nüshanın sayfasını incele.')}</span><span>${kac(fiyatYaz(d.fiyat) ?? 'Fiyat için sor')}</span></a>`;
  }).join('') + '</div></section>';
}

export function kitapSayfasi(k, slug, kayitlar = []) {
  const kanonik = `${SITE}/vitrin/kitap/${slug}.html`;
  const fiyat = fiyatYaz(k.fiyat);
  const yazar = k.yazar ? `${k.yazar}` : null;
  const kitapAciklamasi = typeof k.aciklama === 'string' ? k.aciklama.trim() : '';
  const baskiKunyesi = kunye(k);
  const ozet = kitapAciklamasi.replace(/\s+/g, ' ').slice(0, 180);
  const aciklama = [ozet, k.ad, yazar, k.yayinevi, k.basim_yili, k.durum ? `Durum: ${k.durum}` : null, fiyat, 'Çorum\'daki Pastelhayaller Sahaf\'ta satışta.']
    .filter(Boolean).join(' — ').slice(0, 300);

  const mesaj = encodeURIComponent(`Merhaba, "${k.ad}" kitabının ${String(k.id).slice(0, 8)} kodlu nüshası hâlâ var mı?\n${kanonik}`);

  const kategoriBaglantisi = kategoriGecerli(k.kategori)
    ? ` / <a href="${SITE}/vitrin/kategori/${k.kategori}.html">${kac(KATEGORILER[k.kategori])}</a>` : '';
  const govde = `
<nav class="geri" aria-label="Konum"><a href="${SITE}/vitrin/">← Tüm kitaplar</a>${kategoriBaglantisi}</nav>
<div class="urun">
<div>${k.foto_url
    ? `<img class="kapak" src="${kac(gosterimKapagi(k.foto_url))}" alt="${kac(k.ad)} kapak görseli">`
    : '<div class="kapak-yok">Kapak fotoğrafı yakında</div>'}</div>
<div>
<h1>${kac(k.ad)}</h1>
<p class="stok-notu">Nüsha kodu: ${kac(String(k.id).slice(0, 8))}</p>
${yazar ? `<p class="yazar">${kac(yazar)}</p>` : ''}
${baskiKunyesi}
${fiyat ? `<p class="fiyat">${kac(fiyat)}</p>` : ''}
<a class="dugme" href="https://wa.me/${WHATSAPP}?text=${mesaj}">WhatsApp'tan ayırt</a>
<p class="stok-notu">Kitap Çorum'daki dükkânımızda; ayırtıp dükkândan teslim alabilirsin. Her kayıt tek bir nüshayı temsil eder.</p>
${kitapAciklamasi ? `<section class="kitap-hakkinda"><h2>Kitap hakkında</h2><p>${kac(kitapAciklamasi)}</p></section>` : ''}
${k.notlar ? `<section class="nusha"><h2>Bu nüsha</h2><div class="not">${kac(k.notlar)}</div></section>` : ''}
</div>
</div>
${digerNushalar(k,kayitlar)}
${kitapKesfi(k,kayitlar)}`;

  // ponytail: fiyat yoksa offers yazmıyoruz — uydurma fiyat structured data'da yalan olur.
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Book',
    name: k.ad, url: kanonik, identifier: String(k.id),
    ...(kitapAciklamasi ? { description: kitapAciklamasi } : {}),
    ...(yazar ? { author: { '@type': 'Person', name: yazar } } : {}),
    ...(k.foto_url ? { image: k.foto_url } : {}),
    ...(k.yayinevi ? { publisher: { '@type': 'Organization', name: k.yayinevi } } : {}),
    ...(k.basim_yili ? { datePublished: String(k.basim_yili) } : {}),
    ...(k.fiyat != null && k.fiyat !== '' ? {
      offers: {
        '@type': 'Offer', price: Number(k.fiyat), priceCurrency: 'TRY',
        availability: 'https://schema.org/InStock', url: kanonik,
        seller: { '@id': ISLETME['@id'] }
      }
    } : {})
  };

  return { slug, kanonik, html: sayfa({ baslik: `${k.ad}${yazar ? ' — ' + yazar : ''} · Pastelhayaller Sahaf Çorum`, aciklama, govde, kanonik, jsonld, gorsel: k.foto_url && gosterimKapagi(k.foto_url) }) };
}

export function kategoriGruplari(kayitlar) {
  const gruplar = new Map();
  for (const kayit of kayitlar) {
    const key = kayit.k?.kategori;
    if (!kategoriGecerli(key)) continue;
    if (!gruplar.has(key)) gruplar.set(key, []);
    gruplar.get(key).push(kayit);
  }
  return Object.keys(KATEGORILER)
    .filter(key => gruplar.has(key))
    .map(key => ({ key, ad: KATEGORILER[key], kayitlar: gruplar.get(key) }));
}

export function kategoriNavigasyonu(gruplar) {
  if (!gruplar.length) return '';
  return `<nav id="kategoriler" class="kategori-nav" aria-label="Kategoriler"><b>Konular</b>${gruplar.map(({ key, ad, kayitlar }) =>
    ` <a href="${SITE}/vitrin/kategori/${key}.html">${kac(ad)} (${kayitlar.length})</a>`).join('')}</nav>`;
}

export function listeSayfasi(kayitlar, { baslik, aciklama, h1, ustMetin, kanonik = `${SITE}/vitrin/`, kategoriNav = '', rehberHtml = '', gezinme = '' } = {}) {
  // Fotoğraflılar önde (sort kararlı: kendi içlerinde A→Z kalır); vitrin gri kutuyla açılmasın.
  const sirali = [...kayitlar].sort((a, b) => !a.k.foto_url - !b.k.foto_url);
  const kartlar = sirali.map(({ k, slug }, i) => `
<a class="kart" href="${SITE}/vitrin/kitap/${slug}.html">
  <span class="kart-kapak">${k.foto_url ? `<img src="${kac(gosterimKucukKapagi(k.foto_url))}" alt="" width="480" height="640" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async"${i === 0 ? ' fetchpriority="high"' : ''}>` : 'Kapak yakında'}</span>
  <b>${kac(k.ad)}</b>
  ${k.yazar ? `<span class="kart-yazar">${kac(k.yazar)}</span>` : ''}
  ${k.durum ? `<span class="kart-kunye">${kac(k.durum)}</span>` : ''}
  ${fiyatYaz(k.fiyat) ? `<span class="fiyat">${kac(fiyatYaz(k.fiyat))}</span>` : ''}
</a>`).join('').replace(/[ \t]+$/gm, '');

  const govde = `
${kategoriNav}
<h1>${kac(h1 ?? 'Çorum Sahaf — Kitaplarımız')}</h1>
<p class="yazar">${kac(ustMetin ?? `${kayitlar.length} ikinci el ve nadir kitap · Çorum'daki dükkânımızda satışta`)}</p>
${rehberHtml}
${gezinme}
<div class="izgara">${kartlar}</div>
${gezinme}`;

  return sayfa({
    baslik: baslik ?? 'Çorum Sahaf — Kitaplarımız · Pastelhayaller Sahaf',
    aciklama: aciklama ?? `Çorum'da sahaf: Pastelhayaller Sahaf'ta satışta olan ${kayitlar.length} ikinci el ve nadir kitap. Bahçelievler, Sanat Sokak No:18. WhatsApp'tan ayırt, dükkândan al.`,
    govde, kanonik,
    jsonld: { '@context': 'https://schema.org', ...ISLETME }
  });
}

// Kitap URL'leri sabit kalır; tam katalog küçük ve taranabilir sayfalara bölünür.
export const KATALOG_SAYFA_BOYUTU = 96;
export const katalogUrl = n => n === 1 ? `${SITE}/vitrin/` : `${SITE}/vitrin/sayfa/${n}.html`;
export function katalogGezinmesi(n, toplam) {
  if (toplam <= 1) return '';
  const sayilar = [...new Set([1, toplam, n - 2, n - 1, n, n + 1, n + 2])]
    .filter(i => i >= 1 && i <= toplam).sort((a, b) => a - b);
  const link = (i, metin, rel = '') => `<a href="${katalogUrl(i)}"${rel ? ` rel="${rel}"` : ''}>${metin}</a>`;
  return `<nav class="sayfalama" aria-label="Katalog sayfaları">${n > 1 ? link(n - 1, '← Önceki', 'prev') : ''}` +
    sayilar.map((i, ix) => (ix && i > sayilar[ix - 1] + 1 ? '<span aria-hidden="true">…</span>' : '') +
      (i === n ? `<span aria-current="page" aria-label="Sayfa ${i}">${i}</span>` : link(i, i))).join('') +
    `${n < toplam ? link(n + 1, 'Sonraki →', 'next') : ''}</nav>`;
}

export function katalogSayfalari(kayitlar) {
  const sirali = [...kayitlar].sort((a, b) => !a.k.foto_url - !b.k.foto_url);
  const toplam = Math.max(1, Math.ceil(sirali.length / KATALOG_SAYFA_BOYUTU));
  const kategoriNav = kategoriNavigasyonu(kategoriGruplari(kayitlar));
  return Array.from({ length: toplam }, (_, ix) => {
    const n = ix + 1, kanonik = katalogUrl(n);
    return { dosya: n === 1 ? 'index.html' : `sayfa/${n}.html`, kanonik,
      html: listeSayfasi(sirali.slice(ix * KATALOG_SAYFA_BOYUTU, n * KATALOG_SAYFA_BOYUTU), {
        kanonik, kategoriNav, gezinme: katalogGezinmesi(n, toplam),
        baslik: `Çorum Sahaf — Kitaplarımız${n > 1 ? ` — Sayfa ${n}` : ''} · Pastelhayaller Sahaf`,
        h1: `Çorum Sahaf — Kitaplarımız${n > 1 ? ` — Sayfa ${n}` : ''}`,
        aciklama: `Çorum'da sahaf: Pastelhayaller Sahaf'ta satışta olan ${kayitlar.length} ikinci el ve nadir kitap. Sayfa ${n}/${toplam}. Bahçelievler, Sanat Sokak No:18. WhatsApp'tan ayırt, dükkândan al.`,
        ustMetin: `${kayitlar.length} ikinci el ve nadir kitap · Sayfa ${n}/${toplam} · Çorum'daki dükkânımızda satışta`
      }) };
  });
}

export function siteHaritasi(urller) {
  // lastmod isteğe bağlı: gerçek sayfa değişim tarihi izlenmeden üretim gününü yazma.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(urller)].map(url => `<url><loc>${kac(url)}</loc></url>`).join('\n')}\n</urlset>`;
}

export function kategoriSayfasi({ key, ad, kayitlar }, mevcut = Object.keys(KATEGORILER)) {
  const kanonik = `${SITE}/vitrin/kategori/${key}.html`;
  return listeSayfasi(kayitlar, {
    baslik: `${ad} — İkinci El Kitaplar · Pastelhayaller Sahaf Çorum`,
    aciklama: `Çorum Pastelhayaller Sahaf'ta ${ad} kategorisindeki ${kayitlar.length} ikinci el kitap. Bahçelievler, Sanat Sokak No:18. WhatsApp'tan ayırt, dükkândan al.`,
    rehberHtml: kategoriRehberiHtml(key,mevcut),
    h1: `${ad} — Çorum Sahaf`,
    ustMetin: `${ad} kategorisinde ${kayitlar.length} kitap · Çorum'daki dükkânımızda satışta`,
    kanonik,
  });
}

// ——— üretim ——————————————————————————————————————————————

async function uret() {
  const kitaplar = await kitaplariGetir();
  if (!kitaplar.length) throw new Error('Hiç kitap gelmedi — üretim durduruldu (boş vitrin basmıyoruz).');

  // Kapak kopyaları: Pillow'lu Python yoksa üretim durmaz, sayfalar ham kapağı kullanır.
  const kapaklar = JSON.stringify(kitaplar.map(k => k.foto_url).filter(Boolean));
  for (const py of [['py', '-3'], ['python3']]) {
    const s = spawnSync(py[0], [...py.slice(1), join(KOK, 'kapak-kucult.py')], { input: kapaklar, stdio: ['pipe', 'inherit', 'inherit'], env: { ...process.env, PYTHONUTF8: '1' } });
    if (!s.error) break;
  }

  const dosyalar = await readdir(join(CIKTI, 'kitap')).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
  const sluglar = slugHaritasi(kitaplar, dosyalar);

  await rm(CIKTI, { recursive: true, force: true });
  await mkdir(join(CIKTI, 'kitap'), { recursive: true });

  const kayitlar = kitaplar.map(k => ({k, slug:sluglar.get(String(k.id))}));
  for (const r of kayitlar) {
    const { kanonik, html } = kitapSayfasi(r.k, r.slug, kayitlar);
    r.kanonik = kanonik;
    await writeFile(join(CIKTI, 'kitap', r.slug + '.html'), html, 'utf8');
  }

  const gruplar = kategoriGruplari(kayitlar);
  await mkdir(join(CIKTI, 'kategori'), { recursive: true });
  for (const grup of gruplar) {
    await writeFile(join(CIKTI, 'kategori', `${grup.key}.html`), kategoriSayfasi(grup, gruplar.map(g => g.key)), 'utf8');
  }
  const katalog = katalogSayfalari(kayitlar);
  await mkdir(join(CIKTI, 'sayfa'), { recursive: true });
  for (const sayfa of katalog) await writeFile(join(CIKTI, sayfa.dosya), sayfa.html, 'utf8');

  const sitemap = siteHaritasi([
    `${SITE}/`, `${SITE}/gizlilik.html`, `${SITE}/cerez-politikasi.html`,
    `${SITE}/islem-rehberi.html`, `${SITE}/iletisim.html`,
    ...katalog.map(s => s.kanonik), ...kayitlar.map(r => r.kanonik),
    ...gruplar.map(({ key }) => `${SITE}/vitrin/kategori/${key}.html`)
  ]);
  await writeFile(join(KOK, 'sitemap.xml'), sitemap, 'utf8');
  await writeFile(join(KOK, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`, 'utf8');

  console.log(`Vitrin üretildi: ${kayitlar.length} kitap sayfası + liste + sitemap.`);
  console.log(`Yerelde bak: ${join(CIKTI, 'index.html')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  uret().catch(h => { console.error('HATA:', h.message); process.exit(1); });
}
