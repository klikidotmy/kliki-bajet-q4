'use strict';

/* ---------- storage (per-device convenience) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

const state = {
  cfg: store.get('kbq4.cfg', { url: '', token: '' }),
  data: store.get('kbq4.data', null),
  view: 'home',
  checkFilter: 'aktif',
  logFilter: 'Semua',
  busy: false
};

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (s) => { if (s == null || s === '') return 0; const n = parseFloat(String(s).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
const rm = (n) => 'RM' + Number(n).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const pct = (n) => (n * 100).toFixed(0) + '%';
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const parseDMY = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

/* ---------- API ---------- */
async function apiGet() {
  if (!state.cfg.url || !state.cfg.token) throw new Error('Set URL dan token dulu dalam Tetapan.');
  const u = state.cfg.url + (state.cfg.url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(state.cfg.token) + '&t=' + Date.now();
  const res = await fetch(u, { method: 'GET', redirect: 'follow' });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'Gagal baca sheet.');
  return j.data;
}

async function apiPost(payload) {
  if (!state.cfg.url || !state.cfg.token) throw new Error('Set URL dan token dulu dalam Tetapan.');
  const res = await fetch(state.cfg.url, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ token: state.cfg.token }, payload))
  });
  const j = await res.json();
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
    render(); toast(okMsg); return true;
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
  return '<div class="bar"><i style="width:' + w + '%"></i>' + mk + '</div>';
}

/* ---------- views ---------- */
function needSetup(el) {
  el.innerHTML = '<div class="card"><h2>Sambung ke sheet</h2><p class="sub">App ni baca dan tulis terus ke sheet Penjejak Bajet Marketing Q4 2026. Masukkan URL Apps Script dan token sekali sahaja.</p><button class="btn" id="goSet">Buka Tetapan</button></div>';
  $('#goSet').onclick = () => show('settings');
}

