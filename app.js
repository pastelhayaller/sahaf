import * as db from './db.js?v=018';
import { kitapFiyatEtiketi, kitapKunye, fiyatVar, sepetOzeti, rezervasyonMetni, rotaOku, rotaUrl, rotaBasligi, KATEGORILER, kategoriGecerli } from './ui-helpers.js?v=018';

const $ = (s) => document.querySelector(s);
const ekranlar = ['giris', 'ara', 'detay', 'ekle', 'duzenle', 'sepet', 'alim-teklif', 'teklifler'];
let seciliKitap = null;
let detayOdak = null;
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
let rota = rotaOku(window.location.search);

// 'yonetici' (baba + eş) veya 'ziyaretci'. Ziyaretçi sadece görür.
// Bu değişken arayüzü şekillendirir; asıl kilit Supabase'deki RLS'tir.
let rol = 'ziyaretci';
const yoneticiMi = () => rol === 'yonetici';

let acikEkran = null;
function ekranCiz(ad) {
  ekranlar.forEach(e => { $('#ekran-' + e).hidden = (e !== ad); });
  // Perde acilip kapanirken listenin okundugu yer korunur.
  if (ad !== acikEkran) { acikEkran = ad; window.scrollTo(0, 0); }
}

// --- Gezinme -------------------------------------------------------------
// Her ekran ve onay penceresi bir tarayici gecmisi girdisidir; boylece
// telefonun geri tusu siteden cikmak yerine bir adim geri alir.
function durumUygula(d) {
  if (!yoneticiMi() && d.rota) rotaUygula(d.rota);
  if (d.ekran === 'detay' && d.kitap && !yoneticiMi()) {
    seciliKitap = d.kitap;
    detayCiz();
  }
  if (d.ekran === 'sepet') sepetiCiz();
  ekranCiz(d.ekran);
  $('#onay').hidden = !d.onay;
  $('#foto-buyut').hidden = !d.buyut;
}

function git(ekran, ekDurum = {}) {
  const d = { ...ekDurum, ekran, onay: false, ...(!yoneticiMi() ? { rota: { ...rota } } : {}) };
  history.pushState(d, '');
  durumUygula(d);
}

// Gecmise yeni girdi eklemeden ekran degistirir (acilis, giris, cikis).
function koku(ekran) {
  const d = { ekran, onay: false, ...(!yoneticiMi() ? { rota: { ...rota } } : {}) };
  history.replaceState(d, '');
  durumUygula(d);
}

