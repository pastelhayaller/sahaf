import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { alimTeklifiDogrula, alimTeklifiGonder } from './db.js';
import { kitapSayfasi } from './vitrin-uret.mjs';

const files = ['gizlilik.html', 'cerez-politikasi.html', 'islem-rehberi.html', 'iletisim.html'];
const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const app = await read('index.html');
const generator = await read('vitrin-uret.mjs');
const generated = kitapSayfasi({ id: 'test1234', ad: 'Örnek kitap', yazar: 'Yazar', foto_url: null }, 'ornek-test1234').html;
for (const file of files) {
  const html = await read(file);
  assert(html.includes('href="https://pastelhayaller.com/' + file + '"'), file + ' canonical');
  assert(!html.includes('noindex'));
  assert(html.includes('/analiz.js?v=001'));
  assert(!html.includes('src="app.js'));
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert(html.includes('Piribaba Çamlığı, Bahçelievler Mah., Sanat Sk. No:18, 19200 Çorum Merkez/Çorum'));
  assert(html.includes('Pazartesi–Cumartesi 10:00–17:00 · Pazar kapalı'));
  for (const target of files) assert(html.includes('href="/' + target + '"'), file + ' shared footer link');
  assert(app.includes('href="/' + file + '"'));
  assert(generated.includes('href="/' + file + '"'));
  assert(generator.includes('/' + file + '</loc>'));
}
assert(!app.includes('id="teklif-onay"'));
assert(app.indexOf('class="ipucu teklif-bilgilendirme"') < app.indexOf('id="teklif-ad"'));
assert(!app.match(/id="alim-teklif-form"[^>]*novalidate/));

// Client and data-layer validation agree with the SQL field length constraints.
const valid = { ad_soyad: '  Ada Soyad  ', iletisim: ' 05361234567 ', kitap_aciklama: ' Üç kitap ' };
assert.deepEqual(alimTeklifiDogrula(valid), { ad_soyad: 'Ada Soyad', iletisim: '05361234567', kitap_aciklama: 'Üç kitap' });
for (const [field, min, max] of [['ad_soyad', 2, 120], ['iletisim', 5, 160], ['kitap_aciklama', 3, 3000]]) {
  for (const value of ['', '   ', 'a'.repeat(min - 1), 'a'.repeat(max + 1), 17]) {
    assert.throws(() => alimTeklifiDogrula({ ...valid, [field]: value }), /karakter olmalı/);
    await assert.rejects(alimTeklifiGonder({ ...valid, [field]: value }), /karakter olmalı/);
  }
  assert.equal(alimTeklifiDogrula({ ...valid, [field]: 'a'.repeat(max) })[field].length, max);
}
assert.equal([...alimTeklifiDogrula({ ...valid, ad_soyad: '😀'.repeat(120) }).ad_soyad].length, 120, 'Postgres char_length counts code points');

assert((await read('cerez-politikasi.html')).includes('180 gün'));
console.log('Bilgi sayfaları, canonical/footer/sitemap bağlantıları ve form veri sınırları geçti.');
