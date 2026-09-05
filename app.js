import * as db from './db.js';

const $ = (s) => document.querySelector(s);
const ekranlar = ['giris', 'ara', 'ekle', 'duzenle', 'sepet', 'alim-teklif', 'teklifler'];
let seciliKitap = null;
let sonSilinen = null;
let bildirimZaman = null;
let bildirimSayac = null;
const SEPET_ANAHTAR = 'pastelhayaller_ziyaretci_sepeti';
const WHATSAPP_NUMARASI = '905369782758';
let sepet = sepetOku();
const fotoTaslak = { ekle: { dosya: null, url: null }, duz: { dosya: null, url: null } };
const KAPAK_HATA_SECICILERI = { ekle: '#ekle-hata', duz: '#duzenle-hata' };
let teklifFotograflari = [];

// Liste durumu tek yerde: arama, sıralama ve sayfa birbirine bağlı.
// Terim ya da sıralama değişince sayfa 1'e döner — 7. sayfada arama yapıp
// boş liste görmek en sık rastlanan sayfalama hatası.
const liste = { terim: '', sirala: db.VARSAYILAN_SIRALAMA, sayfa: 1 };

// 'yonetici' (baba + eş) veya 'ziyaretci'. Ziyaretçi sadece görür.
// Bu değişken arayüzü şekillendirir; asıl kilit Supabase'deki RLS'tir.
let rol = 'ziyaretci';
const yoneticiMi = () => rol === 'yonetici';

function ekranCiz(ad) {
  ekranlar.forEach(e => { $('#ekran-' + e).hidden = (e !== ad); });
  window.scrollTo(0, 0);
}

// --- Gezinme -------------------------------------------------------------
// Her ekran ve onay penceresi bir tarayici gecmisi girdisidir; boylece
// telefonun geri tusu siteden cikmak yerine bir adim geri alir.
function durumUygula(d) {
  ekranCiz(d.ekran);
  $('#onay').hidden = !d.onay;
}

function git(ekran) {
  const d = { ekran, onay: false };
  history.pushState(d, '');
  durumUygula(d);
}

// Gecmise yeni girdi eklemeden ekran degistirir (acilis, giris, cikis).
function koku(ekran) {
  const d = { ekran, onay: false };
  history.replaceState(d, '');
  durumUygula(d);
}

window.addEventListener('popstate', async (ev) => {
  const d = ev.state || { ekran: 'ara', onay: false };
  if (d.ekran !== 'alim-teklif' && teklifFotograflari.length) teklifFotograflariTemizle();
  durumUygula(d);
  if (d.ekran === 'ara' && !d.onay) await listeyiTazele();
});

function paraYaz(f) {
  if (f == null || f === '') return '';
  return Number(f).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}

function sepetOku() {
  try { return JSON.parse(localStorage.getItem(SEPET_ANAHTAR) || '[]'); }
  catch { return []; }
}
function sepetKaydet() { localStorage.setItem(SEPET_ANAHTAR, JSON.stringify(sepet)); }
function sepetRozetiniYaz() { $('#sepet-sayi').textContent = sepet.length; }

function bildir(metin, geriAlFn) {
  clearTimeout(bildirimZaman);
  clearInterval(bildirimSayac);
  $('#bildirim-metin').textContent = metin;
  const btn = $('#bildirim-geri');
  btn.hidden = !geriAlFn;
  btn.onclick = geriAlFn ? () => { bildirimKapat(); geriAlFn(); } : null;
  $('#bildirim').hidden = false;

  if (!geriAlFn) {
    bildirimZaman = setTimeout(bildirimKapat, 2200);
    return;
  }
  // Geri alma penceresi sayili gorunur: "Geri al (15sn)"
  let kalan = 15;
  btn.textContent = `Geri al (${kalan}sn)`;
  bildirimSayac = setInterval(() => {
    kalan -= 1;
    if (kalan <= 0) bildirimKapat();
    else btn.textContent = `Geri al (${kalan}sn)`;
  }, 1000);
}

function bildirimKapat() {
  clearTimeout(bildirimZaman);
  clearInterval(bildirimSayac);
  $('#bildirim').hidden = true;
}

