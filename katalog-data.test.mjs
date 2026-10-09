import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const rows = Array.from({ length: 1501 }, (_, i) => ({ id: i, ad: `Kitap ${i}`, yazar: i === 1500 ? 'Son Yazar' : `Yazar ${i % 7}`, yayinevi: i % 2 ? 'Bir Yayın' : 'İki Yayın', basim_yili: i % 2 ? 2020 : null }));
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
const source = (await readFile(new URL('db.js', import.meta.url), 'utf8')).replace(/import\s*\{[\s\S]*?\}\s*from '\.\/config.js';/, '').replace(/^export /gm, '');
const ctx = vm.createContext({ SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'public-test', ZIYARETCI_EPOSTA: '', ZIYARETCI_SIFRE: '', client, console });
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