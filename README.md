# KLIKI Bajet Q4

PWA untuk jejak bajet marketing Q4 2026 KLIKI. App baca dan tulis terus ke Google Sheet **Penjejak Bajet Marketing Q4 2026** melalui Google Apps Script. Sheet kekal sebagai sumber data; app ialah cara cepat untuk isi dan tengok.

## Apa yang app buat

- **Ringkasan:** belanja Q4 dan bulan semasa, leads dan walk-in berbanding target dan pace, minggu semasa, status setiap outlet, belanja ikut channel, tugas akan datang.
- **Tambah:** rekod belanja (tarikh, outlet, channel, amaun, perbualan WhatsApp, perkara, nota) terus ke tab Log Belanja.
- **Log:** senarai belanja ikut outlet, boleh padam rekod.
- **Checklist:** tick tugas siap terus ke tab Checklist.
- **Banner:** isi sebut harga banner dan bunting, app kira berapa unit muat dalam bajet setiap outlet.

## Setup (sekali sahaja, lebih kurang 5 minit)

1. Buka script.google.com > **New project** (projek berasingan; ia buka sheet ikut `SHEET_ID` dalam kod).
2. Padam kod contoh, tampal semua isi `apps-script/Code.gs`, tekan Save.
3. **Deploy** > **New deployment** > jenis **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Tekan Deploy, benarkan akses bila diminta, salin **Web app URL** (berakhir dengan `/exec`).
4. Tampal URL tu dalam `API_URL` di atas `app.js`, commit dan push.
5. Buka app di telefon. Tiada login: app terus baca sheet.
6. Pasang ke skrin utama: Safari > Share > Add to Home Screen, atau Chrome > menu > Install app.

Bila ubah `Code.gs` kemudian: **Deploy** > **Manage deployments** > edit > Version: **New version**. URL kekal sama.

## Keselamatan

- Tiada token. URL Apps Script ada dalam `app.js`, dan repo ni public, jadi sesiapa yang jumpa URL tu boleh baca bajet dan tambah, ubah atau padam rekod dalam sheet.
- Kalau perlu tutup akses: **Deploy** > **Manage deployments** > **Archive**, kemudian buat deployment baru dan tukar `API_URL`.
- Simpan salinan sheet (File > Version history) supaya data boleh dipulihkan kalau ada orang ubah.

## Struktur

```
index.html, style.css, app.js   UI (vanilla JS, tiada build)
sw.js, manifest.webmanifest     PWA (cache app shell; data sentiasa terus dari sheet)
icons/                          ikon app dan logo
apps-script/Code.gs             API untuk sheet (doGet = baca, doPost = tulis)
```
