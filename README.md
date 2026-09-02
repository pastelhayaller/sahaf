# Pastelhayaller Sahaf — kitap envanteri

Kurulum gerektirmeyen tek sayfalık web uygulaması. Telefondan, tabletten,
bilgisayardan aynı linkle açılır.

## Ne yapar
- **Ara** — kitap adı veya yazar yaz, hangi rafta olduğunu gör
- **Listele** — arama boşken tüm envanter görünür, sayfa başına 20 kitap
- **Sırala** — son eklenenler · ada göre (A→Z) · fiyat (ucuz/pahalı)
- **Ekle** — kitap adı, yazar, raf, fiyat, not
- **Düzenle** — fiyat ve raf güncellenir
- **Sil** — kitap satılınca listeden kaldırılır (15 saniye "Geri al" hakkı var)

Türkçe arama harf duyarsızdır: "cigdem" yazınca "Çiğdem" bulunur.
Fiyatı girilmemiş kitaplar, fiyata göre sıralamada her iki yönde de en sonda kalır.

## İki tür kullanıcı

| | Görür | Ekler / düzenler / siler |
|---|---|---|
| **Personel** (baba + eş) | ✅ | ✅ |
| **Ziyaretçi** (müşteri) | ✅ | ❌ |

Ziyaretçi giriş ekranındaki **"Ziyaretçi olarak gir"** butonuyla, şifre yazmadan
girer. Ziyaretçide "+" düğmesi ve düzenleme ekranı yoktur; kartlar tıklanmaz.

**Bu bir arayüz süsü değildir.** Butonu gizlemek güvenlik sağlamaz — anon anahtar
herkese açıktır. Asıl kilit veritabanındadır: `kitaplar` tablosunda yazma
politikaları `yonetici_mi()` şartına bağlıdır, ziyaretçinin göndereceği her
INSERT/UPDATE/DELETE Supabase tarafından reddedilir. Bkz.
`supabase/yama-002-roller-ve-ziyaretci.sql`.

Rol, `roller` tablosundan okunur. **Satırı olmayan kullanıcı ziyaretçidir** —
varsayılan reddetme, yani ileride elle açılan bir hesap kazara yazma yetkisi almaz.

## Deneme modu
`config.js` boşken uygulama **deneme modunda** çalışır: veriler sadece o cihazın
tarayıcısında durur, başka cihaza geçmez. Üstte sarı şerit bunu söyler.

## Gerçek kullanıma geçiş
1. Supabase'de yeni bir proje aç.
2. SQL Editor'de `supabase/schema.sql` dosyasını olduğu gibi çalıştır.
3. Authentication → Providers → Email: **signup'ı kapat**, iki kullanıcı elle ekle
   (baba + eş), sonra ikisini `roller` tablosunda `'yonetici'` yap
   (komut `schema.sql`'in sonunda yorum olarak duruyor).
4. `config.js` içine proje URL'sini ve `anon` anahtarını yaz.
5. Sayfayı yayınla (GitHub Pages yeterli) ve linki dükkândaki cihaza kaydet.

### Ziyaretçi girişini açmak
Kurulu bir projeye ziyaretçi eklemek için sıra şu — **sırası önemli**:

1. SQL Editor'de `supabase/yama-002-roller-ve-ziyaretci.sql` dosyasını çalıştır.
   (Bu, o an var olan tüm kullanıcıları yönetici yapar — yani baba + eş.)
2. Authentication → Users → yeni kullanıcı: ziyaretçi hesabı. `roller` tablosuna
   **satır ekleme** — satırı olmaması onu zaten salt-okunur yapar.
3. O hesabın e-posta ve şifresini `config.js` içindeki `ZIYARETCI_EPOSTA` /
   `ZIYARETCI_SIFRE` alanlarına yaz. İkisi de doluysa buton görünür, boşsa görünmez.

Şifrenin herkese açık dosyada durması bilinçlidir: hesap salt-okunurdur ve bunu
garanti eden şey dosya değil, veritabanındaki politikadır.

Yama çalıştırılmadan uygulama açılırsa üstte turuncu bir uyarı şeridi çıkar —
"rol tablosu yok, ziyaretçi kısıtlaması devrede değil". Şeridi gördüğünde 1. adım
atlanmış demektir.

### Kilidin çalıştığını doğrulamak
"Ziyaretçi olarak gir" ile girdikten sonra tarayıcı konsolunda:

```js
const db = await import('./db.js');
await db.ekle({ ad: 'TEST', raf: 'X1' });
```

Beklenen sonuç: **"Ziyaretçi hesabı değişiklik yapamaz."** hatası.
Kitap gerçekten eklenirse yama uygulanmamıştır veya ziyaretçi hesabına
`roller` tablosunda yanlışlıkla `'yonetici'` satırı açılmıştır.

## Yerelde çalıştırmak
```
python -m http.server 8765
```
Sonra `http://127.0.0.1:8765/` adresini aç.
