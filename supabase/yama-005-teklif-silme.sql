-- YAMA 005 — alım teklifini silme (2026-09-07)
-- Şikâyet: "teklifler kısmında seçenekler var ama silme yok, silinmiyor."
-- Sebep: yama-004 tabloya yalnız insert/select/update verdi; delete ne
-- GRANT'ta ne de politikada vardı. Arayüzdeki düğme eksikti ama asıl kapı
-- buydu — düğme tek başına eklenseydi sunucu yine reddederdi.
--
-- Silme YÖNETİCİYE ÖZEL ve KALICI: kitap silmedeki gibi geri alma yok,
-- çünkü fotoğraflar aynı anda bucket'tan da gidiyor.

grant delete on table alim_teklifleri to authenticated;

drop policy if exists alim_teklifleri_yonetici_sil on alim_teklifleri;
create policy alim_teklifleri_yonetici_sil on alim_teklifleri
  for delete to authenticated using (yonetici_mi());

-- Not: storage tarafındaki silme izni yama-004'te zaten verilmişti
-- (alim_teklifleri_yonetici_sil on storage.objects). Politika adları tablo
-- başına benzersiz olduğu için aynı isim burada çakışmaz.
