// Aynı doğrulama URL, form ve sunucu sorgusu için kullanılır.
export function fiyatAraligi(minFiyat = null, maxFiyat = null) {
  const sinir = value => {
    if (value == null || value === '') return null;
    const text = String(value).trim();
    if (!text) return null;
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) throw new Error('Fiyatı sıfır veya daha büyük, en fazla iki ondalık basamakla yaz.');
    const n = Number(text.replace(',', '.'));
    if (!Number.isFinite(n) || n > Number.MAX_SAFE_INTEGER / 100) throw new Error('Geçerli bir fiyat yaz.');
    return n;
  };
  const alt = sinir(minFiyat), ust = sinir(maxFiyat);
  if (alt !== null && ust !== null && alt > ust) throw new Error('En düşük fiyat, en yüksek fiyattan büyük olamaz.');
  return { minFiyat: alt, maxFiyat: ust };
}
