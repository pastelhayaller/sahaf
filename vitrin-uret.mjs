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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SUPABASE_URL, SUPABASE_ANON_KEY, ZIYARETCI_EPOSTA, ZIYARETCI_SIFRE
} from './config.js';

const KOK = dirname(fileURLToPath(import.meta.url));
const CIKTI = join(KOK, 'vitrin');
const SITE = 'https://pastelhayaller.com';
const WHATSAPP = '905369782758';

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
  telephone: '+90 536 978 27 58',
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
      `${SUPABASE_URL}/rest/v1/kitaplar?select=id,ad,yazar,raf,fiyat,notlar,foto_url,yayinevi,basim_yili,durum,aciklama&order=id.asc`,
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

const fiyatYaz = f =>
  f == null || f === '' ? null : `${Number(f).toLocaleString('tr-TR', { minimumFractionDigits: 0 })} TL`;

// ——— şablon ——————————————————————————————————————————————

// Müşteri uygulamasının (index.html, ziyaretçi teması) renk ve yazı dili; iki yüz tek mağaza.
const STIL = `
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
${gorsel ? `<meta property="og:image" content="${kac(gorsel)}">\n` : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter+Tight:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap">
<style>${STIL}</style>
<link rel="stylesheet" href="/bilgilendirme.css?v=019">
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
  ${SAATLER} · <a href="https://wa.me/${WHATSAPP}">0536 978 27 58 (WhatsApp)</a><br>
  <a href="${SITE}/">Kitap ara ve sepete ekle</a> · <a href="${SITE}/vitrin/">Tüm kitaplar</a>
<nav class="bilgi-baglantilari" aria-label="Bilgilendirme">
  <a href="/gizlilik.html">Gizlilik ve kişisel veriler</a>
  <a href="/cerez-politikasi.html">Çerezler ve tarayıcı depolaması</a>
  <a href="/islem-rehberi.html">İşlem rehberi</a>
  <a href="/iletisim.html">İletişim</a>
</nav>
</footer>
</div>
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

export function kitapSayfasi(k, slug) {
  const kanonik = `${SITE}/vitrin/kitap/${slug}.html`;
  const fiyat = fiyatYaz(k.fiyat);
  const yazar = k.yazar ? `${k.yazar}` : null;
  const kitapAciklamasi = typeof k.aciklama === 'string' ? k.aciklama.trim() : '';
  const baskiKunyesi = kunye(k);
  const ozet = kitapAciklamasi.replace(/\s+/g, ' ').slice(0, 180);
  const aciklama = [ozet, k.ad, yazar, k.yayinevi, k.basim_yili, k.durum ? `Durum: ${k.durum}` : null, fiyat, 'Çorum\'daki Pastelhayaller Sahaf\'ta satışta.']
    .filter(Boolean).join(' — ').slice(0, 300);

  const mesaj = encodeURIComponent(`Merhaba, "${k.ad}" kitabı hâlâ var mı?`);

  const govde = `
<a class="geri" href="${SITE}/vitrin/">← Tüm kitaplar</a>
<div class="urun">
<div>${k.foto_url
    ? `<img class="kapak" src="${kac(k.foto_url)}" alt="${kac(k.ad)} kapak görseli">`
    : '<div class="kapak-yok">Kapak fotoğrafı yakında</div>'}</div>
<div>
<h1>${kac(k.ad)}</h1>
${yazar ? `<p class="yazar">${kac(yazar)}</p>` : ''}
${baskiKunyesi}
${fiyat ? `<p class="fiyat">${kac(fiyat)}</p>` : ''}
<a class="dugme" href="https://wa.me/${WHATSAPP}?text=${mesaj}">WhatsApp'tan ayırt</a>
<p class="stok-notu">Kitap Çorum'daki dükkânımızda; ayırtıp dükkândan teslim alabilirsin. Her kitaptan tek nüsha var.</p>
${kitapAciklamasi ? `<section class="kitap-hakkinda"><h2>Kitap hakkında</h2><p>${kac(kitapAciklamasi)}</p></section>` : ''}
${k.notlar ? `<section class="nusha"><h2>Bu nüsha</h2><div class="not">${kac(k.notlar)}</div></section>` : ''}
</div>
</div>`;

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

  return { slug, kanonik, html: sayfa({ baslik: `${k.ad}${yazar ? ' — ' + yazar : ''} · Pastelhayaller Sahaf Çorum`, aciklama, govde, kanonik, jsonld, gorsel: k.foto_url }) };
}

function listeSayfasi(kayitlar) {
  // Fotoğraflılar önde (sort kararlı: kendi içlerinde A→Z kalır); vitrin gri kutuyla açılmasın.
  const sirali = [...kayitlar].sort((a, b) => !a.k.foto_url - !b.k.foto_url);
  const kartlar = sirali.map(({ k, slug }) => `
