# DIMONEX — RUNBOOK INSIDEN OPERASIONAL & KEUANGAN

Dokumen prosedur standar penanganan insiden darurat (*Incident Response Standard Operating Procedure*) untuk bursa spot aset kripto DIMONEX.

***

## 1. Matriks Tingkat Keparahan (Severity Levels)

| Level | Kategori Insiden | Dampak Finansial & Operasional | Waktu Respon Maksimal (SLA) |
|---|---|---|---|
| **SEV-1 (CRITICAL)** | Pelanggaran Invarian Saldo Ledger, Upaya Double-Spend, Selisih Saldo Riil vs Tercatat, Kompromi Kunci Penarikan | Potensi kehilangan modal nasabah atau integritas buku besar | $\le$ 5 Menit (Eskalasi C-Level & Freeze Darurat) |
| **SEV-2 (HIGH)** | Matching Engine Stuck/OOM, Fluktuasi Harga Ekstrem > 20% dalam 1 menit, Feed WebSocket terputus massal | Gangguan likuiditas atau eksekusi order tidak wajar | $\le$ 15 Menit |
| **SEV-3 (MEDIUM)** | Keterlambatan verifikasi KYC pihak ketiga, delay konfirmasi Virtual Account bank > 10 menit | Penundaan pengalaman pengguna parsial | $\le$ 1 Jam |
| **SEV-4 (LOW)** | Gangguan minor tampilan UI, typo teks, latensi dashboard statistik | Tidak ada dampak finansial | $\le$ 4 Jam |

***

## 2. Prosedur Penanganan SEV-1: Pelanggaran Invarian Saldo Ledger

### Gejala:
- Endpoint `/api/ledger/verify-invariants` mengembalikan `isConsistent: false`
- Log alarm Prometheus `dimonex_invariants_valid == 0` menyala

### Langkah Mitigasi Langsung:
1. **Eksekusi Emergency Trading Halt**:
   Segera hentikan matching engine untuk semua pair via API admin:
   ```bash
   curl -X POST http://localhost:3000/api/admin/pairs/toggle-halt \
     -H "Authorization: Bearer <SUPERADMIN_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"pairId": "BTC-IDR", "isHalted": true}'
   ```
   Ulangi untuk pair `ETH-IDR` dan `USDT-IDR`.

2. **Kunci Penarikan Dana (Freeze Global Outflows)**:
   Semua antrean penarikan dana (fiat dan kripto) dialihkan ke peninjauan manual manual approval.

3. **Audit Snapshot Jurnal Transaksi**:
   Periksa entri jurnal terakhir sebelum desinkronisasi:
   ```sql
   SELECT j.id, j.tx_type, j.reference_id, SUM(CASE WHEN e.entry_type='DEBIT' THEN e.amount ELSE 0 END) as total_debit,
          SUM(CASE WHEN e.entry_type='CREDIT' THEN e.amount ELSE 0 END) as total_credit
   FROM journal_transactions j
   JOIN ledger_entries e ON e.journal_id = j.id
   GROUP BY j.id, j.tx_type, j.reference_id
   HAVING SUM(CASE WHEN e.entry_type='DEBIT' THEN e.amount ELSE 0 END) != SUM(CASE WHEN e.entry_type='CREDIT' THEN e.amount ELSE 0 END);
   ```

4. **Event Log Replay**:
   Jika in-memory matching engine mengalami diskrepansi, jalankan rekonsiliasi ulang event log dari WAL terakhir yang terverifikasi konsisten.

***

## 3. Prosedur Penanganan SEV-2: Flash Crash atau Manipulasi Pasar

### Gejala:
- Harga aset anjlok atau melonjak $> 15\%$ tanpa pergerakan setara di bursa global
- Upaya wash-trading atau self-trade masif terdeteksi

### Tindakan:
1. Periksa log deteksi Self-Trade Prevention:
   ```bash
   curl http://localhost:3000/api/risk/suspicious-activity \
     -H "Authorization: Bearer <ADMIN_TOKEN>"
   ```
2. Bekukan akun pelaku (*Account Freeze*):
   ```bash
   curl -X POST http://localhost:3000/api/risk/account-freeze \
     -H "Authorization: Bearer <ADMIN_TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"userId": "<TARGET_USER_ID>", "freeze": true, "reason": "Manipulasi harga pasar terdeteksi"}'
   ```
3. Hentikan trading sementara pair terkait (Halt), batalkan order manipulatir yang belum terisi (*unfilled orders*), lalu buka kembali trading setelah likuiditas stabil.

***

## 4. Runbook Pemulihan Pasca-Insiden (Post-Mortem)
- Publikasikan laporan insiden (*Incident Retrospective*) dalam tempo maksimal 24 jam.
- Periksa konsistensi Proof-of-Reserves: Saldo hot wallet + cold wallet $\ge$ Total liabilitas saldo nasabah di `ledger_accounts`.
- Laporkan ke regulator Bappebti / OJK jika ada insiden material terkait dana nasabah sesuai POJK/Perba yang berlaku.
