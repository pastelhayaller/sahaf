import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { katalogSayfalari, katalogGezinmesi, siteHaritasi } from './vitrin-uret.mjs';
const root = dirname(fileURLToPath(import.meta.url)), site = 'https://pastelhayaller.com';
const sample = count => Array.from({length:count},(_,i)=>({slug:`ornek-${i}`,k:{id:`id-${i}`,ad:`Kitap ${i} & <örnek>`,yazar:'Yazar',foto_url:i>=96?'https://example.test/cover.jpg':null,kategori:'roman'}}));
for(const count of [0,1,96,97,192,193]) {
  const pages=katalogSayfalari(sample(count)), seen=[];
  assert.equal(pages.length,Math.max(1,Math.ceil(count/96)));
  for(const [ix,page] of pages.entries()) {
    assert(page.html.includes(`<link rel="canonical" href="${page.kanonik}">`));
    assert(page.html.includes(`<meta property="og:url" content="${page.kanonik}">`));
    const cards=[...page.html.matchAll(/<a class="kart" href="([^"]+)"/g)].map(m=>m[1]);
    assert(cards.length<=96); seen.push(...cards); assert(!page.html.includes('<örnek>'));
    if(pages.length>1) {
      assert(page.html.includes(`aria-current="page" aria-label="Sayfa ${ix+1}"`));
      assert.equal(page.html.includes('rel="prev"'),ix>0);
      assert.equal(page.html.includes('rel="next"'),ix<pages.length-1);
    }
  }
  assert.equal(seen.length,count); assert.equal(new Set(seen).size,count);
  if(count>96) assert.equal(seen[0],`${site}/vitrin/kitap/ornek-96.html`,'Cover-first sort must precede slicing');
}
assert.equal(katalogGezinmesi(1,1),'');
const middle=katalogGezinmesi(18,36);
assert(middle.includes('/sayfa/17.html')&&middle.includes('/sayfa/19.html')&&middle.includes('…')&&middle.includes('/sayfa/36.html'));
const xml=siteHaritasi([site+'/',site+'/',site+'/?a=1&b=2']);
assert.equal([...xml.matchAll(/<loc>/g)].length,2); assert(xml.includes('&amp;')); assert(!xml.includes('lastmod'));
const files=['vitrin/index.html',...(await readdir(join(root,'vitrin/sayfa'))).map(f=>'vitrin/sayfa/'+f)];
const actualBooks=(await readdir(join(root,'vitrin/kitap'))).filter(f=>f.endsWith('.html')).map(f=>site+'/vitrin/kitap/'+f).sort();
const listed=[],sitemap=await readFile(join(root,'sitemap.xml'),'utf8');
for(const file of files) {
  const html=await readFile(join(root,file),'utf8'),url=site+'/'+(file==='vitrin/index.html'?'vitrin/':file);
  assert(html.includes(`<link rel="canonical" href="${url}">`)); assert(sitemap.includes(`<loc>${url}</loc>`));
  const cards=[...html.matchAll(/<a class="kart" href="([^"]+)"/g)].map(m=>m[1]); assert(cards.length<=96);listed.push(...cards);
  for(const m of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
    const u=new URL(m[1],site);if(u.origin!==site)continue;
    await access(join(root,decodeURI(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname)));
  }
}
assert.deepEqual(listed.sort(),actualBooks,'Every existing book appears exactly once');assert(!sitemap.includes('<lastmod>'));
console.log(`PASS: boundaries, ordering, escaping, navigation, canonical, sitemap and links; ${actualBooks.length} books / ${files.length} pages.`);
