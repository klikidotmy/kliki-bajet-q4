/**
 * Sync belanja iklan ke tab Log Belanja, setiap pagi.
 * - Meta CTWA: fail harian kliki-meta-YYYY-MM-DD.json (folder Drive "KLIKI Meta Report Data").
 *   Setiap fail ada jumlah bulan setakat tarikh tu ikut ad set; belanja sehari = beza dengan fail sebelumnya.
 * - Google Ads (Raxbit): tab Prestasi dan Ringkasan dalam "KLIKI – Tracker Google Ads (Raxbit)".
 *   Kos iklan sebulan ikut outlet, campur yuran monitor dibahagi sama rata antara outlet yang beriklan, campur SST.
 * Baris sync bertanda "auto:..." dalam kolum Nota dan dikemas kini setiap kali sync, bukan ditambah semula.
 * Pasang: run installSyncTrigger sekali dari editor.
 */

var META_FOLDER_ID = '10YBFZD7o0qlQSvoAi5Q-E-KK0q0a6Zqw';
var RAXBIT_SHEET_ID = '1XqBEHIsfon1J4CGPwx2_8YomxhA5jQHJnSb9FPBseWY';
var SYNC_TZ = 'Asia/Kuala_Lumpur';
var SYNC_HOUR = 10;                       // fail Meta sampai sekitar 9:15 pagi
var Q4_MONTHS = ['2026-10', '2026-11', '2026-12'];
var META_CODES = { KLL: 'Kelang Lama', SP: 'Sungai Petani', AS: 'Alor Setar', PDG: 'Pendang' };
var RAXBIT_OUTLETS = { 'Kulim / Kelang Lama': 'Kelang Lama', 'Kelang Lama': 'Kelang Lama',
  'Sungai Petani': 'Sungai Petani', 'Alor Setar': 'Alor Setar', 'Pendang': 'Pendang' };
var MONTH_LABEL = { '10': 'Okt', '11': 'Nov', '12': 'Dis' };

function round2_(n) { return Math.round(n * 100) / 100; }

function moneyNum_(v) {
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function metaOutlet_(adsetName) {
  var code = String(adsetName || '').split('|')[0].trim().toUpperCase();
  return META_CODES[code] || null;
}

/** files: [{date:'2026-11-07', data:{month:{rows:[{name,spend,messages}]}}}], sudah disusun ikut tarikh. */
function metaEntries_(files) {
  var out = [];
  var unknown = {};
  var prev = {}, prevMonth = '';
  files.forEach(function (f) {
    var month = f.date.slice(0, 7);
    if (Q4_MONTHS.indexOf(month) < 0) return;
    if (month !== prevMonth) { prev = {}; prevMonth = month; }
    var mtd = {};
    ((f.data.month || {}).rows || []).forEach(function (r) {
      var outlet = metaOutlet_(r.name);
      if (!outlet) { unknown[r.name] = true; return; }
      var m = mtd[outlet] || (mtd[outlet] = { spend: 0, messages: 0 });
      m.spend += Number(r.spend) || 0;
      m.messages += Number(r.messages) || 0;
    });
    Object.keys(mtd).forEach(function (outlet) {
      var p = prev[outlet] || { spend: 0, messages: 0 };
      var spend = round2_(mtd[outlet].spend - p.spend);
      var messages = Math.round(mtd[outlet].messages - p.messages);
      if (Math.abs(spend) < 0.01 && messages === 0) return;
      out.push({ key: 'auto:meta:' + f.date + ':' + outlet, date: f.date, outlet: outlet, channel: 'Meta CTWA',
        perkara: 'Meta CTWA (auto)', amaun: spend, perbualan: messages });
    });
    prev = mtd;
  });
  return { entries: out, unknown: Object.keys(unknown) };
}

/** prestasi: nilai tab Prestasi termasuk header. today: 'yyyy-MM-dd'. */
function googleEntries_(prestasi, yuran, sst, today) {
  var byMonth = {};
  prestasi.slice(1).forEach(function (r) {
    var month = r[0] instanceof Date ? Utilities.formatDate(r[0], SYNC_TZ, 'yyyy-MM') : String(r[0]).trim();
    var outlet = RAXBIT_OUTLETS[String(r[1]).trim()];
    var kos = moneyNum_(r[3]);
    if (Q4_MONTHS.indexOf(month) < 0 || !outlet || !(kos > 0)) return;
    var m = byMonth[month] || (byMonth[month] = {});
    m[outlet] = (m[outlet] || 0) + kos;
  });
  var out = [];
  Object.keys(byMonth).forEach(function (month) {
    var outlets = Object.keys(byMonth[month]);
    var fee = yuran / outlets.length;
    var y = +month.slice(0, 4), mo = +month.slice(5, 7);
    var last = month + '-' + ('0' + new Date(y, mo, 0).getDate()).slice(-2);
    var date = today < last ? today : last;
    outlets.forEach(function (outlet) {
      out.push({ key: 'auto:google:' + month + ':' + outlet, date: date, outlet: outlet, channel: 'Google Ads (Raxbit)',
        perkara: 'Google Ads ' + MONTH_LABEL[month.slice(5)] + ' (auto, termasuk yuran dan SST)',
        amaun: round2_((byMonth[month][outlet] + fee) * (1 + sst)), perbualan: '' });
    });
  });
  return out;
}

function readMetaFiles_() {
  var latest = {};
  var it = DriveApp.getFolderById(META_FOLDER_ID).getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var m = /^kliki-meta-(\d{4}-\d{2}-\d{2})\.json$/.exec(f.getName());
    if (!m) continue;
    if (!latest[m[1]] || f.getLastUpdated() > latest[m[1]].getLastUpdated()) latest[m[1]] = f;
  }
  return Object.keys(latest).sort().map(function (date) {
    return { date: date, data: JSON.parse(latest[date].getBlob().getDataAsString()) };
  });
}

