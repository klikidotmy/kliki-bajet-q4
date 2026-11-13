'use strict';

/* ---------- storage (per-device convenience) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* URL Web app Apps Script (berakhir dengan /exec). Tiada token: sesiapa yang ada URL ni boleh baca dan tulis sheet. */
const API_URL = 'https://script.google.com/macros/s/AKfycbz73ZyFEVezFnSEW6EIPh362tzWxIJ2TDZn_tfLpj5oFrkE8K8qbhXZ6XJQ2V1MtHAwgA/exec';

const state = {
  data: store.get('kbq4.data', null),
  view: 'home',
  month: null,
  checkFilter: 'aktif',
  logFilter: 'Semua',
  busy: false
};

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (s) => { if (s == null || s === '') return 0; const n = parseFloat(String(s).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
const rm = (n) => { const f = Math.round(Number(n) * 100) % 100 ? 2 : 0; return 'RM' + Number(n).toLocaleString('en-MY', { minimumFractionDigits: f, maximumFractionDigits: f }); };
const pct = (n) => (n * 100).toFixed(0) + '%';
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const parseDMY = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

/* ---------- API ---------- */
async function readJson(res) {
  try { return await res.json(); }
  catch (e) { throw new Error('Sheet tak pulangkan data. Semak deployment Apps Script.'); }
}

async function apiGet() {
  const u = API_URL + (API_URL.includes('?') ? '&' : '?') + 't=' + Date.now();
  const res = await fetch(u, { method: 'GET', redirect: 'follow' });
  const j = await readJson(res);
  if (!j.ok) throw new Error(j.error || 'Gagal baca sheet.');
  return j.data;
}

async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  const j = await readJson(res);
  if (!j.ok) throw new Error(j.error || 'Gagal simpan.');
  return j;
}

function setData(d) {
  state.data = d; store.set('kbq4.data', d);
  $('#updated').textContent = d && d.updated ? 'Sync ' + d.updated.slice(5) : 'Belum sync';
}

async function refresh(silent) {
  if (state.busy) return;
  state.busy = true; $('#btnRefresh').disabled = true;
  try { setData(await apiGet()); render(); if (!silent) toast('Data terkini dari sheet'); }
  catch (e) { toast(navigator.onLine ? e.message : 'Offline. Papar data terakhir.'); if (!state.data) render(); }
  finally { state.busy = false; $('#btnRefresh').disabled = false; }
}

async function mutate(payload, okMsg) {
  try {
    const j = await apiPost(payload);
    if (j.data) setData(j.data);
    render(); if (okMsg) toast(okMsg); return true;
  } catch (e) { toast(navigator.onLine ? e.message : 'Offline. Tak dapat simpan.'); return false; }
}

/* ---------- helpers on snapshot ---------- */
function currentMonthNo() {
  const m = new Date().getMonth() + 1;
  return m < 10 ? 10 : m > 12 ? 12 : m;
}
function bulananRows(d, monthNo) {
  return d.bulanan.slice(1).filter((r) => num(r[0]) === monthNo);
}
function currentWeek(d) {
  const rows = d.mingguan.slice(1, -1);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return rows.find((r) => { const a = parseDMY(r[0]), b = parseDMY(r[1]); return a && b && now >= a && now <= b; }) || rows[0];
}
function statusPill(s) {
  if (s === 'Atas pace') return '<span class="pill good">Atas pace</span>';
  if (s === 'Bawah pace') return '<span class="pill bad">Bawah pace</span>';
  return '<span class="pill idle">' + esc(s || 'Belum mula') + '</span>';
}
function bar(frac, marker) {
  const w = Math.max(0, Math.min(1, frac)) * 100;
  const mk = marker == null ? '' : '<b style="left:' + (Math.max(0, Math.min(1, marker)) * 100) + '%"></b>';
  return '<div class="bar"><i style="transform:scaleX(' + (w / 100) + ')"></i>' + mk + '</div>';
}

/* ---------- views ---------- */
function needSetup(el) {
  el.innerHTML = '<div class="card"><h2>Belum ada data</h2><p class="sub">App tak dapat baca sheet Penjejak Bajet Marketing Q4 2026. Semak internet, kemudian cuba lagi.</p><button class="btn" id="goRetry">Cuba lagi</button></div>';
  $('#goRetry').onclick = () => refresh(false);
}

/* ---------- dashboard helpers ---------- */
const MONTHS = { 10: 'Okt', 11: 'Nov', 12: 'Dis' };
const CH_COL = { 10: 1, 11: 3, 12: 5, q4: 7 };   // kolum rancang dalam jadual channel; belanja = +1

// Bahagian Q4 yang dah berlalu ikut tarikh hari ini (1 Okt hingga 31 Dis).
function q4Pace() {
  const now = new Date(); const y = now.getFullYear();
  const start = new Date(y, 9, 1), end = new Date(y, 11, 31, 23, 59, 59);
  return Math.max(0, Math.min(1, (now - start) / (end - start)));
}

// Belanja: lebih bajet = merah, lebih pace = kuning, dalam pace = hijau.
function spendTone(frac, pace) {
  if (frac > 1.0005) return 'bad';
  if (frac > pace + 0.05) return 'warn';
  return 'good';
}

// Leads dan walk-in: atas pace = hijau, 80% pace ke atas = kuning, bawah tu = merah.
function hitTone(frac, pace) {
  if (!(pace > 0)) return 'idle';
  const r = frac / pace;
  return r >= 1 ? 'good' : r >= 0.8 ? 'warn' : 'bad';
}

const TONE_LABEL = { good: 'Dalam landasan', warn: 'Perlu perhatian', bad: 'Luar landasan', idle: 'Belum mula' };

function ring(frac, tone, size, center, sub) {
  const shown = Math.max(0, Math.min(1, frac)) * 100;
  return '<div class="ring ring-' + size + ' tone-' + tone + '" role="img" aria-label="' + esc(center + (sub ? ', ' + sub : '')) + '">' +
    '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="ring-track" cx="18" cy="18" r="15.9155"/>' +
    '<circle class="ring-fill" cx="18" cy="18" r="15.9155" pathLength="100" stroke-dasharray="' + shown.toFixed(1) + ' 100"/></svg>' +
    '<div class="ring-mid"><span class="ring-val">' + esc(center) + '</span>' + (sub ? '<span class="ring-sub">' + esc(sub) + '</span>' : '') + '</div></div>';
}

function metricTile(label, frac, tone, value, target) {
  return '<div class="metric">' + ring(frac, tone, 'md', pct(frac), '') +
    '<div class="metric-txt"><span class="lab">' + esc(label) + '</span><span class="num">' + value + '</span><span class="sub">daripada ' + target + '</span></div></div>';
}

// Satu baris setiap outlet untuk bulan dipilih, atau jumlah Q4 bila tab Q4.
function outletRows(d, key) {
  const rows = d.bulanan.slice(1).filter((r) => String(r[0]) !== '' && !String(r[2]).startsWith('Jumlah'));
  if (key !== 'q4') return rows.filter((r) => num(r[0]) === key);
  const by = {};
  rows.forEach((r) => {
    const o = by[r[2]] || (by[r[2]] = { name: r[2], bajet: 0, belanja: 0, leads: 0, tLeads: 0, walk: 0, tWalk: 0 });
    o.bajet += num(r[3]); o.belanja += num(r[4]); o.leads += num(r[7]); o.tLeads += num(r[8]); o.walk += num(r[10]); o.tWalk += num(r[11]);
  });
  return Object.keys(by).map((k) => by[k]);
}

function renderHome() {
  const el = $('#view-home'); const d = state.data;
  if (!d) return needSetup(el);
  const key = state.month || currentMonthNo();
  const isQ4 = key === 'q4';
  const q4 = d.bulanan[d.bulanan.length - 1];
  const bajetQ4 = num(q4[3]), belanjaQ4 = num(q4[4]);
  const paceQ4 = q4Pace();
  const fracQ4 = bajetQ4 ? belanjaQ4 / bajetQ4 : 0;
  const toneQ4 = spendTone(fracQ4, paceQ4);

  // 1. Q4 di atas sekali.
  let html = '<h2>Bajet Q4</h2>';
  html += '<div class="card hero">' + ring(fracQ4, toneQ4, 'lg', pct(fracQ4), 'bajet guna') +
    '<div class="hero-txt"><span class="hero-val">' + rm(belanjaQ4) + '</span><span class="sub">daripada ' + rm(bajetQ4) + '</span>' +
    '<span class="hero-baki">Baki ' + rm(bajetQ4 - belanjaQ4) + '</span>' +
    '<span class="tag tone-' + toneQ4 + '">' + TONE_LABEL[toneQ4] + '</span>' +
    '<span class="sub">Sepatutnya ' + pct(paceQ4) + ' ikut tarikh</span></div></div>';

  // 2. Tab bulan.
  html += '<div class="seg" role="tablist" aria-label="Bulan">' + [10, 11, 12, 'q4'].map((k) =>
    '<button role="tab" aria-selected="' + (k === key) + '" class="' + (k === key ? 'on' : '') + '" data-m="' + k + '">' + (k === 'q4' ? 'Q4' : MONTHS[k]) + '</button>').join('') + '</div>';

  let bajet, belanja, leads, tLeads, walk, tWalk, pace, label;
  if (isQ4) {
    bajet = bajetQ4; belanja = belanjaQ4; leads = num(q4[7]); tLeads = num(q4[8]); walk = num(q4[10]); tWalk = num(q4[11]); pace = paceQ4; label = 'Q4';
  } else {
    const tot = bulananRows(d, key).find((r) => String(r[2]).startsWith('Jumlah')) || [];
    bajet = num(tot[3]); belanja = num(tot[4]); leads = num(tot[7]); tLeads = num(tot[8]); walk = num(tot[10]); tWalk = num(tot[11]);
    pace = num(tot[13]) / 100; label = MONTHS[key];
  }
  const fB = bajet ? belanja / bajet : 0, fL = tLeads ? leads / tLeads : 0, fW = tWalk ? walk / tWalk : 0;

  html += '<div class="card"><div class="row"><h3>' + label + ' sekilas</h3><span class="sub">Sepatutnya ' + pct(pace) + '</span></div><div class="metrics">' +
    metricTile('Belanja', fB, pace > 0 ? spendTone(fB, pace) : 'idle', rm(belanja), rm(bajet)) +
    metricTile('Leads', fL, hitTone(fL, pace), leads.toLocaleString('en-MY'), tLeads.toLocaleString('en-MY')) +
    metricTile('Walk-in', fW, hitTone(fW, pace), walk.toLocaleString('en-MY'), tWalk.toLocaleString('en-MY')) +
    '</div></div>';

  // 3. Bajet ikut channel.
  const col = CH_COL[key];
  const ch = d.channel.slice(1, -1);
  html += '<div class="card"><h3>Bajet ikut channel, ' + label + '</h3><div class="list">';
  ch.forEach((r) => {
    const p = num(r[col]), s = num(r[col + 1]);
    const f = p ? s / p : (s > 0 ? 2 : 0);
    const tone = p === 0 && s === 0 ? 'idle' : spendTone(f, pace);
    const baki = p - s;
    html += '<div class="item chan">' + ring(f, tone, 'sm', p ? pct(f) : '-', '') +
      '<div class="l"><div class="t">' + esc(r[0]) + '</div><div class="s">' + rm(s) + ' / ' + rm(p) + '</div></div>' +
      '<div class="num ' + (baki < 0 ? 'neg' : '') + '">' + (baki < 0 ? 'Lebih ' + rm(-baki) : 'Baki ' + rm(baki)) + '</div></div>';
  });
  html += '</div></div>';

  // 4. Outlet.
  const outs = outletRows(d, key);
  html += '<div class="card"><h3>Outlet, ' + label + '</h3><div class="tblwrap"><table><tr><th>Outlet</th><th>Belanja</th><th>Leads</th><th>Walk-in</th></tr>';
  outs.forEach((r) => {
    const o = isQ4 ? r : { name: r[2], bajet: num(r[3]), belanja: num(r[4]), leads: num(r[7]), tLeads: num(r[8]), walk: num(r[10]), tWalk: num(r[11]) };
    const fb = o.bajet ? o.belanja / o.bajet : 0, fl = o.tLeads ? o.leads / o.tLeads : 0, fw = o.tWalk ? o.walk / o.tWalk : 0;
    const tl = hitTone(fl, pace);
    html += '<tr><td>' + esc(o.name) + '<br><span class="tag tone-' + tl + '">' + TONE_LABEL[tl] + '</span></td>' +
      '<td class="tone-txt-' + (pace > 0 ? spendTone(fb, pace) : 'idle') + '">' + rm(o.belanja) + '<br><span class="sub">/' + rm(o.bajet) + '</span></td>' +
      '<td class="tone-txt-' + tl + '">' + o.leads.toLocaleString('en-MY') + '<br><span class="sub">' + pct(fl) + '</span></td>' +
      '<td class="tone-txt-' + hitTone(fw, pace) + '">' + o.walk.toLocaleString('en-MY') + '<br><span class="sub">' + pct(fw) + '</span></td></tr>';
  });
  html += '</table></div><p class="sub">Warna dibanding dengan pace: hijau dalam landasan, kuning perlu perhatian, merah luar landasan.</p></div>';

  // 5. Minggu semasa, hanya untuk bulan ini.
  const wk = currentWeek(d);
  if (wk && key === currentMonthNo()) {
    html += '<div class="card"><h3>Minggu ' + esc(wk[0].slice(0, 5)) + ' hingga ' + esc(wk[1].slice(0, 5)) + '</h3><div class="list">' +
      item('Belanja', 'RM' + esc(wk[2])) +
      item('Perbualan WhatsApp (iklan)', esc(wk[3]) + (wk[4] ? ' (RM' + esc(wk[4]) + ' seorang)' : '')) +
      item('Leads', esc(wk[5]) + ' / ' + esc(wk[6]) + ' (' + esc(wk[7] || '-') + ')') +
      item('Walk-in', esc(wk[8]) + ' / ' + esc(wk[9]) + ' (' + esc(wk[10] || '-') + ')') +
      '</div></div>';
  }

  // 6. Tugas.
  const late = (d.checklist || []).filter((t) => !t.siap && t.tarikh && t.tarikh < todayISO());
  const next = (d.checklist || []).filter((t) => !t.siap && t.tarikh && t.tarikh >= todayISO()).slice(0, 3);
  html += '<div class="card"><div class="row"><h3>Tugas</h3><button class="btn ghost sm" data-go="check">Semua</button></div>';
  if (late.length) html += '<div class="warn">' + late.length + ' tugas lewat. Paling awal: ' + esc(late[0].tugas) + '</div>';
  html += '<div class="list">' + (next.length ? next.map((t) => item(t.tugas, esc(t.tarikhLabel))).join('') : '<div class="empty">Tiada tugas akan datang.</div>') + '</div></div>';

  // 7. Banner di bawah sekali.
  html += '<button class="btn ghost more" data-go="banner">Kira banner & bunting</button>';

  el.innerHTML = html;
  el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => show(b.dataset.go)));
  el.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => {
    state.month = b.dataset.m === 'q4' ? 'q4' : +b.dataset.m; renderHome();
  }));
}

