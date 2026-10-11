// Vitrin üreticisinin kırılırsa satışı sessizce bozacak iki parçası:
// slug (çakışma = kitap sayfası birbirini ezer) ve kaçış (tırnaklı ad = bozuk HTML).
// Çalıştır: node vitrin-uret.test.mjs

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugla, slugHaritasi, kitapSayfasi, kategoriGruplari, kategoriSayfasi, listeSayfasi, kategoriNavigasyonu } from './vitrin-uret.mjs';

const KOK = dirname(fileURLToPath(import.meta.url));

// Türkçe harfler URL'de kaybolmamalı, ASCII'ye inmeli.
assert.equal(slugla('Çiğdem Şiirleri', 'abcd1234-xxxx'), 'cigdem-siirleri-abcd1234');
// Aynı adlı iki kitap ASLA aynı dosyaya yazmamalı.
assert.notEqual(slugla('Sefiller', 'aaaa1111-x'), slugla('Sefiller', 'bbbb2222-x'));
// Adı tamamen sembol olan kitap yine de geçerli bir dosya adı üretmeli.
assert.match(slugla('!!! ???', 'ffff9999-x'), /^kitap-ffff9999$/);
// Uzun ad dosya adını patlatmamalı.
assert.ok(slugla('a'.repeat(200), 'cccc3333-x').length <= 70);

// Üretilmiş vitrin varsa: çakışma yok ve metin HTML'in İÇİNDE (Googlebot görsün).
const dizin = join(KOK, 'vitrin', 'kitap');
const dosyalar = await readdir(dizin).catch(() => []);
if (dosyalar.length) {
  assert.equal(new Set(dosyalar).size, dosyalar.length, 'slug çakışması var — sayfalar birbirini eziyor');
  const ornek = await readFile(join(dizin, dosyalar[0]), 'utf8');
  assert.match(ornek, /<h1>.+<\/h1>/, 'başlık HTML içinde değil');
  assert.match(ornek, /application\/ld\+json/, 'structured data yok');
  assert.doesNotMatch(ornek, /<title>[^<]*[<>][^<]*<\/title>/, 'başlıkta kaçırılmamış işaret var');
  console.log(`Vitrin kontrolü: ${dosyalar.length} sayfa, çakışma yok.`);
} else {
  console.log('Vitrin henüz üretilmemiş; yalnız slug testleri koştu.');
}

console.log('Tamam.');

// Renaming authors/titles must not orphan an indexed URL.
const renamed = { id: 'aaaa1111-1234', ad: 'Yeni başlık', yazar: 'Düzeltilmiş yazar' };
assert.equal(slugHaritasi([renamed], ['eski-baslik-eski-yazar-aaaa1111.html']).get(renamed.id), 'eski-baslik-eski-yazar-aaaa1111');
assert.equal(slugHaritasi([renamed]).get(renamed.id), slugla(`${renamed.ad} ${renamed.yazar}`, renamed.id));
assert.throws(() => slugHaritasi([renamed], ['biri-aaaa1111.html', 'digeri-aaaa1111.html']), /Birden çok/);
assert.throws(() => slugHaritasi([renamed, { ...renamed, id: 'aaaa1111-9999' }], ['eski-aaaa1111.html']), /belirsiz/);
assert.throws(() => slugHaritasi([renamed, renamed]), /Tekrarlanan/);
assert.equal(slugHaritasi([renamed], ['ilgisisiz-bbbb2222.html']).get(renamed.id), slugla(`${renamed.ad} ${renamed.yazar}`, renamed.id));

if (dosyalar.length) {
  const current = dosyalar.filter(name => /-[a-z0-9]{8}\.html$/.test(name));
  const records = current.map(name => ({ id: name.slice(-13, -5) + '-full-id', ad: 'Yeni temizlenmiş başlık', yazar: 'Yeni yazar' }));
  const stable = slugHaritasi(records, current);
  assert.deepEqual([...stable.values()].map(slug => slug + '.html').sort(), current.sort(), 'Every existing URL survives metadata cleanup');
  console.log(`URL koruması: ${stable.size} mevcut yol değişmedi.`);
}

