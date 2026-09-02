import * as db from './db.js';

const $ = (s) => document.querySelector(s);
const ekranlar = ['giris', 'ara', 'ekle', 'duzenle'];
let seciliKitap = null;
let sonSilinen = null;
let bildirimZaman = null;
let bildirimSayac = null;

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
  durumUygula(d);
  if (d.ekran === 'ara' && !d.onay) await listeyiTazele();
});

function paraYaz(f) {
  if (f == null || f === '') return '';
  return Number(f).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
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

// --- Sonuç listesi ------------------------------------------------------
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function kartIci(k) {
  return `
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
  }
  return el;
}

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

// --- Ekle ---------------------------------------------------------------
function ekleAc(onDolguAd = '') {
  if (!yoneticiMi()) return; // Ziyaretçi bu ekrana hiç giremez.
  hataGizle('#ekle-hata');
  $('#ekle-ad').value = onDolguAd;
  $('#ekle-yazar').value = '';
  $('#ekle-fiyat').value = '';
  $('#ekle-notlar').value = '';
  raflariTazele();
  git('ekle');
  $('#ekle-ad').focus();
}

$('#ekle-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  hataGizle('#ekle-hata');
  const kitap = {
    ad: $('#ekle-ad').value,
    yazar: $('#ekle-yazar').value,
    raf: $('#ekle-raf').value,
    fiyat: $('#ekle-fiyat').value,
    notlar: $('#ekle-notlar').value,
  };
  try {
    await db.ekle(kitap);
    // Raf DOLU kalır: aynı rafa arka arkaya giriş için.
    $('#ekle-ad').value = '';
    $('#ekle-yazar').value = '';
    $('#ekle-fiyat').value = '';
    $('#ekle-notlar').value = '';
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
  $('#deneme-serit').hidden = !db.denemeModu;
  $('#ziyaretci-alani').hidden = !db.ziyaretciGirisiVar;
  siralamaKutusunuKur();
  if (await db.oturumVarMi()) await araEkraniAc();
  else koku('giris');
})();
