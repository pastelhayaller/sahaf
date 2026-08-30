import * as db from './db.js';

const $ = (s) => document.querySelector(s);
const ekranlar = ['giris', 'ara', 'ekle', 'duzenle'];
let seciliKitap = null;
let sonSilinen = null;
let bildirimZaman = null;

function ekranGoster(ad) {
  ekranlar.forEach(e => { $('#ekran-' + e).hidden = (e !== ad); });
  window.scrollTo(0, 0);
}

function paraYaz(f) {
  if (f == null || f === '') return '';
  return Number(f).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}

function bildir(metin, geriAlFn) {
  clearTimeout(bildirimZaman);
  $('#bildirim-metin').textContent = metin;
  const btn = $('#bildirim-geri');
  btn.hidden = !geriAlFn;
  btn.onclick = geriAlFn ? () => { $('#bildirim').hidden = true; geriAlFn(); } : null;
  $('#bildirim').hidden = false;
  bildirimZaman = setTimeout(() => { $('#bildirim').hidden = true; }, geriAlFn ? 15000 : 2200);
}

function hataGoster(secici, e) {
  const el = $(secici);
  el.textContent = (e && e.message) || 'Bir şeyler ters gitti.';
  el.hidden = false;
}
function hataGizle(secici) { $(secici).hidden = true; }

// --- Sonuç listesi ------------------------------------------------------
function kartYap(k) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'kart';
  b.innerHTML = `
    <span class="raf-rozet"><span class="raf-etiket">RAF</span>${escapeHtml(k.raf)}</span>
    <span class="kart-orta">
      <span class="kart-ad">${escapeHtml(k.ad)}</span>
      ${k.yazar ? `<span class="kart-yazar">${escapeHtml(k.yazar)}</span>` : ''}
    </span>
    <span class="kart-fiyat">${paraYaz(k.fiyat)}</span>`;
  b.addEventListener('click', () => duzenleAc(k));
  return b;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function listeYaz(kitaplar, terimVarMi) {
  const kap = $('#sonuclar');
  kap.replaceChildren();
  $('#bos-sonuc').hidden = true;

  if (!kitaplar.length) {
    if (terimVarMi) $('#bos-sonuc').hidden = false;
    $('#ara-durum').textContent = terimVarMi ? '' : 'Henüz kitap eklenmemiş.';
    return;
  }
  kitaplar.forEach(k => kap.appendChild(kartYap(k)));
  $('#ara-durum').textContent = terimVarMi
    ? `${kitaplar.length} kitap bulundu`
    : 'Son eklenenler';
}

let aramaZaman = null;
async function aramayiCalistir() {
  const terim = $('#arama').value.trim();
  try {
    const sonuc = terim ? await db.ara(terim) : await db.sonEklenenler();
    listeYaz(sonuc, !!terim);
  } catch (e) {
    $('#ara-durum').textContent = e.message;
  }
}

// --- Raf önerileri ------------------------------------------------------
async function raflariTazele() {
  try {
    const liste = await db.raflar();
    const dl = $('#raf-listesi');
    dl.replaceChildren();
    liste.forEach(r => {
      const o = document.createElement('option');
      o.value = r;
      dl.appendChild(o);
    });
  } catch { /* öneri yoksa sorun değil */ }
}

// --- Ekle ---------------------------------------------------------------
function ekleAc(onDolguAd = '') {
  hataGizle('#ekle-hata');
  $('#ekle-ad').value = onDolguAd;
  $('#ekle-yazar').value = '';
  $('#ekle-fiyat').value = '';
  $('#ekle-notlar').value = '';
  raflariTazele();
  ekranGoster('ekle');
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
  seciliKitap = k;
  hataGizle('#duzenle-hata');
  $('#duz-ad').value = k.ad || '';
  $('#duz-yazar').value = k.yazar || '';
  $('#duz-raf').value = k.raf || '';
  $('#duz-fiyat').value = k.fiyat == null ? '' : k.fiyat;
  $('#duz-notlar').value = k.notlar || '';
  raflariTazele();
  ekranGoster('duzenle');
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
    ekranGoster('ara');
    await aramayiCalistir();
  } catch (e) {
    hataGoster('#duzenle-hata', e);
  }
});

// --- Silme + geri alma ---------------------------------------------------
function onaySor(metin, evetFn) {
  $('#onay-metin').textContent = metin;
  $('#onay').hidden = false;
  $('#onay-evet').onclick = () => { $('#onay').hidden = true; evetFn(); };
  $('#onay-vazgec').onclick = () => { $('#onay').hidden = true; };
}

$('#btn-satildi').addEventListener('click', () => {
  if (!seciliKitap) return;
  onaySor(`«${seciliKitap.ad}» silinecek. Emin misin?`, async () => {
    const yedek = { ...seciliKitap };
    try {
      await db.sil(yedek.id);
      sonSilinen = yedek;
      ekranGoster('ara');
      await aramayiCalistir();
      bildir('Kitap silindi', async () => {
        try {
          await db.geriKoy(sonSilinen);
          await aramayiCalistir();
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

$('#btn-cikis').addEventListener('click', async () => {
  await db.cikisYap();
  ekranGoster('giris');
});

// --- Bağlantılar ---------------------------------------------------------
$('#arama').addEventListener('input', () => {
  clearTimeout(aramaZaman);
  aramaZaman = setTimeout(aramayiCalistir, 300);
});
$('#btn-ekle-ac').addEventListener('click', () => ekleAc());
$('#btn-bunu-ekle').addEventListener('click', () => ekleAc($('#arama').value.trim()));
document.querySelectorAll('[data-geri]').forEach(function (b) {
  b.addEventListener('click', async function () {
    ekranGoster('ara');
    await aramayiCalistir();
  });
});

// --- Açılış --------------------------------------------------------------
async function araEkraniAc() {
  ekranGoster('ara');
  $('#btn-cikis').hidden = db.denemeModu;
  await raflariTazele();
  await aramayiCalistir();
  $('#arama').focus();
}

(async function baslat() {
  $('#deneme-serit').hidden = !db.denemeModu;
  if (await db.oturumVarMi()) await araEkraniAc();
  else ekranGoster('giris');
})();