<a class="kart" href="${SITE}/vitrin/kitap/${slug}.html">
  <span class="kart-kapak">${k.foto_url ? `<img src="${kac(k.foto_url)}" alt="" loading="lazy">` : 'Kapak yakında'}</span>
  <b>${kac(k.ad)}</b>
  ${k.yazar ? `<span class="kart-yazar">${kac(k.yazar)}</span>` : ''}
  ${k.durum ? `<span class="kart-kunye">${kac(k.durum)}</span>` : ''}
  ${fiyatYaz(k.fiyat) ? `<span class="fiyat">${kac(fiyatYaz(k.fiyat))}</span>` : ''}
</a>`).join('').replace(/[ \t]+$/gm, '');

  const govde = `
<h1>Çorum Sahaf — Kitaplarımız</h1>
<p class="yazar">${kayitlar.length} ikinci el ve nadir kitap · Çorum'daki dükkânımızda satışta</p>
<div class="izgara">${kartlar}</div>`;

  return sayfa({
    baslik: 'Çorum Sahaf — Kitaplarımız · Pastelhayaller Sahaf',
    aciklama: `Çorum'da sahaf: Pastelhayaller Sahaf'ta satışta olan ${kayitlar.length} ikinci el ve nadir kitap. Bahçelievler, Sanat Sokak No:18. WhatsApp'tan ayırt, dükkândan al.`,
    govde, kanonik: `${SITE}/vitrin/`,
    jsonld: { '@context': 'https://schema.org', ...ISLETME }
  });
}

// ——— üretim ——————————————————————————————————————————————

async function uret() {
  const kitaplar = await kitaplariGetir();
  if (!kitaplar.length) throw new Error('Hiç kitap gelmedi — üretim durduruldu (boş vitrin basmıyoruz).');

  const dosyalar = await readdir(join(CIKTI, 'kitap')).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
  const sluglar = slugHaritasi(kitaplar, dosyalar);

  await rm(CIKTI, { recursive: true, force: true });
  await mkdir(join(CIKTI, 'kitap'), { recursive: true });

  const kayitlar = [];
  for (const k of kitaplar) {
    const { slug, kanonik, html } = kitapSayfasi(k, sluglar.get(String(k.id)));
    await writeFile(join(CIKTI, 'kitap', `${slug}.html`), html, 'utf8');
    kayitlar.push({ k, slug, kanonik });
  }

  await writeFile(join(CIKTI, 'index.html'), listeSayfasi(kayitlar), 'utf8');

  const bugun = new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE}/</loc><lastmod>${bugun}</lastmod></url>
<url><loc>${SITE}/vitrin/</loc><lastmod>${bugun}</lastmod></url>
<url><loc>${SITE}/gizlilik.html</loc><lastmod>${bugun}</lastmod></url>
<url><loc>${SITE}/cerez-politikasi.html</loc><lastmod>${bugun}</lastmod></url>
<url><loc>${SITE}/islem-rehberi.html</loc><lastmod>${bugun}</lastmod></url>
<url><loc>${SITE}/iletisim.html</loc><lastmod>${bugun}</lastmod></url>
${kayitlar.map(r => `<url><loc>${r.kanonik}</loc><lastmod>${bugun}</lastmod></url>`).join('\n')}
</urlset>`;
  await writeFile(join(KOK, 'sitemap.xml'), sitemap, 'utf8');
  await writeFile(join(KOK, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`, 'utf8');

  console.log(`Vitrin üretildi: ${kayitlar.length} kitap sayfası + liste + sitemap.`);
  console.log(`Yerelde bak: ${join(CIKTI, 'index.html')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  uret().catch(h => { console.error('HATA:', h.message); process.exit(1); });
}