function hataGoster(secici, e) {
  const el = $(secici);
  el.textContent = (e && e.message) || 'Bir şeyler ters gitti.';
  el.hidden = false;
}
function hataGizle(secici) { $(secici).hidden = true; }

// --- Sonuç listesi ------------------------------------------------------
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function kartIci(k) {
  return `
    ${k.foto_url ? `<img class="kart-kapak" src="${escapeHtml(k.foto_url)}" alt="${escapeHtml(k.ad)} kapağı">` : '<span class="kart-kapak yok" aria-hidden="true">☷</span>'}
    <span class="raf-rozet"><span class="raf-etiket">RAF</span>${escapeHtml(k.raf)}</span>
    <span class="kart-orta">
      <span class="kart-ad">${escapeHtml(k.ad)}</span>
      ${k.yazar ? `<span class="kart-yazar">${escapeHtml(k.yazar)}</span>` : ''}
    </span>
    <span class="kart-fiyat">${paraYaz(k.fiyat)}</span>`;
}

function kartYap(k) {
  // Ziyaretçide kart tıklanabilir bir düğme değil: düzenleme ekranı hiç açılmaz.
  // Sunucu zaten reddederdi; kapıyı da göstermemek yanlış beklenti yaratmıyor.
  const el = document.createElement(yoneticiMi() ? 'button' : 'div');
  el.className = 'kart' + (yoneticiMi() ? '' : ' salt-okunur');
  el.innerHTML = kartIci(k);
  if (yoneticiMi()) {
    el.type = 'button';
    el.addEventListener('click', () => duzenleAc(k));
  } else {
    const ekle = document.createElement('button');
    ekle.className = 'sepet-ekle';
    ekle.type = 'button';
    ekle.textContent = sepet.some(x => x.id === k.id) ? 'Sepette' : 'Sepete ekle';
    ekle.disabled = sepet.some(x => x.id === k.id);
    ekle.addEventListener('click', () => sepeteEkle(k));
    el.appendChild(ekle);
  }
  return el;
}

function sepeteEkle(k) {
  if (sepet.some(x => x.id === k.id)) return;
  sepet.push({ id: k.id, ad: k.ad, yazar: k.yazar, fiyat: k.fiyat, raf: k.raf, foto_url: k.foto_url || null });
  sepetKaydet(); sepetRozetiniYaz();
  bildir(`✓ «${k.ad}» sepete eklendi`);
  listeyiTazele();
}

function sepetiCiz() {
  const kap = $('#sepet-kalemleri');
  kap.replaceChildren();
  $('#sepet-bos').hidden = sepet.length !== 0;
  $('#sepet-ozet').hidden = sepet.length === 0;
  $('#btn-whatsapp').hidden = sepet.length === 0;
  const toplam = sepet.reduce((t, k) => t + (Number(k.fiyat) || 0), 0);
  $('#sepet-toplam').textContent = paraYaz(toplam);
  sepet.forEach(k => {
    const el = document.createElement('div'); el.className = 'sepet-kalem';
    el.innerHTML = `${k.foto_url ? `<img class="sepet-kapak" src="${escapeHtml(k.foto_url)}" alt="">` : ''}
      <span class="kart-orta"><span class="kart-ad">${escapeHtml(k.ad)}</span>${k.yazar ? `<span class="kart-yazar">${escapeHtml(k.yazar)}</span>` : ''}<span class="sepet-raf">Raf ${escapeHtml(k.raf)}</span></span>
      <span class="kart-fiyat">${paraYaz(k.fiyat)}</span>`;
    const sil = document.createElement('button'); sil.className = 'btn sade kucuk'; sil.type = 'button'; sil.textContent = 'Çıkar';
    sil.addEventListener('click', () => { sepet = sepet.filter(x => x.id !== k.id); sepetKaydet(); sepetRozetiniYaz(); sepetiCiz(); });
    el.appendChild(sil); kap.appendChild(el);
  });
}

function sepetiAc() { sepetiCiz(); git('sepet'); }