function item(l, r) { return '<div class="item"><div class="l"><div class="t">' + esc(l) + '</div></div><div class="num">' + r + '</div></div>'; }

function renderAdd() {
  const el = $('#view-add'); const d = state.data;
  if (!d) return needSetup(el);
  const last = store.get('kbq4.lastAdd', {});
  const chips = (name, opts, sel) => '<div class="chips" data-name="' + name + '">' + opts.map((o) => '<button type="button" class="chip" aria-pressed="' + (o === sel) + '" data-val="' + esc(o) + '">' + esc(o) + '</button>').join('') + '</div>';
  el.innerHTML = '<h2>Tambah belanja</h2><form id="addForm" class="card" novalidate>' +
    '<label for="fTarikh">Tarikh<input type="date" id="fTarikh" required value="' + todayISO() + '"></label>' +
    '<label>Outlet' + chips('outlet', d.outlets, last.outlet) + '</label>' +
    '<label>Channel' + chips('channel', d.channels, last.channel) + '</label>' +
    '<label for="fAmaun">Amaun (RM)<input type="number" id="fAmaun" inputmode="decimal" step="0.01" min="0" placeholder="250" required></label>' +
    '<label for="fPerbualan">Perbualan WhatsApp dari iklan (Ads Manager)<input type="number" id="fPerbualan" inputmode="numeric" min="0" placeholder="Kosongkan kalau bukan iklan"></label>' +
    '<label for="fPerkara">Perkara<input type="text" id="fPerkara" placeholder="Contoh: Iklan uji minggu 1"></label>' +
    '<label for="fNota">Nota<input type="text" id="fNota" placeholder="Lokasi banner, no. invois, dll."></label>' +
    '<button class="btn" id="fSubmit" type="submit">Simpan ke sheet</button></form>' +
    '<p class="sub">Invois Raxbit: masukkan ikut outlet dalam invois, termasuk SST. Yuran monitor dibahagi sama rata.</p>';
  el.querySelectorAll('.chips').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    g.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true');
  }));
  $('#addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pick = (n) => { const b = el.querySelector('.chips[data-name="' + n + '"] .chip[aria-pressed="true"]'); return b ? b.dataset.val : ''; };
    const entry = { tarikh: $('#fTarikh').value, outlet: pick('outlet'), channel: pick('channel'), amaun: $('#fAmaun').value,
      perbualan: $('#fPerbualan').value, perkara: $('#fPerkara').value.trim(), nota: $('#fNota').value.trim() };
    if (!entry.tarikh) return toast('Pilih tarikh.');
    if (!entry.outlet) return toast('Pilih outlet.');
    if (!entry.channel) return toast('Pilih channel.');
    if (!(num(entry.amaun) > 0)) return toast('Masukkan amaun lebih dari 0.');
    const btn = $('#fSubmit'); btn.disabled = true; btn.textContent = 'Menyimpan...';
    const ok = await mutate({ action: 'addLog', entry }, null);
    if (ok) { store.set('kbq4.lastAdd', { outlet: entry.outlet, channel: entry.channel }); show('log'); }
    else { btn.disabled = false; btn.textContent = 'Simpan ke sheet'; }
  });
}

