// Vitrin üreticisinin kırılırsa satışı sessizce bozacak iki parçası:
// slug (çakışma = kitap sayfası birbirini ezer) ve kaçış (tırnaklı ad = bozuk HTML).
// Çalıştır: node vitrin-uret.test.mjs

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugla, slugHaritasi } from './vitrin-uret.mjs';

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
