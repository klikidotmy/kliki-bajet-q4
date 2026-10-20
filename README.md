# KLIKI Bajet Q4

PWA untuk jejak bajet marketing Q4 2026 KLIKI. App baca dan tulis terus ke Google Sheet **Penjejak Bajet Marketing Q4 2026** melalui Google Apps Script. Sheet kekal sebagai sumber data; app ialah cara cepat untuk isi dan tengok.

## Apa yang app buat

- **Ringkasan:** belanja Q4 dan bulan semasa, leads dan walk-in berbanding target dan pace, minggu semasa, status setiap outlet, belanja ikut channel, tugas akan datang.
- **Tambah:** rekod belanja (tarikh, outlet, channel, amaun, perbualan WhatsApp, perkara, nota) terus ke tab Log Belanja.
- **Log:** senarai belanja ikut outlet, boleh padam rekod.
- **Checklist:** tick tugas siap terus ke tab Checklist.
- **Banner:** isi sebut harga banner dan bunting, app kira berapa unit muat dalam bajet setiap outlet.

## Setup (sekali sahaja, lebih kurang 5 minit)

1. Buka sheet **Penjejak Bajet Marketing Q4 2026** > **Extensions** > **Apps Script**.
2. Padam kod contoh, tampal semua isi `apps-script/Code.gs`, tekan Save.
3. **Project Settings** (ikon gear) > **Script properties** > Add: `TOKEN` = kata laluan panjang pilihan sendiri (contoh 20 aksara rawak).
4. **Deploy** > **New deployment** > jenis **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Tekan Deploy, benarkan akses bila diminta, salin **Web app URL** (berakhir dengan `/exec`).
5. Buka app di telefon, tekan ikon gear, tampal URL dan TOKEN, tekan Simpan.
6. Pasang ke skrin utama: Safari > Share > Add to Home Screen, atau Chrome > menu > Install app.

Bila ubah `Code.gs` kemudian: **Deploy** > **Manage deployments** > edit > Version: **New version**. URL kekal sama.

## Keselamatan

- URL dan TOKEN disimpan dalam telefon sahaja (localStorage), tidak dalam repo.
- Tanpa TOKEN yang betul, Apps Script tolak semua permintaan.
- Jangan kongsi URL bersama TOKEN. Kalau terbocor, tukar TOKEN dalam Script properties.

## Struktur

```
index.html, style.css, app.js   UI (vanilla JS, tiada build)
sw.js, manifest.webmanifest     PWA (cache app shell; data sentiasa terus dari sheet)
icons/                          ikon app dan logo
apps-script/Code.gs             API untuk sheet (doGet = baca, doPost = tulis)
```
