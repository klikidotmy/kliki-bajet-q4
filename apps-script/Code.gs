/**
 * KLIKI Bajet Q4 - API untuk PWA.
 * Projek Apps Script berasingan (script.google.com) yang buka sheet "Penjejak Bajet Marketing Q4 2026" ikut ID.
 * Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 * Set TOKEN dalam Project Settings > Script properties.
 */

const SHEET_ID = '1kIbaD_2i99siDW-TbNvftlAD6d_giHlC61rGr5XM4O0';

const TABS = {
  log: 'Log Belanja',
  mingguan: 'Mingguan',
  bulanan: 'Bulanan',
  checklist: 'Checklist',
  banner: 'Kira Banner',
  tetapan: 'Tetapan'
};

const OUTLETS = ['Sungai Petani', 'Kelang Lama', 'Alor Setar', 'Pendang'];
const CHANNELS = ['Meta CTWA', 'Google Ads (Raxbit)', 'TikTok Ads', 'On-ground'];

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!expected) throw new Error('TOKEN belum diset dalam Script properties.');
  if (token !== expected) throw new Error('Token salah.');
}

function sheet_(name) {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
  if (!sh) throw new Error('Tab tidak dijumpai: ' + name);
  return sh;
}

function display_(name, a1) {
  return sheet_(name).getRange(a1).getDisplayValues();
}

function doGet(e) {
  try {
    checkToken_(e.parameter.token);
    return json_({ ok: true, data: snapshot_() });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents);
    checkToken_(body.token);
    lock.waitLock(10000);
    let result;
    switch (body.action) {
      case 'addLog': result = addLog_(body.entry); break;
      case 'deleteLog': result = deleteLog_(body.row, body.check); break;
      case 'toggleTask': result = toggleTask_(body.row, body.done); break;
      case 'setBanner': result = setBanner_(body.outlet, body.values); break;
      default: throw new Error('Action tidak dikenali: ' + body.action);
    }
    SpreadsheetApp.flush();
    return json_({ ok: true, result: result, data: snapshot_() });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function snapshot_() {
  const logSh = sheet_(TABS.log);
  const lastA = lastFilledRow_(logSh, 1, 4);
  let log = [];
  if (lastA >= 4) {
    const vals = logSh.getRange(4, 1, lastA - 3, 9).getDisplayValues();
    log = vals.map(function (r, i) {
      return { row: i + 4, tarikh: r[0], outlet: r[1], channel: r[2], perkara: r[3],
        amaun: r[4], perbualan: r[5], nota: r[8] };
    }).filter(function (x) { return x.tarikh; }).reverse();
  }

  const ckSh = sheet_(TABS.checklist);
  const ckLast = lastFilledRow_(ckSh, 1, 4);
  let checklist = [];
  if (ckLast >= 4) {
    const vals = ckSh.getRange(4, 1, ckLast - 3, 8).getValues();
    const disp = ckSh.getRange(4, 3, ckLast - 3, 1).getDisplayValues();
    checklist = vals.map(function (r, i) {
      const d = r[2] instanceof Date ? Utilities.formatDate(r[2], 'Asia/Kuala_Lumpur', 'yyyy-MM-dd') : '';
      return { row: i + 4, no: r[0], fasa: r[1], tarikh: d, tarikhLabel: disp[i][0], tugas: r[3],
        cara: r[4], siapa: r[5], siap: r[6] === true, nota: r[7] };
    }).filter(function (x) { return x.tugas; });
  }

  return {
    updated: Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyy-MM-dd HH:mm'),
    outlets: OUTLETS,
    channels: CHANNELS,
    mingguan: display_(TABS.mingguan, 'A4:L16'),
    bulanan: display_(TABS.bulanan, 'A4:Q20'),
    channel: display_(TABS.bulanan, 'C24:L29'),
    banner: display_(TABS.banner, 'A4:P9'),
    bajetChannel: display_(TABS.tetapan, 'A49:E54'),
    peraturan: display_(TABS.tetapan, 'A40:B43'),
    log: log,
    checklist: checklist
  };
}

function lastFilledRow_(sh, col, startRow) {
  const n = sh.getMaxRows() - startRow + 1;
  if (n <= 0) return startRow - 1;
  const vals = sh.getRange(startRow, col, n, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (vals[i][0] !== '' && vals[i][0] !== null) return startRow + i;
  }
  return startRow - 1;
}

function parseDate_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) throw new Error('Tarikh tidak sah: ' + s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function addLog_(entry) {
  if (!entry) throw new Error('Tiada data.');
  if (OUTLETS.indexOf(entry.outlet) < 0) throw new Error('Outlet tidak sah.');
  if (CHANNELS.indexOf(entry.channel) < 0) throw new Error('Channel tidak sah.');
  const amaun = Number(entry.amaun);
  if (!(amaun > 0)) throw new Error('Amaun mesti lebih dari 0.');
  const perbualan = entry.perbualan === '' || entry.perbualan == null ? '' : Number(entry.perbualan);
  const sh = sheet_(TABS.log);
  const row = lastFilledRow_(sh, 1, 4) + 1;
  sh.getRange(row, 1, 1, 6).setValues([[parseDate_(entry.tarikh), entry.outlet, entry.channel,
    String(entry.perkara || ''), amaun, perbualan]]);
  sh.getRange(row, 9).setValue(String(entry.nota || ''));
  return { row: row };
}

function deleteLog_(row, check) {
  row = Number(row);
  const sh = sheet_(TABS.log);
  if (!(row >= 4)) throw new Error('Baris tidak sah.');
  const cur = sh.getRange(row, 1, 1, 5).getDisplayValues()[0];
  if (!check || cur[1] !== check.outlet || cur[4] !== check.amaun) {
    throw new Error('Baris dah berubah. Muat semula dan cuba lagi.');
  }
  sh.getRange(row, 1, 1, 6).clearContent();
  sh.getRange(row, 9).clearContent();
  // Rapatkan jurang supaya log kekal bersambung (kolum G:H ialah ARRAYFORMULA, tidak disentuh).
  const last = lastFilledRow_(sh, 1, 4);
  if (row < last) {
    const below = sh.getRange(row + 1, 1, last - row, 9).getValues();
    const aF = below.map(function (r) { return r.slice(0, 6); });
    const iCol = below.map(function (r) { return [r[8]]; });
    sh.getRange(row, 1, aF.length, 6).setValues(aF);
    sh.getRange(row, 9, iCol.length, 1).setValues(iCol);
    sh.getRange(last, 1, 1, 6).clearContent();
    sh.getRange(last, 9).clearContent();
  }
  return { deleted: row };
}

function toggleTask_(row, done) {
  row = Number(row);
  if (!(row >= 4)) throw new Error('Baris tidak sah.');
  sheet_(TABS.checklist).getRange(row, 7).setValue(done === true);
  return { row: row, done: done === true };
}

function setBanner_(outlet, values) {
  const idx = OUTLETS.indexOf(outlet);
  if (idx < 0) throw new Error('Outlet tidak sah.');
  const keys = ['bil', 'hargaBanner', 'upahBanner', 'permitBanner', 'hargaBunting', 'upahBunting', 'permitBunting'];
  const row = keys.map(function (k) {
    const v = values ? values[k] : '';
    return v === '' || v == null ? '' : Number(v);
  });
  sheet_(TABS.banner).getRange(5 + idx, 5, 1, 7).setValues([row]);
  return { outlet: outlet };
}