window.addEventListener('popstate', async (ev) => {
  const d = ev.state || { ekran: 'ara', onay: false, rota: rotaOku(window.location.search) };
  clearTimeout(aramaZaman);
  if (d.ekran !== 'alim-teklif' && teklifFotograflari.length) teklifFotograflariTemizle();
  // Düzenle'den çıkıldıysa kuyruk da kapanır; açık kalırsa sonraki tekil
  // düzenlemede şerit yanlışlıkla görünür ve "sonraki" beklenmedik yere atlar.
  if (d.ekran !== 'duzenle' && kuyruk.length) {
    kuyruk = [];
    kuyrukSira = 0;
    $('#kuyruk-serit').hidden = true;
    $('#duzenle-form').querySelector('button[type="submit"]').textContent = 'Kaydet';
    kuyrukSayisiniTazele();
  }
  durumUygula(d);
  if (d.ekran === 'ara' && !d.onay) {
    const odak = detayOdak;
    detayOdak = null;
    await listeyiTazele();
    if (odak && document.contains(odak)) odak.focus();
    else if (odak?.dataset.kitapId) {
      [...document.querySelectorAll('.kitap-basligi, .urun-kapak')]
        .find(b => b.dataset.kitapId === odak.dataset.kitapId)?.focus();
    }
  }
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
function sepetRozetiniYaz() {
  $('#sepet-sayi').textContent = sepet.length;
  $('#detay-sepet-sayi').textContent = sepet.length;
}

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

// --- Fotograf buyutme ----------------------------------------------------
// Tam ekran perde. Gecmise girdi olarak yazilir: telefonun geri tusu
// uygulamadan cikmak yerine sadece fotografi kapatir.
let buyutListesi = [];
let buyutSira = 0;

function fotoBuyut(urller, sira) {
  buyutListesi = (urller || []).filter(Boolean);
  if (!buyutListesi.length) return;
  buyutSira = Math.max(0, Math.min(sira || 0, buyutListesi.length - 1));
  buyutCiz();
  const d = { ...history.state, ekran: history.state?.ekran || 'ara', onay: false, buyut: true };
  history.pushState(d, '');
  durumUygula(d);
}

function buyutCiz() {
  const cok = buyutListesi.length > 1;
  $('#buyut-resim').src = buyutListesi[buyutSira] || '';
  $('#buyut-sayac').textContent = cok ? `${buyutSira + 1} / ${buyutListesi.length}` : '';
  $('#buyut-onceki').hidden = !cok;
  $('#buyut-sonraki').hidden = !cok;
}

function buyutKaydir(yon) {
  if (buyutListesi.length < 2) return;
  buyutSira = (buyutSira + yon + buyutListesi.length) % buyutListesi.length;
  buyutCiz();
}

// Bir <img> yerine tiklanabilir bir dugme uretir; ayni listenin tamami
// buyutmeye gecer, boylece pencerede ileri-geri gezilebilir.
function fotoDugmesi(urller, sira, alt) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'foto-dugme';
  btn.setAttribute('aria-label', `${alt} — büyüt`);
  const img = document.createElement('img');
  img.src = urller[sira];
  img.alt = alt;
  img.loading = 'lazy';
  btn.appendChild(img);
  btn.addEventListener('click', (ev) => { ev.stopPropagation(); fotoBuyut(urller, sira); });
  return btn;
}

$('#buyut-kapat').addEventListener('click', () => history.back());
$('#buyut-onceki').addEventListener('click', (ev) => { ev.stopPropagation(); buyutKaydir(-1); });
$('#buyut-sonraki').addEventListener('click', (ev) => { ev.stopPropagation(); buyutKaydir(1); });
$('#foto-buyut').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) history.back(); });
document.addEventListener('keydown', (ev) => {
  if ($('#foto-buyut').hidden) return;
  if (ev.key === 'Escape') history.back();
  if (ev.key === 'ArrowLeft') buyutKaydir(-1);
  if (ev.key === 'ArrowRight') buyutKaydir(1);
});

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
  if (yoneticiMi()) {
    const el = document.createElement('button');
    el.className = 'kart';
    el.innerHTML = kartIci(k);
    el.type = 'button';
    el.addEventListener('click', () => duzenleAc(k));
    return el;
  }

  // Başlık ve sepet eylemi kardeş düğmeler: erişilebilir ve yuvalanmamış.
  const el = document.createElement('article');
  el.className = 'kart customer-kart' + (k.foto_url ? '' : ' no-cover');
  const kapakDugmesi = document.createElement('button');
  kapakDugmesi.type = 'button';
  kapakDugmesi.className = 'urun-kapak';
  kapakDugmesi.dataset.kitapId = String(k.id);
  kapakDugmesi.setAttribute('aria-label', `${k.ad || 'Adsız kitap'} — ayrıntıları gör`);
  const kapakYok = () => {
    kapakDugmesi.textContent = 'Kapak fotoğrafı yok';
    el.classList.add('no-cover');
  };
  if (k.foto_url) {
    const kapak = document.createElement('img');
    kapak.className = 'kart-kapak';
    kapak.src = k.foto_url;
    kapak.alt = `${k.ad} kapağı`;
    kapak.loading = 'lazy';
    kapak.addEventListener('error', () => { kapakDugmesi.replaceChildren(); kapakYok(); }, { once: true });
    kapakDugmesi.appendChild(kapak);
  } else kapakYok();
  kapakDugmesi.addEventListener('click', () => detayAc(k, kapakDugmesi));
  el.appendChild(kapakDugmesi);
  const orta = document.createElement('div');
  orta.className = 'kart-orta';
  const baslik = document.createElement('button');
  baslik.type = 'button';
  baslik.className = 'kart-ad kitap-basligi';
  baslik.dataset.kitapId = String(k.id);
  baslik.textContent = k.ad || 'Adsız kitap';
  baslik.addEventListener('click', () => detayAc(k, baslik));
  orta.appendChild(baslik);
  if (k.yazar) {
    const yazar = document.createElement('span');
    yazar.className = 'kart-yazar';
    yazar.textContent = k.yazar;
    orta.appendChild(yazar);
  }
  const kunye = kitapKunye(k);
  if (kunye.length) {
    const meta = document.createElement('span');
    meta.className = 'kart-kunye';
    meta.textContent = kunye.join(' · ');
    orta.appendChild(meta);
  }
  el.appendChild(orta);

  const fiyat = document.createElement('span');
  fiyat.className = 'kart-fiyat' + (!fiyatVar(k) ? ' fiyat-yok' : '');
  fiyat.textContent = kitapFiyatEtiketi(k, paraYaz);
  el.appendChild(fiyat);

  const ekle = document.createElement('button');
  ekle.className = 'sepet-ekle';
  ekle.type = 'button';
  ekle.textContent = sepet.some(x => x.id === k.id) ? 'Sepette' : 'Sepete ekle';
  ekle.disabled = sepet.some(x => x.id === k.id);
  ekle.addEventListener('click', () => sepeteEkle(k));
  el.appendChild(ekle);
  return el;
}

function detayAc(k, odak) {
  if (yoneticiMi()) return;
  seciliKitap = k;
  detayOdak = odak;
  git('detay', { kitap: k });
}

function detayCiz() {
  const k = seciliKitap;
  if (!k) return;
  const kapak = '<p class="detay-kapak-yok">Bu kayıt için kapak görseli yok.</p>';
  const kunye = [
    kategoriGecerli(k.kategori) && `<div><dt>Kategori</dt><dd>${escapeHtml(KATEGORILER[k.kategori])}</dd></div>`,
    k.yazar && `<div><dt>Yazar</dt><dd>${escapeHtml(k.yazar)}</dd></div>`,
    k.yayinevi && `<div><dt>Yayınevi</dt><dd>${escapeHtml(k.yayinevi)}</dd></div>`,
    k.basim_yili && `<div><dt>Basım yılı</dt><dd>${escapeHtml(k.basim_yili)}</dd></div>`,
    k.durum && `<div><dt>Durum</dt><dd>${escapeHtml(k.durum)}</dd></div>`,
  ].filter(Boolean).join('');
  const fiyat = kitapFiyatEtiketi(k, paraYaz);
  const aciklama = typeof k.aciklama === 'string' ? k.aciklama.trim() : '';
  $('#detay-icerik').innerHTML = `
    <article class="detay-kart">
      <div class="detay-gorsel">${kapak}</div>
      <div class="detay-metin">
        <h1>${escapeHtml(k.ad || 'Adsız kitap')}</h1>
        ${aciklama ? `<section class="detay-aciklama"><h2>Kitap hakkında</h2><p>${escapeHtml(aciklama)}</p></section>` : ''}
        <section class="detay-nusha"><h2>Bu nüsha</h2>
          ${kunye ? `<dl class="detay-kunye">${kunye}</dl>` : '<p class="ipucu">Bu kayıt için ek künye bilgisi bulunmuyor.</p>'}
          ${k.notlar ? `<p class="detay-not"><strong>Nüsha notu</strong>${escapeHtml(k.notlar)}</p>` : ''}
        </section>
        <p class="detay-fiyat">${fiyat}</p>
        ${!fiyatVar(k) ? '<p class="ipucu">Güncel fiyatı WhatsApp’tan sorabilirsin.</p>' : ''}
        <button id="btn-detay-sepet" class="btn birincil" type="button">${sepet.some(x => x.id === k.id) ? 'Sepette' : 'Sepete ekle'}</button>
      </div>
    </article>`;
  if (k.foto_url) {
    const gorsel = $('#detay-icerik .detay-gorsel');
    const foto = fotoDugmesi([k.foto_url], 0, `${k.ad} kapağı`);
    foto.querySelector('img').className = 'detay-kapak';
    foto.querySelector('img').addEventListener('error', () => {
      gorsel.innerHTML = '<p class="detay-kapak-yok">Kapak fotoğrafı yüklenemedi.</p>';
    }, { once: true });
    gorsel.replaceChildren(foto);
  }
  const ekle = $('#btn-detay-sepet');
  ekle.disabled = sepet.some(x => x.id === k.id);
  ekle.addEventListener('click', () => sepeteEkle(k));
}