function whatsappRezervasyon() {
  const satirlar = sepet.map(k => `• ${k.ad}${k.yazar ? ` — ${k.yazar}` : ''}${k.fiyat == null ? '' : ` (${paraYaz(k.fiyat)})`}`);
  const toplam = sepet.reduce((t, k) => t + (Number(k.fiyat) || 0), 0);
  const mesaj = `Merhaba, aşağıdaki kitaplar için rezervasyon talep ediyorum:\n\n${satirlar.join('\n')}\n\nToplam: ${paraYaz(toplam)}\nStok durumunu teyit edebilir misiniz?`;
  window.open(`https://wa.me/${WHATSAPP_NUMARASI}?text=${encodeURIComponent(mesaj)}`, '_blank', 'noopener');
}

// --- Dükkâna kitap satmak isteyen ziyaretçi ----------------------------
function alimTeklifAc() {
  if (yoneticiMi()) return;
  hataGizle('#alim-teklif-hata');
  $('#alim-teklif-form').reset();
  teklifFotograflariTemizle();
  git('alim-teklif');
}

function fotoBoyutuYaz(byte) {
  if (byte < 1024 * 1024) return `${Math.ceil(byte / 1024)} KB`;
  return `${(byte / (1024 * 1024)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
}

function teklifFotoDurumuYaz() {
  const n = teklifFotograflari.length;
  const toplam = teklifFotograflari.reduce((byte, fotograf) => byte + fotograf.dosya.size, 0);
  $('#teklif-foto-durum').textContent = n
    ? `${n} fotoğraf seçildi (${fotoBoyutuYaz(toplam)}). Gönderdikten sonra yalnız personel görebilir.`
    : `En fazla ${db.TEKLIF_FOTO_SINIRI} fotoğraf; gönderilmeden önce küçültülür.`;
}

function teklifFotoOnizlemeleriYaz() {
  const kap = $('#teklif-foto-onizlemeler');
  kap.replaceChildren();
  teklifFotograflari.forEach(fotograf => {
    const kart = document.createElement('article');
    kart.className = 'teklif-foto-onizleme';

    const img = document.createElement('img');
    img.src = fotograf.url;
    img.alt = `${fotograf.dosya.name} önizlemesi`;

    const bilgi = document.createElement('span');
    bilgi.className = 'teklif-foto-bilgi';
    bilgi.textContent = `${fotograf.dosya.name} · ${fotoBoyutuYaz(fotograf.dosya.size)}`;

    const kaldir = document.createElement('button');
    kaldir.className = 'teklif-foto-kaldir';
    kaldir.type = 'button';
    kaldir.textContent = '×';
    kaldir.setAttribute('aria-label', `${fotograf.dosya.name} fotoğrafını kaldır`);
    kaldir.addEventListener('click', () => {
      const sira = teklifFotograflari.indexOf(fotograf);
      if (sira < 0) return;
      URL.revokeObjectURL(teklifFotograflari[sira].url);
      teklifFotograflari.splice(sira, 1);
      teklifFotoOnizlemeleriYaz();
      teklifFotoDurumuYaz();
    });

    kart.append(img, bilgi, kaldir);
    kap.appendChild(kart);
  });
}

function teklifFotograflariTemizle() {
  teklifFotograflari.forEach(fotograf => URL.revokeObjectURL(fotograf.url));
  teklifFotograflari = [];
  $('#teklif-fotolar').value = '';
  $('#teklif-foto-onizlemeler').replaceChildren();
  teklifFotoDurumuYaz();
}

function teklifFotograflariEkle(dosyalar) {
  const mevcut = new Set(teklifFotograflari.map(fotograf => `${fotograf.dosya.name}\u0000${fotograf.dosya.size}`));
  const yeni = Array.from(dosyalar || []).filter(dosya => {
    const kimlik = `${dosya.name}\u0000${dosya.size}`;
    if (mevcut.has(kimlik)) return false;
    mevcut.add(kimlik);
    return true;
  });
  const bosYer = db.TEKLIF_FOTO_SINIRI - teklifFotograflari.length;
  const eklenecek = yeni.slice(0, Math.max(0, bosYer));
  eklenecek.forEach(dosya => teklifFotograflari.push({ dosya, url: URL.createObjectURL(dosya) }));
  $('#teklif-fotolar').value = '';
  teklifFotoOnizlemeleriYaz();
  teklifFotoDurumuYaz();
  if (yeni.length > eklenecek.length) {
    hataGoster('#alim-teklif-hata', new Error(`Bir teklife en fazla ${db.TEKLIF_FOTO_SINIRI} fotoğraf eklenebilir.`));
  }
}

const DURUM_ETIKETI = {
  yeni: 'Yeni', inceleniyor: 'İnceleniyor', teklif_verildi: 'Fiyat verildi', anlasildi: 'Anlaşıldı', uygun_degil: 'Uygun değil',
};

async function teklifleriYenile() {
  const kap = $('#teklifler-listesi');
  kap.replaceChildren();
  try {
    const teklifler = await db.alimTeklifleriniListele();
    $('#teklifler-durum').textContent = teklifler.length ? `${teklifler.length} alım teklifi` : 'Henüz alım teklifi yok.';
    teklifler.forEach(t => {
      const el = document.createElement('article'); el.className = 'teklif-kart';
      const tarih = new Date(t.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
      el.innerHTML = `<div class="teklif-baslik"><strong>${escapeHtml(t.ad_soyad)}</strong><span>${escapeHtml(t.iletisim)}</span></div>
        <p>${escapeHtml(t.kitap_aciklama)}</p><small>${tarih}</small>`;
      if (t.foto_urlari.length) {
        const fotograflar = document.createElement('div'); fotograflar.className = 'teklif-fotolar';
        t.foto_urlari.forEach(url => { const img = document.createElement('img'); img.src = url; img.alt = 'Gönderilen kitap fotoğrafı'; fotograflar.appendChild(img); });
        el.appendChild(fotograflar);
      }
      const sec = document.createElement('select'); sec.className = 'teklif-durum-sec';
      Object.entries(DURUM_ETIKETI).forEach(([anahtar, etiket]) => { const o = document.createElement('option'); o.value = anahtar; o.textContent = etiket; o.selected = anahtar === t.durum; sec.appendChild(o); });
      sec.addEventListener('change', async () => { try { await db.alimTeklifiDurumGuncelle(t.id, sec.value); bildir('✓ Teklif durumu güncellendi'); } catch (e) { bildir(e.message); sec.value = t.durum; } });
      el.appendChild(sec); kap.appendChild(el);
    });
  } catch (e) { $('#teklifler-durum').textContent = e.message; }
}

async function teklifleriAc() { if (!yoneticiMi()) return; git('teklifler'); await teklifleriYenile(); }

function listeYaz(sonuc, terimVarMi) {
  const kap = $('#sonuclar');
  kap.replaceChildren();
  $('#bos-sonuc').hidden = true;

  if (!sonuc.kayitlar.length) {
    if (terimVarMi) $('#bos-sonuc').hidden = false;
    $('#ara-durum').textContent = terimVarMi ? '' : 'Henüz kitap eklenmemiş.';
    sayfalamaYaz(sonuc);
    return;
  }

  sonuc.kayitlar.forEach(k => kap.appendChild(kartYap(k)));

  const kaynak = terimVarMi
    ? `${sonuc.toplam} kitap bulundu`
    : `${sonuc.toplam} kitap`;
  $('#ara-durum').textContent = sonuc.sayfaSayisi > 1
    ? `${kaynak} · sayfa ${sonuc.sayfa}/${sonuc.sayfaSayisi}`
    : kaynak;

  sayfalamaYaz(sonuc);
}

// --- Sayfalama ----------------------------------------------------------
// 1 2 3 … düz sayfa numaraları. Çok sayfa olduğunda baş/son + mevcudun
// komşuları gösterilir, arası "…" ile atlanır — telefonda tek satırda kalsın.
function sayfaNumaralari(mevcut, toplam) {
  if (toplam <= 7) return Array.from({ length: toplam }, (_, i) => i + 1);
  const set = new Set([1, toplam, mevcut, mevcut - 1, mevcut + 1]);
  if (mevcut <= 3) { set.add(2); set.add(3); set.add(4); }
  if (mevcut >= toplam - 2) { set.add(toplam - 1); set.add(toplam - 2); set.add(toplam - 3); }
  const sayfalar = [...set].filter(n => n >= 1 && n <= toplam).sort((a, b) => a - b);
  const cikti = [];
  sayfalar.forEach((n, i) => {
    if (i > 0 && n - sayfalar[i - 1] > 1) cikti.push(null); // "…"
    cikti.push(n);
  });
  return cikti;
}

function sayfalamaYaz(sonuc) {
  const nav = $('#sayfalama');
  nav.replaceChildren();
  nav.hidden = sonuc.sayfaSayisi <= 1;
  if (nav.hidden) return;

  const dugme = (etiket, hedef, sinif) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sayfa-btn' + (sinif ? ' ' + sinif : '');
    b.textContent = etiket;
    if (hedef == null) {
      b.disabled = true;
    } else {
      if (hedef === sonuc.sayfa) {
        b.classList.add('aktif');
        b.setAttribute('aria-current', 'page');
      }
      b.addEventListener('click', () => sayfayaGit(hedef));
    }
    return b;
  };

  nav.appendChild(dugme('‹', sonuc.sayfa > 1 ? sonuc.sayfa - 1 : null, 'ok'));
  sayfaNumaralari(sonuc.sayfa, sonuc.sayfaSayisi).forEach(n => {
    if (n === null) {
      const s = document.createElement('span');
      s.className = 'sayfa-bosluk';
      s.textContent = '…';
      nav.appendChild(s);
    } else {
      nav.appendChild(dugme(String(n), n));
    }
  });
  nav.appendChild(dugme('›', sonuc.sayfa < sonuc.sayfaSayisi ? sonuc.sayfa + 1 : null, 'ok'));
}

async function sayfayaGit(no) {
  liste.sayfa = no;
  await listeyiTazele();
  // Sayfa değişince listenin başına dön: kullanıcı 20. kitabın hizasında kalmasın.
  $('#ekran-ara').scrollIntoView({ block: 'start', behavior: 'auto' });
}

// --- Listeyi tazele -----------------------------------------------------
// Eşzamanlı istekleri numaralandırıyoruz: hızlı yazarken geç dönen eski bir
// cevap, yeni sonucun üstüne yazmasın.
let istekSayaci = 0;
async function listeyiTazele() {
  const benim = ++istekSayaci;
  try {
    const sonuc = await db.listele(liste);
    if (benim !== istekSayaci) return;
    liste.sayfa = sonuc.sayfa; // db aralık dışına düşen sayfayı geri çekmiş olabilir
    listeYaz(sonuc, !!liste.terim);
  } catch (e) {
    if (benim !== istekSayaci) return;
    $('#ara-durum').textContent = e.message;
    $('#sayfalama').hidden = true;
  }
}

// --- Sıralama kutusu ----------------------------------------------------
function siralamaKutusunuKur() {
  const sec = $('#siralama');
  sec.replaceChildren();
  Object.entries(db.SIRALAMALAR).forEach(([anahtar, s]) => {
    const o = document.createElement('option');
    o.value = anahtar;
    o.textContent = s.etiket;
    sec.appendChild(o);
  });
  sec.value = liste.sirala;
  sec.addEventListener('change', async () => {
    liste.sirala = sec.value;
    liste.sayfa = 1;
    await listeyiTazele();
  });
}

// --- Raf önerileri ------------------------------------------------------
async function raflariTazele() {
  try {
    const raflar = await db.raflar();
    const dl = $('#raf-listesi');
    dl.replaceChildren();
    raflar.forEach(r => {
      const o = document.createElement('option');
      o.value = r;
      dl.appendChild(o);
    });
  } catch { /* öneri yoksa sorun değil */ }
}

// --- Kapak fotoğrafları -------------------------------------------------
function kapakOnizlemeYaz(alan) {
  const taslak = fotoTaslak[alan];
  const img = $(`#${alan}-kapak-onizleme`);
  const kaynak = taslak.dosya ? URL.createObjectURL(taslak.dosya) : taslak.url;
  img.hidden = !kaynak;
  if (kaynak) img.src = kaynak;
}

