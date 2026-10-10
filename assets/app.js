(() => {
  const APP_VERSION = '20';
  const KEY = 'oaf-tasks-v1';           // same key as the live app, so your tasks carry over
  const OWNER = 'Oren';
  const CATS = [
    { id: 'call', label: 'Call', icon: '📞' },
    { id: 'visit', label: 'Site visit', icon: '🚗' },
    { id: 'money', label: 'Invoice / $', icon: '💵' },
    { id: 'permit', label: 'Permit', icon: '📋' },
    { id: 'order', label: 'Order', icon: '📦' },
  ];
  const catOf = id => CATS.find(c => c.id === id);

  let tasks = [], view = 'today', filter = 'all', editingId = null, curJob = '', jobTab = 'chat';
  let formCat = '', formStar = false, lastUndo = null, toastTimer = null;
  const collapsed = new Set();
  const NOOP = new Proxy(function () {}, {
    get: (t, k) => k === 'classList' ? { add() {}, remove() {}, toggle() {}, contains() { return false; } } : k === 'style' ? {} : k === 'dataset' ? {} : k === 'value' ? '' : k === 'hidden' ? true : NOOP,
    set: () => true, apply: () => NOOP,
  });
  const $ = s => document.querySelector(s) || NOOP;   // a missing element can never stop the app from starting

  try { tasks = JSON.parse(localStorage.getItem(KEY)) || []; } catch { tasks = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch {} };
  const JOBS_KEY = 'oaf-jobs-v1';        // per-project info: upsell potential, sub
  let jobs = {};
  try { jobs = JSON.parse(localStorage.getItem(JOBS_KEY)) || {}; } catch { jobs = {}; }
  const saveJobs = () => { try { localStorage.setItem(JOBS_KEY, JSON.stringify(jobs)); } catch {} };
  const money = n => n >= 1000 ? '$' + (n / 1000).toFixed(n % 1000 ? 1 : 0).replace(/\.0$/, '') + 'k' : '$' + n;
  // a job can have several subs; older jobs only stored one (sub + phone)
  const getSubs = j => (j && j.subs) ? j.subs : (j && j.sub ? [{ name: j.sub, phone: j.phone || '' }] : []);
  const subLabel = x => `${x.name}${x.trade ? ' · ' + x.trade : ''}`;
  const subChips = (j, tel) => getSubs(j).map(x => tel && x.phone
    ? `<a class="subchip" href="tel:${esc(x.phone)}">👷 ${esc(subLabel(x))}</a>`
    : `<span class="subchip">👷 ${esc(subLabel(x))}</span>`).join('');
  const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
  function visitInfo(name) {
    const j = jobs[name] || {}, every = j.every || 5;
    const next = j.last ? addDays(every, j.last) : (j.kick || null);
    let state = 'soon', diff = null;
    if (next) { diff = daysBetween(todayISO(), next); state = diff < 0 ? 'late' : diff <= 1 ? 'soon' : 'ok'; }
    return { j, every, next, diff, state };
  }
  const agoText = d => { const n = daysBetween(d, todayISO()); return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : n + ' days ago'; };
  const nextText = v => v.diff === null ? 'No visit logged yet' : v.diff < 0 ? `Overdue ${-v.diff}d` : v.diff === 0 ? 'Due today' : v.diff === 1 ? 'Due tomorrow' : `Due in ${v.diff} days`;
  const activeProjects = () => [...new Set(tasks.filter(t => !t.done && t.project).map(t => t.project))];
  function visitList() {
    const order = { late: 0, soon: 1, ok: 2 };
    return activeProjects().map(n => ({ n, ...visitInfo(n) }))
      .sort((a, b) => order[a.state] - order[b.state] || (b.j.upsell || 0) - (a.j.upsell || 0) || a.n.localeCompare(b.n));
  }
  const fmtStamp = iso => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const REM_KEY = 'oaf-reminder-v1';
  let remTime = '18:00';
  try { remTime = localStorage.getItem(REM_KEY) || '18:00'; } catch {}
  const fmtDue = t => t.due ? fmtDate(t.due).toLowerCase() : 'no date';

  function jobSummary(n) {
    const j = jobs[n] || {}, t0 = todayISO(), v = visitInfo(n), subs = getSubs(j);
    const mine = tasks.filter(t => !t.done && t.project === n).sort(cmp);
    const late = mine.filter(t => t.due && t.due < t0);
    const doneRecent = tasks.filter(t => t.done && t.project === n && t.doneOn && daysBetween(t.doneOn, t0) <= 7);
    const L = [`${n}${j.addr ? ' - ' + j.addr : ''}`];
    if (subs.length) L.push('Subs: ' + subs.map(subLabel).join(', '));
    if (j.upsell) L.push('Upsell potential: ' + money(j.upsell));
    L.push('', late.length ? `⚠ ${late.length} overdue ${late.length === 1 ? 'task' : 'tasks'}` : '✓ Nothing overdue');
    L.push('Site check: ' + (j.last ? `last ${j.kind === 'photos' ? 'photos' : 'on-site visit'} ${agoText(j.last).toLowerCase()}` : 'none logged') + ` (${nextText(v).toLowerCase()})`);
    L.push('', `Open tasks (${mine.length}):`);
    mine.slice(0, 8).forEach(t => L.push(`  ${t.due && t.due < t0 ? '⚠' : '•'} ${t.title} (${fmtDue(t)})`));
    if (mine.length > 8) L.push(`  ...and ${mine.length - 8} more`);
    if (!mine.length) L.push('  none');
    if (doneRecent.length) { L.push('', `Done this week (${doneRecent.length}):`); doneRecent.slice(0, 5).forEach(t => L.push('  ✓ ' + t.title)); }
    const msgs = timeline(n).filter(x => x.kind !== 'sys').slice(-4).reverse();
    if (msgs.length) { L.push('', 'Recent messages and notes:'); msgs.forEach(x => L.push(`  • ${fmtStamp(new Date(x.ts).toISOString())} ${x.kind === 'out' ? 'You: ' : x.kind === 'in' ? (x.who || 'Reply') + ': ' : ''}${x.text}`)); }
    const att = jobMedia(n); if (att.length) L.push('', `Media: ${att.filter(a => a.kind === 'image').length} photos, ${att.filter(a => a.kind === 'video').length} videos, ${att.filter(a => a.kind === 'file').length} files`);
    const watch = [];
    if (late.length) watch.push('Overdue tasks');
    if (v.state === 'late') watch.push('Site visit or photo check is overdue');
    if (!j.addr) watch.push('No address saved');
    if (!j.upsell) watch.push('No upsell amount set');
    const noPhone = subs.filter(x => !x.phone).map(x => x.name);
    if (noPhone.length) watch.push('No phone number for ' + noPhone.join(', '));
    if (watch.length) { L.push('', 'Watch-outs:'); watch.forEach(w => L.push('  • ' + w)); }
    L.push('', mine[0] ? `Next step: ${mine[0].title} (${fmtDue(mine[0])})` : 'Next step: no open tasks. Add the next step.');
    return L.join('\n');
  }
  function eveningSummary() {
    const t0 = todayISO(), tmr = addDays(1), L = [`Evening review - ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`, ''];
    const list = visitList();
    if (!list.length) L.push('No active jobs.');
    list.forEach(v => {
      const open = tasks.filter(t => !t.done && t.project === v.n).sort(cmp), late = open.filter(t => t.due && t.due < t0).length;
      const bits = [`${open.length} open`]; if (late) bits.push(`${late} overdue`); if (v.state === 'late') bits.push('visit overdue');
      L.push(`• ${v.n}${v.j.addr ? ' (' + v.j.addr + ')' : ''}: ${bits.join(', ')}${open[0] ? '. Next: ' + open[0].title : ''}`);
    });
    const tm = tasks.filter(t => !t.done && t.due === tmr).sort(cmp);
    L.push('', `Tomorrow (${tm.length}):`); tm.forEach(t => L.push(`  • ${t.title}${t.project ? ' - ' + t.project : ''}${t.time ? ' @ ' + fmtTime(t.time) : ''}`));
    if (!tm.length) L.push('  nothing scheduled');
    L.push('', `Done today: ${tasks.filter(t => t.done && t.doneOn === t0).length}`);
    return L.join('\n');
  }
  function notesHTML(n) {
    const notes = (jobs[n] || {}).notes || [];
    return `<div class="section-title">Notes</div>
      <div class="noteadd"><textarea id="noteIn" placeholder="What happened today? Tap the 🎤 on your keyboard to talk."></textarea>
      <button class="jbtn primary" data-act="addnote">Add note</button></div>` +
      notes.map(x => `<div class="note"><div class="nmeta"><span>${fmtStamp(x.at)}</span><button data-act="delnote" data-id="${x.id}" aria-label="Delete note">×</button></div><div class="ntext">${esc(x.text)}</div></div>`).join('');
  }
  function downloadReminder(time) {
    const [h, m] = time.split(':'), d = new Date(), pad2 = pad;
    const start = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${h}${m}00`;
    const url = location.origin + location.pathname + '#evening';
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OAF Tasks//EN', 'BEGIN:VEVENT', 'UID:oaf-evening-review@oaf-tasks',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z', 'DTSTART:' + start, 'DURATION:PT15M', 'RRULE:FREQ=DAILY',
      'SUMMARY:Evening review - update jobs and tasks', 'DESCRIPTION:Open the app: ' + url, 'URL:' + url,
      'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Evening review', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'evening-review.ics'; a.click();
  }
  function showText(title, text) {
    $('#sumTitle').textContent = title; $('#sumText').textContent = text; $('#sumBg').classList.add('open');
  }
  // ---- job chat (WhatsApp-style thread) ----
  function groupMembers(n) {
    const j = jobs[n] || {};
    const all = [...getSubs(j), ...team].filter(x => hasPhone(x.phone));
    return j.group ? all.filter(x => j.group.includes(cleanPhone(x.phone))) : getSubs(j).filter(x => hasPhone(x.phone));
  }
  function logMsg(n, kind, text, extra = {}) {
    const j = jobs[n] = jobs[n] || {};
    j.chat = [...(j.chat || []), { id: uid(), at: new Date().toISOString(), kind, text, ...extra }]; saveJobs();
  }
  function timeline(n) {
    const j = jobs[n] || {}, items = [];
    (j.notes || []).forEach(x => items.push({ id: x.id, ts: new Date(x.at).getTime(), kind: 'note', text: x.text, star: x.star, heart: x.heart }));
    (j.chat || []).forEach(x => items.push({ ...x, ts: new Date(x.at).getTime() }));
    tasks.filter(t => t.done && t.project === n && t.doneOn).forEach(t => items.push({ id: 'd' + t.id, ts: new Date(t.doneAt || t.doneOn + 'T12:00:00').getTime(), kind: 'sys', text: '✓ Done: ' + t.title }));
    if (j.last) items.push({ id: 'v', ts: new Date(j.last + 'T12:00:00').getTime(), kind: 'sys', text: j.kind === 'photos' ? '📷 Photos received from sub' : '🚗 Site visit logged' });
    return items.sort((a, b) => a.ts - b.ts);
  }
  // ---- photos / videos / documents: stored on this phone in IndexedDB ----
  let dbp = null; const memBlobs = {}, urlCache = {};
  const mdb = () => dbp ||= new Promise((res, rej) => { const r = indexedDB.open('oaf-media', 1); r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const idb = (mode, fn) => mdb().then(d => new Promise((res, rej) => { const t = d.transaction('files', mode), r = fn(t.objectStore('files')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }));
  const putFile = rec => idb('readwrite', st => st.put(rec));
  const getFile = id => idb('readonly', st => st.get(id));
  const delFile = id => { delete memBlobs[id]; if (urlCache[id]) { URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; } return idb('readwrite', st => st.delete(id)).catch(() => {}); };
  async function blobOf(id) { if (memBlobs[id]) return memBlobs[id]; const r = await getFile(id).catch(() => null); return r ? r.blob : null; }
  async function urlOf(id) { if (urlCache[id]) return urlCache[id]; const b = await blobOf(id); return b ? (urlCache[id] = URL.createObjectURL(b)) : ''; }
  const kindOf = f => /^image\//.test(f.type) ? 'image' : /^video\//.test(f.type) ? 'video' : 'file';
  const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const fileIcon = n => /\.pdf$/i.test(n) ? '📕' : /\.(xls|xlsx|csv)$/i.test(n) ? '📗' : /\.(doc|docx|txt)$/i.test(n) ? '📘' : /\.(zip)$/i.test(n) ? '🗜️' : '📄';
  async function shrinkImage(file) {
    if (!/^image\//.test(file.type) || file.type === 'image/gif') return file;
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }), sc = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
      return blob && blob.size < file.size ? new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
    } catch { return file; }
  }
  let pending = [];
  function mediaHTML(att) {
    return `<div class="media n${Math.min(att.filter(a => a.kind !== 'file').length, 4)}">` + att.map(a => a.kind === 'image' ? `<img class="mimg" data-mid="${a.id}" alt="${esc(a.name)}">`
      : a.kind === 'video' ? `<video class="mvid" data-mid="${a.id}" controls playsinline preload="metadata"></video>`
      : `<button class="mfile" data-mid="${a.id}" data-name="${esc(a.name)}"><span class="ficn">${fileIcon(a.name)}</span><span class="fnm"><b>${esc(a.name)}</b><small>${fmtSize(a.size)}</small></span></button>`).join('') + '</div>';
  }
  function hydrateMedia() {
    document.querySelectorAll('img[data-mid],video[data-mid]').forEach(el => { if (!el.src) urlOf(el.dataset.mid).then(u => { if (u) el.src = u; }); });
  }
  function jobMedia(n) { return ((jobs[n] || {}).chat || []).flatMap(x => (x.attach || []).map(a => ({ ...a, at: x.at }))); }
  async function openViewer(id, name, kind) {
    const u = await urlOf(id); if (!u) { toast('File not found on this phone'); return; }
    $('#vBody').innerHTML = kind === 'image' ? `<img src="${u}" alt="">` : kind === 'video' ? `<video src="${u}" controls playsinline autoplay></video>` : `<iframe src="${u}" title="${esc(name)}"></iframe>`;
    $('#viewer').dataset.mid = id; $('#viewer').dataset.name = name; $('#viewer').hidden = false;
  }
  async function shareFile(id, name) {
    const b = await blobOf(id); if (!b) return;
    const f = new File([b], name || 'file', { type: b.type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f] }).catch(() => {});
    else { const a = document.createElement('a'); a.href = await urlOf(id); a.download = name || 'file'; a.click(); }
  }
  function paintTray() {
    $('#tray').hidden = !pending.length;
    $('#tray').innerHTML = pending.map((p, i) => `<div class="titem">${p.kind === 'image' ? `<img src="${p.preview}" alt="">` : p.kind === 'video' ? `<span>🎬<br>${esc(fmtSize(p.size))}</span>` : `<span>${fileIcon(p.name)}<br>${esc(p.name.slice(0, 10))}</span>`}<button data-i="${i}" aria-label="Remove">×</button></div>`).join('');
    updateMain(); layoutComposer();
  }
  async function addFiles(list) {
    for (const f of [...list]) {
      const k = kindOf(f), file = k === 'image' ? await shrinkImage(f) : f;
      pending.push({ id: uid(), kind: k, name: f.name || (k === 'image' ? 'photo.jpg' : k === 'video' ? 'video.mov' : 'file'), size: file.size, mime: file.type || f.type, blob: file, preview: k === 'image' ? URL.createObjectURL(file) : '' });
    }
    paintTray(); $('#chatIn').focus();
  }
  const NAME_COLORS = ['#0b7a6b', '#a24bbf', '#d1580b', '#1f6feb', '#c2185b', '#5d8a00', '#7b4fd1', '#b8860b'];
  const nameColor = nm => NAME_COLORS[[...String(nm || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % NAME_COLORS.length];
  const MIC_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 15a3.5 3.5 0 003.5-3.5V6a3.5 3.5 0 10-7 0v5.5A3.5 3.5 0 0012 15zm6-3.5a6 6 0 01-12 0H4.5a7.5 7.5 0 006.75 7.46V22h1.5v-3.04A7.5 7.5 0 0019.5 11.5z"/></svg>';
  const SEND_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.99.99 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/></svg>';
  let sendVia = 'wa';
  try { sendVia = localStorage.getItem('oaf-via-v1') || 'wa'; } catch {}
  let lastTap = { id: '', t: 0 }, pressTimer = null, pressed = false;

  function chatHTML(n) {
    const items = timeline(n);
    if (!items.length) return `<div class="chatempty">🔒 Messages, replies, notes and job updates for this job show up here.<br>Tap <b>＋</b> to get started.</div>`;
    let last = '', prev = '', out = '<div class="chat">';
    items.forEach(x => {
      const d = new Date(x.ts), key = iso(d);
      if (key !== last) { out += `<div class="bday"><span>${fmtDate(key)}</span></div>`; last = key; prev = ''; }
      const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (x.kind === 'sys') { out += `<div class="bsys">${esc(x.text)}</div>`; prev = ''; return; }
      const run = x.kind + '|' + (x.who || ''), first = run !== prev; prev = run;
      out += `<div class="bub ${x.kind} ${first ? 'first' : ''} ${x.heart ? 'hasheart' : ''}" data-id="${x.id}" data-k="${x.kind}">
        ${x.kind === 'in' && first ? `<div class="bwho" style="color:${nameColor(x.who)}">${esc(x.who || 'Reply')}</div>` : ''}
        ${x.kind === 'out' && x.to && x.to.length ? `<div class="bto">To: ${esc(x.to.join(', '))}</div>` : ''}
        ${x.kind === 'note' ? '<div class="bto">📝 Note to self</div>' : ''}
        ${x.attach && x.attach.length ? mediaHTML(x.attach) : ''}
        ${x.text ? `<span class="btext">${esc(x.text)}</span>` : ''}<span class="btime">${x.star ? '<i class="bstar">★</i> ' : ''}${time}${x.kind === 'out' ? ' <i class="tick">✓</i>' : ''}</span>
        ${x.heart ? '<span class="react">❤️</span>' : ''}</div>`;
    });
    return out + '</div>';
  }
  function layoutComposer() {
    if (!$('#composer') || $('#composer').hidden) return;
    const vv = window.visualViewport, kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    $('#composer').style.bottom = (kb > 80 ? kb : 0) + 'px';
    $('#composer').classList.toggle('kb', kb > 80);
    document.querySelector('main').style.paddingBottom = ($('#composer').offsetHeight + 14) + 'px';
  }
  if (window.visualViewport) { visualViewport.addEventListener('resize', layoutComposer); visualViewport.addEventListener('scroll', layoutComposer); }
  function updateMain() { const has = $('#chatIn').value.trim() || pending.length; $('#chatSend').innerHTML = has ? SEND_SVG : MIC_SVG; $('#chatSend').classList.toggle('mic', !has); }
  function paintChatHead() {
    const n = curJob, j = jobs[n] || {};
    $('#cName').textContent = j.addr || n;
    const names = [...new Set([...getSubs(j), ...team].map(x => x.name))];
    $('#cMembers').textContent = [...names, 'You'].join(', ');
    $('#cTaskN').textContent = tasks.filter(t => !t.done && t.project === n).length || '';
    $('#apVia').lastChild.textContent = sendVia === 'wa' ? 'Sending via WhatsApp' : 'Sending via Messages';
  }
  function sendChat() {
    const text = $('#chatIn').value.trim();
    if (!text && !pending.length) { toast('Tap the 🎤 on your keyboard to dictate'); $('#chatIn').focus(); return; }
    if (pending.length) {
      const files = pending.map(p => new File([p.blob], p.name, { type: p.mime }));
      const attach = pending.map(p => { memBlobs[p.id] = p.blob; putFile({ id: p.id, job: curJob, name: p.name, mime: p.mime, size: p.size, blob: p.blob }).catch(() => toast('Could not save a file on this phone')); return { id: p.id, kind: p.kind, name: p.name, size: p.size, mime: p.mime }; });
      pending.forEach(p => p.preview && URL.revokeObjectURL(p.preview));
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
      let shared = null;
      if (navigator.canShare && navigator.canShare({ files })) shared = navigator.share({ files, text: text || undefined }).catch(() => {});
      logMsg(curJob, 'out', text, { attach, via: 'share' });
      pending = []; $('#chatIn').value = ''; paintTray(); autoGrow(); render();
      if (!shared) toast('Saved in the chat. Sharing is not available on this device.');
      return;
    }
    if (sendVia === 'wa') {
      logMsg(curJob, 'out', text, { via: 'wa' });
      $('#chatIn').value = ''; autoGrow(); render();
      location.href = 'https://wa.me/?text=' + encodeURIComponent(text);
      return;
    }
    const g = groupMembers(curJob);
    logMsg(curJob, g.length ? 'out' : 'note', text, g.length ? { to: g.map(x => x.name), via: 'sms' } : {});
    $('#chatIn').value = ''; autoGrow(); render();
    if (g.length) location.href = `sms:${g.map(x => cleanPhone(x.phone)).join(',')}${/iPhone|iPad|Mac/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(text)}`;
    else toast('Saved as a note. Pick who to text from ＋ → Quick messages.');
  }
  // paste copied WhatsApp messages: "[10/10/26, 11:18 PM] Name: text" (also "10/10/26, 11:18 PM - Name: text")
  function parseWhatsApp(text) {
    const re = /^\[?(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?\]?\s*[-–]?\s*([^:\n]{1,40}?):\s*(.*)$/;
    const out = [];
    text.split(/\r?\n/).forEach(line => {
      const m = line.replace(/[‎‏ ]/g, ' ').match(re);
      if (m) {
        let [, mo, dd, yy, hh, mi, ap, who, body] = m; yy = +yy < 100 ? 2000 + +yy : +yy; hh = +hh;
        if (ap) { ap = ap.toLowerCase(); if (ap === 'pm' && hh < 12) hh += 12; if (ap === 'am' && hh === 12) hh = 0; }
        out.push({ at: new Date(yy, +mo - 1, +dd, hh, +mi).toISOString(), who: who.trim(), text: body });
      } else if (out.length && line.trim()) out[out.length - 1].text += '\n' + line;
    });
    return out;
  }
  // ---- WhatsApp-style group info screens ----
  let tabHist = [], mediaTab = 'media', chatSearch = false, pendingJump = null;
  const waNum = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '1' + d : d; };
  function goTab(t) { if (t !== jobTab) tabHist.push(jobTab); jobTab = t; chatSearch = false; render(); window.scrollTo(0, 0); }
  function backTab() { jobTab = tabHist.pop() || 'chat'; chatSearch = false; render(); if (jobTab !== 'chat') window.scrollTo(0, 0); }
  function defaultGroupPhones(j) { return getSubs(j).filter(x => hasPhone(x.phone)).map(x => cleanPhone(x.phone)); }
  function membersOf(n) {
    const j = jobs[n] || {}, g = j.group;
    return [...getSubs(j).map(x => ({ ...x, role: x.trade || 'Sub', kind: 'sub' })),
            ...team.filter(x => g && g.includes(cleanPhone(x.phone))).map(x => ({ ...x, kind: 'team' }))];
  }
  function openPick(title, items) {
    $('#pickTitle').textContent = title;
    $('#pickList').innerHTML = items.map((it, i) => `<button class="pickbtn ${it.danger ? 'dng' : ''}" data-i="${i}">${esc(it.label)}</button>`).join('');
    $('#pickList').onclick = ev => { const b = ev.target.closest('[data-i]'); if (!b) return; $('#pickBg').classList.remove('open'); items[+b.dataset.i].fn(); };
    $('#pickBg').classList.add('open');
  }
  const label2 = x => `${x.name}${x.role ? ' · ' + x.role : ''}`;
  function callPeople(n) {
    const m = membersOf(n).filter(x => hasPhone(x.phone));
    if (!m.length) { toast('Add a phone number first (Edit job)'); return; }
    if (m.length === 1) { location.href = 'tel:' + cleanPhone(m[0].phone); return; }
    openPick('Who do you want to call?', m.map(x => ({ label: '📞 ' + label2(x), fn: () => { location.href = 'tel:' + cleanPhone(x.phone); } })));
  }
  function memberMenu(n, i) {
    const x = membersOf(n)[i]; if (!x) return; const ok = hasPhone(x.phone), j = jobs[n] = jobs[n] || {};
    const items = [];
    if (ok) items.push({ label: '📞 Call ' + x.name, fn: () => { location.href = 'tel:' + cleanPhone(x.phone); } },
      { label: '💬 Text ' + x.name, fn: () => { location.href = smsHref(x.phone, ''); } },
      { label: '🟢 WhatsApp ' + x.name, fn: () => { location.href = 'https://wa.me/' + waNum(x.phone); } });
    else items.push({ label: 'No phone number saved', fn: () => openEdit(n) });
    if (x.kind === 'team') items.push({ label: 'Remove from this group', danger: true, fn: () => { j.group = (j.group || defaultGroupPhones(j)).filter(p => p !== cleanPhone(x.phone)); saveJobs(); render(); } });
    else items.push({ label: '✎ Edit in job details', fn: () => openEdit(n) });
    openPick(label2(x), items);
  }
  function addMemberMenu(n) {
    const j = jobs[n] = jobs[n] || {}, inG = j.group || defaultGroupPhones(j);
    const items = team.filter(x => hasPhone(x.phone) && !inG.includes(cleanPhone(x.phone))).map(x => ({ label: '＋ ' + label2(x), fn: () => { j.group = [...(j.group || defaultGroupPhones(j)), cleanPhone(x.phone)]; saveJobs(); render(); toast(x.name + ' added'); } }));
    items.push({ label: '＋ New sub or person…', fn: () => { openEdit(n); addSubRow(); } }, { label: '👥 Manage my team', fn: () => { teamFromMsg = false; openTeam(); } });
    openPick('Add to this group', items);
  }
  const findMsg = (id, k) => { const j = jobs[curJob] || {}; return (k === 'note' ? (j.notes || []) : (j.chat || [])).find(x => x.id === id); };
  function delMsg(id, k) {
    const j = jobs[curJob] || {};
    if (k === 'note') j.notes = (j.notes || []).filter(x => x.id !== id);
    else { (j.chat || []).filter(x => x.id === id).forEach(x => (x.attach || []).forEach(a => delFile(a.id))); j.chat = (j.chat || []).filter(x => x.id !== id); }
    saveJobs(); render();
  }
  function msgMenu(id, k) {
    const m = findMsg(id, k); if (!m) return; const j = jobs[curJob];
    const items = [{ label: m.star ? '☆ Remove star' : '⭐ Star message', fn: () => { m.star = !m.star; saveJobs(); render(); toast(m.star ? 'Starred' : 'Star removed'); } },
      { label: m.heart ? '💔 Remove ❤️' : '❤️ React', fn: () => { m.heart = !m.heart; saveJobs(); render(); } }];
    if (m.text) items.push({ label: '📋 Copy text', fn: async () => { try { await navigator.clipboard.writeText(m.text); toast('Copied'); } catch { toast('Could not copy'); } } });
    items.push({ label: '🗑 Delete', danger: true, fn: () => { if (confirm('Delete this message?')) delMsg(id, k); } });
    openPick('Message', items);
  }
  const linksOf = n => timeline(n).filter(x => x.kind !== 'sys' && x.text).flatMap(x => (x.text.match(/https?:\/\/[^\s<>"']+/g) || []).map(u => ({ u, ts: x.ts, who: x.kind === 'in' ? x.who : 'You' })));
  const sbar = (back, title, right = '') => `<div class="sbar"><button class="sback" data-act="back" aria-label="Back">‹</button><div class="stitle">${title}</div><div class="sright">${right}</div></div>`;
  const srow = (icon, label, val, act, extra = '') => `<button class="srow" data-act="${act}" ${extra}><span class="sico">${icon}</span><span class="slbl">${label}</span><span class="sval">${val}</span><span class="schev">›</span></button>`;
  function screenInfo(n) {
    const j = jobs[n] || {}, mem = membersOf(n), media = jobMedia(n), starred = timeline(n).filter(x => x.star && x.kind !== 'sys').length;
    const openN = tasks.filter(t => !t.done && t.project === n).length, links = linksOf(n).length;
    const avatar = x => `<span class="mav" style="background:${nameColor(x.name)}">${esc((x.name || '?').trim()[0].toUpperCase())}</span>`;
    return `<div class="sbar"><button class="sback" data-act="back" aria-label="Back">‹</button><div class="sright"><button class="spill" data-act="editjobd">✎ Edit</button></div></div>
      <div class="ginfo"><div class="gavatar"><svg viewBox="0 0 24 24" width="54" height="54" fill="currentColor"><path d="M16 11a3 3 0 100-6 3 3 0 000 6zM8 11a3 3 0 100-6 3 3 0 000 6zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div>
        <h2 class="gtitle">${esc(j.addr || n)}</h2>
        <div class="gsub">Group · <b>${mem.length + 1} members</b></div>
        <div class="gsub2">${esc(n)}</div></div>
      <div class="gactions">
        <button data-act="callall"><i>📞</i>Call</button>
        <button data-act="${j.addr ? 'navjob' : 'editjobd'}"><i>🧭</i>Navigate</button>
        <button data-act="addmember"><i>＋</i>Add</button>
        <button data-act="search"><i>🔍</i>Search</button></div>
      <div class="ssec">Media</div><div class="scard">
        ${srow('🖼️', 'Media, links and docs', media.length + links, 'jtab', 'data-tab="media"')}
        ${srow('⭐', 'Starred messages', starred, 'jtab', 'data-tab="starred"')}
        ${srow('✅', 'To-do &amp; checklists', openN ? openN + ' open' : '✓', 'jtab', 'data-tab="tasks"')}
        ${srow('📝', 'Job summary', '', 'summary')}</div>
      <div class="ssec">${mem.length + 1} members</div><div class="scard">
        <div class="mrow me">${`<span class="mav" style="background:#0f2747">${esc(OWNER[0])}</span>`}<span class="mbody"><b>${esc(OWNER)}</b><small>You</small></span></div>
        ${mem.map((x, i) => `<div class="mrow" data-act="member" data-i="${i}">${avatar(x)}<span class="mbody"><b>${esc(x.name)}</b><small>${esc(x.role || '')}${x.phone ? ' · ' + esc(x.phone) : ' · no phone'}</small></span>${hasPhone(x.phone) ? `<a class="mcall" href="tel:${esc(cleanPhone(x.phone))}" aria-label="Call">📞</a>` : ''}</div>`).join('')}
        <button class="srow addm" data-act="addmember"><span class="sico">＋</span><span class="slbl">Add member</span></button></div>
      <div class="ssec">Job settings</div><div class="scard">
        ${srow('💰', 'Upsell potential', j.upsell ? money(j.upsell) : 'Set', 'upsell', `data-p="${esc(n)}"`)}
        ${srow('🚗', 'Site check every', (j.every || 5) + ' days', 'editjobd')}
        ${srow('🕒', 'Last site check', j.last ? agoText(j.last) : 'none', 'editjobd')}
        ${srow('🔗', 'WhatsApp group link', j.wa ? 'Open' : 'Add', j.wa ? 'openwa' : 'editjobd')}
        ${srow('📤', 'Send chat messages via', sendVia === 'wa' ? 'WhatsApp' : 'Messages', 'togvia')}</div>`;
  }
  function screenTasks(n) {
    const all = tasks.filter(t => t.project === n), chk = all.filter(t => t.ord !== undefined).sort((a, b) => a.ord - b.ord);
    const todo = all.filter(t => !t.done && t.ord === undefined).sort(cmp), doneT = all.filter(t => t.done && t.ord === undefined);
    const dn = chk.filter(t => t.done).length;
    return sbar(0, 'To-do &amp; checklists', `<button class="spill primary" data-act="addto" data-p="${esc(n)}">＋ Task</button>`) +
      (chk.length ? `<div class="ssec">Kickoff checklist · ${dn} of ${chk.length}</div><div class="prog"><i style="width:${Math.round(dn / chk.length * 100)}%"></i></div>` + chk.map(taskHTML).join('') : '') +
      `<div class="ssec">To-do · ${todo.length} open</div>` + (todo.length ? todo.map(taskHTML).join('') : `<div class="empty small">No open to-dos. Tap ＋ Task to add one.</div>`) +
      (doneT.length ? `<div class="ssec">Done · ${doneT.length}</div>` + doneT.map(taskHTML).join('') : '');
  }
  function screenMedia(n) {
    const mm = jobMedia(n).slice().reverse(), photos = mm.filter(a => a.kind !== 'file'), docs = mm.filter(a => a.kind === 'file'), links = linksOf(n).slice().reverse();
    const tab = (k, l, c) => `<button class="${mediaTab === k ? 'on' : ''}" data-act="mtab" data-t="${k}">${l} ${c}</button>`;
    let body = '';
    if (mediaTab === 'media') body = photos.length ? '<div class="mgrid">' + photos.map(a => a.kind === 'image' ? `<img class="mthumb" data-mid="${a.id}" data-k="image" alt="">` : `<button class="mthumb mtile" data-mid="${a.id}" data-name="${esc(a.name)}"><span>🎬</span><small>${esc(a.name.slice(0, 14))}</small></button>`).join('') + '</div>' : `<div class="empty small"><div class="big">🖼️</div>No photos or videos yet.</div>`;
    else if (mediaTab === 'docs') body = docs.length ? '<div class="scard">' + docs.map(a => `<button class="srow mfile2" data-mid="${a.id}" data-name="${esc(a.name)}"><span class="sico">${fileIcon(a.name)}</span><span class="slbl"><b>${esc(a.name)}</b><small>${fmtSize(a.size)} · ${fmtDate(iso(new Date(a.at)))}</small></span><span class="schev">›</span></button>`).join('') + '</div>' : `<div class="empty small"><div class="big">📄</div>No documents yet.</div>`;
    else body = links.length ? '<div class="scard">' + links.map(l => `<button class="srow" data-act="openlink" data-u="${esc(l.u)}"><span class="sico">🔗</span><span class="slbl"><b class="lnk">${esc(l.u)}</b><small>${esc(l.who)} · ${fmtDate(iso(new Date(l.ts)))}</small></span><span class="schev">›</span></button>`).join('') + '</div>' : `<div class="empty small"><div class="big">🔗</div>No links yet.</div>`;
    return sbar(0, 'Media, links and docs') + `<div class="seg">${tab('media', 'Media', photos.length)}${tab('docs', 'Docs', docs.length)}${tab('links', 'Links', links.length)}</div>` + body;
  }
  function screenStarred(n) {
    const st = timeline(n).filter(x => x.star && x.kind !== 'sys').reverse();
    return sbar(0, 'Starred messages') + (st.length ? st.map(x => `<button class="starcard" data-act="jump" data-id="${x.id}"><div class="sh"><b style="color:${x.kind === 'in' ? nameColor(x.who) : '#0f2747'}">${x.kind === 'in' ? esc(x.who || 'Reply') : 'You'}</b><span>${fmtDate(iso(new Date(x.ts)))} · ${new Date(x.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div><div class="st">${x.text ? esc(x.text) : '📎 ' + ((x.attach || []).map(a => a.name).join(', ') || 'Attachment')}</div></button>`).join('')
      : `<div class="empty small"><div class="big">⭐</div>No starred messages yet.<br>Touch and hold a message in the chat, then tap Star.</div>`);
  }
  const smsHref = (phone, body) => `sms:${phone || ''}${/iPhone|iPad|Mac/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(body)}`;
  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
  }

  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => iso(new Date());
  const addDays = (n, from) => { const d = from ? new Date(from + 'T12:00:00') : new Date(); d.setDate(d.getDate() + n); return iso(d); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function fmtDate(s) {
    if (!s) return 'No date';
    if (s === todayISO()) return 'Today';
    if (s === addDays(1)) return 'Tomorrow';
    if (s === addDays(-1)) return 'Yesterday';
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const cmp = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.star ? 1 : 0) - (a.star ? 1 : 0) || (a.ord ?? 99) - (b.ord ?? 99) || a.title.localeCompare(b.title);

  function taskHTML(t) {
    const t0 = todayISO(), c = catOf(t.cat);
    const dcls = !t.done && t.due ? (t.due < t0 ? 'late' : t.due === t0 ? 'today' : '') : '';
    return `<div class="task ${t.done ? 'done' : ''} ${t.star ? 'starred' : ''}" data-id="${t.id}">
      <button class="check" data-act="toggle" aria-label="Mark done">${t.done ? '✓' : ''}</button>
      <div class="body" data-act="edit">
        <div class="title">${esc(t.title)}</div>
        <div class="meta">
          ${c ? `<span class="tag">${c.icon} ${c.label}</span>` : ''}
          ${t.project ? `<span class="proj">${esc(t.project)}</span>` : ''}
          <span class="date ${dcls}">${fmtDate(t.due)}${t.time ? ' · ' + fmtTime(t.time) : ''}</span>
        </div>
        ${t.notes ? `<div class="notes">${esc(t.notes)}</div>` : ''}
      </div>
      ${t.done ? '' : `<div class="quick">
        <button class="qbtn star" data-act="star" aria-label="Priority">${t.star ? '★' : '☆'}</button>
        <button class="qbtn" data-act="snooze" aria-label="Push to tomorrow">+1d</button>
      </div>`}
    </div>`;
  }

  function render() {
    const t0 = todayISO();
    const open = tasks.filter(t => !t.done).sort(cmp);
    const open_ = n => open.filter(t => t.project === n);
    let html = '', stats = '';

    if (view === 'today') {
      const h = new Date().getHours();
      $('#h1').textContent = `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${OWNER}`;
      const overdue = open.filter(t => t.due && t.due < t0);
      const today = open.filter(t => t.due === t0);
      const doneToday = tasks.filter(t => t.done && t.doneOn === t0);
      const need = overdue.length + today.length;
      $('#sub').textContent = need ? `${need} ${need === 1 ? 'task needs' : 'tasks need'} you today` : 'You are all caught up';
      const chip = (k, n, l, cls) => `<button class="stat ${cls} ${filter === k ? 'on' : ''}" data-filter="${k}"><b>${n}</b><span>${l}</span></button>`;
      stats = chip('overdue', overdue.length, 'Overdue', 'bad') + chip('today', today.length, 'Due today', 'mid') + chip('done', doneToday.length, 'Done', 'good');
      if (filter === 'all' || filter === 'overdue') if (overdue.length) html += `<div class="section-title overdue">Overdue</div>` + overdue.map(taskHTML).join('');
      if (filter === 'all' || filter === 'today') if (today.length) html += `<div class="section-title">Due today</div>` + today.map(taskHTML).join('');
      if (filter === 'all' || filter === 'done') if (doneToday.length) html += `<div class="section-title">Done today</div>` + doneToday.map(taskHTML).join('');
      const needV = visitList().filter(v => v.state === 'late').length;
      if (needV && filter === 'all') html = `<button class="alert" data-go="visits">🚗 <b>${needV}</b> ${needV === 1 ? 'job needs' : 'jobs need'} a site visit<span>Open ›</span></button>` + html;
      const evlink = `<button class="evlink" data-go="evening">🌙 <b>Evening review</b><span>Open ›</span></button>`;
      if (!html) html = !tasks.length && !Object.keys(jobs).length && filter === 'all'
        ? `<div class="welcome"><div class="wbig">👋</div><h3>Welcome</h3><p>This is a work-in-progress app for managing jobs, subs, and the team chat. Take a look around and tell us what you think.</p>
            <button class="jbtn primary wide" data-act="demoload">✨ Load sample jobs</button>
            <button class="jbtn wide" data-act="feedback">💬 Send feedback</button>
            <div class="hint">Sample jobs are made-up examples. You can remove them anytime from the Projects tab.</div></div>`
        : `<div class="empty"><div class="big">✓</div>${filter === 'all' ? 'Nothing due. Tap + to add a task.' : 'Nothing here.'}</div>`;
      if (filter === 'all') { const k = html.startsWith('<button class="alert"') ? html.indexOf('</button>') + 9 : 0; html = html.slice(0, k) + evlink + html.slice(k); }
    } else if (view === 'visits') {
      $('#h1').textContent = 'Site Visits';
      const list = visitList();
      const cnt = k => list.filter(v => v.state === k).length;
      $('#sub').textContent = cnt('late') ? `${cnt('late')} ${cnt('late') === 1 ? 'job is' : 'jobs are'} overdue for a visit` : 'Every job is on track';
      const chip = (k, n, l, cls) => `<button class="stat ${cls} ${filter === k ? 'on' : ''}" data-filter="${k}"><b>${n}</b><span>${l}</span></button>`;
      stats = chip('late', cnt('late'), 'Overdue', 'bad') + chip('soon', cnt('soon'), 'Due soon', 'mid') + chip('ok', cnt('ok'), 'On track', 'good');
      const shown = list.filter(v => filter === 'all' || v.state === filter);
      if (!shown.length) html = `<div class="empty"><div class="big">🚗</div>${list.length ? 'Nothing here.' : 'No active jobs yet. Tap New job sold to add one.'}</div>`;
      shown.forEach(v => {
        const up = v.j.upsell ? `<span class="pup set">${money(v.j.upsell)} upsell</span>` : '';
        html += `<div class="vcard ${v.state}" data-p="${esc(v.n)}">
          <div class="vtop">
            <div class="vtitle"><div class="vname">${esc(v.n)}</div><div class="vsub">${esc(v.j.addr || '') || 'Add address with ✎'}</div>${getSubs(v.j).length ? `<div class="subchips">${subChips(v.j)}</div>` : ''}</div>
            <span class="vbadge">${nextText(v)}</span>
          </div>
          <div class="vmeta"><span>Last: ${v.j.last ? agoText(v.j.last) + ' · ' + (v.j.kind === 'photos' ? 'photos' : 'on site') : 'none logged'}</span>${up}</div>
          <div class="vbtns">
            <button data-act="visited">✓ Visited</button>
            <button data-act="photosin">📷 Photos in</button>
            <button data-act="asksub">💬 Ask sub</button>
            ${v.j.addr ? '<button data-act="navto">🧭 Go</button>' : ''}
            <button data-act="editjob" aria-label="Edit job">✎</button>
          </div>
        </div>`;
      });
    } else if (view === 'upcoming') {
      $('#h1').textContent = 'Upcoming';
      $('#sub').textContent = 'What is coming up next';
      const later = open.filter(t => !t.due || t.due > t0);
      if (!later.length) html = `<div class="empty"><div class="big">📅</div>No upcoming tasks.</div>`;
      let last = null;
      later.forEach(t => {
        const k = t.due || '';
        if (k !== last) { html += `<div class="section-title">${t.due ? fmtDate(t.due) : 'No date'}</div>`; last = k; }
        html += taskHTML(t);
      });
    } else if (view === 'evening') {
      $('#h1').textContent = '🌙 Evening review';
      $('#sub').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      const list = visitList().map(v => {
        const open = open_(v.n), late = open.filter(t => t.due && t.due < t0).length, issues = [];
        if (late) issues.push(`${late} overdue ${late === 1 ? 'task' : 'tasks'}`);
        if (v.state === 'late') issues.push('visit overdue');
        return { ...v, issues, open };
      });
      const attn = list.filter(v => v.issues.length);
      const tm = open.filter(t => t.due === addDays(1));
      const doneN = tasks.filter(t => t.done && t.doneOn === t0).length;
      html += `<div class="evstats"><div><b>${attn.length}</b><span>need attention</span></div><div><b>${tm.length}</b><span>due tomorrow</span></div><div><b>${doneN}</b><span>done today</span></div></div>`;
      html += `<div class="section-title">Needs attention tonight</div>`;
      html += attn.length ? attn.map(v => `<button class="folder hasLate" data-act="openjob" data-p="${esc(v.n)}"><span class="ficon">⚠️</span><span class="fbody"><span class="fclient">${esc(v.n)}</span><span class="fmeta"><em>${v.issues.join(' · ')}</em></span></span><span class="fright"><i>›</i></span></button>`).join('')
        : `<div class="empty small"><div class="big">✓</div>All jobs are on track.</div>`;
      html += `<div class="section-title">Tomorrow</div>` + (tm.length ? tm.map(taskHTML).join('') : `<div class="empty small">Nothing scheduled for tomorrow.</div>`);
      html += `<div class="section-title">Daily reminder</div><div class="remcard">
        <div class="remtxt">Get a reminder every evening that opens this screen.</div>
        <div class="chips" id="remChips">${['17:00', '18:00', '19:00', '20:00'].map(t => `<button type="button" class="chip ${remTime === t ? 'on' : ''}" data-rem="${t}">${fmtTime(t)}</button>`).join('')}</div>
        <button class="jbtn primary wide" data-act="setrem">🔔 Add daily reminder to Calendar</button>
        <div class="hint">If nothing opens, set a daily alarm in the Clock app and label it "Evening review".</div></div>
        <div class="jobactions"><button class="jbtn" data-act="evcopy">📋 Copy / share summary</button></div>`;
    } else if (view === 'job') {
      const n = curJob;
      $('#h1').textContent = n; $('#sub').textContent = (jobs[n] || {}).addr || '';
      if (jobTab === 'chat') html += (chatSearch ? `<div class="schat"><input id="sq" placeholder="Search this chat" autocomplete="off"><button data-act="searchx">Cancel</button></div>` : '') + chatHTML(n);
      else if (jobTab === 'tasks') html += screenTasks(n);
      else if (jobTab === 'media') html += screenMedia(n);
      else if (jobTab === 'starred') html += screenStarred(n);
      else html += screenInfo(n);
    } else {
      $('#h1').textContent = 'Projects';
      const names = activeProjects();
      $('#sub').textContent = names.length ? `${names.length} active ${names.length === 1 ? 'job' : 'jobs'}` : 'No active jobs yet';
      const cityOf = n => { const a = (jobs[n]?.addr || '').split(',').map(x => x.trim()).filter(Boolean); return a.length > 1 ? a[1] : (a.length ? 'Other' : ''); };
      const sections = {};
      names.forEach(n => (sections[cityOf(n) || 'No address yet'] ||= []).push(n));
      const secNames = Object.keys(sections).sort((a, b) => a === 'No address yet' ? 1 : b === 'No address yet' ? -1 : a.localeCompare(b));
      if (!names.length) html = `<div class="empty"><div class="big">📁</div>No jobs yet. Tap New job sold to add one.</div>`;
      secNames.forEach(city => {
        html += `<div class="section-title">${esc(city)}</div>`;
        sections[city].sort((a, b) => (jobs[a]?.addr || a).localeCompare(jobs[b]?.addr || b)).forEach(n => {
          const j = jobs[n] || {}, mine = open.filter(t => t.project === n);
          const late = mine.filter(t => t.due && t.due < t0).length, nxt = mine[0];
          html += `<button class="folder ${late ? 'hasLate' : ''}" data-act="openjob" data-p="${esc(n)}">
            <span class="ficon">📁</span>
            <span class="fbody">
              <span class="faddr ${j.addr ? '' : 'none'}">${esc(j.addr || 'No address yet')}</span>
              <span class="fclient">${esc(n)}</span>
              ${getSubs(j).length ? `<span class="subchips">${subChips(j)}</span>` : ''}
              <span class="fmeta">${mine.length} open${late ? ` · <em>${late} late</em>` : nxt && nxt.due ? ' · next ' + fmtDate(nxt.due) : ''}</span>
            </span>
            <span class="fright">${j.upsell ? `<span class="pup set">${money(j.upsell)}</span>` : ''}<i>›</i></span>
          </button>`;
        });
      });
      html += `<div class="tools">
        <button id="exportBtn">⬇ Back up</button>
        <button id="importBtn">⬆ Restore</button>
        <button id="teamBtn">👥 My team</button>
        <button id="demoBtn">${Object.values(jobs).some(j => j && j.demo) ? '🧹 Remove sample jobs' : '✨ Add sample jobs'}</button>
        <button id="fbBtn">💬 Send feedback</button>
        <button id="updateBtn">🔄 Update app</button>
        <button id="clearDone">🧹 Clear completed</button>
        <input type="file" id="importFile" accept="application/json" hidden>
      </div><div class="hint">Your tasks are stored on this phone only. Back up now and then. Photos, videos and files stay on this phone and are not in the backup yet.<br>Version ${APP_VERSION}</div>`;
    }
    $('#stats').innerHTML = stats; $('#stats').hidden = !stats;
    $('#jobbar').hidden = ['upcoming', 'visits', 'job', 'evening'].includes(view);
    $('#back').hidden = view !== 'job' && view !== 'evening';
    $('#back').textContent = view === 'evening' ? '‹ Today' : '‹ Projects';
    const lateN = visitList().filter(v => v.state === 'late').length;
    $('#vbadge').textContent = lateN || ''; $('#vbadge').hidden = !lateN;
    const inPlay = [...new Set(open.map(t => t.project).filter(Boolean))].reduce((a, n) => a + (jobs[n]?.upsell || 0), 0);
    $('#pot').innerHTML = inPlay ? `Upsell potential in play <b>${money(inPlay)}</b>` : 'Add upsell potential to each job';
    $('#main').innerHTML = html;
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === (view === 'job' ? 'projects' : view)));
    const inChat = view === 'job' && jobTab === 'chat';
    $('#composer').hidden = !inChat; $('#chatHead').hidden = !inChat; $('#fab').hidden = view === 'job';
    document.body.classList.toggle('injob', view === 'job');
    document.body.classList.toggle('inchat', inChat);
    document.documentElement.classList.toggle('inchat', inChat);
    if (!inChat) document.querySelector('main').style.paddingBottom = '';
    if (inChat) { paintChatHead(); updateMain(); layoutComposer(); requestAnimationFrame(() => {
      layoutComposer();
      const jt = pendingJump && document.querySelector('.bub[data-id="' + pendingJump + '"]');
      if (jt) { jt.scrollIntoView({ block: 'center' }); jt.classList.add('flash'); setTimeout(() => jt.classList.remove('flash'), 1800); } else window.scrollTo(0, document.body.scrollHeight);
      pendingJump = null;
    }); }
    hydrateMedia();
    $('#projList').innerHTML = [...new Set(tasks.map(t => t.project).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('');
  }

  // ---- toast with undo ----
  function toast(msg, undo) {
    lastUndo = undo || null;
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button id="undoBtn">Undo</button>' : ''}`;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
  }

  // ---- add / edit sheet ----
  function paintCats() {
    $('#catChips').innerHTML = CATS.map(c => `<button type="button" class="chip ${formCat === c.id ? 'on' : ''}" data-cat="${c.id}">${c.icon} ${c.label}</button>`).join('');
    $('#starChip').classList.toggle('on', formStar);
    $('#starChip').textContent = formStar ? '★ Priority' : '☆ Priority';
  }
  function setDue(v) {
    $('#f-due').value = v || '';
    document.querySelectorAll('#dueChips .chip').forEach(c => c.classList.toggle('on', !!v && addDays(+c.dataset.d) === v));
  }
  function openSheet(id, project) {
    editingId = id || null;
    const t = id ? tasks.find(x => x.id === id) : null;
    $('#sheetTitle').textContent = t ? 'Edit task' : 'New task';
    $('#f-title').value = t ? t.title : '';
    $('#f-project').value = t ? t.project : (project || '');
    $('#f-notes').value = t ? t.notes : '';
    formCat = t ? (t.cat || '') : ''; formStar = t ? !!t.star : false;
    paintCats(); setDue(t ? t.due : todayISO());
    $('#delBtn').hidden = !t;
    $('#bg').classList.add('open');
    if (!t) setTimeout(() => $('#f-title').focus(), 60);
  }
  const closeSheet = () => { $('#bg').classList.remove('open'); editingId = null; };
  function saveSheet() {
    const title = $('#f-title').value.trim();
    if (!title) { $('#f-title').focus(); return; }
    const data = { title, project: $('#f-project').value.trim(), due: $('#f-due').value, notes: $('#f-notes').value.trim(), cat: formCat, star: formStar };
    if (editingId) Object.assign(tasks.find(x => x.id === editingId), data);
    else tasks.push({ id: uid(), done: false, ...data });
    save(); closeSheet(); render();
  }

  // ---- team contacts + group text (opens your Messages app) ----
  const TEAM_KEY = 'oaf-team-v1';
  let team = [];
  try { team = JSON.parse(localStorage.getItem(TEAM_KEY)) || []; } catch { team = []; }
  const saveTeam = () => { try { localStorage.setItem(TEAM_KEY, JSON.stringify(team)); } catch {} };
  const cleanPhone = p => String(p || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  const hasPhone = p => cleanPhone(p).replace(/\D/g, '').length >= 10;
  let teamFromMsg = false, msgJob = '', msgList = [];

  function addTeamRow(x = {}) {
    const d = document.createElement('div'); d.className = 'subrow';
    d.innerHTML = `<input class="s-name" placeholder="Name" autocomplete="off" value="${esc(x.name || '')}">
      <input class="s-trade" list="roleList" placeholder="Role" autocomplete="off" value="${esc(x.role || '')}">
      <input class="s-phone" type="tel" inputmode="tel" placeholder="Phone" value="${esc(x.phone || '')}">
      <button type="button" class="s-del" aria-label="Remove person">×</button>`;
    $('#teamRows').appendChild(d);
  }
  function openTeam() {
    $('#teamRows').innerHTML = ''; (team.length ? team : [{ role: 'Partner' }, { role: 'Partner' }, { role: 'Sales rep' }]).forEach(addTeamRow);
    $('#teamBg').classList.add('open');
  }
  function closeTeam() { $('#teamBg').classList.remove('open'); if (teamFromMsg) { teamFromMsg = false; openMsg(msgJob); } }
  $('#addTeam').onclick = () => addTeamRow({ role: 'Sales rep' });
  $('#teamRows').onclick = e => { if (e.target.classList.contains('s-del')) e.target.closest('.subrow').remove(); };
  $('#tCancel').onclick = closeTeam;
  $('#teamBg').onclick = e => { if (e.target.id === 'teamBg') closeTeam(); };
  $('#tSave').onclick = () => {
    team = [...document.querySelectorAll('#teamRows .subrow')].map(r => ({ id: uid(), name: r.querySelector('.s-name').value.trim(), role: r.querySelector('.s-trade').value.trim(), phone: r.querySelector('.s-phone').value.trim() })).filter(x => x.name);
    saveTeam(); closeTeam(); toast(`${team.length} ${team.length === 1 ? 'person' : 'people'} saved`);
  };

  const TEMPLATES = [
    ['📷 Photos', (n, a) => `Hi team, it's ${OWNER}. Can you send photos or a quick video of the current work at ${n}${a}? Please include anything about to get covered up. Thanks!`],
    ['📅 Schedule', (n, a) => `Hi team, quick schedule update for ${n}${a}: `],
    ['⏰ I\'ll be there', (n, a) => `Hi team, I'll be at ${n}${a} tomorrow at 8:00 AM. Please make sure someone is on site. Thanks!`],
    ['⚠️ Problem', (n, a) => `Heads up on ${n}${a}: there's an issue. `],
    ['✏️ Custom', () => ''],
  ];
  function paintRecips() {
    const grp = (title, arr) => arr.length ? `<div class="rgroup">${title}</div>` + arr.map(r => `<label class="rcpt ${r.phone ? '' : 'nophone'}"><input type="checkbox" data-k="${r.key}" ${r.checked ? 'checked' : ''} ${r.phone ? '' : 'disabled'}><span><span class="rn"><b>${esc(r.name)}</b>${r.role ? ' · ' + esc(r.role) : ''}</span><small>${r.phone ? esc(r.phone) : 'no phone number'}</small></span></label>`).join('') : '';
    $('#rcptList').innerHTML = grp('Subs on this job', msgList.filter(r => r.kind === 'sub')) + grp('Your team', msgList.filter(r => r.kind === 'team')) ||
      '<div class="hint">No contacts yet. Add subs to the job and your team below.</div>';
  }
  function openMsg(n) {
    msgJob = n; const j = jobs[n] || {};
    msgList = [
      ...getSubs(j).map((x, i) => ({ key: 's' + i, kind: 'sub', name: x.name, role: x.trade, phone: hasPhone(x.phone) ? x.phone : '', checked: j.group ? j.group.includes(cleanPhone(x.phone)) : hasPhone(x.phone) })),
      ...team.map((x, i) => ({ key: 't' + i, kind: 'team', name: x.name, role: x.role, phone: hasPhone(x.phone) ? x.phone : '', checked: !!(j.group && j.group.includes(cleanPhone(x.phone))) })),
    ];
    $('#msgTitle').textContent = 'Message team · ' + n;
    $('#tplChips').innerHTML = TEMPLATES.map((t, i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-t="${i}">${t[0]}</button>`).join('');
    $('#m-text').value = TEMPLATES[0][1](n, j.addr ? ' (' + j.addr + ')' : '');
    $('#mUse').hidden = !(view === 'job' && jobTab === 'chat');
    paintRecips(); $('#msgBg').classList.add('open');
  }
  $('#tplChips').onclick = e => {
    const c = e.target.closest('[data-t]'); if (!c) return;
    document.querySelectorAll('#tplChips .chip').forEach(x => x.classList.toggle('on', x === c));
    const j = jobs[msgJob] || {}; $('#m-text').value = TEMPLATES[+c.dataset.t][1](msgJob, j.addr ? ' (' + j.addr + ')' : '');
    $('#m-text').focus();
  };
  function saveGroup() {
    const j = jobs[msgJob] = jobs[msgJob] || {};
    j.group = msgList.filter(r => r.checked && r.phone).map(r => cleanPhone(r.phone)); saveJobs();
    if (view === 'job') render();
  }
  $('#rcptList').onchange = e => { const r = msgList.find(x => x.key === e.target.dataset.k); if (r) { r.checked = e.target.checked; saveGroup(); } };
  $('#mAll').onclick = () => { msgList.forEach(r => { if (r.phone) r.checked = true; }); paintRecips(); saveGroup(); };
  $('#mNone').onclick = () => { msgList.forEach(r => r.checked = false); paintRecips(); saveGroup(); };
  $('#mUse').onclick = () => { $('#chatIn').value = $('#m-text').value; $('#msgBg').classList.remove('open'); autoGrow(); $('#chatIn').focus(); };
  $('#mTeam').onclick = () => { teamFromMsg = true; $('#msgBg').classList.remove('open'); openTeam(); };
  $('#mCancel').onclick = () => $('#msgBg').classList.remove('open');
  $('#msgBg').onclick = e => { if (e.target.id === 'msgBg') $('#msgBg').classList.remove('open'); };
  $('#mCopy').onclick = async () => { try { await navigator.clipboard.writeText($('#m-text').value); toast('Message copied'); } catch { toast('Could not copy'); } };
  $('#mSend').onclick = () => {
    const nums = msgList.filter(r => r.checked && r.phone).map(r => cleanPhone(r.phone));
    if (!nums.length) { toast('Pick at least one person'); return; }
    logMsg(msgJob, 'out', $('#m-text').value, { to: msgList.filter(r => r.checked && r.phone).map(r => r.name) }); if (view === 'job') render();
    location.href = `sms:${nums.join(',')}${/iPhone|iPad|Mac/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent($('#m-text').value)}`;
  };

  // ---- composer ----
  function autoGrow() { const t = $('#chatIn'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; updateMain(); layoutComposer(); }
  $('#chatIn').addEventListener('input', autoGrow);
  $('#chatIn').addEventListener('focus', () => { $('#apanel').hidden = true; setTimeout(() => { layoutComposer(); window.scrollTo(0, document.body.scrollHeight); }, 300); });
  $('#chatIn').addEventListener('blur', () => setTimeout(layoutComposer, 100));
  $('#chatSend').onclick = sendChat;
  $('#chatPlus').onclick = () => { const p = $('#apanel'); p.hidden = !p.hidden; if (!p.hidden) $('#chatIn').blur(); layoutComposer(); window.scrollTo(0, document.body.scrollHeight); };
  $('#cCam').onclick = () => doAction('cam');
  $('#fCam').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  $('#fVid').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  $('#fLib').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  $('#fDoc').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  $('#tray').onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; const p = pending.splice(+b.dataset.i, 1)[0]; if (p && p.preview) URL.revokeObjectURL(p.preview); paintTray(); };
  $('#vClose').onclick = () => { $('#viewer').hidden = true; $('#vBody').innerHTML = ''; };
  $('#vShare').onclick = () => shareFile($('#viewer').dataset.mid, $('#viewer').dataset.name);
  $('#cQuick').onclick = () => doAction('quick');
  $('#cBack').onclick = () => { view = 'projects'; tabHist = []; render(); window.scrollTo(0, 0); };
  $('#cTitle').onclick = () => goTab('info');
  $('#cTasks').onclick = () => goTab('tasks');
  $('#cCall').onclick = () => callPeople(curJob);
  function doAction(a) {
    $('#apanel').hidden = true; layoutComposer();
    const j = jobs[curJob] || {}, ad = j.addr ? ' (' + j.addr + ')' : '';
    if (a === 'cam') $('#fCam').click();
    else if (a === 'vid') $('#fVid').click();
    else if (a === 'lib') $('#fLib').click();
    else if (a === 'doc') $('#fDoc').click();
    else if (a === 'quick') openMsg(curJob);
    else if (a === 'photos') { $('#chatIn').value = TEMPLATES[0][1](curJob, ad); autoGrow(); $('#chatIn').focus(); }
    else if (a === 'loc') {
      if (!j.addr) { toast('Add the job address in Details first'); return; }
      $('#chatIn').value = ($('#chatIn').value ? $('#chatIn').value + '\n' : '') + 'Job location: https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(j.addr); autoGrow(); $('#chatIn').focus();
    } else if (a === 'summary') { $('#chatIn').value = jobSummary(curJob); autoGrow(); $('#chatIn').focus(); }
    else if (a === 'reply') {
      const people = [...getSubs(j), ...team];
      $('#inWho').innerHTML = people.map(x => `<option>${esc(x.name)}</option>`).join('') + '<option>Customer</option><option>Other</option>';
      $('#inText').value = ''; $('#inBg').classList.add('open'); setTimeout(() => $('#inText').focus(), 60);
    } else if (a === 'note') {
      const text = $('#chatIn').value.trim(); if (!text) { toast('Type the note first, then tap Note'); return; }
      logMsg(curJob, 'note', text); $('#chatIn').value = ''; autoGrow(); render();
    } else if (a === 'via') {
      sendVia = sendVia === 'wa' ? 'sms' : 'wa'; try { localStorage.setItem('oaf-via-v1', sendVia); } catch {}
      paintChatHead(); toast(sendVia === 'wa' ? 'Sending via WhatsApp. Pick the group when it opens.' : 'Sending via Messages to the people you choose.');
    } else if (a === 'team') { teamFromMsg = false; openTeam(); }
  }
  $('#apanel').onclick = e => { const b = e.target.closest('[data-a]'); if (b) doAction(b.dataset.a); };
  $('#inCancel').onclick = () => $('#inBg').classList.remove('open');
  $('#inBg').onclick = e => { if (e.target.id === 'inBg') $('#inBg').classList.remove('open'); };
  $('#inSave').onclick = () => {
    const text = $('#inText').value.trim(); if (!text) { $('#inText').focus(); return; }
    const parsed = parseWhatsApp(text);
    if (parsed.length) {
      parsed.slice(0, 300).forEach(m => logMsg(curJob, OWNER && m.who.toLowerCase().includes(OWNER.toLowerCase()) ? 'out' : 'in', m.text, { who: m.who, at: m.at, via: 'wa' }));
      toast(`Added ${parsed.length} ${parsed.length === 1 ? 'message' : 'messages'} from WhatsApp`);
    } else logMsg(curJob, 'in', text, { who: $('#inWho').value });
    $('#inBg').classList.remove('open'); render();
  };
  // WhatsApp-like gestures on bubbles: double-tap = heart, long-press = delete
  const bubOf = e => e.target.closest && !e.target.closest('.mvid') && e.target.closest('.bub');
  function pressStart(e) { const b = bubOf(e); if (!b) return; pressed = false; clearTimeout(pressTimer); pressTimer = setTimeout(() => { pressed = true; msgMenu(b.dataset.id, b.dataset.k); }, 550); }
  const pressEnd = () => clearTimeout(pressTimer);
  $('#main').addEventListener('input', e => {
    if (e.target.id !== 'sq') return; const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('.bub').forEach(b => { b.style.display = !q || b.textContent.toLowerCase().includes(q) ? '' : 'none'; });
  });
  $('#main').addEventListener('touchstart', pressStart, { passive: true });
  $('#main').addEventListener('mousedown', pressStart);
  ['touchend', 'touchmove', 'touchcancel', 'mouseup', 'mouseleave'].forEach(ev => $('#main').addEventListener(ev, pressEnd, { passive: true }));
  $('#main').addEventListener('click', e => {
    const m = e.target.closest('.mimg,.mfile,.mfile2,.mthumb');
    if (m) { openViewer(m.dataset.mid, m.dataset.name || m.alt || '', m.classList.contains('mimg') || m.dataset.k === 'image' ? 'image' : /\.(mp4|mov|m4v)$/i.test(m.dataset.name || '') ? 'video' : 'file'); return; }
    if (e.target.closest('.mvid')) return;
    const b = bubOf(e); if (!b) return;
    if (pressed) { pressed = false; return; }
    const now = Date.now();
    if (lastTap.id === b.dataset.id && now - lastTap.t < 350) {
      const m = findMsg(b.dataset.id, b.dataset.k); if (m) { m.heart = !m.heart; saveJobs(); render(); }
      lastTap = { id: '', t: 0 };
    } else lastTap = { id: b.dataset.id, t: now };
  });

  // ---- sample jobs (for trying the app) + feedback ----
  function loadDemo() {
    const ago = h => new Date(Date.now() - h * 3600000).toISOString(), d = n => addDays(n);
    const T = (id, title, project, due, extra = {}) => ({ id: 'demo-' + id, title, project, due, done: false, cat: '', star: false, notes: '', demo: true, ...extra });
    const A = 'Martinez kitchen (Sample)', B = 'Lee bathroom (Sample)', C = 'Cohen ADU (Sample)';
    const t = [
      T('a1', 'Find upsell opportunities with Martinez', A, d(0), { star: true, cat: 'visit', ord: 4 }),
      T('a2', 'Take photos of the site before work starts', A, d(-6), { done: true, doneOn: d(-6), doneAt: ago(150), cat: 'visit', ord: 1, time: '08:00' }),
      T('a3', 'Sign Martinez on DocuSign with the finance company', A, d(-6), { done: true, doneOn: d(-6), doneAt: ago(149), cat: 'money', ord: 2, time: '08:00' }),
      T('a4', 'Confirm Carlos started, ask for photos', A, d(-5), { cat: 'call', ord: 5 }),
      T('a5', 'Order backsplash tile', A, d(2), { cat: 'order' }),
      T('b1', 'Check permit status', B, d(1), { cat: 'permit' }),
      T('b2', 'Send final invoice', B, d(3), { cat: 'money', star: true }),
      T('c1', 'Pick up coffee + donuts, meet Tony at the site', C, d(1), { cat: 'visit', ord: 0, time: '08:00' }),
      T('c2', 'Find upsell opportunities with Cohen', C, d(1), { cat: 'visit', ord: 4, star: true, time: '08:00' }),
    ];
    const jb = {
      [A]: { demo: true, addr: '123 Main St, Palm Springs, CA', upsell: 30000, last: d(-6), kind: 'visit', every: 5, kick: d(-6),
        subs: [{ name: 'Carlos', trade: 'Plumber', phone: '760 555 0101' }, { name: 'Mike', trade: 'Electrician', phone: '760 555 0102' }],
        chat: [{ id: 'demo-m1', at: ago(50), kind: 'out', text: 'Hi team, it\'s ' + OWNER + '. Can you send photos of the current work at Martinez kitchen? Thanks!', to: ['Carlos', 'Mike'] },
               { id: 'demo-m2', at: ago(48), kind: 'in', who: 'Carlos', text: 'Rough-in is done. Sending photos in a bit. Tile arrives Thursday.', star: true },
               { id: 'demo-m3', at: ago(47), kind: 'in', who: 'Mike', text: 'Panel upgrade is scheduled for Friday. Customer asked about adding under-cabinet lighting.' },
               { id: 'demo-m4', at: ago(3), kind: 'out', text: 'Great. Martinez wants a backsplash too. Let\'s price it.' }],
        notes: [{ id: 'demo-n1', at: ago(30), text: 'Customer mentioned she may want new flooring in the hallway.' }] },
      [B]: { demo: true, addr: '45 Oak Ave, Barstow, CA', upsell: 12000, last: d(-2), kind: 'photos', every: 5, kick: d(-8),
        subs: [{ name: 'Dave', trade: 'Tile', phone: '760 555 0103' }],
        chat: [{ id: 'demo-m5', at: ago(20), kind: 'in', who: 'Dave', text: 'Shower pan is in. Waiting on the inspector.' }] },
      [C]: { demo: true, addr: '900 Sunset Blvd, San Bernardino, CA', upsell: 45000, kick: d(1), every: 5,
        subs: [{ name: 'Tony', trade: 'General', phone: '909 555 0104' }], chat: [] },
    };
    tasks = [...tasks.filter(x => !x.demo), ...t]; Object.assign(jobs, jb);
    save(); saveJobs(); view = 'today'; filter = 'all'; render(); window.scrollTo(0, 0);
    toast('Sample jobs added. Tap Projects to explore.');
  }
  function clearDemo() {
    tasks = tasks.filter(x => !x.demo); Object.keys(jobs).forEach(k => { if (jobs[k] && jobs[k].demo) delete jobs[k]; });
    save(); saveJobs(); render(); toast('Sample jobs removed');
  }
  function openFeedback() { $('#fbText').value = ''; $('#fbBg').classList.add('open'); setTimeout(() => $('#fbText').focus(), 80); }
  const fbBody = () => `Feedback on the app (version ${APP_VERSION})${$('#fbWho').value.trim() ? ' from ' + $('#fbWho').value.trim() : ''}:\n\n${$('#fbText').value.trim()}`;
  $('#fbCancel').onclick = () => $('#fbBg').classList.remove('open');
  $('#fbBg').onclick = e => { if (e.target.id === 'fbBg') $('#fbBg').classList.remove('open'); };
  $('#fbCopy').onclick = async () => { try { await navigator.clipboard.writeText(fbBody()); toast('Copied'); } catch { toast('Could not copy'); } };
  $('#fbSend').onclick = () => {
    if (!$('#fbText').value.trim()) { $('#fbText').focus(); return; }
    if (navigator.share) navigator.share({ title: 'App feedback', text: fbBody() }).catch(() => {});
    else location.href = 'mailto:?subject=' + encodeURIComponent('App feedback') + '&body=' + encodeURIComponent(fbBody());
  };

  // ---- new job sold: creates the whole first-48-hours playbook ----
  function setKick(v) {
    $('#j-kick').value = v || '';
    document.querySelectorAll('#kickChips .chip').forEach(c => c.classList.toggle('on', !!v && addDays(+c.dataset.d) === v));
  }
  function openJob() {
    ['#j-name', '#j-sub', '#j-phone', '#j-addr', '#j-upsell'].forEach(i => { $(i).value = ''; $(i).classList.remove('err'); });
    setKick(addDays(1)); $('#j-time').value = '08:00';
    $('#jobBg').classList.add('open'); setTimeout(() => $('#j-addr').focus(), 60);
  }
  const closeJob = () => $('#jobBg').classList.remove('open');
  function saveJob() {
    const name = $('#j-name').value.trim(), addrIn = $('#j-addr').value.trim();
    ['#j-addr', '#j-name'].forEach(i => $(i).classList.remove('err'));
    if (!addrIn) { $('#j-addr').classList.add('err'); $('#j-addr').focus(); toast('Enter the job address'); return; }
    if (!name) { $('#j-name').classList.add('err'); $('#j-name').focus(); toast('Enter the customer name'); return; }
    const kick = $('#j-kick').value || addDays(1), time = $('#j-time').value || '08:00';
    const sub = $('#j-sub').value.trim(), amt = parseInt($('#j-upsell').value.replace(/[^0-9]/g, ''), 10) || 0;
    const newSubs = sub ? [{ name: sub, phone: $('#j-phone').value.trim() }] : [];
    const subs = newSubs.length ? newSubs : getSubs(jobs[name]);
    const subTxt = subs.length ? subs.map(x => x.name).join(' & ') : 'the sub';
    const plan = [
      [0, 'Pick up coffee + donuts, meet ' + subTxt + ' at the site', 'visit', false, true],
      [0, 'Take photos of the site before work starts', 'visit', false, true],
      [0, 'Sign ' + name + ' on DocuSign with the finance company', 'money', false, true],
      [0, 'Walk ' + subTxt + ' through what needs to be done', 'visit', false, true],
      [0, 'Find upsell opportunities with ' + name, 'visit', true, true],
      [1, 'Confirm ' + subTxt + ' started, ask for photos', 'call', false, false],
      [3, 'Upsell follow-up call with ' + name, 'call', true, false],
      [7, 'Progress check before work gets covered up', 'visit', false, false],
    ];
    plan.forEach(([off, title, cat, star, timed], i) => tasks.push({
      id: uid(), done: false, title, project: name, due: addDays(off, kick), cat, star, notes: '', ord: i, ...(timed ? { time } : {}),
    }));
    jobs[name] = { ...(jobs[name] || {}), upsell: amt, subs, sub: undefined, phone: undefined, addr: $('#j-addr').value.trim(), kick, every: jobs[name]?.every || 5 };
    saveJobs(); save();
    closeJob(); view = 'today'; filter = 'all'; render(); window.scrollTo(0, 0);
    toast(`${plan.length} tasks created for ${name}`);
  }
  // ---- edit job details ----
  let editName = '', editEvery = 5;
  function paintEvery() { document.querySelectorAll('#everyChips .chip').forEach(c => c.classList.toggle('on', +c.dataset.e === editEvery)); }
  function openEdit(n) {
    const j = jobs[n] || {}; editName = n; editEvery = j.every || 5;
    $('#eTitle').textContent = n;
    $('#e-addr').value = j.addr || ''; $('#e-wa').value = j.wa || ''; $('#e-upsell').value = j.upsell || '';
    $('#subRows').innerHTML = ''; const cur = getSubs(j); (cur.length ? cur : [{}]).forEach(addSubRow);
    paintEvery(); $('#editBg').classList.add('open');
  }
  function addSubRow(x = {}) {
    const d = document.createElement('div'); d.className = 'subrow';
    d.innerHTML = `<input class="s-name" placeholder="Sub name" autocomplete="off" value="${esc(x.name || '')}">
      <input class="s-trade" placeholder="Trade (plumber...)" autocomplete="off" value="${esc(x.trade || '')}">
      <input class="s-phone" type="tel" inputmode="tel" placeholder="Phone" value="${esc(x.phone || '')}">
      <button type="button" class="s-del" aria-label="Remove sub">×</button>`;
    $('#subRows').appendChild(d);
  }
  $('#addSub').onclick = () => addSubRow();
  $('#subRows').onclick = e => { if (e.target.classList.contains('s-del')) e.target.closest('.subrow').remove(); };
  const closeEdit = () => $('#editBg').classList.remove('open');
  $('#eCancel').onclick = closeEdit;
  $('#pCancel').onclick = () => $('#pickBg').classList.remove('open');
  $('#pickBg').onclick = e => { if (e.target.id === 'pickBg') $('#pickBg').classList.remove('open'); };
  $('#editBg').onclick = e => { if (e.target.id === 'editBg') closeEdit(); };
  $('#everyChips').onclick = e => { const c = e.target.closest('.chip'); if (c) { editEvery = +c.dataset.e; paintEvery(); } };
  $('#eSave').onclick = () => {
    jobs[editName] = { ...(jobs[editName] || {}), addr: $('#e-addr').value.trim(), wa: $('#e-wa').value.trim(), sub: undefined, phone: undefined,
      subs: [...document.querySelectorAll('#subRows .subrow')].map(r => ({ name: r.querySelector('.s-name').value.trim(), trade: r.querySelector('.s-trade').value.trim(), phone: r.querySelector('.s-phone').value.trim() })).filter(x => x.name),
      upsell: parseInt($('#e-upsell').value.replace(/[^0-9]/g, ''), 10) || 0, every: editEvery };
    saveJobs(); closeEdit(); render();
  };

  $('#newJobBtn').onclick = openJob;
  $('#jCancel').onclick = closeJob;
  $('#jSave').onclick = saveJob;
  $('#jobBg').onclick = e => { if (e.target.id === 'jobBg') closeJob(); };
  $('#kickChips').onclick = e => { const c = e.target.closest('.chip'); if (c) setKick(addDays(+c.dataset.d)); };
  $('#j-kick').onchange = e => setKick(e.target.value);

  // ---- events ----
  $('#fab').onclick = () => openSheet(null, view === 'job' ? curJob : '');
  $('#back').onclick = () => { view = view === 'evening' ? 'today' : 'projects'; render(); window.scrollTo(0, 0); };
  $('#cancelBtn').onclick = closeSheet;
  $('#saveBtn').onclick = saveSheet;
  $('#bg').onclick = e => { if (e.target.id === 'bg') closeSheet(); };
  $('#f-title').addEventListener('keydown', e => { if (e.key === 'Enter') saveSheet(); });
  $('#delBtn').onclick = () => {
    if (editingId && confirm('Delete this task?')) { tasks = tasks.filter(x => x.id !== editingId); save(); closeSheet(); render(); }
  };
  $('#dueChips').onclick = e => { const c = e.target.closest('.chip'); if (c) setDue(addDays(+c.dataset.d)); };
  $('#f-due').onchange = e => setDue(e.target.value);
  $('#catChips').onclick = e => { const c = e.target.closest('[data-cat]'); if (c) { formCat = formCat === c.dataset.cat ? '' : c.dataset.cat; paintCats(); } };
  $('#starChip').onclick = () => { formStar = !formStar; paintCats(); };

  document.querySelector('nav').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    view = b.dataset.view; filter = 'all'; render(); window.scrollTo(0, 0);
  };
  $('#stats').onclick = e => {
    const b = e.target.closest('[data-filter]'); if (!b) return;
    filter = filter === b.dataset.filter ? 'all' : b.dataset.filter; render();
  };

  $('#main').onclick = e => {
    const rem = e.target.closest('[data-rem]');
    if (rem) { remTime = rem.dataset.rem; try { localStorage.setItem(REM_KEY, remTime); } catch {} return render(); }
    const go = e.target.closest('[data-go]');
    if (go) { view = go.dataset.go; filter = 'all'; render(); window.scrollTo(0, 0); return; }
    const el = e.target.closest('[data-act]');
    const vc = el && el.closest('.vcard');
    if (vc) {
      const n = vc.dataset.p, j = jobs[n] = jobs[n] || {}, act = el.dataset.act;
      if (act === 'visited' || act === 'photosin') {
        const prev = { last: j.last, kind: j.kind };
        j.last = todayISO(); j.kind = act === 'photosin' ? 'photos' : 'visit'; saveJobs(); render();
        toast(`${act === 'photosin' ? 'Photos' : 'Visit'} logged for ${n}`, () => { j.last = prev.last; j.kind = prev.kind; saveJobs(); render(); });
      } else if (act === 'asksub') {
        const subs = getSubs(j);
        const send = x => location.href = smsHref(x && x.phone, `Hi${x && x.name ? ' ' + x.name : ''}, it's ${OWNER}. Can you send me photos or a quick video of the current work at ${n}${j.addr ? ' (' + j.addr + ')' : ''}? Please include anything about to get covered up. Thanks!`);
        if (subs.length <= 1) send(subs[0]);
        else openPick('Who do you want to text?', subs.map(x => ({ label: '💬 ' + subLabel(x), fn: () => send(x) })));
      } else if (act === 'navto') window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(j.addr), '_blank');
      else if (act === 'editjob') openEdit(n);
      return;
    }
    if (el) {
      const act = el.dataset.act;
      if (act === 'collapse') { const p = el.dataset.p; collapsed.has(p) ? collapsed.delete(p) : collapsed.add(p); return render(); }
      if (act === 'addto') return openSheet(null, el.dataset.p);
      if (act === 'openjob') { curJob = el.dataset.p; jobTab = 'chat'; tabHist = []; chatSearch = false; view = 'job'; render(); return; }
      if (act === 'demoload') return loadDemo();
      if (act === 'feedback') return openFeedback();
      if (act === 'jtab') return goTab(el.dataset.tab);
      if (act === 'back') return backTab();
      if (act === 'callall') return callPeople(curJob);
      if (act === 'addmember') return addMemberMenu(curJob);
      if (act === 'member') { if (e.target.closest('.mcall')) return; return memberMenu(curJob, +el.dataset.i); }
      if (act === 'mtab') { mediaTab = el.dataset.t; return render(); }
      if (act === 'openlink') return void window.open(el.dataset.u, '_blank');
      if (act === 'openwa') { const w = (jobs[curJob] || {}).wa; if (w) location.href = w; return; }
      if (act === 'togvia') { sendVia = sendVia === 'wa' ? 'sms' : 'wa'; try { localStorage.setItem('oaf-via-v1', sendVia); } catch {} render(); return toast(sendVia === 'wa' ? 'Sending via WhatsApp' : 'Sending via Messages'); }
      if (act === 'search') { tabHist = []; jobTab = 'chat'; chatSearch = true; render(); window.scrollTo(0, 0); setTimeout(() => $('#sq').focus(), 80); return; }
      if (act === 'searchx') { chatSearch = false; render(); return; }
      if (act === 'jump') { pendingJump = el.dataset.id; tabHist = []; jobTab = 'chat'; render(); return; }
      if (act === 'navjob') return void window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((jobs[curJob] || {}).addr || ''), '_blank');
      if (act === 'addto') return openSheet(null, el.dataset.p);
      if (act === 'openjob') { curJob = el.dataset.p; jobTab = 'chat'; view = 'job'; render(); return; }
      if (act === 'jtab') { jobTab = el.dataset.tab; render(); if (jobTab !== 'chat') window.scrollTo(0, 0); return; }
      if (act === 'navjob') return void window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((jobs[curJob] || {}).addr || ''), '_blank');
      if (act === 'delmsg') {
        if (!confirm('Delete this message?')) return;
        const j = jobs[curJob] || {};
        if (el.dataset.k === 'note') j.notes = (j.notes || []).filter(x => x.id !== el.dataset.id); else j.chat = (j.chat || []).filter(x => x.id !== el.dataset.id);
        saveJobs(); return render();
      }
      if (act === 'editjobd') return openEdit(curJob);
      if (act === 'msgteam') return openMsg(curJob);
      if (act === 'summary') return showText('Summary', jobSummary(curJob));
      if (act === 'evcopy') return showText('Evening review', eveningSummary());
      if (act === 'setrem') return downloadReminder(remTime);
      if (act === 'addnote') {
        const txt = ($('#noteIn').value || '').trim(); if (!txt) { $('#noteIn').focus(); return; }
        const j = jobs[curJob] = jobs[curJob] || {};
        j.notes = [{ id: uid(), at: new Date().toISOString(), text: txt }, ...(j.notes || [])]; saveJobs(); return render();
      }
      if (act === 'delnote') {
        const j = jobs[curJob] || {}, gone = (j.notes || []).find(x => x.id === el.dataset.id); if (!gone) return;
        j.notes = j.notes.filter(x => x.id !== gone.id); saveJobs(); render();
        return toast('Note deleted', () => { j.notes = [gone, ...(j.notes || [])].sort((a, b) => b.at.localeCompare(a.at)); saveJobs(); render(); });
      }
      if (act === 'upsell') {
        const n = el.dataset.p; if (!n) return;
        const v = prompt(`Upsell potential for ${n} (in dollars, e.g. 30000):`, jobs[n]?.upsell || '');
        if (v === null) return;
        const amt = parseInt(String(v).replace(/[^0-9]/g, ''), 10) || 0;
        jobs[n] = { ...(jobs[n] || {}), upsell: amt }; saveJobs(); return render();
      }
      const t = tasks.find(x => x.id === el.closest('.task').dataset.id); if (!t) return;
      if (act === 'toggle') {
        t.done = !t.done; t.doneOn = t.done ? todayISO() : null; t.doneAt = t.done ? new Date().toISOString() : null; save(); render();
        if (t.done) toast('Marked done', () => { t.done = false; t.doneOn = null; save(); render(); });
      } else if (act === 'star') { t.star = !t.star; save(); render(); }
      else if (act === 'snooze') {
        const prev = t.due, base = !t.due || t.due < todayISO() ? todayISO() : t.due;
        t.due = addDays(1, base); save(); render();
        toast(`Moved to ${fmtDate(t.due)}`, () => { t.due = prev; save(); render(); });
      } else if (act === 'edit') openSheet(t.id);
      return;
    }
    const id = e.target.id;
    if (id === 'exportBtn') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ tasks, jobs, team }, null, 2)], { type: 'application/json' }));
      a.download = `tasks-backup-${todayISO()}.json`; a.click();
    } else if (id === 'importBtn') $('#importFile').click();
    else if (id === 'teamBtn') openTeam();
    else if (id === 'demoBtn') { Object.values(jobs).some(j => j && j.demo) ? clearDemo() : loadDemo(); }
    else if (id === 'fbBtn') openFeedback();
    else if (id === 'updateBtn') {
      toast('Updating...');
      const done = () => location.reload();
      const regs = navigator.serviceWorker ? navigator.serviceWorker.getRegistrations() : Promise.resolve([]);
      regs.then(rs => Promise.all(rs.map(r => r.unregister()))).then(() => window.caches ? caches.keys() : []).then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(done, done);
    }
    else if (id === 'clearDone' && confirm('Remove all completed tasks?')) { tasks = tasks.filter(t => !t.done); save(); render(); }
  };
  $('#main').addEventListener('change', e => {
    if (e.target.id !== 'importFile') return;
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => {
      try {
        const raw = JSON.parse(txt), d = Array.isArray(raw) ? raw : raw.tasks;
        if (!Array.isArray(d)) throw 0;
        if (confirm(`Replace current tasks with ${d.length} from the backup?`)) {
          tasks = d; save();
          if (!Array.isArray(raw) && raw.jobs) { jobs = raw.jobs; saveJobs(); }
          if (!Array.isArray(raw) && raw.team) { team = raw.team; saveTeam(); }
          render();
        }
      } catch { alert('That file is not a valid backup.'); }
    });
  });
  $('#toast').onclick = e => { if (e.target.id === 'undoBtn' && lastUndo) { lastUndo(); lastUndo = null; $('#toast').classList.remove('show'); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  $('#sumClose').onclick = () => $('#sumBg').classList.remove('open');
  $('#sumBg').onclick = e => { if (e.target.id === 'sumBg') $('#sumBg').classList.remove('open'); };
  $('#sumCopy').onclick = async () => {
    const t = $('#sumText').textContent;
    try { await navigator.clipboard.writeText(t); toast('Copied'); } catch { const r = document.createRange(); r.selectNodeContents($('#sumText')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Text selected - tap Copy'); }
  };
  $('#sumShare').onclick = () => { const t = $('#sumText').textContent; if (navigator.share) navigator.share({ text: t }).catch(() => {}); else $('#sumCopy').click(); };
  if (location.hash === '#evening') view = 'evening';
  render();
  window.__oafV = APP_VERSION; window.__oafReady = true;
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const hadController = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; window.__oafNotify && window.__oafNotify('A new version is ready. Tap Reload to update.'); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  }
})();
