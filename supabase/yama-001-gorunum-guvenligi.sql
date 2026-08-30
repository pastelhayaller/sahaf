-- YAMA 001 — raflar görünümü RLS'i atlıyordu (2026-08-30, canlı probda bulundu)
-- Şemayı zaten çalıştırdıysan SQL Editor'de SADECE bunu çalıştır.

alter view raflar set (security_invoker = on);
revoke all on raflar from anon;
revoke all on kitaplar from anon;