function kapakTaslaginiSifirla(alan, url = null) {
  fotoTaslak[alan] = { dosya: null, url };
  $(`#${alan}-foto`).value = '';
  kapakOnizlemeYaz(alan);
}

async function internettenKapakBul(alan) {
  const ad = $(`#${alan}-ad`).value.trim();
  const yazar = $(`#${alan}-yazar`).value.trim();
  if (!ad) throw new Error('Önce kitap adını yaz.');
  // Google Books mobil tarayıcılarda daha tutarlı CORS ve kapak dönüşü veriyor.
  // Open Library ikinci kaynak: Google'ın tanımadığı eski/yerel baskılarda şansımız sürer.
  let url = null;
  try {
    const sorgular = [
      [ad, yazar].filter(Boolean).join(' '),
      `intitle:${ad}${yazar ? ` inauthor:${yazar}` : ''}`,
    ];
    for (const q of sorgular) {
      const cevap = await fetch(`https://www.googleapis.com/books/v1/volumes?maxResults=5&q=${encodeURIComponent(q)}`);
      const veri = cevap.ok && await cevap.json();
      const kayit = veri && veri.items && veri.items.find(item => {
        const baglar = item && item.volumeInfo && item.volumeInfo.imageLinks;
        return baglar && (baglar.thumbnail || baglar.smallThumbnail);
      });
      const baglar = kayit && kayit.volumeInfo.imageLinks;
      url = baglar && (baglar.thumbnail || baglar.smallThumbnail);
      if (url) {
        const kapakUrl = new URL(url.replace(/^http:/, 'https:'));
        kapakUrl.searchParams.delete('edge');
        kapakUrl.searchParams.set('zoom', '1');
        url = kapakUrl.toString();
        break;
      }
    }
  } catch { /* ikinci kaynağı dene */ }
  if (!url) {
    try {
      const sorgu = new URLSearchParams({ title: ad, limit: '1', fields: 'cover_i' });
      if (yazar) sorgu.set('author', yazar);
      const cevap = await fetch(`https://openlibrary.org/search.json?${sorgu}`);
      const veri = cevap.ok && await cevap.json();
      if (veri && veri.docs && veri.docs[0] && veri.docs[0].cover_i) url = `https://covers.openlibrary.org/b/id/${veri.docs[0].cover_i}-L.jpg`;
    } catch { /* aşağıdaki anlaşılır hata gösterilir */ }
  }
  if (!url) throw new Error('Kapak önerisi bulunamadı. Fotoğraf çekebilirsin.');
  fotoTaslak[alan] = { dosya: null, url: url.replace(/^http:/, 'https:') };
  $(`#${alan}-foto`).value = '';
  kapakOnizlemeYaz(alan);
  bildir('Kapak önerisi geldi — baskıyla eşleştiğini kontrol et.');
}