function sepeteEkle(k) {
  if (sepet.some(x => x.id === k.id)) return;
  sepet.push({ id: k.id, ad: k.ad, yazar: k.yazar, fiyat: k.fiyat, raf: k.raf, foto_url: k.foto_url || null });
  sepetKaydet(); sepetRozetiniYaz();
  const detayDugmesi = $('#btn-detay-sepet');
  if (detayDugmesi && seciliKitap?.id === k.id) { detayDugmesi.disabled = true; detayDugmesi.textContent = 'Sepette'; }
  bildir(`✓ «${k.ad}» sepete eklendi`);
  listeyiTazele();
}

function sepetiCiz() {
  const kap = $('#sepet-kalemleri');
  kap.replaceChildren();
  $('#sepet-bos').hidden = sepet.length !== 0;
  $('#sepet-ozet').hidden = sepet.length === 0;
  $('#btn-whatsapp').hidden = sepet.length === 0;
  const { toplam, bilinen, bilinmeyen } = sepetOzeti(sepet);
  $('#sepet-toplam-etiket').textContent = bilinmeyen ? 'Bilinen ara toplam' : 'Toplam';
  $('#sepet-toplam').textContent = bilinen ? paraYaz(toplam) : 'Fiyatlar sorulacak';
  $('#sepet-fiyat-notu').hidden = !bilinmeyen;
  $('#sepet-fiyat-notu').textContent = `${bilinmeyen} kitabın fiyatı sorulacak; bu kitaplar ara toplama dahil değil. Kesin tutarı sahaf teyit eder.`;
  sepet.forEach(k => {
    const el = document.createElement('div'); el.className = 'sepet-kalem';
    el.innerHTML = `${k.foto_url ? `<img class="sepet-kapak" src="${escapeHtml(k.foto_url)}" alt="">` : ''}
      <span class="kart-orta"><span class="kart-ad">${escapeHtml(k.ad)}</span>${k.yazar ? `<span class="kart-yazar">${escapeHtml(k.yazar)}</span>` : ''}</span>
      <span class="kart-fiyat">${kitapFiyatEtiketi(k, paraYaz)}</span>`;
    const sil = document.createElement('button'); sil.className = 'btn sade kucuk'; sil.type = 'button'; sil.textContent = 'Çıkar';
    sil.addEventListener('click', () => { sepet = sepet.filter(x => x.id !== k.id); sepetKaydet(); sepetRozetiniYaz(); sepetiCiz(); });
    el.appendChild(sil); kap.appendChild(el);
  });
}

function sepetiAc() { sepetiCiz(); git('sepet'); }