function renderLog() {
  const el = $('#view-log'); const d = state.data;
  if (!d) return needSetup(el);
  const opts = ['Semua'].concat(d.outlets);
  const rows = d.log.filter((r) => state.logFilter === 'Semua' || r.outlet === state.logFilter);
  const total = rows.reduce((a, r) => a + num(r.amaun), 0);
  let html = '<h2>Log belanja</h2><div class="seg">' + opts.map((o) => '<button class="' + (o === state.logFilter ? 'on' : '') + '" data-f="' + esc(o) + '">' + esc(o) + '</button>').join('') + '</div>';
  html += '<div class="card"><div class="row"><span class="sub">' + rows.length + ' rekod</span><span class="num">' + rm(total) + '</span></div><div class="list">';
  html += rows.length ? rows.map((r) => '<div class="item"><div class="l"><div class="t">' + esc(r.perkara || r.channel) + '</div><div class="s">' + esc(r.tarikh) + ', ' + esc(r.outlet) + ', ' + esc(r.channel) + (r.perbualan ? ', ' + esc(r.perbualan) + ' perbualan' : '') + '</div>' + (r.nota ? '<div class="s">' + esc(r.nota) + '</div>' : '') + '</div><div class="end"><span class="num">' + rm(num(r.amaun)) + '</span><button class="btn danger" data-del="' + r.row + '" data-outlet="' + esc(r.outlet) + '" data-amaun="' + esc(r.amaun) + '">Padam</button></div></div>').join('') : '<div class="empty">Belum ada belanja. Tekan Tambah untuk rekod yang pertama.</div>';
  html += '</div></div>';
  el.innerHTML = html;
  el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { state.logFilter = b.dataset.f; renderLog(); }));
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Sahkan padam'; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = 'Padam'; } }, 3000); return; }
    b.disabled = true;
    const ok = await mutate({ action: 'deleteLog', row: +b.dataset.del, check: { outlet: b.dataset.outlet, amaun: b.dataset.amaun } }, null);
    if (!ok) { b.disabled = false; b.dataset.armed = ''; b.textContent = 'Padam'; }
  }));
}