function renderHome() {
  const el = $('#view-home'); const d = state.data;
  if (!d) return needSetup(el);
  const mNo = currentMonthNo(); const mLab = { 10: 'Okt', 11: 'Nov', 12: 'Dis' }[mNo];
  const rows = bulananRows(d, mNo);
  const tot = rows.find((r) => String(r[2]).startsWith('Jumlah')) || [];
  const outlets = rows.filter((r) => !String(r[2]).startsWith('Jumlah'));
  const q4 = d.bulanan[d.bulanan.length - 1];
  const bajetQ4 = num(q4[3]), belanjaQ4 = num(q4[4]);
  const leads = num(tot[7]), tLeads = num(tot[8]), walk = num(tot[10]), tWalk = num(tot[11]), pace = num(tot[13]) / 100;
  const wk = currentWeek(d);

  let html = '<h2>Ringkasan ' + mLab + '</h2>';
  html += '<div class="grid2">';
  html += '<div class="kpi brand"><span class="lab">Belanja Q4</span><span class="val">' + rm(belanjaQ4) + '</span><span class="foot">daripada ' + rm(bajetQ4) + ' · baki ' + rm(bajetQ4 - belanjaQ4) + '</span>' + bar(bajetQ4 ? belanjaQ4 / bajetQ4 : 0) + '</div>';
  html += '<div class="kpi"><span class="lab">Belanja ' + mLab + '</span><span class="val">' + rm(num(tot[4])) + '</span><span class="foot">bajet ' + rm(num(tot[3])) + '</span>' + bar(num(tot[3]) ? num(tot[4]) / num(tot[3]) : 0) + '</div>';
  html += '<div class="kpi"><span class="lab">Leads ' + mLab + '</span><span class="val">' + leads.toLocaleString('en-MY') + '</span><span class="foot">target ' + tLeads.toLocaleString('en-MY') + ' · ' + (tLeads ? pct(leads / tLeads) : '-') + '</span>' + bar(tLeads ? leads / tLeads : 0, pace) + '</div>';
  html += '<div class="kpi"><span class="lab">Walk-in ' + mLab + '</span><span class="val">' + walk.toLocaleString('en-MY') + '</span><span class="foot">target ' + tWalk.toLocaleString('en-MY') + ' · ' + (tWalk ? pct(walk / tWalk) : '-') + '</span>' + bar(tWalk ? walk / tWalk : 0, pace) + '</div>';
  html += '</div>';
  html += '<p class="sub">Garis hitam pada bar = sepatutnya ' + pct(pace) + ' ikut tarikh hari ini.</p>';

  if (wk) {
    html += '<div class="card"><div class="row"><h3>Minggu ' + esc(wk[0].slice(0, 5)) + ' – ' + esc(wk[1].slice(0, 5)) + '</h3></div><div class="list">' +
      item('Belanja', 'RM' + esc(wk[2])) +
      item('Perbualan WhatsApp (iklan)', esc(wk[3]) + (wk[4] ? ' · RM' + esc(wk[4]) + ' seorang' : '')) +
      item('Leads', esc(wk[5]) + ' / ' + esc(wk[6]) + ' (' + esc(wk[7] || '-') + ')') +
      item('Walk-in', esc(wk[8]) + ' / ' + esc(wk[9]) + ' (' + esc(wk[10] || '-') + ')') +
      '</div></div>';
  }

  html += '<div class="card"><h3>Outlet ' + mLab + '</h3><div class="tblwrap"><table><tr><th>Outlet</th><th>Belanja</th><th>Leads</th><th>Walk-in</th><th>Kos/lead+</th><th>Status</th></tr>';
  outlets.forEach((r) => {
    html += '<tr><td>' + esc(r[2]) + '</td><td>' + rm(num(r[4])) + '<br><span class="sub">/' + rm(num(r[3])) + '</span></td><td>' + esc(r[7]) + '<br><span class="sub">' + esc(r[9]) + '</span></td><td>' + esc(r[10]) + '<br><span class="sub">' + esc(r[12]) + '</span></td><td>' + (r[15] ? 'RM' + esc(r[15]) : '-') + '</td><td>' + statusPill(r[16]) + '</td></tr>';
  });
  html += '</table></div><p class="sub">Kos/lead+ = belanja ÷ leads tambahan berbanding prestasi biasa Sep. Had: RM' + esc((d.peraturan[0] || [])[1] || '15') + '.</p></div>';

  const ch = d.channel.slice(1, -1);
  const colPlan = { 10: 1, 11: 3, 12: 5 }[mNo];
  html += '<div class="card"><h3>Channel ' + mLab + '</h3><div class="list">';
  ch.forEach((r) => {
    const p = num(r[colPlan]), s = num(r[colPlan + 1]);
    html += '<div class="item" style="flex-direction:column;gap:6px"><div class="row"><span class="t">' + esc(r[0]) + '</span><span class="num">' + rm(s) + ' / ' + rm(p) + '</span></div>' + bar(p ? s / p : 0) + '</div>';
  });
  html += '</div></div>';

  const late = (d.checklist || []).filter((t) => !t.siap && t.tarikh && t.tarikh < todayISO());
  const next = (d.checklist || []).filter((t) => !t.siap && t.tarikh && t.tarikh >= todayISO()).slice(0, 3);
  html += '<div class="card"><div class="row"><h3>Tugas</h3><button class="btn ghost" style="padding:6px 10px;font-size:13px" data-go="check">Semua</button></div>';
  if (late.length) html += '<div class="warn">' + late.length + ' tugas lewat. Paling awal: ' + esc(late[0].tugas) + '</div>';
  html += '<div class="list">' + (next.length ? next.map((t) => item(t.tugas, esc(t.tarikhLabel))).join('') : '<div class="empty">Tiada tugas akan datang.</div>') + '</div></div>';

  el.innerHTML = html;
  el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => show(b.dataset.go)));
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
    const ok = await mutate({ action: 'addLog', entry }, 'Disimpan: ' + rm(num(entry.amaun)) + ' · ' + entry.outlet);
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
  html += rows.length ? rows.map((r) => '<div class="item"><div class="l"><div class="t">' + esc(r.perkara || r.channel) + '</div><div class="s">' + esc(r.tarikh) + ' · ' + esc(r.outlet) + ' · ' + esc(r.channel) + (r.perbualan ? ' · ' + esc(r.perbualan) + ' perbualan' : '') + (r.nota ? ' · ' + esc(r.nota) : '') + '</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><span class="num">RM' + esc(r.amaun) + '</span><button class="btn danger" data-del="' + r.row + '" data-outlet="' + esc(r.outlet) + '" data-amaun="' + esc(r.amaun) + '">Padam</button></div></div>').join('') : '<div class="empty">Belum ada belanja. Tekan Tambah untuk rekod yang pertama.</div>';
  html += '</div></div>';
  el.innerHTML = html;
  el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { state.logFilter = b.dataset.f; renderLog(); }));
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Sahkan padam'; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = 'Padam'; } }, 3000); return; }
    b.disabled = true;
    await mutate({ action: 'deleteLog', row: +b.dataset.del, check: { outlet: b.dataset.outlet, amaun: b.dataset.amaun } }, 'Rekod dipadam');
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
    if (t.fasa !== lastFasa) { html += '<h3 style="margin-top:6px">Fasa ' + esc(t.fasa) + '</h3>'; lastFasa = t.fasa; }
    const late = !t.siap && t.tarikh && t.tarikh < t0;
    html += '<div class="task' + (t.siap ? ' done' : '') + (late ? ' late' : '') + '"><input type="checkbox" id="ck' + t.row + '" data-row="' + t.row + '"' + (t.siap ? ' checked' : '') + ' aria-label="Tandakan siap: ' + esc(t.tugas) + '"><div class="l"><div class="due">' + esc(t.tarikhLabel) + (late ? ' · lewat' : '') + ' · ' + esc(t.siapa) + '</div><label for="ck' + t.row + '" class="t" style="color:inherit;font-size:15px">' + esc(t.tugas) + '</label>' + (t.cara ? '<details><summary>Cara</summary><p>' + esc(t.cara) + '</p></details>' : '') + '</div></div>';
  });
  html += '</div>';
  el.innerHTML = html;
  el.querySelectorAll('[data-cf]').forEach((b) => (b.onclick = () => { state.checkFilter = b.dataset.cf; renderCheck(); }));
  el.querySelectorAll('input[data-row]').forEach((c) => (c.onchange = async () => {
    c.disabled = true;
    const ok = await mutate({ action: 'toggleTask', row: +c.dataset.row, done: c.checked }, c.checked ? 'Tugas siap' : 'Tanda dibuang');
    if (!ok) { c.checked = !c.checked; c.disabled = false; }
  }));
}