function whatsappRezervasyon() {
  const mesaj = rezervasyonMetni(sepet, paraYaz);
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
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', () => fotoBuyut(teklifFotograflari.map(f => f.url), teklifFotograflari.indexOf(fotograf)));

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

// Kac saat kaldi: "23 saat" / "40 dakika" / "birazdan".
function kalanSure(silindiAt) {
  const biter = new Date(silindiAt).getTime() + db.TEKLIF_SAKLAMA_SAATI * 3600 * 1000;
  const dakika = Math.round((biter - Date.now()) / 60000);
  if (dakika <= 1) return 'birazdan';
  if (dakika < 60) return `${dakika} dakika sonra`;
  return `${Math.round(dakika / 60)} saat sonra`;
}

async function teklifleriYenile() {
  const kap = $('#teklifler-listesi');
  const cop = $('#cop-listesi');
  kap.replaceChildren();
  cop.replaceChildren();
  try {
    let teklifler = await db.alimTeklifleriniListele();

    // Suresi dolanlari once gercekten yok et, sonra ekrani ciz -- yoksa
    // "0 dakika sonra silinecek" diyen olu kartlar gorunurdu.
    if (await db.alimTeklifleriniTemizle(teklifler)) {
      teklifler = await db.alimTeklifleriniListele();
    }

    const aktif = teklifler.filter(t => !t.silindi_at);
    const silinen = teklifler.filter(t => t.silindi_at);

    $('#teklifler-durum').textContent = aktif.length ? `${aktif.length} alım teklifi` : 'Henüz alım teklifi yok.';
    aktif.forEach(t => kap.appendChild(teklifKarti(t)));

    $('#cop-durum').hidden = !silinen.length;
    $('#cop-ipucu').hidden = !silinen.length;
    $('#cop-durum').textContent = `Silinen teklifler (${silinen.length})`;
    silinen.forEach(t => cop.appendChild(teklifKarti(t)));
  } catch (e) { $('#teklifler-durum').textContent = e.message; }
}

// Durum artik acilir listede saklanmiyor: kartin tepesinde renkli bir muhur.
// Cop kutusundaki kart ayni bilesen -- sadece rozeti, tarihi ve alt satiri
// degisiyor. Ayri bir "silinmis kart" bileseni yazmak ikisini zamanla
// birbirinden ayirirdi.
function teklifKarti(t) {
  const silinmis = !!t.silindi_at;
  const el = document.createElement('article');
  el.className = 'teklif-kart' + (silinmis ? ' silinmis' : '');
  const tarih = new Date(t.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

  const rozet = document.createElement('span');
  const rozetiYaz = (durum) => {
    rozet.className = `teklif-durum-rozet d-${durum}`;
    rozet.textContent = DURUM_ETIKETI[durum] || durum;
  };
  if (silinmis) {
    rozet.className = 'teklif-durum-rozet d-silinmis';
    rozet.textContent = 'Silindi';
  } else {
    rozetiYaz(t.durum);
  }

  const ust = document.createElement('div');
  ust.className = 'teklif-ust';
  const tarihEl = document.createElement('span');
  tarihEl.className = 'teklif-tarih';
  // Cop kutusunda gelis tarihi degil kalan sure onemli.
  tarihEl.textContent = silinmis ? `${kalanSure(t.silindi_at)} silinir` : tarih;
  ust.append(rozet, tarihEl);
  el.appendChild(ust);

  const govde = document.createElement('div');
  govde.innerHTML = `<div class="teklif-baslik"><strong>${escapeHtml(t.ad_soyad)}</strong><span>${escapeHtml(t.iletisim)}</span></div>
    <p>${escapeHtml(t.kitap_aciklama)}</p>`;
  el.appendChild(govde);

  if (t.foto_urlari.length) {
    const fotograflar = document.createElement('div');
    fotograflar.className = 'teklif-fotolar';
    t.foto_urlari.forEach((url, i) => {
      fotograflar.appendChild(fotoDugmesi(t.foto_urlari, i, `${t.ad_soyad} — gönderilen kitap fotoğrafı ${i + 1}`));
    });
    el.appendChild(fotograflar);
  }

  const eylemler = document.createElement('div');
  eylemler.className = 'teklif-eylemler';

  if (silinmis) {
    // Cop kutusunda durum degistirilmez -- teklif zaten islem disi.
    // Tek eylem geri getirmek; kalici yok etme sureye birakildi ki
    // "sil" dedigin an bir dugme daha basip pisman olamayasin.
    const aciklama = document.createElement('span');
    aciklama.className = 'cop-aciklama';
    aciklama.textContent = `${t.foto_urlari.length} fotoğrafıyla birlikte`;

    const geri = document.createElement('button');
    geri.type = 'button';
    geri.className = 'teklif-geri';
    geri.textContent = 'Geri al';
    geri.setAttribute('aria-label', `${t.ad_soyad} teklifini geri al`);
    geri.addEventListener('click', async () => {
      try {
        await db.alimTeklifiGeriAl(t.id);
        bildir('✓ Teklif geri alındı');
        await teklifleriYenile();
      } catch (e) { bildir(e.message); }
    });
    eylemler.append(aciklama, geri);
    el.appendChild(eylemler);
    return el;
  }

  const sec = document.createElement('select');
  sec.className = 'teklif-durum-sec';
  sec.setAttribute('aria-label', 'Teklif durumu');
  Object.entries(DURUM_ETIKETI).forEach(([anahtar, etiket]) => {
    const o = document.createElement('option');
    o.value = anahtar; o.textContent = etiket; o.selected = anahtar === t.durum;
    sec.appendChild(o);
  });
  sec.addEventListener('change', async () => {
    try {
      await db.alimTeklifiDurumGuncelle(t.id, sec.value);
      t.durum = sec.value;
      rozetiYaz(t.durum);
      bildir('✓ Teklif durumu güncellendi');
    } catch (e) { bildir(e.message); sec.value = t.durum; }
  });

  // Silme artik iki adimli: kart cop kutusuna duser, 24 saat sonra gercekten
  // gider. Onay penceresi yine duruyor ama artik "geri alinamaz" demiyor.
  const sil = document.createElement('button');
  sil.type = 'button';
  sil.className = 'teklif-sil';
  sil.textContent = 'Sil';
  sil.setAttribute('aria-label', `${t.ad_soyad} teklifini sil`);
  sil.addEventListener('click', () => {
    onaySor(`«${t.ad_soyad}» teklifi silinsin mi? ${db.TEKLIF_SAKLAMA_SAATI} saat boyunca «Silinen teklifler» altında durur, geri alabilirsin.`, async () => {
      try {
        await db.alimTeklifiSil(t.id);
        bildir('✓ Teklif silinenlere taşındı');
        await teklifleriYenile();
      } catch (e) { bildir(e.message); }
    });
  });

  eylemler.append(sec, sil);
  el.appendChild(eylemler);
  return el;
}

async function teklifleriAc() { if (!yoneticiMi()) return; git('teklifler'); await teklifleriYenile(); }

function listeYaz(sonuc, terimVarMi) {
  const kap = $('#sonuclar');
  kap.replaceChildren();
  $('#bos-sonuc').hidden = true;
  magazaVitriniYaz(sonuc.kayitlar);

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

// Vitrin yalnız varsayılan raf görünümünde; aramada sonuçlar öne çıkar.
function magazaVitriniYaz(kitaplar) {
  const vitrin = $('#magaza-vitrini');
  vitrin.hidden = rota.bolum !== 'ana' || liste.sayfa !== 1;
  $('#katalog-baslik').textContent = rotaBasligi(rota);
  if (yoneticiMi() || vitrin.hidden) return;
  const kap = $('#vitrin-kapaklari');
  kap.replaceChildren();
  kitaplar.filter(k => k.foto_url).slice(0, 3).forEach(k => {
    const dugme = document.createElement('button');
    dugme.type = 'button';
    dugme.setAttribute('aria-label', `${k.ad} — ayrıntıları gör`);
    dugme.dataset.kitapId = String(k.id);
    const img = document.createElement('img');
    img.src = k.foto_url;
    img.alt = `${k.ad} kapağı`;
    img.addEventListener('error', () => dugme.remove(), { once: true });
    dugme.appendChild(img);
    dugme.addEventListener('click', () => detayAc(k, dugme));
    kap.appendChild(dugme);
  });
}

function rotaUygula(yeni) {
  rota = { ...yeni };
  Object.assign(liste, { terim: rota.terim, sirala: rota.sirala, sayfa: rota.sayfa });
  $('#arama').value = rota.bolum === 'arama' ? rota.terim : '';
  $('#siralama').value = rota.sirala;
  $('#dizin-arama').value = rota.terim;
}

async function rotaAc(yeni, degistir = false) {
  if (yoneticiMi()) return;
  clearTimeout(aramaZaman);
  rotaUygula(yeni);
  $('#kitap-menu').open = false;
  const d = { ekran: 'ara', onay: false, rota: { ...rota } };
  history[degistir ? 'replaceState' : 'pushState'](d, '', rotaUrl(rota));
  durumUygula(d);
  window.scrollTo(0, 0);
  await listeyiTazele();
}

function rotaBagla(a) {
  a.addEventListener('click', ev => {
    if (yoneticiMi()) { ev.preventDefault(); return; }
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey || ev.button > 0) return;
    ev.preventDefault();
    rotaAc(rotaOku(new URL(a.href, window.location.href).search));
  });
}

function magazaSayfasiCiz() {
  const dizinMi = ['yazarlar', 'yayinevleri'].includes(rota.bolum);
  const kategoriMi = rota.bolum === 'kategori';
  const gecersizKategori = kategoriMi && !kategoriGecerli(rota.deger);
  const eksikSecim = ['yazar', 'yayinevi'].includes(rota.bolum) && !rota.deger;
  $('#dizin-sonuclar').hidden = !dizinMi;
  $('#sonuclar').hidden = dizinMi || gecersizKategori || eksikSecim;
  $('#dizin-arama-form').hidden = !dizinMi;
  $('#dizin-arama-etiket').textContent = rota.bolum === 'yazarlar' ? 'Yazar adı ara' : 'Yayınevi ara';
  $('#siralama').hidden = dizinMi || gecersizKategori || eksikSecim;
  $('label[for="siralama"]').hidden = dizinMi || gecersizKategori || eksikSecim;
  $('#katalog-baslik').textContent = rotaBasligi(rota);
  $('#katalog-aciklama').textContent = rota.bolum === 'yeni-basimlar'
    ? 'Kayıtlı basım yılına göre sıralanır. Yeni yayın tarihi anlamına gelmez.'
    : rota.bolum === 'yeni-gelenler' ? 'Dükkânın raflarına en son eklenen kitaplar.'
    : rota.bolum === 'kitaplar' ? 'Tüm raflarımız, kitap adına göre A–Z.'
    : rota.bolum === 'arama' ? (rota.terim ? `“${rota.terim}” için kitaplar` : 'Bir kitap adı veya yazar yaz.')
    : dizinMi ? 'Katalogda adı bulunan tüm kayıtlar. Bir isim seçerek kitaplarını gör.'
    : rota.bolum === 'ana' ? 'Aradığın kitap, belki de bu rafta.' : '';
  $('#magaza-vitrini').hidden = rota.bolum !== 'ana' || rota.sayfa !== 1;
  const yol = $('#magaza-yol');
  yol.replaceChildren();
  yol.hidden = rota.bolum === 'ana';
  const ana = document.createElement('a'); ana.href = './'; ana.textContent = 'Ana sayfa'; rotaBagla(ana); yol.appendChild(ana);
  const simdi = document.createElement('span'); simdi.textContent = rotaBasligi(rota); simdi.setAttribute('aria-current', 'page'); yol.appendChild(simdi);
  document.querySelectorAll('.storefront-nav a[data-rota]').forEach(a => {
    const hedef = rotaOku(new URL(a.href, window.location.href).search);
    if (hedef.bolum === rota.bolum && hedef.deger === rota.deger) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#sayfa-mesaj').hidden = true;
  return { dizinMi, gecersizKategori, eksikSecim };
}

function sayfaMesaji(metin, tekrar = false) {
  const el = $('#sayfa-mesaj'); el.replaceChildren(); el.hidden = false;
  const p = document.createElement('p'); p.textContent = metin; el.appendChild(p);
  if (tekrar) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ikincil';
    b.textContent = 'Yeniden dene'; b.addEventListener('click', listeyiTazele); el.appendChild(b);
  }
}

async function dizinYaz(benim) {
  const alan = rota.bolum === 'yazarlar' ? 'yazar' : 'yayinevi';
  const kap = $('#dizin-sonuclar'); kap.replaceChildren();
  $('#ara-durum').textContent = 'Dizin yükleniyor…';
  const kayitlar = (await db.dizin(alan)).filter(k => db.normalize(k.ad).includes(db.normalize(rota.terim)));
  if (benim !== istekSayaci) return;
  const toplam = kayitlar.length;
  const sayfaSayisi = Math.max(1, Math.ceil(toplam / 100));
  liste.sayfa = Math.min(liste.sayfa, sayfaSayisi);
  rota.sayfa = liste.sayfa;
  history.replaceState({ ...history.state, rota: { ...rota } }, '', rotaUrl(rota));
  const bas = (liste.sayfa - 1) * 100;
  kayitlar.slice(bas, bas + 100).forEach(k => {
    const a = document.createElement('a');
    a.href = rotaUrl({ ...rotaOku(), bolum: alan, deger: k.ad, sirala: 'ad' });
    a.textContent = `${k.ad} (${k.adet})`; rotaBagla(a); kap.appendChild(a);
  });
  $('#ara-durum').textContent = `${toplam} ${alan === 'yazar' ? 'yazar' : 'yayınevi'} · sayfa ${liste.sayfa}/${sayfaSayisi}`;
  if (!toplam) sayfaMesaji(rota.terim ? 'Bu isimle kayıt bulunamadı.' : 'Bu dizinde henüz kayıt yok.');
  sayfalamaYaz({ sayfa: liste.sayfa, sayfaSayisi });
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
  if (!yoneticiMi()) return rotaAc({ ...rota, sayfa: no });
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
  $('#bos-sonuc').hidden = true;
  $('#sayfalama').hidden = true;
  try {
    if (!yoneticiMi()) {
      const { dizinMi, gecersizKategori, eksikSecim } = magazaSayfasiCiz();
      if (gecersizKategori || eksikSecim || (rota.bolum === 'arama' && !rota.terim)) {
        $('#sonuclar').replaceChildren();
        $('#ara-durum').textContent = '';
        sayfaMesaji(gecersizKategori ? 'Bu kategori bulunamadı. Kitap menüsünden bir kategori seçebilirsin.'
          : eksikSecim ? 'Dizinden bir isim seçerek kitaplarına ulaşabilirsin.' : 'Aramaya başlamak için yukarıya bir kitap adı veya yazar yaz.');
        return;
      }
      if (dizinMi) return await dizinYaz(benim);
    }
    if (!$('#sonuclar').firstChild) iskeletYaz();
    const filtre = yoneticiMi() ? {} : {
      yazar: rota.bolum === 'yazar' ? rota.deger : '',
      yayinevi: rota.bolum === 'yayinevi' ? rota.deger : '',
      basimVar: rota.bolum === 'yeni-basimlar',
      kategori: rota.bolum === 'kategori' ? rota.deger : null,
    };
    const sonuc = await db.listele({ ...liste, ...filtre });
    if (benim !== istekSayaci) return;
    liste.sayfa = sonuc.sayfa;
    if (!yoneticiMi()) {
      rota.sayfa = sonuc.sayfa;
      history.replaceState({ ...history.state, rota: { ...rota } }, '', rotaUrl(rota));
    }
    listeYaz(sonuc, !!liste.terim);
    if (!yoneticiMi() && !sonuc.kayitlar.length) sayfaMesaji('Bu sayfada gösterilecek kitap bulunamadı.');
  } catch (e) {
    if (benim !== istekSayaci) return;
    $('#sonuclar').replaceChildren();
    $('#ara-durum').textContent = e.message;
    $('#sayfalama').hidden = true;
    if (!yoneticiMi()) sayfaMesaji('Kitaplar yüklenemedi. Bağlantını kontrol edip yeniden deneyebilirsin.', true);
  }
}

// Yükleniyor iskeleti — gerçek satırla aynı ölçüde, sadece boş. Sonuç
// gelince listeYaz() zaten replaceChildren ile üstüne yazıyor.
function iskeletYaz(adet = 4) {
  const parca = document.createDocumentFragment();
  for (let i = 0; i < adet; i++) {
    const s = document.createElement('div');
    s.className = 'iskelet';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<i class="is-kapak"></i><i class="is-ad"></i><i class="is-raf"></i><i class="is-fiyat"></i>';
    parca.appendChild(s);
  }
  $('#sonuclar').replaceChildren(parca);
}

function kategoriKutulariniKur() {
  ['ekle', 'duz'].forEach(alan => {
    const sec = $(`#${alan}-kategori`);
    sec.replaceChildren();
    for (const [deger, ad] of [['', 'Henüz sınıflandırılmadı'], ...Object.entries(KATEGORILER)]) {
      const o = document.createElement('option'); o.value = deger; o.textContent = ad; sec.appendChild(o);
    }
  });
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
    if (!yoneticiMi()) return rotaAc({ ...rota, sirala: sec.value, sayfa: 1 });
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
  try {
    const liste = await db.yayinevleri();
    const dl = $('#yayinevi-listesi');
    dl.replaceChildren();
    liste.forEach(y => {
      const o = document.createElement('option');
      o.value = y;
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
  // Google Books zaten yayınevi ve basım yılını döndürüyordu; atılıyordu.
  // Girişte kitap başına iki alan eksilsin diye tutuluyor.
  let kunye = null;
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
        kunye = kayit.volumeInfo;
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
      const sorgu = new URLSearchParams({ title: ad, limit: '1', fields: 'cover_i,publisher,first_publish_year' });
      if (yazar) sorgu.set('author', yazar);
      const cevap = await fetch(`https://openlibrary.org/search.json?${sorgu}`);
      const veri = cevap.ok && await cevap.json();
      const belge = veri && veri.docs && veri.docs[0];
      if (belge && belge.cover_i) {
        url = `https://covers.openlibrary.org/b/id/${belge.cover_i}-L.jpg`;
        kunye = {
          publisher: Array.isArray(belge.publisher) ? belge.publisher[0] : belge.publisher,
          publishedDate: belge.first_publish_year ? String(belge.first_publish_year) : null,
        };
      }
    } catch { /* aşağıdaki anlaşılır hata gösterilir */ }
  }
  if (!url) throw new Error('Kapak önerisi bulunamadı. Fotoğraf çekebilirsin.');
  fotoTaslak[alan] = { dosya: null, url: url.replace(/^http:/, 'https:') };
  $(`#${alan}-foto`).value = '';
  kapakOnizlemeYaz(alan);
  bildir(`Öneri geldi${kunyeDoldur(alan, kunye)} — baskıyla eşleştiğini kontrol et.`);
}

// Öneriden gelen yayınevi/yılı YALNIZ boş alana yazar. Personelin elle girdiği
// değer bir tahminle ezilmez; öneri yanlış baskıyı tutmuş olabilir.
function kunyeDoldur(alan, kunye) {
  if (!kunye) return '';
  const dolanlar = [];
  const yayinevi = $(`#${alan}-yayinevi`);
  if (yayinevi && !yayinevi.value.trim() && kunye.publisher) {
    yayinevi.value = String(kunye.publisher).trim();
    dolanlar.push('yayınevi');
  }
  const yil = $(`#${alan}-basim-yili`);
  // publishedDate "1998", "1998-04" veya "1998-04-01" gelebiliyor; yılı ayıkla.
  // Rakam sınırları şart: aksi halde bozuk bir "20026" sessizce 2002 olurdu.
  const eslesme = kunye.publishedDate && String(kunye.publishedDate).match(/(?<!\d)\d{4}(?!\d)/);
  const sayi = eslesme && Number(eslesme[0]);
  if (yil && !yil.value.trim() && sayi >= 1400 && sayi <= 2100) {
    yil.value = String(sayi);
    dolanlar.push('basım yılı');
  }
  return dolanlar.length ? ` (${dolanlar.join(' + ')} dolduruldu)` : '';
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
  $('#ekle-kategori').value = '';
  $('#ekle-aciklama').value = '';
  $('#ekle-fiyat').value = '';
  $('#ekle-notlar').value = '';
  $('#ekle-basim-yili').value = '';
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
      yayinevi: $('#ekle-yayinevi').value,
      basim_yili: $('#ekle-basim-yili').value,
      durum: $('#ekle-durum').value,
      kategori: $('#ekle-kategori').value,
      aciklama: $('#ekle-aciklama').value,
      foto_url: await kapakUrlHazirla('ekle'),
    };
    await db.ekle(kitap);
    // Raf DOLU kalır: aynı rafa arka arkaya giriş için.
    $('#ekle-ad').value = '';
    $('#ekle-yazar').value = '';
    $('#ekle-kategori').value = '';
    $('#ekle-aciklama').value = '';
    $('#ekle-fiyat').value = '';
    $('#ekle-notlar').value = '';
    $('#ekle-basim-yili').value = '';
    kapakTaslaginiSifirla('ekle');
    $('#ekle-ad').focus();
    bildir('✓ Kitap eklendi');
    raflariTazele();
  } catch (e) {
    hataGoster('#ekle-hata', e);
  }
});

// --- Eksik tamamlama kuyruğu --------------------------------------------
// 1500 kitaba dört alan girilecek. Tek kitaplık Düzenle akışında her kitap
// "kaydet → listeye dön → sonrakini bul → aç" demek; kuyruk o üç adımı siliyor.
// Yeni ekran YOK — aynı Düzenle formu, sadece kaydetme sonrası davranış farklı.
let kuyruk = [];
let kuyrukSira = 0;

function kuyruktaMi() { return kuyruk.length > 0; }

async function kuyrukBaslat() {
  if (!yoneticiMi()) return;
  try {
    kuyruk = await db.eksikKuyrugu();
  } catch (e) {
    hataGoster('#ara-durum', e);
    return;
  }
  if (!kuyruk.length) { bildir('✓ Eksik bilgi kalmadı'); return; }
  kuyrukSira = 0;
  kuyruktakiniAc();
}

function kuyruktakiniAc() {
  if (kuyrukSira >= kuyruk.length) {
    const bitenSayi = kuyruk.length;
    kuyrukBitir();
    bildir(`✓ Kuyruk bitti — ${bitenSayi} kitap gözden geçirildi`);
    return;
  }
  duzenleAc(kuyruk[kuyrukSira]);
}

function kuyrukSeridiniYaz() {
  const serit = $('#kuyruk-serit');
  serit.hidden = !kuyruktaMi();
  if (!kuyruktaMi()) return;
  $('#kuyruk-sayac').textContent = `${kuyrukSira + 1} / ${kuyruk.length}`;
  // Raf yine de yazılıyor: kitabı fiziksel olarak bulmak gereken tek bilgi bu.
  const raf = kuyruk[kuyrukSira] && kuyruk[kuyrukSira].raf;
  $('#kuyruk-raf').textContent = raf ? `Raf ${raf}` : '';
}

function kuyrukBitir() {
  kuyruk = [];
  kuyrukSira = 0;
  $('#kuyruk-serit').hidden = true;
  $('#duzenle-form').querySelector('button[type="submit"]').textContent = 'Kaydet';
  git('ara');
  listeyiTazele();
  kuyrukSayisiniTazele();
}

$('#btn-kuyruk-baslat').addEventListener('click', kuyrukBaslat);
$('#btn-kuyruk-bitir').addEventListener('click', kuyrukBitir);
$('#btn-kuyruk-atla').addEventListener('click', () => {
  // Atlanan kitap kaydedilmez; elde olmayan kitabı beklemesin diye.
  kuyrukSira++;
  kuyruktakiniAc();
});

// Kaç kitapta eksik var — düğmenin üstünde yazsın ki iş görünür olsun.
async function kuyrukSayisiniTazele() {
  const dugme = $('#btn-kuyruk-baslat');
  if (!yoneticiMi()) { dugme.hidden = true; return; }
  try {
    const eksikler = await db.eksikKuyrugu();
    dugme.hidden = eksikler.length === 0;
    dugme.textContent = `Eksikleri tamamla (${eksikler.length})`;
  } catch {
    dugme.hidden = true; // sayaç alınamadıysa düğmeyi hiç gösterme
  }
}

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
  $('#duz-yayinevi').value = k.yayinevi || '';
  $('#duz-basim-yili').value = k.basim_yili == null ? '' : k.basim_yili;
  $('#duz-durum').value = k.durum || '';
  $('#duz-kategori').value = kategoriGecerli(k.kategori) ? k.kategori : '';
  $('#duz-aciklama').value = k.aciklama || '';
  kapakTaslaginiSifirla('duz', k.foto_url || null);
  raflariTazele();
  kuyrukSeridiniYaz();
  $('#duzenle-form').querySelector('button[type="submit"]').textContent =
    kuyruktaMi() ? 'Kaydet ve sonraki ›' : 'Kaydet';
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
      yayinevi: $('#duz-yayinevi').value,
      basim_yili: $('#duz-basim-yili').value,
      durum: $('#duz-durum').value,
      kategori: $('#duz-kategori').value,
      aciklama: $('#duz-aciklama').value,
      foto_url: await kapakUrlHazirla('duz'),
    });
    if (kuyruktaMi()) {
      bildir('✓ Kaydedildi');
      kuyrukSira++;
      kuyruktakiniAc();
      return;
    }
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
document.querySelectorAll('a[data-rota]').forEach(rotaBagla);
$('#magaza-arama-form').addEventListener('submit', ev => {
  ev.preventDefault();
  if (!yoneticiMi()) rotaAc({ ...rotaOku('?bolum=arama'), terim: $('#arama').value.trim() });
});
$('#dizin-arama-form').addEventListener('submit', ev => {
  ev.preventDefault();
  if (!yoneticiMi()) rotaAc({ ...rota, terim: $('#dizin-arama').value.trim(), sayfa: 1 });
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && $('#kitap-menu').open) { $('#kitap-menu').open = false; $('#kitap-menu summary').focus(); }
});
document.addEventListener('click', ev => {
  if ($('#kitap-menu').open && !$('#kitap-menu').contains(ev.target)) $('#kitap-menu').open = false;
});
$('#arama').addEventListener('input', () => {
  if (!yoneticiMi()) return;
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
$('#btn-detay-sepet-ac').addEventListener('click', sepetiAc);
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
  document.body.dataset.rol = rol;
  if (yonetici) {
    $('#sonuclar').hidden = false;
    $('#dizin-sonuclar').hidden = true;
    $('#sayfa-mesaj').hidden = true;
    $('#siralama').hidden = false;
    $('label[for="siralama"]').hidden = false;
  }
  $('#btn-ekle-ac').hidden = !yonetici;          // "+" düğmesi
  $('#btn-bunu-ekle').hidden = !yonetici;        // boş sonuçtaki "Bunu ekle"
  $('#btn-sepet').hidden = yonetici;
  $('#btn-alim-teklif-ac').hidden = yonetici;
  $('#btn-teklifler').hidden = !yonetici;
  $('#rol-rozet').hidden = true;
  const cikisEtiketi = yonetici ? 'Çıkış' : 'Personel girişi';
  $('#btn-cikis').title = cikisEtiketi;
  $('#btn-cikis').setAttribute('aria-label', cikisEtiketi);
  $('#yama-serit').hidden = !db.durum.yamaEksik;
  // Boş sonuç metni role göre değişir: ziyaretçiye "ekle" demek anlamsız.
  $('#bos-sonuc').querySelector('p').textContent = yonetici
    ? 'Bu isimde kitap kayıtlı değil.'
    : 'Bu isimde kitap kayıtlı değil. Personele sorabilirsin.';
}

// --- Açılış --------------------------------------------------------------
async function araEkraniAc() {
  rol = await db.rolGetir();
  if (!yoneticiMi()) rotaUygula(rotaOku(window.location.search));
  koku('ara');
  $('#btn-cikis').hidden = db.denemeModu;
  roluUygula();
  if (yoneticiMi()) await raflariTazele();
  await listeyiTazele();
  kuyrukSayisiniTazele();
  if (yoneticiMi()) $('#arama').focus();
}

(async function baslat() {
  sepetRozetiniYaz();
  $('#deneme-serit').hidden = !db.denemeModu;
  $('#ziyaretci-alani').hidden = !db.ziyaretciGirisiVar;
  siralamaKutusunuKur();
  kategoriKutulariniKur();
  if (await db.oturumVarMi()) return araEkraniAc();
  // Müşteri giriş ekranına değil kitaplara düşsün; personel çıkış düğmesinden girer.
  if (db.ziyaretciGirisiVar) {
    try { await db.ziyaretciGirisiYap(); return araEkraniAc(); }
    catch (e) { console.warn('Ziyaretçi girişi olmadı:', e); }
  }
  koku('giris');
})();
