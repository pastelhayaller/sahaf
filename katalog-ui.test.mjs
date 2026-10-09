import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as helpers from './ui-helpers.js';

const money = f => `${f} ₺`;
assert.deepEqual(helpers.kitapKunye({ yayinevi: 'İletişim', basim_yili: 1998, durum: 'İyi' }), ['İletişim', 1998, 'İyi']);
assert.deepEqual(helpers.kitapKunye({}), []);
for (const fiyat of [null, undefined, '']) assert.equal(helpers.kitapFiyatEtiketi({ fiyat }, money), 'Fiyat için sor');
assert.equal(helpers.kitapFiyatEtiketi({ fiyat: 0 }, money), '0 ₺');
const mixed = [{ ad: 'Bilinen', fiyat: 125 }, { ad: 'Boş', fiyat: '' }, { ad: 'Eksik', fiyat: null }];
assert.deepEqual(helpers.sepetOzeti(mixed), { toplam: 125, bilinen: 1, bilinmeyen: 2 });
const message = helpers.rezervasyonMetni(mixed, money);
assert.match(message, /Bilinen ara toplam: 125 ₺/);
assert.match(message, /2 kitabın fiyatını/);
assert.doesNotMatch(message, /Toplam:/);
assert.match(helpers.rezervasyonMetni([mixed[0]], money), /Toplam: 125 ₺/);
assert.doesNotMatch(helpers.rezervasyonMetni(mixed.slice(1), money), /toplam/i);

