// Vitrin üreticisinin kırılırsa satışı sessizce bozacak iki parçası:
// slug (çakışma = kitap sayfası birbirini ezer) ve kaçış (tırnaklı ad = bozuk HTML).
// Çalıştır: node vitrin-uret.test.mjs

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugla } from './vitrin-uret.mjs';

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
