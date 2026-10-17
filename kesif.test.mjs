import assert from 'node:assert/strict';
import {KATEGORILER} from './kategori.js';
import {kategoriRehberi,ilgiliKitaplar} from './kesif.js';
import {kitapKesfi,kategoriRehberiHtml,kitapSayfasi} from './vitrin-uret.mjs';
for(const key of Object.keys(KATEGORILER)){const r=kategoriRehberi(key);assert(r[0].length>60);assert(r[1].every(k=>Object.hasOwn(KATEGORILER,k)&&k!==key));}
assert.equal(kategoriRehberi('__proto__'),null);
const k={id:'one',ad:'Asıl Kitap',yazar:'Yazar',kategori:'roman'};
const rows=[k,{...k,id:'copy',ad:'asıl kitap'},{id:'two',ad:'Başka <kitap>',yazar:'Yazar',kategori:'roman'},{id:'three',ad:'Üçüncü',yazar:'Diğer',kategori:'roman'}, {id:'bad',ad:'Yanlış',yazar:'Başka',kategori:'siir'}];
assert.deepEqual(ilgiliKitaplar(k,rows,'yazar').map(k=>k.id),['two']);
assert.deepEqual(ilgiliKitaplar(k,rows,'kategori',[rows[2]]).map(k=>k.id),['three']);
assert.deepEqual(ilgiliKitaplar({id:'blank'},rows,'yazar'),[]);
assert.deepEqual(ilgiliKitaplar({id:'blank'},rows,'kategori'),[]);
assert.equal(ilgiliKitaplar(k,Array.from({length:8},(_,i)=>({id:String(i),ad:'Başlık'+i,yazar:'Yazar'})),'yazar').length,4);
const records=rows.map(k=>({k,slug:k.id}));const html=kitapKesfi(k,records);
assert.match(html,/Aynı yazardan/);assert.match(html,/Aynı kategoriden/);assert.match(html,/Başka &lt;kitap&gt;/);assert(!html.includes('/one.html'));assert(!html.includes('/copy.html'));assert(!html.includes('/bad.html'));
assert.equal(html.split('/two.html').length-1,1);
assert.equal(kitapKesfi(k,[records[0]]),'');
const guide=kategoriRehberiHtml('roman',['roman','oyku']);assert(guide.includes('/oyku.html'));assert(!guide.includes('/edebiyat.html'));assert.equal(kategoriRehberiHtml('bad'), '');
const page=kitapSayfasi(k,'kept',records).html;assert.match(page,/class="kitap-kesfi"/);assert(page.includes('href="https://pastelhayaller.com/vitrin/kitap/kept.html"'));
console.log('Keşif: kategori rehberi, doğru eşleşme, öz/tekrar dışlama, sınır, kaçış ve geçerli bağlantılar geçti.');

assert.deepEqual(ilgiliKitaplar(k,[{...rows[2],id:'other-copy'},rows[3]],'kategori',[rows[2]]).map(k=>k.id),['three'],'Same title must not repeat across author/category sections');