const described = { id: 'desc1234-full', ad: 'Örnek kitap', yazar: 'Yazar', yayinevi: 'Yayın', basim_yili: 2001, durum: 'İyi', notlar: 'Kapakta çizik', aciklama: 'Konu tanıtımı.\n</script><script>alert(1)</script> & devam.' };
const describedPage = kitapSayfasi(described, 'eski-ad-desc1234');
assert.equal(describedPage.kanonik, 'https://pastelhayaller.com/vitrin/kitap/eski-ad-desc1234.html');
assert.match(describedPage.html, /<h2>Kitap hakkında<\/h2>/);
assert.match(describedPage.html, /Konu tanıtımı\.\n&lt;\/script&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; devam\./);
assert.doesNotMatch(describedPage.html, /<script>alert/);
const bookJson = JSON.parse(describedPage.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
assert.equal(bookJson.description, described.aciklama);
assert.equal(bookJson.bookEdition, undefined, 'Physical condition is not a bibliographic edition');
assert(describedPage.html.indexOf('Kapakta çizik') > describedPage.html.indexOf('<h2>Bu nüsha</h2>'));
const metaDescription = describedPage.html.match(/<meta name="description" content="([^"]*)"/)[1];
assert.match(metaDescription, /Konu tanıtımı/); assert.match(metaDescription, /Yayın/); assert.match(metaDescription, /2001/);
const blankPage = kitapSayfasi({ ...described, aciklama: '  ' }, 'eski-ad-desc1234');
assert.doesNotMatch(blankPage.html, /<h2>Kitap hakkında/);
assert.equal(JSON.parse(blankPage.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]).description, undefined);
console.log('Vitrin description HTML/JSON-LD escaping, topic/copy separation and stable URL passed.');

const categoryRecords = [
  { k: { id: 'roman1234-full', ad: 'Rüzgâr & "Yol"', yazar: 'Yazar', kategori: 'roman' }, slug: 'ruzgar-yol-roman1234', kanonik: 'https://pastelhayaller.com/vitrin/kitap/ruzgar-yol-roman1234.html' },
  { k: { id: 'roman5678-full', ad: 'İkinci Roman', kategori: 'roman' }, slug: 'ikinci-roman-roman5678', kanonik: 'https://pastelhayaller.com/vitrin/kitap/ikinci-roman-roman5678.html' },
  { k: { id: 'null1234-full', ad: 'Sınıflandırılmamış', kategori: null }, slug: 'siniflandirilmamis-null1234', kanonik: 'https://pastelhayaller.com/vitrin/kitap/siniflandirilmamis-null1234.html' },
  { k: { id: 'bad12345-full', ad: 'Geçersiz Kategori', kategori: 'uydurma' }, slug: 'gecersiz-kategori-bad12345', kanonik: 'https://pastelhayaller.com/vitrin/kitap/gecersiz-kategori-bad12345.html' },
  { k: { id: 'empty123-full', ad: 'Boş Kategori', kategori: '' }, slug: 'bos-kategori-empty123', kanonik: 'https://pastelhayaller.com/vitrin/kitap/bos-kategori-empty123.html' },
  { k: { id: 'empty456-full', ad: 'Boş Kategori İki', kategori: 'siir' }, slug: 'bos-kategori-empty456', kanonik: 'https://pastelhayaller.com/vitrin/kitap/bos-kategori-empty456.html' },
];
const gruplar = kategoriGruplari(categoryRecords);
assert.deepEqual(gruplar.map(g => g.key), ['roman', 'siir']);
assert.deepEqual(gruplar[0].kayitlar.map(r => r.k.ad), ['Rüzgâr & "Yol"', 'İkinci Roman']);
assert.doesNotMatch(kategoriSayfasi(gruplar[0]), /Sınıflandırılmamış|Geçersiz Kategori|Boş Kategori/);
assert.match(kategoriSayfasi(gruplar[0]), /<link rel="canonical" href="https:\/\/pastelhayaller\.com\/vitrin\/kategori\/roman\.html">/);
assert.match(kategoriSayfasi(gruplar[0]), /href="https:\/\/pastelhayaller\.com\/vitrin\/kitap\/ruzgar-yol-roman1234\.html"/);
assert.match(kategoriSayfasi(gruplar[0]), /Rüzgâr &amp; &quot;Yol&quot;/);
assert.match(listeSayfasi(categoryRecords, { kategoriNav: kategoriNavigasyonu(gruplar) }), /id="kategoriler"/);
assert.match(kategoriNavigasyonu(gruplar), /roman\.html">Roman \(2\)/);
assert.match(listeSayfasi(categoryRecords), /siniflandirilmamis-null1234\.html/);
assert.match(kitapSayfasi({ ...categoryRecords[0].k }, categoryRecords[0].slug).html, /kategori\/roman\.html/);
console.log('Kategori üyeliği, dışlama, kaçış, canonical ve gezinme geçti.');

assert.deepEqual(kategoriGruplari([]), []);
assert.equal(kategoriNavigasyonu([]), "");
assert.deepEqual(kategoriGruplari([{ k: { kategori: "__proto__" } }]), []);
