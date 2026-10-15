(() => {
  // Gerçek web akışı kimliği girilene kadar Google'a hiçbir istek yapılmaz.
  const kimlik = 'G-XBP3WS07JM';
  const anahtar = 'pastelhayaller_analiz_tercihi_v1';
  const sure = 180 * 24 * 60 * 60 * 1000;
  let tercih = null, basladi = false;
  const gecerli = () => tercih && tercih.son > Date.now() && tercih.izin === true;
  try {
    const kayit = JSON.parse(localStorage.getItem(anahtar));
    if (kayit && typeof kayit.izin === 'boolean' && kayit.son > Date.now()) tercih = kayit;
  } catch { /* Depolama engellenirse varsayılan kapalı kalır. */ }
  function olc(ad, veri = {}) {
    if (!basladi || !gecerli() || document.body.dataset.rol === 'yonetici') return;
    if (!['page_view', 'view_item', 'add_to_cart', 'whatsapp_click', 'social_click'].includes(ad)) return;
    const temiz = { page_location: location.origin + location.pathname, page_title: 'Pastelhayaller Sahaf', page_referrer: '' };
    try { temiz.page_referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch { /* Tam yönlendirme adresi gönderilmez. */ }
    if (typeof veri.item_id === 'string' && /^[a-z0-9-]{1,40}$/i.test(veri.item_id)) temiz.items = [{ item_id: veri.item_id, quantity: 1 }];
    if (Number.isInteger(veri.kitap_sayisi) && veri.kitap_sayisi >= 0) temiz.kitap_sayisi = veri.kitap_sayisi;
    if (veri.kaynak === 'sepet') temiz.kaynak = 'sepet';
    if (veri.platform === 'instagram') temiz.platform = 'instagram';
    window.gtag('event', ad, temiz);
  }
  window.pastelOlcum = olc;
  function baslat() {
    if (!['pastelhayaller.com', 'www.pastelhayaller.com'].includes(location.hostname) || basladi || !gecerli() || !/^G-[A-Z0-9]+$/.test(kimlik)) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window['ga-disable-' + kimlik] = false;
    window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    window.gtag('js', new Date());
    window.gtag('config', kimlik, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: 15552000, cookie_update: false, page_location: location.origin + location.pathname, page_referrer: '', page_title: 'Pastelhayaller Sahaf' });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + kimlik;
    document.head.appendChild(script);
    basladi = true;
    olc('page_view');
    if (location.pathname.startsWith('/vitrin/kitap/')) olc('view_item', { item_id: location.pathname.match(/-([a-z0-9]{8})\.html$/)?.[1] });
  }
  function cerezleriSil() {
    for (const cerez of document.cookie.split(';')) {
      const ad = cerez.split('=')[0].trim();
      if (!/^_ga(?:_|$)/.test(ad)) continue;
      for (const domain of ['', location.hostname, '.' + location.hostname]) {
        document.cookie = ad + '=; Max-Age=0; path=/' + (domain ? '; domain=' + domain : '') + '; SameSite=Lax';
      }
    }
  }
  function sec(izin) {
    tercih = { izin, son: Date.now() + sure };
    try { localStorage.setItem(anahtar, JSON.stringify(tercih)); } catch { /* Tercih bu sayfada geçerli kalır. */ }
    kart.hidden = true;
    if (izin) baslat();
    else {
      window['ga-disable-' + kimlik] = true;
      cerezleriSil();
      if (basladi) location.reload();
    }
  }
  const stil = document.createElement('link');
  stil.rel = 'stylesheet'; stil.href = '/analiz.css?v=001'; document.head.appendChild(stil);
  const kart = document.createElement('aside');
  kart.className = 'analiz-karti'; kart.setAttribute('aria-label', 'Çerez tercihi');
  kart.innerHTML = '<p>Sepet ve oturum için gerekli kayıtları kullanıyoruz. İzin verirsen ziyaretleri ve kitaplarla etkileşimi Google Analytics ile ölçeriz. <a href="/cerez-politikasi.html">Çerez bilgilendirmesi</a></p><div><button type="button" data-analiz="hayir">Yalnızca gerekli</button><button type="button" data-analiz="evet">Analize izin ver</button></div>';
  kart.hidden = tercih !== null || !/^G-[A-Z0-9]+$/.test(kimlik);
  document.body.appendChild(kart);
  kart.querySelector('[data-analiz="hayir"]').addEventListener('click', () => sec(false));
  kart.querySelector('[data-analiz="evet"]').addEventListener('click', () => sec(true));
  document.querySelectorAll('[data-analiz-tercihi]').forEach(btn => btn.addEventListener('click', () => { kart.hidden = false; kart.querySelector('button').focus(); }));
  document.addEventListener('click', ev => {
    const bag = ev.target.closest?.('a[href]');
    if (!bag) return;
    try {
      const url = new URL(bag.href);
      if (url.hostname === 'wa.me') olc('whatsapp_click');
      if (url.hostname === 'www.instagram.com') olc('social_click', { platform: 'instagram' });
    } catch { /* Geçersiz bağlantı ölçülmez. */ }
  });
  window.addEventListener('storage', ev => { if (ev.key === anahtar) location.reload(); });
  baslat();
})();
