// Pastelhayaller Sahaf — bağlantı ayarları
//
// Supabase kurulduğunda aşağıdaki iki satırı doldur, başka hiçbir yeri değiştirme.
// Boş kalırsa uygulama DENEME MODUNDA çalışır (veriler sadece o cihazda durur).
//
// Bu anahtar gizli değildir, herkese açık olması normaldir — veriyi koruyan şey
// Supabase tarafındaki RLS kuralları ve giriş zorunluluğudur.

export const SUPABASE_URL = "https://nbwczugdjrolfpuoewqj.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_SbMPKHAK6Q7G3gf_XbeKqw_yl92FMOi";

// --- Ziyaretçi hesabı ---------------------------------------------------
// Giriş ekranındaki "Ziyaretçi olarak gir" butonu bu hesapla oturum açar.
// Müşteri şifre öğrenmez, tek dokunuşla kitapları görür.
//
// Bu şifrenin burada, herkese açık dosyada durması BİLİNÇLİDİR: hesap
// salt-okunurdur ve bunu garanti eden şey dosya değil, veritabanındaki RLS
// (bkz. supabase/yama-002-roller-ve-ziyaretci.sql). Bu hesaba ASLA `roller`
// tablosunda 'yonetici' satırı açma.
//
// Kurulum: yama-002'yi çalıştır → Authentication → Users'tan bu kullanıcıyı
// oluştur → e-posta ve şifresini buraya yaz. Boş bırakırsan buton görünmez,
// uygulama eskisi gibi sadece şifreli girişle çalışır.
export const ZIYARETCI_EPOSTA = "ziyaretci@pastelhayaller.com";
export const ZIYARETCI_SIFRE = "1906";
