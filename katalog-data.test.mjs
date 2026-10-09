import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { kategoriGecerli, KATEGORILER } from './kategori.js';

const rows = Array.from({ length: 1501 }, (_, i) => ({ id: i, ad: `Kitap ${i}`, yazar: i === 1500 ? 'Son Yazar' : `Yazar ${i % 7}`, yayinevi: i % 2 ? 'Bir Yayın' : 'İki Yayın', basim_yili: i % 2 ? 2020 : null, kategori: i % 3 ? 'roman' : null }));
rows[0].yazar = '  ';
rows[1].yazar = null;
rows[2].yazar = "O'Connor, A & B";
let requests = [], fail = false;
const client = {
  from(table) {
    assert.equal(table, 'kitaplar');
    const filters = [];
    let columns;
    const q = {
      select(value) { columns = value; return q; },
      order() { return q; },
      eq(column, value) { filters.push({ column, value, op: 'eq' }); return q; },
      not(column, op, value) { assert.equal(op, 'is'); assert.equal(value, null); filters.push({ column, op: 'notnull' }); return q; },
      ilike(column, value) { filters.push({ column, value, op: 'ilike' }); return q; },
      async range(start, end) {
        requests.push({ start, end, columns, filters: structuredClone(filters) });
        if (fail) return { error: { message: 'NetworkError' } };
        const filtered = rows.filter(row => filters.every(f => f.op === 'eq' ? row[f.column] === f.value : f.op === 'notnull' ? row[f.column] != null : true));
        // Server cap is deliberately smaller than the requested 500 rows.
        return { data: filtered.slice(start, Math.min(end + 1, start + 200)), count: filtered.length, error: null };
      },
    };
    return q;
  },
};
const source = (await readFile(new URL('db.js', import.meta.url), 'utf8')).replace(/import\s*\{[\s\S]*?\}\s*from '\.\/config.js';/, '').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const ctx = vm.createContext({ SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'public-test', ZIYARETCI_EPOSTA: '', ZIYARETCI_SIFRE: '', client, console, kategoriGecerli });
vm.runInContext(source, ctx);
vm.runInContext('_sb = client;', ctx);
const run = code => vm.runInContext(code, ctx);
const authors = await run("dizin('yazar')");
assert(authors.some(k => k.ad === 'Son Yazar'), '1000. satırdan sonraki isim dizinde bulunmalı');
assert(!authors.some(k => !k.ad.trim()));
assert.equal(authors.reduce((sum, k) => sum + k.adet, 0), 1499);
assert.equal(requests.length, 8);
assert.equal(requests.at(-1).start, 1400);
assert(requests.every(r => r.columns === 'id,yazar'));
const cachedCount = requests.length;
await run("dizin('yazar')");
assert.equal(requests.length, cachedCount, 'Dizin sayfalaması aynı tam veriyi yeniden indirmemeli');
await assert.rejects(run("dizin('raf')"), /Geçersiz dizin/);
fail = true;
await assert.rejects(run("dizin('yayinevi')"), /bağlanılamadı/);
fail = false;
const publishers = await run("dizin('yayinevi')");
assert.equal(publishers.reduce((sum, k) => sum + k.adet, 0), 1501, 'Hatalı istek önbellekten temizlenip tekrar denenmeli');
requests = [];
const selected = await run(`listele({ yazar: "O'Connor, A & B", sayfa: 99, sirala: 'ad' })`);
assert.equal(selected.toplam, 1);
assert.equal(selected.sayfa, 1);
assert.equal(selected.kayitlar[0].id, 2);
assert.equal(requests.length, 2, 'Aralık dışı sayfa birinci sayfaya dönmeli');
assert(requests.every(r => r.filters.some(f => f.column === 'yazar' && f.value === "O'Connor, A & B" && f.op === 'eq')));
requests = [];
const filtered = await run("listele({ yayinevi: 'Bir Yayın', basimVar: true, sirala: 'basim', sayfa: 2 })");
assert(filtered.kayitlar.every(k => k.yayinevi === 'Bir Yayın' && k.basim_yili != null));
assert.equal(requests[0].start, 20);
assert.equal(requests[0].end, 39);
assert.equal(filtered.toplam, 750);
console.log('Veri: 1501 kayıt, düşük API cap, tam dizin, exact filter/count/clamp ve hata tekrar denemesi geçti.');
requests = [];
const category = await run("listele({ kategori: 'roman', sayfa: 2 })");
assert.equal(category.toplam, 1000);
assert.equal(category.kayitlar.length, 20);
assert(category.kayitlar.every(k => k.kategori === 'roman'));
assert.equal(requests[0].start, 20);
assert(requests[0].filters.some(f => f.column === 'kategori' && f.value === 'roman'));
const priorRequests = requests.length;
for (const kategori of ['', 'unknown', '__proto__', 'constructor']) {
  const result = await run(`listele({ kategori: ${JSON.stringify(kategori)} })`);
  assert.equal(result.toplam, 0);
}
assert.equal(requests.length, priorRequests, 'Invalid category must not query all books');
assert.equal(run("kayitTemizle({ kategori: 'roman' }).kategori"), 'roman');
assert.equal(run("kayitTemizle({ kategori: '' }).kategori"), null);
assert.equal(run("Object.hasOwn(kayitTemizle({ ad: 'Legacy caller' }), 'kategori')"), false, 'Omitted category must preserve current category in update');
assert.throws(() => run("kayitTemizle({ kategori: '__proto__' })"), /Geçersiz kategori/);
const migration = await readFile(new URL('supabase/yama-008-kategoriler.sql', import.meta.url), 'utf8');
assert.deepEqual([...migration.matchAll(/'([a-z-]+)'/g)].map(m => m[1]).sort(), Object.keys(KATEGORILER).sort());
console.log('Kategori: exact count/paging, invalid filter, omitted-field preservation, whitelist/schema parity passed.');