function readGoogle_(today) {
  var ss = SpreadsheetApp.openById(RAXBIT_SHEET_ID);
  var pr = ss.getSheetByName('Prestasi');
  var prestasi = pr.getRange(1, 1, pr.getLastRow(), 4).getValues();
  var ring = ss.getSheetByName('Ringkasan');
  var yuran = moneyNum_(ring.getRange('B3').getValue());
  var sst = ring.getRange('B4').getValue();
  sst = typeof sst === 'number' ? sst : moneyNum_(sst) / 100;
  return googleEntries_(prestasi, yuran, sst, today);
}

/** Tulis entries ke Log Belanja: kemas kini baris "auto:" yang sama kunci, tambah yang baru. */
function upsertLog_(entries) {
  var sh = sheet_(TABS.log);
  var last = lastFilledRow_(sh, 1, 4);
  var index = {};
  var block = [];
  if (last >= 4) {
    block = sh.getRange(4, 1, last - 3, 9).getValues();
    block.forEach(function (r, i) {
      var k = String(r[8]);
      if (k.indexOf('auto:') === 0) index[k] = i + 4;
    });
  }
  var updated = 0;
  var fresh = [];
  entries.forEach(function (e) {
    var row = [parseDate_(e.date), e.outlet, e.channel, e.perkara, e.amaun, e.perbualan];
    var at = index[e.key];
    if (at) {
      var cur = block[at - 4];
      var same = cur[0] instanceof Date && cur[0].getTime() === row[0].getTime() &&
        cur[1] === row[1] && cur[2] === row[2] && Number(cur[4]) === row[4] && String(cur[5]) === String(row[5]);
      if (!same) { sh.getRange(at, 1, 1, 6).setValues([row]); updated++; }
    } else {
      fresh.push({ row: row, key: e.key });
    }
  });
  if (fresh.length) {
    var start = last + 1;
    sh.getRange(start, 1, fresh.length, 6).setValues(fresh.map(function (f) { return f.row; }));
    sh.getRange(start, 9, fresh.length, 1).setValues(fresh.map(function (f) { return [f.key]; }));
  }
  return { added: fresh.length, updated: updated };
}

function syncSpend() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var today = Utilities.formatDate(new Date(), SYNC_TZ, 'yyyy-MM-dd');
    var meta = metaEntries_(readMetaFiles_());
    var google = readGoogle_(today);
    var res = upsertLog_(meta.entries.concat(google));
    SpreadsheetApp.flush();
    var summary = { today: today, meta: meta.entries.length, google: google.length, added: res.added,
      updated: res.updated, unknownAdsets: meta.unknown };
    Logger.log(JSON.stringify(summary));
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function installSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncSpend') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncSpend').timeBased().everyDays(1).atHour(SYNC_HOUR).inTimezone(SYNC_TZ).create();
  return syncSpend();
}
