import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digerNushalar, kitapSayfasi } from './vitrin-uret.mjs';
const k={id:'copy0001-full',ad:'Bir kitap & <örnek>',yazar:'Ömer Seyfettin',fiyat:25};
const records=[{k,slug:'ilk-copy0001'},
 {k:{...k,id:'copy0002-full',yazar:' ömer seyfettin ',yayinevi:'A & B',basim_yili:1999,durum:'İyi',fiyat:0},slug:'ikinci-copy0002'},
 {k:{...k,id:'copy0003-full',ad:'Farklı kitap'},slug:'farkli-copy0003'},
 {k:{...k,id:'copy0004-full',yazar:'Farklı Yazar'},slug:'farkli-copy0004'},
 {k:{...k,id:'copy0002-full'},slug:'tekrar-copy0002'}];
const before=JSON.stringify(records),html=digerNushalar(k,records);
assert.equal([...html.matchAll(/<a /g)].length,1);
assert(html.includes('ikinci-copy0002.html'));assert(!html.includes('ilk-copy0001.html'));assert(!html.includes('tekrar-copy0002.html'));
assert(html.includes('A &amp; B')&&html.includes('1999 basımı')&&html.includes('İyi')&&html.includes('0 TL'));
assert(html.includes('&lt;örnek&gt;'));assert(!html.includes('<örnek>'));
assert.equal(JSON.stringify(records),before);
assert.equal(digerNushalar(k,[]),'');
for(const author of [null,'','Anonim','Yazar Belli Değil','Yazar bilinmiyor','Komisyon','Kolektif','?']) {
 const unknown={...k,yazar:author};assert.equal(digerNushalar(unknown,[{k:{...unknown,id:'copy0002'},slug:'diger'}]),'');
}
const missing=digerNushalar(k,[{k:{...k,id:'copy0005',fiyat:null},slug:'diger'}]);
assert(missing.includes('Ek bilgi için nüshanın sayfasını incele.')&&missing.includes('Fiyat için sor'));
const page=kitapSayfasi(k,'eski-url-copy0001',records);
const wa=new URL(page.html.match(/<a class="dugme" href="([^"]+)"/)[1]);
assert(wa.searchParams.get('text').includes('\n'+page.kanonik));
assert(wa.searchParams.get('text').includes('copy0001'));
assert(page.html.includes('Her kayıt tek bir nüshayı temsil eder.'));
assert(!page.html.includes('Her kitaptan tek nüsha var.'));
assert(kitapSayfasi(k,'eski-url-copy0001',[records[0],records[1]]).html.includes('Diğer nüshalar'),'Copies remain visible when there are no other recommended titles');
const root=dirname(fileURLToPath(import.meta.url));
// Optional release comparison; normal tests run in a standalone checkout.
const baseline=process.env.SEO_BASELINE_DIR;
let sections=0,links=0;
for(const f of (await readdir(join(root,'vitrin/kitap'))).filter(f=>f.endsWith('.html'))) {
 const old=baseline ? (await readFile(join(baseline,'vitrin/kitap',f),'utf8')).replace(/\r\n/g,'\n') : null;
 const current=(await readFile(join(root,'vitrin/kitap',f),'utf8')).replace(/\r\n/g,'\n');
 const b=JSON.parse(current.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 const canonical=current.match(/<link rel="canonical" href="([^"]+)"/)[1];
 const message=new URL(current.match(/<a class="dugme" href="([^"]+)"/)[1]).searchParams.get('text');
 assert(message.includes('\n'+canonical),f);assert(message.includes(String(b.identifier).slice(0,8)),f);
 const alt=current.match(/<section class="diger-nushalar kitap-kesfi">([\s\S]*?)<\/section>\n/);
 if(alt){
   sections++;const destinations=[...alt[1].matchAll(/<a[^>]+href="([^"]+)"/g)].map(m=>m[1]);links+=destinations.length;
   assert.equal(new Set(destinations).size,destinations.length,f);assert(!destinations.includes(canonical),f);
   for(const url of destinations) await access(join(root,decodeURI(new URL(url).pathname)));
 }
 if(old !== null) {
 let reversed=current.replace(/\n<p class="stok-notu">Nüsha kodu: [a-zA-Z0-9-]+<\/p>/,'')
  .replace(/<section class="diger-nushalar kitap-kesfi">[\s\S]*?<\/section>\n/,'')
  .replace('Her kayıt tek bir nüshayı temsil eder.','Her kitaptan tek nüsha var.')
  .replace(/<a class="dugme" href="[^"]+">/,()=>old.match(/<a class="dugme" href="[^"]+">/)[0]);
 assert.equal(reversed===old,true,`Unexpected unrelated change: ${f}`);
 }
}
console.log(`PASS: exact copy grouping, unknown authors, escaping, no mutation, zero/missing price, unique WhatsApp; ${sections} copy sections / ${links} links; ${baseline ? 'baseline comparison: every unrelated byte preserved' : 'standalone checks complete'}.`);