function renderBanner() {
  const el = $('#view-banner'); const d = state.data;
  if (!d) return needSetup(el);
  const rows = d.banner.slice(1, -1);
  const fields = [
    ['bil', 'Bil banner kedai', 4], ['hargaBanner', 'Harga banner seunit', 5], ['upahBanner', 'Upah pasang banner', 6], ['permitBanner', 'Permit banner seunit', 7],
    ['hargaBunting', 'Harga bunting seunit', 8], ['upahBunting', 'Upah pasang bunting', 9], ['permitBunting', 'Permit bunting seunit', 10]
  ];
  let html = '<h2>Kira banner & bunting</h2><p class="sub">Isi harga dari sebut harga seller. App kira berapa bunting muat dalam bajet fizikal (cetak, pasang, permit). Baki ialah untuk perjalanan dan shoot.</p>';
  rows.forEach((r, i) => {
    const maxB = r[13];
    const baki = num(r[12]);
    html += '<form class="card" data-outlet="' + esc(r[0]) + '"><div class="row"><h3>' + esc(r[0]) + '</h3><span class="pill ' + (maxB === '' ? 'idle' : 'good') + '">' + (maxB === '' ? 'Isi harga' : 'Max ' + esc(maxB) + ' bunting') + '</span></div>' +
      '<div class="grid2"><div class="kpi"><span class="lab">Bajet fizikal</span><span class="val" style="font-size:18px">RM' + esc(r[3]) + '</span></div><div class="kpi"><span class="lab">Perjalanan & shoot</span><span class="val" style="font-size:18px">RM' + esc(r[15]) + '</span></div></div>' +
      (baki < 0 ? '<div class="warn">Banner kedai dah lebih bajet fizikal. Kecilkan saiz atau kurangkan bilangan.</div>' : '') +
      '<div class="grid2">' + fields.map((f) => '<label for="b' + i + f[0] + '">' + f[1] + '<input id="b' + i + f[0] + '" name="' + f[0] + '" type="number" inputmode="decimal" step="0.01" min="0" value="' + esc(String(r[f[2]]).replace(/,/g, '')) + '"></label>').join('') + '</div>' +
      '<div class="row"><span class="sub">Kos fizikal: RM' + esc(r[14]) + '</span><button class="btn" type="submit" style="padding:10px 16px;font-size:14px">Kira & simpan</button></div></form>';
  });
  el.innerHTML = html;
  el.querySelectorAll('form[data-outlet]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = {}; f.querySelectorAll('input').forEach((inp) => (values[inp.name] = inp.value));
    const b = f.querySelector('button'); b.disabled = true;
    const ok = await mutate({ action: 'setBanner', outlet: f.dataset.outlet, values }, 'Dikira: ' + f.dataset.outlet);
    if (!ok) b.disabled = false;
  }));
}

function renderSettings() {
  const el = $('#view-settings');
  el.innerHTML = '<h2>Tetapan</h2><form id="setForm" class="card">' +
    '<label for="sUrl">URL Apps Script (Web app)<input id="sUrl" type="url" placeholder="https://script.google.com/macros/s/.../exec" value="' + esc(state.cfg.url) + '"></label>' +
    '<label for="sTok">Token<input id="sTok" type="password" autocomplete="off" value="' + esc(state.cfg.token) + '"></label>' +
    '<button class="btn" type="submit">Simpan & sambung</button></form>' +
    '<p class="sub">URL dan token disimpan dalam telefon ini sahaja, bukan dalam repo.</p>';
  $('#setForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    state.cfg = { url: $('#sUrl').value.trim(), token: $('#sTok').value.trim() };
    store.set('kbq4.cfg', state.cfg);
    await refresh(true);
    if (state.data) { toast('Bersambung ke sheet'); show('home'); }
  });
}

/* ---------- router ---------- */
const renderers = { home: renderHome, add: renderAdd, log: renderLog, check: renderCheck, banner: renderBanner, settings: renderSettings };
function render() { renderers[state.view](); }
function show(v) {
  state.view = v;
  document.querySelectorAll('.view').forEach((s) => (s.hidden = s.id !== 'view-' + v));
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  render(); window.scrollTo(0, 0);
}

document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => show(b.dataset.view)));
$('#btnSettings').onclick = () => show('settings');
$('#btnRefresh').onclick = () => refresh(false);

if (state.data) setData(state.data);
show(state.cfg.url ? 'home' : 'settings');
if (state.cfg.url) refresh(true);
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.cfg.url) refresh(true); });

if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {})); }
