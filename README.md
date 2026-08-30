# Pastelhayaller Sahaf — kitap envanteri

Kurulum gerektirmeyen tek sayfalık web uygulaması. Telefondan, tabletten,
bilgisayardan aynı linkle açılır.

## Ne yapar
- **Ara** — kitap adı veya yazar yaz, hangi rafta olduğunu gör
- **Ekle** — kitap adı, yazar, raf, fiyat, not
- **Düzenle** — fiyat ve raf güncellenir
- **Sil** — kitap satılınca listeden kaldırılır (15 saniye "Geri al" hakkı var)

Türkçe arama harf duyarsızdır: "cigdem" yazınca "Çiğdem" bulunur.

## Deneme modu
`config.js` boşken uygulama **deneme modunda** çalışır: veriler sadece o cihazın
tarayıcısında durur, başka cihaza geçmez. Üstte sarı şerit bunu söyler.

## Gerçek kullanıma geçiş
1. Supabase'de yeni bir proje aç.
2. SQL Editor'de `supabase/schema.sql` dosyasını olduğu gibi çalıştır.
3. Authentication → Providers → Email: **signup'ı kapat**, iki kullanıcı elle ekle
   (baba + eş).
4. `config.js` içine proje URL'sini ve `anon` anahtarını yaz.
5. Sayfayı yayınla (GitHub Pages yeterli) ve linki dükkândaki cihaza kaydet.

## Yerelde çalıştırmak
```
python -m http.server 8765
```
Sonra `http://127.0.0.1:8765/` adresini aç.