async function kapakUrlHazirla(alan) {
  const taslak = fotoTaslak[alan];
  return taslak.dosya ? db.kapakYukle(taslak.dosya) : taslak.url;
}

// --- Ekle ---------------------------------------------------------------
function ekleAc(onDolguAd = '') {
  if (!yoneticiMi()) return; // Ziyaretçi bu ekrana hiç giremez.
  hataGizle('#ekle-hata');
  $('#ekle-ad').value = onDolguAd;
  $('#ekle-yazar').value = '';
  $('#ekle-fiyat').value = '';
  $('#ekle-notlar').value = '';
  kapakTaslaginiSifirla('ekle');
  raflariTazele();
  git('ekle');
  $('#ekle-ad').focus();
}

$('#ekle-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  hataGizle('#ekle-hata');
  try {
    const kitap = {
      ad: $('#ekle-ad').value,
      yazar: $('#ekle-yazar').value,
      raf: $('#ekle-raf').value,
      fiyat: $('#ekle-fiyat').value,
      notlar: $('#ekle-notlar').value,
      foto_url: await kapakUrlHazirla('ekle'),
    };
    await db.ekle(kitap);
    // Raf DOLU kalır: aynı rafa arka arkaya giriş için.
    $('#ekle-ad').value = '';
    $('#ekle-yazar').value = '';
    $('#ekle-fiyat').value = '';
    $('#ekle-notlar').value = '';
    kapakTaslaginiSifirla('ekle');
    $('#ekle-ad').focus();
    bildir('✓ Kitap eklendi');
    raflariTazele();
  } catch (e) {
    hataGoster('#ekle-hata', e);
  }
});