function renderCheck() {
  const el = $('#view-check'); const d = state.data;
  if (!d) return needSetup(el);
  const all = d.checklist || [];
  const done = all.filter((t) => t.siap).length;
  const filters = { aktif: 'Belum siap', semua: 'Semua', siap: 'Siap' };
  const list = all.filter((t) => state.checkFilter === 'semua' || (state.checkFilter === 'siap' ? t.siap : !t.siap));
  const t0 = todayISO();
  let html = '<h2>Checklist</h2><div class="card"><div class="row"><span class="sub">' + done + ' / ' + all.length + ' siap</span><span class="num">' + (all.length ? pct(done / all.length) : '0%') + '</span></div>' + bar(all.length ? done / all.length : 0) + '</div>';
  html += '<div class="seg">' + Object.keys(filters).map((k) => '<button class="' + (k === state.checkFilter ? 'on' : '') + '" data-cf="' + k + '">' + filters[k] + '</button>').join('') + '</div>';
  let lastFasa = '';
  html += '<div class="card">';
  if (!list.length) html += '<div class="empty">Tiada tugas dalam senarai ini.</div>';
  list.forEach((t) => {
    if (t.fasa !== lastFasa) { html += '<h3 class="fasa">Fasa ' + esc(t.fasa) + '</h3>'; lastFasa = t.fasa; }
    const late = !t.siap && t.tarikh && t.tarikh < t0;
    html += '<div class="task' + (t.siap ? ' done' : '') + (late ? ' late' : '') + '"><input type="checkbox" id="ck' + t.row + '" data-row="' + t.row + '"' + (t.siap ? ' checked' : '') + ' aria-label="Tandakan siap: ' + esc(t.tugas) + '"><div class="l"><div class="due">' + (late ? 'Lewat, ' : '') + esc(t.tarikhLabel) + ', ' + esc(t.siapa) + '</div><label for="ck' + t.row + '" class="t">' + esc(t.tugas) + '</label>' + (t.cara ? '<details><summary>Cara</summary><p>' + esc(t.cara) + '</p></details>' : '') + '</div></div>';
  });
  html += '</div>';
  el.innerHTML = html;
  el.querySelectorAll('[data-cf]').forEach((b) => (b.onclick = () => { state.checkFilter = b.dataset.cf; renderCheck(); }));
  el.querySelectorAll('input[data-row]').forEach((c) => (c.onchange = async () => {
    c.disabled = true;
    const ok = await mutate({ action: 'toggleTask', row: +c.dataset.row, done: c.checked }, null);
    if (!ok) { c.checked = !c.checked; c.disabled = false; }
  }));
}

