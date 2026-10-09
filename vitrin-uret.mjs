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
const ADRES = 'Piribaba Çamlığı, Bahçelievler Mah., Sanat Sk. No:8, 19200 Çorum Merkez/Çorum';
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
    streetAddress: 'Piribaba Çamlığı, Bahçelievler Mah., Sanat Sk. No:8',
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
      `${SUPABASE_URL}/rest/v1/kitaplar?select=id,ad,yazar,raf,fiyat,notlar,foto_url,yayinevi,basim_yili,durum&order=id.asc`,
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

const STIL = `
:root{--kagit:#f5eee0;--kagit-2:#fdfaf3;--kraft:#e9dcc0;--murekkep:#1b1913;
--murekkep-2:#554e3d;--soluk:#6b6353;--kilcal:#ded4bf;--cizgi:#c6b99c;
--muhur:#4a6e51;--muhur-koyu:#3a5740;--baski:3px 3px 0 rgba(28,26,21,.16)}
*{box-sizing:border-box}
body{margin:0;background:var(--kagit);color:var(--murekkep);
font-family:"Inter Tight",Inter,-apple-system,"Segoe UI",Roboto,sans-serif;
font-size:16px;line-height:1.6}
a{color:var(--muhur-koyu)}
.sar{max-width:960px;margin:0 auto;padding:24px 18px 64px}
header{border-bottom:2px solid var(--murekkep);padding-bottom:14px;margin-bottom:26px}
.marka{font-family:Fraunces,"Iowan Old Style",Georgia,serif;font-size:26px;
font-weight:600;letter-spacing:.01em;text-decoration:none;color:var(--murekkep);display:block}
.alt{font-family:"Space Mono",ui-monospace,monospace;font-size:10.5px;
letter-spacing:.16em;text-transform:uppercase;color:var(--soluk);margin-top:5px}
h1{font-family:Fraunces,"Iowan Old Style",Georgia,serif;font-size:30px;
font-weight:600;margin:0 0 6px;line-height:1.25}
.yazar{font-size:17px;color:var(--murekkep-2);margin:0 0 18px}
.izgara{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.kart{background:var(--kagit-2);border:1px solid var(--cizgi);border-radius:2px;
padding:14px;box-shadow:var(--baski);text-decoration:none;color:inherit;display:block}
.kart b{font-family:Fraunces,Georgia,serif;font-size:17px;font-weight:600;
display:block;margin-bottom:3px;line-height:1.3}
.kart span{font-size:14px;color:var(--murekkep-2)}
.fiyat{font-family:"Space Mono",ui-monospace,monospace;font-size:14px;
font-weight:700;color:var(--muhur-koyu);margin-top:9px;display:block}
.etiket{display:inline-block;background:var(--kraft);border:1px solid var(--cizgi);
font-family:"Space Mono",ui-monospace,monospace;font-size:10px;letter-spacing:.1em;
text-transform:uppercase;padding:3px 8px;margin-top:10px}
.kapak{width:100%;max-width:280px;border:1px solid var(--cizgi);box-shadow:var(--baski);
display:block;margin-bottom:20px}
.dugme{display:inline-block;background:var(--muhur);color:#fff;text-decoration:none;
font-weight:600;padding:13px 22px;border:0;box-shadow:var(--baski);margin-top:8px}
.kunye{display:grid;grid-template-columns:auto 1fr;gap:5px 16px;margin:0 0 18px;
font-size:15px;align-items:baseline}
.kunye dt{font-family:"Space Mono",ui-monospace,monospace;font-size:10.5px;
letter-spacing:.12em;text-transform:uppercase;color:var(--soluk)}
.kunye dd{margin:0;color:var(--murekkep)}
.not{background:var(--kagit-2);border-left:3px solid var(--cizgi);padding:11px 14px;margin:18px 0}
footer{margin-top:44px;padding-top:16px;border-top:1px solid var(--kilcal);
font-size:13px;color:var(--soluk)}
.geri{font-family:"Space Mono",ui-monospace,monospace;font-size:11px;
letter-spacing:.1em;text-transform:uppercase;display:inline-block;margin-bottom:18px}
`;