// --- Düzenle ------------------------------------------------------------
function duzenleAc(k) {
  if (!yoneticiMi()) return;
  seciliKitap = k;
  hataGizle('#duzenle-hata');
  $('#duz-ad').value = k.ad || '';
  $('#duz-yazar').value = k.yazar || '';
  $('#duz-raf').value = k.raf || '';
  $('#duz-fiyat').value = k.fiyat == null ? '' : k.fiyat;
  $('#duz-notlar').value = k.notlar || '';
  kapakTaslaginiSifirla('duz', k.foto_url || null);
  raflariTazele();
  git('duzenle');
}

$('#duzenle-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  hataGizle('#duzenle-hata');
  try {
    await db.guncelle(seciliKitap.id, {
      ad: $('#duz-ad').value,
      yazar: $('#duz-yazar').value,
      raf: $('#duz-raf').value,
      fiyat: $('#duz-fiyat').value,
      notlar: $('#duz-notlar').value,
      foto_url: await kapakUrlHazirla('duz'),
    });
    bildir('✓ Güncellendi');
    history.back();
  } catch (e) {
    hataGoster('#duzenle-hata', e);
  }
});

// --- Silme + geri alma ---------------------------------------------------
function onaySor(metin, evetFn) {
  $('#onay-metin').textContent = metin;
  const d = { ekran: (history.state && history.state.ekran) || 'duzenle', onay: true };
  history.pushState(d, '');
  durumUygula(d);
  // Geri tusu de "vazgec" ile ayni sey: pencereyi kapatir, silmez.
  $('#onay-evet').onclick = () => { history.back(); evetFn(); };
  $('#onay-vazgec').onclick = () => { history.back(); };
}