// Exercise the local path and edit/undo against actual stored rows.
let localRows = Array.from({ length: 24 }, (_, i) => ({ id: `local-${i}`, ad: `Kitap ${i}`, raf: 'A1', kategori: i < 23 ? 'roman' : null, durum: 'İyi', yayinevi: 'Yayın', basim_yili: 2020, foto_url: 'cover.jpg' }));
const local = vm.createContext({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '', ZIYARETCI_EPOSTA: '', ZIYARETCI_SIFRE: '', console, kategoriGecerli,
  localStorage: { getItem: () => JSON.stringify(localRows), setItem: (key, value) => { localRows = JSON.parse(value); } } });
vm.runInContext(source, local);
const localRun = code => vm.runInContext(code, local);
const localPage = await localRun("listele({ kategori: 'roman', sayfa: 2 })");
assert.equal(localPage.toplam, 23); assert.equal(localPage.kayitlar.length, 3);
const complete = localRows[0];
local.savedBook = structuredClone(complete);
await localRun("guncelle(savedBook.id, { ad: savedBook.ad, raf: savedBook.raf })");
assert.equal(localRows[0].kategori, 'roman', 'Legacy edit without category must preserve stored category');
await localRun("sil(savedBook.id); geriKoy(savedBook);");
assert.equal(localRows.find(k => k.id === complete.id).kategori, 'roman', 'Undo preserves category');
const missing = await localRun('eksikKuyrugu()');
assert.equal(missing.length, 1); assert.equal(missing[0].id, 'local-23');
const html = await readFile(new URL('index.html', import.meta.url), 'utf8');
const menuSlugs = [...html.matchAll(/href="\?bolum=kategori&amp;ad=([a-z-]+)"/g)].map(m => m[1]);
assert.deepEqual([...new Set(menuSlugs)].sort(), Object.keys(KATEGORILER).sort(), 'All categories reachable from menu');
console.log('Local category filter/edit/undo/queue and menu coverage passed.');

// Description is optional, typed, bounded and preserved by legacy edit/undo.
for (const invalid of [17, {}, [], true]) {
  ctx.badDescription = invalid;
  assert.throws(() => run('kayitTemizle({ aciklama: badDescription })'), /metin olmalı/);
}
assert.equal(run("kayitTemizle({ aciklama: '  Satır 1\\nSatır 2  ' }).aciklama"), 'Satır 1\nSatır 2');
assert.equal(run("kayitTemizle({ aciklama: '   ' }).aciklama"), null);
assert.equal(run("kayitTemizle({ aciklama: null }).aciklama"), null);
assert.equal(run("Object.hasOwn(kayitTemizle({}), 'aciklama')"), false);
assert.equal(run("kayitTemizle({ aciklama: 'ş'.repeat(3000) }).aciklama.length"), 3000);
assert.throws(() => run("kayitTemizle({ aciklama: 'ş'.repeat(3001) })"), /3000/);
assert.equal(run("kayitTemizle({ aciklama: '📚'.repeat(1500) }).aciklama.length"), 3000);
assert.throws(() => run("kayitTemizle({ aciklama: '📚'.repeat(1501) })"), /3000/);
await localRun("guncelle(savedBook.id, { ...savedBook, aciklama: 'Doğrulanmış konu.\\nİkinci satır.' })");
local.savedDescription = structuredClone(localRows.find(k => k.id === complete.id));
await localRun("guncelle(savedBook.id, { ...savedBook })");
assert.equal(localRows.find(k => k.id === complete.id).aciklama, local.savedDescription.aciklama);
await localRun("sil(savedBook.id); geriKoy(savedDescription);");
assert.equal(localRows.find(k => k.id === complete.id).aciklama, local.savedDescription.aciklama);
assert.equal((await localRun('eksikKuyrugu()')).length, 1, 'Missing description must not add every book to queue');
assert.match(await readFile(new URL('supabase/yama-009-kitap-aciklamasi.sql', import.meta.url), 'utf8'), /char_length\(aciklama\) <= 3000/);
console.log('Description type/limit/trim/omission/undo/optional-queue checks passed.');