function sayfa({ baslik, aciklama, govde, kanonik, jsonld }) {
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter+Tight:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap">
<style>${STIL}</style>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head>
<body>
<div class="sar">
<header>
  <a class="marka" href="${SITE}/">Pastelhayaller Sahaf</a>
  <div class="alt">Çorum sahaf · İkinci el ve nadir kitap</div>
</header>
${govde}
<footer>
  <b>Pastelhayaller Sahaf</b> · Çorum<br>
  <a href="${HARITA}">${ADRES}</a><br>
  ${SAATLER} · <a href="https://wa.me/${WHATSAPP}">0536 978 27 58 (WhatsApp)</a><br>
  <a href="${SITE}/">Kitap ara ve sepete ekle</a> · <a href="${SITE}/vitrin/">Tüm kitaplar</a>
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

function kitapSayfasi(k, slug) {
  const kanonik = `${SITE}/vitrin/kitap/${slug}.html`;
  const fiyat = fiyatYaz(k.fiyat);
  const yazar = k.yazar ? `${k.yazar}` : null;
  const aciklama = [k.ad, yazar, k.yayinevi, k.basim_yili, k.durum ? `Durum: ${k.durum}` : null, fiyat, 'Çorum\'daki Pastelhayaller Sahaf\'ta satışta.']
    .filter(Boolean).join(' — ').slice(0, 300);

  const mesaj = encodeURIComponent(`Merhaba, "${k.ad}" kitabı hâlâ var mı?`);

  const govde = `
<a class="geri" href="${SITE}/vitrin/">← Tüm kitaplar</a>
<h1>${kac(k.ad)}</h1>
${yazar ? `<p class="yazar">${kac(yazar)}</p>` : ''}
${k.foto_url ? `<img class="kapak" src="${kac(k.foto_url)}" alt="${kac(k.ad)} kapak görseli" loading="lazy">` : ''}
${kunye(k)}
${fiyat ? `<p class="fiyat">${kac(fiyat)}</p>` : ''}
${k.notlar ? `<div class="not">${kac(k.notlar)}</div>` : ''}
<p><a class="dugme" href="https://wa.me/${WHATSAPP}?text=${mesaj}">WhatsApp'tan sor</a></p>
<p style="margin-top:22px;color:var(--murekkep-2);font-size:15px">
Bu kitap Çorum'daki dükkânımızda bulunuyor; gelip alabilir ya da WhatsApp'tan ayırtabilirsin. Stok tek adettir; sormadan önce satılmış olabilir.
</p>`;

  // ponytail: fiyat yoksa offers yazmıyoruz — uydurma fiyat structured data'da yalan olur.
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Book',
    name: k.ad, url: kanonik, identifier: String(k.id),
    ...(yazar ? { author: { '@type': 'Person', name: yazar } } : {}),
    ...(k.foto_url ? { image: k.foto_url } : {}),
    ...(k.yayinevi ? { publisher: { '@type': 'Organization', name: k.yayinevi } } : {}),
    ...(k.basim_yili ? { datePublished: String(k.basim_yili) } : {}),
    ...(k.durum ? { bookEdition: k.durum } : {}),
    ...(k.fiyat != null && k.fiyat !== '' ? {
      offers: {
        '@type': 'Offer', price: Number(k.fiyat), priceCurrency: 'TRY',
        availability: 'https://schema.org/InStock', url: kanonik,
        seller: { '@id': ISLETME['@id'] }
      }
    } : {})
  };

  return { slug, kanonik, html: sayfa({ baslik: `${k.ad}${yazar ? ' — ' + yazar : ''} · Pastelhayaller Sahaf Çorum`, aciklama, govde, kanonik, jsonld }) };
}

function listeSayfasi(kayitlar) {
  const kartlar = kayitlar.map(({ k, slug }) => `
<a class="kart" href="${SITE}/vitrin/kitap/${slug}.html">
  <b>${kac(k.ad)}</b>
  ${k.yazar ? `<span>${kac(k.yazar)}</span>` : ''}
  ${fiyatYaz(k.fiyat) ? `<span class="fiyat">${kac(fiyatYaz(k.fiyat))}</span>` : ''}
  ${k.durum ? `<span class="etiket">${kac(k.durum)}</span>` : ''}
</a>`).join('').replace(/[ \t]+$/gm, '');

  const govde = `
<h1>Çorum Sahaf — Kitaplarımız</h1>
<p class="yazar">${kayitlar.length} ikinci el ve nadir kitap · Çorum'daki dükkânımızda satışta</p>
<div class="izgara">${kartlar}</div>`;

  return sayfa({
    baslik: 'Çorum Sahaf — Kitaplarımız · Pastelhayaller Sahaf',
    aciklama: `Çorum'da sahaf: Pastelhayaller Sahaf'ta satışta olan ${kayitlar.length} ikinci el ve nadir kitap. Bahçelievler, Sanat Sokak No:8. WhatsApp'tan ayırt, dükkândan al.`,
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