$('#btn-satildi').addEventListener('click', () => {
  if (!seciliKitap) return;
  onaySor(`«${seciliKitap.ad}» silinecek. Emin misin?`, async () => {
    const yedek = { ...seciliKitap };
    try {
      await db.sil(yedek.id);
      sonSilinen = yedek;
      history.back();
      bildir('Kitap silindi', async () => {
        try {
          await db.geriKoy(sonSilinen);
          await listeyiTazele();
          bildir('✓ Geri alındı');
        } catch (e) { bildir(e.message); }
      });
    } catch (e) {
      hataGoster('#duzenle-hata', e);
    }
  });
});

// --- Giriş / çıkış -------------------------------------------------------
$('#giris-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  hataGizle('#giris-hata');
  try {
    await db.girisYap($('#giris-eposta').value.trim(), $('#giris-sifre').value);
    await araEkraniAc();
  } catch (e) {
    hataGoster('#giris-hata', e);
  }
});

$('#btn-ziyaretci').addEventListener('click', async () => {
  hataGizle('#giris-hata');
  const btn = $('#btn-ziyaretci');
  btn.disabled = true;
  try {
    await db.ziyaretciGirisiYap();
    await araEkraniAc();
  } catch (e) {
    hataGoster('#giris-hata', e);
  } finally {
    btn.disabled = false;
  }
});

$('#btn-cikis').addEventListener('click', async () => {
  await db.cikisYap();
  rol = 'ziyaretci';
  liste.terim = ''; liste.sayfa = 1;
  $('#arama').value = '';
  koku('giris');
});

