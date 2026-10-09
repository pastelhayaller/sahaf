// Bu kayıt yalnız bilgilendirmenin kapatılmasını hatırlar; rıza tercihi değildir.
(() => {
  const anahtar = 'pastelhayaller_depolama_bilgisi_kapatildi';
  const bildirim = document.getElementById('depolama-bilgisi');
  const kapat = document.getElementById('depolama-bilgisi-kapat');
  if (!bildirim || !kapat) return;
  let kapali = false;
  try { kapali = sessionStorage.getItem(anahtar) === '1'; } catch { /* Depolama engelliyse de bilgi okunabilir. */ }
  bildirim.hidden = kapali;
  kapat.addEventListener('click', () => {
    bildirim.hidden = true;
    try { sessionStorage.setItem(anahtar, '1'); } catch { /* Kapatma bu sayfada yine çalışır. */ }
  });
})();