function renderBanner() {
  const el = $('#view-banner'); const d = state.data;
  if (!d) return needSetup(el);
  const rows = d.banner.slice(1, -1);
  const fields = [
    ['bil', 'Bil banner kedai', 4], ['hargaBanner', 'Harga banner seunit', 5], ['upahBanner', 'Upah pasang banner', 6], ['permitBanner', 'Permit banner seunit', 7],
    ['hargaBunting', 'Harga bunting seunit', 8], ['upahBunting', 'Upah pasang bunting (pakej)', 9], ['permitBunting', 'Permit bunting seunit', 10]
  ];
  let html = '<button class="btn ghost sm back" data-go="home">Kembali ke Ringkasan</button><h2>Kira banner & bunting</h2><p class="sub">Isi harga dari sebut harga seller. App kira berapa bunting muat dalam bajet fizikal (cetak, pasang, permit). Baki ialah untuk perjalanan dan shoot.</p>';
  rows.forEach((r, i) => {
    const maxB = r[13];
    const baki = num(r[12]);
    html += '<form class="card" data-outlet="' + esc(r[0]) + '"><div class="row"><h3>' + esc(r[0]) + '</h3><span class="pill ' + (maxB === '' ? 'idle' : 'good') + '">' + (maxB === '' ? 'Isi harga' : 'Max ' + esc(maxB) + ' bunting') + '</span></div>' +
      '<div class="grid2"><div class="stat"><span class="lab">Bajet fizikal</span><span class="val">' + rm(num(r[3])) + '</span></div><div class="stat"><span class="lab">Perjalanan & shoot</span><span class="val">' + rm(num(r[15])) + '</span></div></div>' +
      (baki < 0 ? '<div class="warn">Banner kedai dah lebih bajet fizikal. Kecilkan saiz atau kurangkan bilangan.</div>' : '') +
      '<div class="grid2">' + fields.map((f) => '<label for="b' + i + f[0] + '">' + f[1] + '<input id="b' + i + f[0] + '" name="' + f[0] + '" type="number" inputmode="decimal" step="0.01" min="0" value="' + esc(String(r[f[2]]).replace(/,/g, '')) + '"></label>').join('') + '</div>' +
      '<div class="row"><span class="sub">Kos fizikal: ' + rm(num(r[14])) + '</span><button class="btn sm" type="submit">Kira & simpan</button></div></form>';
  });
  el.innerHTML = html;
  el.querySelector('[data-go]').onclick = () => show('home');
  el.querySelectorAll('form[data-outlet]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = {}; f.querySelectorAll('input').forEach((inp) => (values[inp.name] = inp.value));
    const b = f.querySelector('button'); b.disabled = true;
    const ok = await mutate({ action: 'setBanner', outlet: f.dataset.outlet, values }, 'Dikira: ' + f.dataset.outlet);
    if (!ok) b.disabled = false;
  }));
}

/* ---------- router ---------- */
const renderers = { home: renderHome, add: renderAdd, log: renderLog, check: renderCheck, banner: renderBanner };
function render() { renderers[state.view](); }
function show(v) {
  state.view = v;
  document.querySelectorAll('.view').forEach((s) => (s.hidden = s.id !== 'view-' + v));
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  render(); window.scrollTo(0, 0);
}

document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => show(b.dataset.view)));
$('#btnRefresh').onclick = () => refresh(false);

if (state.data) setData(state.data);
show('home');
refresh(true);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(true); });

if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {})); }