// --- Bağlantılar ---------------------------------------------------------
let aramaZaman = null;
$('#arama').addEventListener('input', () => {
  clearTimeout(aramaZaman);
  aramaZaman = setTimeout(async () => {
    liste.terim = $('#arama').value.trim();
    liste.sayfa = 1;
    await listeyiTazele();
  }, 300);
});
$('#btn-ekle-ac').addEventListener('click', () => ekleAc());
$('#btn-bunu-ekle').addEventListener('click', () => ekleAc($('#arama').value.trim()));
['ekle', 'duz'].forEach(alan => {
  $(`#${alan}-foto`).addEventListener('change', (ev) => {
    fotoTaslak[alan] = { dosya: ev.target.files && ev.target.files[0], url: null };
    kapakOnizlemeYaz(alan);
  });
  $(`#btn-${alan}-kapak-bul`).addEventListener('click', async () => {
    const hataSecici = KAPAK_HATA_SECICILERI[alan];
    hataGizle(hataSecici);
    try { await internettenKapakBul(alan); }
    catch (e) { hataGoster(hataSecici, e); }
  });
});
$('#btn-sepet').addEventListener('click', sepetiAc);
$('#btn-whatsapp').addEventListener('click', whatsappRezervasyon);
$('#btn-alim-teklif-ac').addEventListener('click', alimTeklifAc);
$('#btn-teklifler').addEventListener('click', teklifleriAc);
$('#teklif-fotolar').addEventListener('change', (ev) => teklifFotograflariEkle(ev.target.files));
$('#alim-teklif-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  hataGizle('#alim-teklif-hata');
  const btn = $('#alim-teklif-form button[type="submit"]');
  btn.disabled = true;
  try {
    const foto_yollari = await db.teklifFotograflariYukle(teklifFotograflari.map(fotograf => fotograf.dosya), (sira, toplam) => {
      $('#teklif-foto-durum').textContent = `${sira}/${toplam} gönderiliyor…`;
    });
    await db.alimTeklifiGonder({
      ad_soyad: $('#teklif-ad').value,
      iletisim: $('#teklif-iletisim').value,
      kitap_aciklama: $('#teklif-aciklama').value,
      foto_yollari,
    });
    teklifFotograflariTemizle();
    bildir('✓ Teklifin geldi. İnceleyip WhatsApp’tan döneceğiz.');
    history.back();
  } catch (e) { hataGoster('#alim-teklif-hata', e); }
  finally { btn.disabled = false; }
});
document.querySelectorAll('[data-geri]').forEach(function (b) {
  b.addEventListener('click', function () {
    history.back();
  });
});

// --- Role göre arayüz ----------------------------------------------------
function roluUygula() {
  const yonetici = yoneticiMi();
  $('#btn-ekle-ac').hidden = !yonetici;          // "+" düğmesi
  $('#btn-bunu-ekle').hidden = !yonetici;        // boş sonuçtaki "Bunu ekle"
  $('#btn-sepet').hidden = yonetici;
  $('#btn-alim-teklif-ac').hidden = yonetici;
  $('#btn-teklifler').hidden = !yonetici;
  $('#rol-rozet').hidden = yonetici;
  $('#yama-serit').hidden = !db.durum.yamaEksik;
  // Boş sonuç metni role göre değişir: ziyaretçiye "ekle" demek anlamsız.
  $('#bos-sonuc').querySelector('p').textContent = yonetici
    ? 'Bu isimde kitap kayıtlı değil.'
    : 'Bu isimde kitap kayıtlı değil. Personele sorabilirsin.';
}

// --- Açılış --------------------------------------------------------------
async function araEkraniAc() {
  rol = await db.rolGetir();
  koku('ara');
  $('#btn-cikis').hidden = db.denemeModu;
  roluUygula();
  if (yoneticiMi()) await raflariTazele();
  await listeyiTazele();
  $('#arama').focus();
}

(async function baslat() {
  sepetRozetiniYaz();
  $('#deneme-serit').hidden = !db.denemeModu;
  $('#ziyaretci-alani').hidden = !db.ziyaretciGirisiVar;
  siralamaKutusunuKur();
  if (await db.oturumVarMi()) await araEkraniAc();
  else koku('giris');
})();