// Exercise the actual app functions with a small DOM/event surface; no database or network.
const elements = new Map();
class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.listeners = {}; this.dataset = {};
    this.hidden = false; this.disabled = false; this.textContent = ''; this.style = {};
    this.classList = { add: name => { this.className += ` ${name}`; } };
  }
  set innerHTML(value) {
    this.html = value;
    for (const [, id] of value.matchAll(/id="([^"]+)"/g)) elements.set(`#${id}`, new Element());
    if (value.includes('detay-gorsel')) elements.set('#detay-icerik .detay-gorsel', new Element());
  }
  get innerHTML() { return this.html || ''; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  appendChild(el) { this.children.push(el); el.parent = this; return el; }
  append(...els) { els.forEach(el => this.appendChild(el)); }
  replaceChildren(...els) { this.children = []; this.append(...els); }
  querySelector(selector) { return this.children.find(el => el.tagName === selector) || get(selector); }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  get firstChild() { return this.children[0]; }
  contains(el) { return this.children.includes(el); }
  focus() {}
  scrollIntoView() {}
  remove() { this.parent.children = this.parent.children.filter(el => el !== this); }
}
function get(selector) { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); }
const windowEvents = {};
let position = -1;
const entries = [];
const entryUrls = [];
const location = { search: '', href: 'http://localhost/' };
function setUrl(url) { if (url) { const u = new URL(url, location.href); location.href = u.href; location.search = u.search; } }
const history = {
  get state() { return entries[position]; },
  pushState(value, unused, url) { entries.splice(position + 1); entryUrls.splice(position + 1); entries.push(structuredClone(value)); setUrl(url); entryUrls.push(location.href); position++; },
  replaceState(value, unused, url) { if (position < 0) position = 0; entries[position] = structuredClone(value); setUrl(url); entryUrls[position] = location.href; },
};
const context = vm.createContext({
  ...helpers, console, history, URL, URLSearchParams,
  document: { querySelector: get, querySelectorAll: () => [], createElement: tag => new Element(tag), createDocumentFragment: () => new Element(), contains: () => false, addEventListener() {}, body: new Element('body') },
  window: { location, addEventListener: (name, fn) => { windowEvents[name] = fn; }, scrollTo() {}, open() {} },
  localStorage: { getItem: () => '[]', setItem() {} },
  db: { VARSAYILAN_SIRALAMA: 'yeni', normalize: s => (s || '').toLocaleLowerCase('tr'), durum: { yamaEksik: false } },
  setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
});
const source = (await readFile(new URL('app.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').split('(async function baslat()')[0];
vm.runInContext(source, context);
vm.runInContext('const gercekListeyiTazele = listeyiTazele; listeyiTazele = async () => {};', context);
const run = code => vm.runInContext(code, context);
async function step(delta) { position += delta; setUrl(entryUrls[position]); await windowEvents.popstate({ state: history.state }); }
run("koku('ara'); detayAc({ id: 'A', ad: 'A kitabı', fiyat: 25, foto_url: 'kapak.jpg' }, null);");
assert.equal(history.state.kitap.id, 'A');
assert.equal(get('#btn-detay-sepet').disabled, false);
run("sepeteEkle({ id: 'B', ad: 'B kitabı', fiyat: '' });");
assert.equal(get('#btn-detay-sepet').disabled, false, 'Başka kitap eklenince A düğmesi değişmemeli');
run('sepeteEkle(seciliKitap);');
assert.equal(get('#btn-detay-sepet').disabled, true);
assert.equal(get('#detay-sepet-sayi').textContent, 2);
run('sepetiAc();');
assert.equal(get('#sepet-toplam-etiket').textContent, 'Bilinen ara toplam');
assert.match(get('#sepet-fiyat-notu').textContent, /^1 kitabın/);
const cart = get('#sepet-kalemleri');
cart.children[1].children.at(-1).listeners.click();
assert.equal(get('#detay-sepet-sayi').textContent, 1);
await step(-1);
assert.equal(history.state.kitap.id, 'A');
assert.equal(get('#btn-detay-sepet').disabled, false, 'Sepetten çıkarılan kitap detayına dönünce eklenebilir olmalı');
const photo = get('#detay-icerik .detay-gorsel').children[0];
photo.listeners.click({ stopPropagation() {} });
assert.equal(history.state.buyut, true);
assert.equal(history.state.kitap.id, 'A');
await step(-1);
assert.equal(get('#foto-buyut').hidden, true);
assert.equal(history.state.ekran, 'detay');
await step(-1);
run("detayAc({ id: 'C', ad: 'C kitabı', fiyat: null }, null); sepetiAc();");
await step(-1); await step(-1); await step(1);
assert.equal(run('seciliKitap.id'), 'C', 'İleri geçmişi doğru kitap ayrıntısını geri yüklemeli');
assert.match(get('#detay-icerik').innerHTML, /C kitabı/);
run("detayAc({ id: 'D', ad: 'D kitabı', foto_url: 'bozuk.jpg' }, null);");
get('#detay-icerik .detay-gorsel').children[0].children[0].listeners.error();
assert.match(get('#detay-icerik .detay-gorsel').innerHTML, /yüklenemedi/);
const card = run("kartYap({ id: 'E', ad: 'E', foto_url: 'bozuk.jpg' })");
card.children[0].children[0].listeners.error();
assert.match(card.className, /no-cover/);
assert.equal(card.children[0].children.length, 0);
assert.equal(card.children[0].textContent, 'Kapak fotoğrafı yok');
card.children[0].listeners.click();
assert.equal(history.state.kitap.id, 'E', 'Kapak düğmesi ayrıntıyı açmalı');
const coverless = run("kartYap({ id: 'F', ad: 'Fotoğrafsız' })");
assert.equal(coverless.children[0].textContent, 'Kapak fotoğrafı yok');
await run("liste.sayfa = 4; liste.sirala = 'fiyat'; rotaAc(rotaOku('?bolum=arama&q=Çorum'));");
assert.equal(run('liste.terim'), 'Çorum');
assert.equal(run('liste.sayfa'), 1);
assert.equal(get('#arama').value, 'Çorum');
assert.equal(get('#siralama').value, 'yeni');
run("magazaVitriniYaz([{ id: 1, ad: 'Gerçek', foto_url: 'gercek.jpg' }]);");
assert.equal(get('#magaza-vitrini').hidden, true, 'Aramada promosyon gizlenmeli');
assert.equal(get('#katalog-baslik').textContent, 'Arama sonuçları');
await run("rotaAc(rotaOku());");
run("magazaVitriniYaz([{ id: 1, ad: 'Gerçek', foto_url: 'gercek.jpg' }, { id: 2, ad: 'Kapaksız' }]);");
assert.equal(get('#magaza-vitrini').hidden, false);
assert.equal(get('#vitrin-kapaklari').children.length, 1, 'Promosyon yalnız gerçek kapaklı kayıtları kullanmalı');
get('#vitrin-kapaklari').children[0].listeners.click();
assert.equal(history.state.kitap.id, 1);
get('#vitrin-kapaklari').children[0].children[0].listeners.error();
assert.equal(get('#vitrin-kapaklari').children.length, 0, 'Bozuk promosyon kapağı kaldırılmalı');
run("rotaUygula(rotaOku('?bolum=kitaplar')); magazaVitriniYaz([]);");
assert.equal(get('#magaza-vitrini').hidden, true);
assert.equal(get('#katalog-baslik').textContent, 'Tüm kitaplar');
run("rol = 'yonetici'; roluUygula();");
assert.equal(get('#btn-sepet').hidden, true);
assert.equal(get('#btn-ekle-ac').hidden, false);
const staffTerm = run('liste.terim');
await run("rotaAc(rotaOku('?bolum=arama&q=Çorum'));");
assert.equal(run('liste.terim'), staffTerm, 'Mağaza gezintisi personel filtresini etkilememeli');
const before = position;
run("detayAc({ id: 'X' }, null);");
assert.equal(position, before, 'Personel müşteri detayına açılmamalı');
console.log('Katalog: fiyat, sepet, history, detay, kapak hatası ve rol davranışları geçti.');

// URL routes remain distinct and preserve exact filters through detail/back/reload.
run("rol = 'ziyaretci';");
await run("rotaAc(rotaOku('?bolum=kitaplar'));");
assert.equal(run('liste.sirala'), 'ad');
const allUrl = location.href;
await run("rotaAc(rotaOku('?bolum=yeni-gelenler'));");
assert.equal(run('liste.sirala'), 'yeni');
assert.notEqual(location.href, allUrl);
await step(-1);
assert.equal(run('rota.bolum'), 'kitaplar');
assert.equal(get('#siralama').value, 'ad');
await run("rotaAc(rotaOku('?bolum=yazar&ad=Oğuz%20Atay&sira=fiyat_artan&sayfa=3'));");
run("detayAc({ id: 'exact-book', ad: 'Kitap' }, null); sepetiAc();");
await step(-1); await step(-1);
assert.equal(run('rota.deger'), 'Oğuz Atay');
assert.equal(run('liste.sayfa'), 3);
assert.equal(get('#siralama').value, 'fiyat_artan');
assert.deepEqual(helpers.rotaOku(new URL(location.href).search), structuredClone(run('rota')));
let calls = 0;
context.db.listele = async request => { calls++; return { kayitlar: [], toplam: 0, sayfa: request.sayfa, sayfaSayisi: 1 }; };
run('listeyiTazele = gercekListeyiTazele;');
await run("rotaAc(rotaOku('?bolum=kategori&ad=unknown'));");
assert.equal(calls, 0, 'Hazırlanan kategori tüm kitapları sorgulamamalı');
assert.equal(get('#sonuclar').hidden, true);
assert.match(get('#sayfa-mesaj').children[0].textContent, /bulunamadı/);
run("rol = 'yonetici'; roluUygula();");
assert.equal(get('#sonuclar').hidden, false);
assert.equal(get('#siralama').hidden, false);
assert.equal(get('#dizin-sonuclar').hidden, true);
run("rol = 'ziyaretci';");
let exactRequest;
context.db.listele = async request => { exactRequest = request; return { kayitlar: [], toplam: 0, sayfa: 1, sayfaSayisi: 1 }; };
await run("rotaAc(rotaOku('?bolum=yazar&ad=Oğuz%20Atay'));");
assert.equal(exactRequest.yazar, 'Oğuz Atay');
assert.equal(exactRequest.yayinevi, '');
let finishDirectory;
context.db.dizin = () => new Promise(resolve => { finishDirectory = resolve; });
const stale = run("rotaAc(rotaOku('?bolum=yazarlar'));");
await run("rotaAc(rotaOku('?bolum=kategori&ad=unknown'));");
finishDirectory([{ ad: 'Eski yanıt', adet: 1 }]);
await stale;
assert.equal(run('rota.bolum'), 'kategori');
assert.equal(get('#dizin-sonuclar').children.length, 0, 'Geç dizin yanıtı yeni rotayı değiştirmemeli');
context.db.dizin = async () => Array.from({ length: 220 }, (_, i) => ({ ad: `Yazar ${i}`, adet: 1 }));
await run("rotaAc(rotaOku('?bolum=yazarlar&sayfa=2'));");
assert.equal(get('#dizin-sonuclar').children.length, 100);
assert.match(get('#dizin-sonuclar').children[0].textContent, /Yazar 100/);
context.db.dizin = async () => { throw new Error('offline'); };
await run("rotaAc(rotaOku('?bolum=yayinevleri'));");
assert.equal(get('#sayfa-mesaj').children.at(-1).textContent, 'Yeniden dene');
const hashUrl = 'http://localhost/?bolum=yazarlar#magaza-bilgileri'; setUrl(hashUrl);
await run("rotaAc(rotaOku());");
assert.equal(new URL(location.href).hash, '');
assert.equal(run('rota.bolum'), 'ana');
console.log('Rotalar: A-Z/yeni ayrımı, exact filtre, history/reload, kategori, rol geçişi, dizin pagination/error/race geçti.');

assert.equal(helpers.rotaBasligi(helpers.rotaOku('?bolum=kategori&ad=constructor')), 'Kategori bulunamadı');

await run("rotaAc(rotaOku('?bolum=kategori&ad=roman'));");
assert.equal(exactRequest.kategori, 'roman');
assert.equal(get('#sonuclar').hidden, false);
assert.equal(get('#katalog-baslik').textContent, 'Roman');
run("kategoriKutulariniKur();");
assert.equal(get('#duz-kategori').children.length, Object.keys(helpers.KATEGORILER).length + 1);
run("rol = 'yonetici'; raflariTazele = async () => {}; kapakTaslaginiSifirla = () => {}; kuyrukSeridiniYaz = () => {}; duzenleAc({ id: 'cat-book', ad: 'Kitap', raf: 'A1', kategori: 'roman' });");
assert.equal(get('#duz-kategori').value, 'roman');
let saved;
context.db.guncelle = async (id, value) => { saved = { id, value }; };
run("history.back = () => {}; kapakUrlHazirla = async () => null;");
await get('#duzenle-form').listeners.submit({ preventDefault() {} });
assert.equal(saved.value.kategori, 'roman');
run("ekleAc();");
assert.equal(get('#ekle-kategori').value, '');
run("rol = 'ziyaretci'; detayAc({ id: 'r', ad: 'Roman', kategori: 'roman' }, null);");
assert.match(get('#detay-icerik').innerHTML, /<dt>Kategori<\/dt><dd>Roman<\/dd>/);

context.descriptionText = 'Birinci satır\n<script>alert(1)</script> & ikinci satır';
run("detayAc({ id: 'desc', ad: 'Kitap', aciklama: descriptionText, notlar: 'Kapakta çizik', durum: 'İyi' }, null);");
const detail = get('#detay-icerik').innerHTML;
assert.match(detail, /<h2>Kitap hakkında<\/h2>/);
assert.match(detail, /Birinci satır\n&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; ikinci satır/);
assert.doesNotMatch(detail, /<script>/);
assert.match(detail, /<h2>Bu nüsha<\/h2>/);
assert(detail.indexOf('Kapakta çizik') > detail.indexOf('Bu nüsha'));
run("detayAc({ id: 'empty-desc', ad: 'Kitap', aciklama: '   ' }, null);");
assert.doesNotMatch(get('#detay-icerik').innerHTML, /Kitap hakkında/);
run("rol = 'yonetici'; duzenleAc({ id: 'desc', ad: 'Kitap', raf: 'A1', aciklama: descriptionText });");
assert.equal(get('#duz-aciklama').value, context.descriptionText);
await get('#duzenle-form').listeners.submit({ preventDefault() {} });
assert.equal(saved.value.aciklama, context.descriptionText);
run('ekleAc();');
assert.equal(get('#ekle-aciklama').value, '');
console.log('Description detail escaping, multiline, separate copy notes and form roundtrip passed.');
