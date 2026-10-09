// Birincil konu rafı. NULL henüz sınıflandırılmamış demektir; Diğer bir tahmin değildir.
export const KATEGORILER = Object.freeze({
  roman: 'Roman', 'cizgi-roman': 'Çizgi Roman', oyku: 'Öykü', siir: 'Şiir',
  edebiyat: 'Edebiyat', tarih: 'Tarih', felsefe: 'Felsefe', cocuk: 'Çocuk Kitapları',
  bilim: 'Bilim', sanat: 'Sanat', psikoloji: 'Psikoloji', din: 'Din', egitim: 'Eğitim',
  'kisisel-gelisim': 'Kişisel Gelişim', dil: 'Dil', teknik: 'Teknik',
  'siyaset-toplum': 'Siyaset ve Toplum', 'saglik-yasam': 'Sağlık ve Yaşam',
  'ekonomi-is': 'Ekonomi ve İş', 'biyografi-ani': 'Biyografi ve Anı', diger: 'Diğer',
});
export const kategoriGecerli = deger => typeof deger === 'string' && Object.hasOwn(KATEGORILER, deger);
