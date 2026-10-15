(() => {
  const APP_VERSION = '76';
  const KEY = 'oaf-tasks-v1';           // same key as the live app, so your tasks carry over
  let OWNER = '';
  try { OWNER = localStorage.getItem('oaf-name-v1') || ''; } catch {}
  const CATS = [
    { id: 'call', label: 'Call', icon: '📞' },
    { id: 'visit', label: 'Site visit', icon: '🚗' },
    { id: 'money', label: 'Invoice / $', icon: '💵' },
    { id: 'permit', label: 'Permit', icon: '📋' },
    { id: 'order', label: 'Order', icon: '📦' },
    { id: 'coffee', label: 'Coffee', icon: '☕' },
    { id: 'meet', label: 'Meet', icon: '🤝' },
    { id: 'video', label: 'Video', icon: '🎥' },
    { id: 'photo', label: 'Photos', icon: '📸' },
    { id: 'sign', label: 'Sign', icon: '✍️' },
    { id: 'upsell', label: 'Upsell', icon: '🔎' },
    { id: 'contact', label: 'Contact', icon: '📱' },
  ];
  const catOf = id => CATS.find(c => c.id === id);

  let asRep = '', swapping = false;
  let tasks = [], view = 'today', filter = 'all', editingId = null, curJob = '', jobTab = 'chat';
  let formCat = '', formStar = false, lastUndo = null, toastTimer = null;
  const collapsed = new Set();
  const NOOP = new Proxy(function () {}, {
    get: (t, k) => k === 'classList' ? { add() {}, remove() {}, toggle() {}, contains() { return false; } } : k === 'style' ? {} : k === 'dataset' ? {} : k === 'value' ? '' : k === 'hidden' ? true : NOOP,
    set: () => true, apply: () => NOOP,
  });
  const $ = s => document.querySelector(s) || NOOP;   // a missing element can never stop the app from starting

  try { tasks = JSON.parse(localStorage.getItem(KEY)) || []; } catch { tasks = []; }
  if (!OWNER && tasks.length) OWNER = 'Oren';   // existing installs keep the original name
  const changed = () => { try { window.OAF && window.OAF.onChange && window.OAF.onChange(); } catch {} };
  const save = () => { if (swapping) return; try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch {} changed(); };
  const FIN_DEFAULT = ['Homerun', 'Aqua', 'Renew', 'Figure', 'HFS', 'Acorn', 'Jason', 'Limor', 'Cash'];
  const FIN_STATUS = ['Not started', 'Applied', 'Approved', 'Docs signed', 'Funded', 'Declined'];
  const JSTAGES = ['PRE NTP', 'POST NTP', 'IN PROGRESS', 'PRE UPSELL', 'POST UPSELL', 'BEFORE COMPLETION', 'COMPLETED', 'MONEY RECEIVED'];
  const SCOL = ['#64748b', '#2563eb', '#f97316', '#9333ea', '#6366f1', '#d97706', '#16a34a', '#0f766e'];
  // a job can be in several stages at once (j.stages); j.stage is kept as the most advanced one
  const getStages = j => (j && j.stages) ? j.stages.filter(x => JSTAGES.includes(x)) : (j && j.stage && JSTAGES.includes(j.stage) ? [j.stage] : []);
  const stageIdx = j => { const g = getStages(j); return g.length ? Math.max(...g.map(x => JSTAGES.indexOf(x))) : -1; };
  let stageF = 'all';
  const BOTS = [{ name: 'Job Assistant', role: 'AI bot · coming soon' }];
  let cfg = { pct: 10, split: 50, override: 1, leadFirst: 15, leadUp: 6, goal: 500000, finance: FIN_DEFAULT.slice() };
  try { cfg = { ...cfg, ...(JSON.parse(localStorage.getItem('oaf-cfg-v1')) || {}) }; } catch {}
  const finList = () => (cfg.finance && cfg.finance.length ? cfg.finance : FIN_DEFAULT);
  const finOptions = sel => ['<option value="">Not set</option>', ...[...new Set([...finList(), ...(sel && !finList().includes(sel) ? [sel] : [])])].map(f => `<option ${f === sel ? 'selected' : ''}>${esc(f)}</option>`)].join('');
  const finStatusOptions = sel => ['<option value="">No status</option>', ...FIN_STATUS.map(f => `<option ${f === sel ? 'selected' : ''}>${esc(f)}</option>`)].join('');
  // a job can use several finance companies, each with an amount used and a max approval
  const getFins = j => (j && j.fins) ? j.fins : (j && j.finance ? [{ id: 'legacy', company: j.finance, status: j.finStatus || '', amount: 0, approved: 0 }] : []);
  function finSummary(j) {
    j = j || {}; const fins = getFins(j), fin2 = fins.filter(f => f.company !== 'Cash');
    const approved = fin2.reduce((a, f) => a + (f.approved || 0), 0), amounts = fins.reduce((a, f) => a + (f.amount || 0), 0);
    const ups = j.upsells || [], wonUp = ups.reduce((a, u) => a + (u.amount || 0), 0), offered = 0;
    const used = approved ? Math.max(amounts, (j.contract || 0) + wonUp) : amounts, room = approved ? Math.max(0, approved - used) : 0;
    return { fins, approved, amounts, used, room, offered, wonUp, toPitch: Math.max(0, room - offered) };
  }
  const finTag = j => { const f = getFins(j); if (!f.length) return ''; const sm = finSummary(j); return f.map(x => x.company).join(' + ') + (f.length === 1 && f[0].status ? ' · ' + f[0].status : '') + (sm.room ? ' · ' + money(sm.room) + ' room' : ''); };
  const saveCfg = () => { try { localStorage.setItem('oaf-cfg-v1', JSON.stringify(cfg)); } catch {} changed(); };
  let leads = [], reports = [], moneyPer = 'month';
  try { leads = JSON.parse(localStorage.getItem('oaf-leads-v1')) || []; } catch {}
  try { reports = JSON.parse(localStorage.getItem('oaf-reports-v1')) || []; } catch {}
  let subsDir = [];
  try { subsDir = JSON.parse(localStorage.getItem('oaf-subsdir-v1')) || []; } catch {}
  const saveSubsDir = () => { try { localStorage.setItem('oaf-subsdir-v1', JSON.stringify(subsDir)); } catch {} changed(); };
  const saveLeads = () => { if (swapping) return; try { localStorage.setItem('oaf-leads-v1', JSON.stringify(leads)); } catch {} changed(); };
  const saveReports = () => { try { localStorage.setItem('oaf-reports-v1', JSON.stringify(reports)); } catch {} changed(); };
  const JOBS_KEY = 'oaf-jobs-v1';        // per-project info: upsell potential, sub
  let jobs = {};
  try { jobs = JSON.parse(localStorage.getItem(JOBS_KEY)) || {}; } catch { jobs = {}; }
  const saveJobs = () => { if (swapping) return; try { localStorage.setItem(JOBS_KEY, JSON.stringify(jobs)); } catch {} changed(); };
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
  // every job counts as active until you mark it complete (jobs with no tasks yet, like ones you import, are included)
  const isArchived = n => !!(jobs[n] && jobs[n].archived);
  const activeProjects = () => [...new Set([...Object.keys(jobs).filter(k => jobs[k] && !jobs[k].archived), ...tasks.filter(t => !t.done && t.project).map(t => t.project)])].filter(n => !isArchived(n));
  let showDoneJobs = false;
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
    { const sg = getStages(j); if (sg.length) L.push('Stage: ' + sg.join(' + ')); }
    if (j.upsell) L.push('Upsell potential: ' + money(j.upsell));
    { const sm = finSummary(j); sm.fins.forEach(f => L.push('Financing: ' + f.company + (f.status ? ' · ' + f.status : '') + (f.amount ? ' · ' + money0(f.amount) : '') + (f.approved ? ' of ' + money0(f.approved) + ' approved' : ''))); if (sm.room) L.push('Room to upsell: ' + money0(sm.room) + (sm.offered ? ' (' + money0(sm.offered) + ' offered)' : '')); }
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
    const all = [...membersOf(n), ...getSubs(j)].filter(x => hasPhone(x.phone));
    return j.group ? [...team, ...getSubs(j)].filter(x => hasPhone(x.phone) && j.group.includes(cleanPhone(x.phone))) : membersOf(n).filter(x => hasPhone(x.phone));
  }
  function logMsg(n, kind, text, extra = {}) {
    const j = jobs[n] = jobs[n] || {};
    j.chat = [...(j.chat || []), { id: uid(), at: new Date().toISOString(), kind, text, uid: window.OAF_ME || undefined, by: OWNER || undefined, ...extra }]; saveJobs();
  }
  function timeline(n) {
    const j = jobs[n] || {}, items = [];
    (j.notes || []).forEach(x => items.push({ id: x.id, ts: new Date(x.at).getTime(), kind: 'note', text: x.text, star: x.star, heart: x.heart }));
    (j.chat || []).forEach(x => { const other = x.kind === 'out' && x.uid && window.OAF_ME && x.uid !== window.OAF_ME; items.push({ ...x, ts: new Date(x.at).getTime(), ...(other ? { kind: 'in', who: x.by || 'Teammate' } : {}) }); });
    tasks.filter(t => t.done && t.project === n && t.doneOn).forEach(t => items.push({ id: 'd' + t.id, ts: new Date(t.doneAt || t.doneOn + 'T12:00:00').getTime(), kind: 'sys', text: '✓ Done: ' + t.title }));
    (j.stageLog || []).forEach((x, i) => items.push({ id: 'st' + i, ts: new Date(x.at).getTime(), kind: 'sys', text: x.on === false ? '📍 Stage removed: ' + x.stage : x.on === true ? '📍 Stage added: ' + x.stage : '📍 Stage: ' + x.stage }));
    if (j.last) items.push({ id: 'v', ts: new Date(j.last + 'T12:00:00').getTime(), kind: 'sys', text: j.kind === 'photos' ? '📷 Photos received from sub' : '🚗 Site visit logged' });
    return items.sort((a, b) => a.ts - b.ts);
  }
  // ---- photos / videos / documents: stored on this phone in IndexedDB ----
  let dbp = null; const memBlobs = {}, urlCache = {};
  const mdb = () => dbp ||= new Promise((res, rej) => { const r = indexedDB.open('oaf-media', 1); r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const idb = (mode, fn) => mdb().then(d => new Promise((res, rej) => { const t = d.transaction('files', mode), r = fn(t.objectStore('files')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }));
  const putFile = rec => idb('readwrite', st => st.put(rec));
  const getFile = id => idb('readonly', st => st.get(id));
  const delFile = id => { window.OAFsync && window.OAFsync.removeMedia && window.OAFsync.removeMedia(id); delete memBlobs[id]; if (urlCache[id]) { URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; } return idb('readwrite', st => st.delete(id)).catch(() => {}); };
  async function blobOf(id, localOnly) {
    let b = memBlobs[id] || ((await getFile(id).catch(() => null)) || {}).blob;
    if (!b && !localOnly && window.OAFsync && window.OAFsync.fetchMedia) {
      b = await window.OAFsync.fetchMedia(id).catch(() => null);
      if (b) { memBlobs[id] = b; putFile({ id, job: '', name: '', mime: b.type, size: b.size, blob: b }).catch(() => {}); }
    }
    return b || null;
  }
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
  // ---- document viewer: PDFs are drawn page by page to fit the screen (iOS cannot scroll PDFs inside a frame) ----
  let pdfjsP = null, pdfObs = null;
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';
  const loadPdfJs = () => pdfjsP ||= new Promise((res, rej) => {
    if (window.pdfjsLib) return res(window.pdfjsLib);
    const sc = document.createElement('script'); sc.src = PDFJS + 'pdf.min.js';
    sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; res(window.pdfjsLib); };
    sc.onerror = () => { pdfjsP = null; rej(new Error('Could not load the PDF viewer. Check your connection.')); }; document.head.appendChild(sc);
  });
  async function renderPdf(blob, host, token) {
    const lib = await loadPdfJs(), pdf = await lib.getDocument({ data: await blob.arrayBuffer() }).promise;
    if (host.dataset.tok !== token) return;
    host.innerHTML = ''; host.className = 'pdf'; const width = Math.max(240, host.clientWidth - 16), dpr = Math.min(2, window.devicePixelRatio || 1);
    $('#vTitle').textContent = $('#viewer').dataset.name + (pdf.numPages > 1 ? ` · ${pdf.numPages} pages` : '');
    if (pdfObs) pdfObs.disconnect();
    pdfObs = new IntersectionObserver(es => es.forEach(en => {
      if (!en.isIntersecting || en.target.dataset.done) return; en.target.dataset.done = '1';
      const c = en.target, n = +c.dataset.n;
      pdf.getPage(n).then(pg => { const vp = pg.getViewport({ scale: (width / pg.getViewport({ scale: 1 }).width) * dpr }); c.width = vp.width; c.height = vp.height; return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; })
        .then(() => c.classList.add('ready')).catch(() => {});
    }), { root: host, rootMargin: '600px 0px' });
    for (let i = 1; i <= pdf.numPages; i++) {
      if (host.dataset.tok !== token) return;
      const pg = await pdf.getPage(i), v = pg.getViewport({ scale: width / pg.getViewport({ scale: 1 }).width }), c = document.createElement('canvas');
      c.dataset.n = i; c.style.width = width + 'px'; c.style.height = Math.round(v.height) + 'px'; c.width = 2; c.height = 2; host.appendChild(c); pdfObs.observe(c);
    }
  }
  const extOf = n => (String(n).split('.').pop() || '').toLowerCase();
  async function openViewer(id, name, kind) {
    const blob = await blobOf(id); if (!blob) { toast('File not found on this phone'); return; }
    const u = await urlOf(id), ext = extOf(name), host = $('#vBody'), token = String(Date.now());
    host.dataset.tok = token; host.className = ''; $('#vTitle').textContent = name || '';
    $('#viewer').dataset.mid = id; $('#viewer').dataset.name = name; $('#viewer').hidden = false;
    if (kind === 'image') host.innerHTML = `<img src="${u}" alt="">`;
    else if (kind === 'video') host.innerHTML = `<video src="${u}" controls playsinline autoplay></video>`;
    else if (ext === 'pdf' || blob.type === 'application/pdf') {
      host.innerHTML = '<div class="vload">Opening…</div>';
      try { await renderPdf(blob, host, token); }
      catch (e) { host.className = ''; host.innerHTML = fileCard(name, blob, `<div class="cerr">${esc(e.message || 'Could not display this PDF here.')}</div>`); }
    } else if (/^(txt|csv|log|md|json)$/.test(ext) || /^text\//.test(blob.type)) {
      host.className = 'txt'; host.innerHTML = '<pre></pre>'; host.firstChild.textContent = (await blob.text()).slice(0, 200000);
    } else host.innerHTML = fileCard(name, blob, '');
  }
  const fileCard = (name, blob, extra) => `<div class="vfile"><div class="vficon">${fileIcon(name)}</div><b>${esc(name)}</b><small>${fmtSize(blob.size)}</small>${extra}
    <button class="vbtn" data-vopen="1">Open</button><div class="vhint">Word, Excel and other office files open in your phone's preview. Use Share / Save to send it to another app.</div></div>`;
  async function openExternal(id, name) {
    const b = await blobOf(id); if (!b) return;
    const typed = new Blob([b], { type: MIMES[extOf(name)] || b.type || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(typed); a.target = '_blank'; a.rel = 'noopener'; a.download = ''; document.body.appendChild(a);
    // iOS shows its own preview for known document types; other browsers download the file
    a.removeAttribute('download'); a.click(); a.remove();
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

  let chatLimit = 300;
  function chatHTML(n) {
    const all = timeline(n), items = all.slice(-chatLimit);
    if (!items.length) return `<div class="chatempty">🔒 Messages, replies, notes and job updates for this job show up here.<br>Already have a WhatsApp group for this job? Tap <b>＋</b> then <b>Import WhatsApp chat</b>.</div>`;
    let last = '', prev = '', out = '<div class="chat">' + (all.length > items.length ? `<button class="older" data-act="older">Show ${Math.min(300, all.length - items.length)} earlier messages</button>` : '');
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
  function nextStep(n) {
    const mine = tasks.filter(t => t.project === n && !t.done);
    const chk = mine.filter(t => t.ord !== undefined).sort((x, y) => x.ord - y.ord);
    return chk[0] || mine.slice().sort((x, y) => (x.due || '9').localeCompare(y.due || '9'))[0] || null;
  }
  function paintTodoBar() {
    const n = curJob, all = tasks.filter(t => t.project === n), gd = all.filter(t => t.ord !== undefined);
    const nx = nextStep(n), open = all.filter(t => !t.done).length;
    const lab = gd.length ? '🏈 Game Day · ' + gd.filter(t => t.done).length + '/' + gd.length : '📝 To-do · ' + open + ' open';
    $('#todoL').textContent = lab;
    $('#todoT').textContent = nx ? 'Next: ' + nx.title : all.length ? '🎉 All done' : 'Add the Game Day plan';
    $('#todoDone').hidden = !nx;
  }
  function paintChatHead() {
    const n = curJob, j = jobs[n] || {};
    $('#cName').textContent = j.addr || n;
    const names = [...new Set(membersOf(n).map(x => x.name))];
    $('#cMembers').textContent = [...names, ...BOTS.map(b => '🤖 ' + b.name), 'You'].join(', ');
    { const g = getStages(j), i = stageIdx(j); $('#cStageTxt').textContent = !g.length ? 'Set the job stage' : g.length <= 2 ? g.join(' + ') : g[0] + ' + ' + (g.length - 1) + ' more'; $('#cStage').style.setProperty('--c', i >= 0 ? SCOL[i] : '#94a3b8');
      $('#cStageSeg').innerHTML = JSTAGES.map((st, k) => `<i class="${g.includes(st) ? 'on' : ''}" style="${g.includes(st) ? '--sc:' + SCOL[k] : ''}"></i>`).join(''); }
    paintTodoBar();
    $('#apVia').lastChild.textContent = sendVia === 'wa' ? 'Sending via WhatsApp' : 'Sending via Messages';
  }
  document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('.sheet .actions button, #exReceipt')) e.preventDefault(); }, true);
  // ---- job money page: one list of sales (first sale + upsells), all the same ----
  let dealJob = '', dealFrom = 'job', dlMode = '', dlId = '', dlReps = [];
  const UP_IDEAS = ['Turf', 'Pavers', 'Patio', 'Lighting', 'Fence', 'Other'];
  function openDeal(n) { dealFrom = view === 'job' ? 'job' : (view === 'deal' ? dealFrom : view); dealJob = n; view = 'deal'; render(); window.scrollTo(0, 0); }
  const teamNames = extra => [...new Set([...team.map(x => x.name).filter(x => x && x !== OWNER), ...(extra || [])])];
  const sgn = v => (v < 0 ? '−' : '') + money0(Math.abs(v));
  function screenDeal() {
    const n = dealJob, j = jobs[n] = jobs[n] || {}, m = jobNet(j), sm = finSummary(j);
    $('#h1').textContent = j.addr || n; $('#sub').textContent = 'Money for this job';
    const cards = m.sales.map(s => `<button class="upcard sale ${s.kind}" data-act="dealsale" data-id="${esc(s.key)}"><div class="uph"><div><b>${esc(s.title)}${s.kind === 'first' ? ' (first sale)' : ''}</b><small>${money0(s.amount)} − lead ${money0(s.lead)} (${+s.leadPct.toFixed(2)}%) − expenses ${money0(s.cost)} = ${sgn(s.profit)} profit</small><small>${s.k > 1 ? 'With ' + esc(s.reps.join(', ')) + ' · each gets ' + +s.pct.toFixed(2) + '%' : 'Just you · ' + +s.pct.toFixed(2) + '%'}</small></div><div class="upyou"><small>You get</small><b>${money0(s.share)}</b></div></div></button>`).join('');
    const repSold = !asRep && j.seller && j.contract ? `<button class="upcard sale first" data-act="dealsale" data-id="first"><div class="uph"><div><b>Prime contract · sold by ${esc(jobReps(j).join(' + '))}</b><small>${money0(j.contract)} · your ${cfg.override}% override${jobReps(j).length > 1 ? ', paid once for the whole file' : ''}</small></div><div class="upyou"><small>You get</small><b>${money0(m.over)}</b></div></div></button>` : '';
    const empty = !j.contract ? `<div class="bigact"><button class="jbtn primary wide" data-act="dealcontract">＋ Add the first sale</button><button class="jbtn wide" data-act="dealpdf">📄 Read it from the contract PDF</button><div class="hint">Or type <b>sold 54686</b> in the job chat.</div></div>` : '';
    const room = sm.approved ? `<div class="hint">💡 Approved up to <b>${money0(sm.approved)}</b>. Room left to upsell: <b>${money0(sm.room)}</b></div>` : '';
    return `<div class="bigcard"><div class="bl">You keep on this job</div><div class="bn">${money0(m.net)}</div><div class="bs">${m.sales.length + (repSold ? 1 : 0)} ${m.sales.length + (repSold ? 1 : 0) === 1 ? 'sale' : 'sales'} added together · profit ${sgn(m.profit)}</div></div>
      <div class="ssec">Sales</div>${repSold}${cards}${empty}${j.contract ? '<button class="jbtn primary wide" data-act="dealup">＋ Add an upsell</button>' : ''}${room}
      <div class="hint">Each sale: amount − lead cost − expenses = profit. Your ${cfg.split}% is divided between the reps on that sale. Tap a sale to change it.</div>`;
  }
  const addDlCost = (c = {}) => { const d = document.createElement('div'); d.className = 'uprow costrow'; d.dataset.id = c.id || ''; d.dataset.date = c.date || '';
    d.innerHTML = `<input class="u-title c-title" placeholder="What (turf, materials…)" value="${esc(c.title || '')}" autocomplete="off"><input class="u-amt c-amt moneyin" inputmode="decimal" placeholder="$" value="${fmtAmt(c.amount)}"><button type="button" class="s-del" aria-label="Remove">×</button>`; $('#dlCosts').appendChild(d); };
  $('#dlAddCost').onclick = () => { addDlCost({}); dlPreview(); const r = $('#dlCosts').lastElementChild; if (r) r.querySelector('.c-title').focus(); };
  $('#dlCosts').onclick = e => { if (e.target.classList.contains('s-del')) { e.target.closest('.uprow').remove(); dlPreview(); } };
  $('#dlCosts').addEventListener('input', () => dlPreview());
  function dlPreview() {
    const v = amt($('#dl-amt').value), lp = $('#dl-lead').value.trim(), lpv = lp === '' ? (dlMode === 'contract' ? leadPctOf(jobs[dealJob] || {}) : cfg.leadUp) : (parseFloat(lp) || 0);
    const cost = [...document.querySelectorAll('#dlCosts .c-amt')].reduce((t, el) => t + amt(el.value), 0), lead = v * lpv / 100, k = 1 + dlReps.length, profit = v - lead - cost, mine = profit * cfg.split / 100 / k;
    $('#dlPrev').innerHTML = $('#dl-seller').value && dlMode === 'contract' ? `<b>Your override: ${money0(v * cfg.override / 100)}</b><br><small>${cfg.override}% of the contract</small>` : (v ? `<b>You get ${money0(mine)}</b><br><small>${money0(v)} − ${money0(lead)} lead cost (${lpv}%) − ${money0(cost)} expenses = ${money0(profit)} profit. ${k > 1 ? 'Each of the ' + k + ' people gets ' : 'Your share is '}${+(cfg.split / k).toFixed(2)}%.</small>` : '');
  }
  function paintDlReps() {
    $('#dlReps').innerHTML = teamNames(dlReps).map(nm => `<button type="button" class="chip ${dlReps.includes(nm) ? 'on' : ''}" data-r="${esc(nm)}">${esc(nm)}</button>`).join('') + '<button type="button" class="chip addsub" data-addrep="1">＋ Add a rep</button>'; dlPreview();
  }
  $('#dlReps').onclick = e => {
    if (e.target.closest('[data-addrep]')) { const nm = (window.prompt('Rep name') || '').trim(); if (nm && !dlReps.includes(nm)) { dlReps.push(nm); paintDlReps(); } return; }
    const c = e.target.closest('[data-r]'); if (!c) return; const nm = c.dataset.r; dlReps = dlReps.includes(nm) ? dlReps.filter(x => x !== nm) : [...dlReps, nm]; paintDlReps();
  };
  ['#dl-amt', '#dl-lead'].forEach(s => $(s).addEventListener('input', dlPreview)); $('#dl-seller').addEventListener('change', dlPreview);
  function openDl(mode, id) {
    dlMode = mode; dlId = id || ''; const j = jobs[dealJob] || {}, u = mode === 'upsell' && id ? (j.upsells || []).find(x => x.id === id) : null, first = mode === 'contract';
    $('#dlHead').textContent = first ? 'First sale (prime contract)' : (u ? 'Edit upsell' : 'New upsell');
    $('#dlTitleWrap').hidden = first; $('#dlContractWrap').hidden = !first; $('#dlDel').hidden = !(mode === 'upsell' && u);
    $('#dl-title').value = u ? u.title || '' : ''; $('#dl-amt').value = fmtAmt(first ? j.contract : (u ? u.amount : ''));
    const lp = first ? j.leadPct : (u ? u.leadPct : undefined); $('#dl-lead').value = lp !== undefined && lp !== null && lp !== '' ? lp : ''; $('#dl-lead').placeholder = first ? cfg.leadFirst : cfg.leadUp;
    $('#dlCosts').innerHTML = ''; (first ? (j.costs || []) : (u ? upCostsOf(u) : [])).forEach(addDlCost);
    dlReps = first ? (j.repNames || []).slice() : (u ? (u.repNames || []).slice() : []); paintDlReps();
    $('#dlChips').innerHTML = UP_IDEAS.map(t => `<button type="button" class="chip" data-t="${t}">${t}</button>`).join('');
    $('#dl-date').value = j.soldOn || todayISO();
    $('#dl-seller').innerHTML = (asRep ? `<option value="${esc(asRep)}" selected>${esc(asRep)} (sold it)</option>` : '<option value="">Me (you sold it)</option>') + team.filter(x => x.name !== asRep).map(x => `<option ${j.seller === x.name ? 'selected' : ''}>${esc(x.name)}</option>`).join('') + (j.seller && !team.some(x => x.name === j.seller) ? `<option selected>${esc(jobReps(j).join(' + '))}</option>` : '');
    dlPreview(); $('#dlBg').classList.add('open'); setTimeout(() => $(!first && !u ? '#dl-title' : '#dl-amt').focus(), 250);
  }
  $('#dlChips').onclick = e => { const c = e.target.closest('[data-t]'); if (c) { $('#dl-title').value = c.dataset.t; $('#dl-amt').focus(); } };
  $('#dlCancel').onclick = () => $('#dlBg').classList.remove('open');
  $('#dlBg').onclick = e => { if (e.target.id === 'dlBg') $('#dlBg').classList.remove('open'); };
  $('#dlSave').onclick = () => { try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); dlSaveNow(); } catch (err) { toast('Could not save: ' + (err && err.message || err)); } };
  function dlSaveNow() {
    const j = jobs[dealJob] = jobs[dealJob] || {}, v = amt($('#dl-amt').value), lp = $('#dl-lead').value.trim();
    const costs = [...document.querySelectorAll('#dlCosts .costrow')].map(r => ({ id: r.dataset.id || uid(), title: r.querySelector('.c-title').value.trim() || 'Expense', amount: amt(r.querySelector('.c-amt').value), date: r.dataset.date || todayISO() })).filter(c => c.amount);
    if (dlMode === 'contract') {
      j.contract = v; j.soldOn = $('#dl-date').value || j.soldOn || todayISO(); j.seller = $('#dl-seller').value; if (!v) delete j.soldOn;
      j.costs = costs; if (dlReps.length) j.repNames = dlReps.slice(); else delete j.repNames; if (lp === '') delete j.leadPct; else j.leadPct = parseFloat(lp) || 0;
    } else {
      if (!v) { toast('Enter the amount'); return; }
      const t = $('#dl-title').value.trim() || 'Upsell', ups = j.upsells = j.upsells || [], u = dlId && ups.find(x => x.id === dlId), f = { title: t, amount: v, costs, status: 'won' };
      const tgt = u || { id: uid(), at: todayISO(), wonAt: todayISO() }; Object.assign(tgt, f); delete tgt.cost; if (dlReps.length) tgt.repNames = dlReps.slice(); else delete tgt.repNames; if (lp === '') delete tgt.leadPct; else tgt.leadPct = parseFloat(lp) || 0; if (!u) ups.push(tgt);
    }
    syncMembers(j); saveJobs(); $('#dlBg').classList.remove('open'); render(); toast('Saved');
  }
  $('#dlDel').onclick = () => { const j = jobs[dealJob]; if (!j) return; const gone = (j.upsells || []).find(x => x.id === dlId); j.upsells = (j.upsells || []).filter(x => x.id !== dlId); saveJobs(); $('#dlBg').classList.remove('open'); render(); toast('Upsell removed', () => { j.upsells = [...(j.upsells || []), gone]; saveJobs(); render(); }); };
  $('#dlPdf').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) maybeContract(dealJob, { name: f.name, mime: f.type, blob: f }, true); };
  function dealAct(act, el) {
    if (act === 'dealcontract') return openDl('contract');
    if (act === 'dealpdf') return $('#dlPdf').click();
    if (act === 'dealup') return openDl('upsell');
    if (act === 'dealsale') return el.dataset.id === 'first' ? openDl('contract') : openDl('upsell', el.dataset.id);
  }
  // ---- quick expense ----
  let exJob = '', skipExp = false;
  function openExpense(n, pre = {}) {
    exJob = n; const j = jobs[n] || {};
    $('#exTitle').textContent = 'Add expense · ' + (j.addr || n); $('#ex-title').value = pre.title || ''; $('#ex-amt').value = fmtAmt(pre.amount);
    $('#exChips').innerHTML = ['Turf', 'Materials', 'Gas', 'Permit', 'Dump fee', 'Sub payment', 'Other'].map(t => `<button type="button" class="chip" data-t="${t}">${t}</button>`).join('');
    $('#exBg').classList.add('open'); setTimeout(() => $(pre.title ? '#ex-amt' : '#ex-title').focus(), 250);
  }
  $('#exChips').onclick = e => { const c = e.target.closest('[data-t]'); if (!c) return; $('#ex-title').value = c.dataset.t; $('#ex-amt').focus(); };
  function saveExpense(receipt) {
    const title = $('#ex-title').value.trim(), amount = amt($('#ex-amt').value);
    if (!amount) { toast('Enter the amount'); $('#ex-amt').focus(); return; }
    const j = jobs[exJob] = jobs[exJob] || {}; j.costs = [...(j.costs || []), { id: uid(), title: title || 'Expense', amount, date: todayISO() }]; saveJobs();
    logMsg(exJob, 'note', '🧾 Expense: ' + (title || 'Expense') + ' ' + money0(amount) + '. Estimated pay now ' + money0(jobNet(j).net) + '.');
    $('#exBg').classList.remove('open'); render(); toast('Expense added');
    if (receipt) setTimeout(() => $('#fCam').click(), 300);
  }
  $('#exSave').onclick = () => saveExpense(false); $('#exReceipt').onclick = () => saveExpense(true);
  $('#exCancel').onclick = () => $('#exBg').classList.remove('open');
  $('#exBg').onclick = e => { if (e.target.id === 'exBg') $('#exBg').classList.remove('open'); };
  // ---- read a contract PDF sent in the chat and offer to record its amount ----
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  async function pdfText(blob) {
    if (!window.pdfjsLib) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await window.pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise, out = [];
    for (let p = 1; p <= Math.min(doc.numPages, 8); p++) {
      const items = (await (await doc.getPage(p)).getTextContent()).items; let line = '', y = null;
      items.forEach(it => { const yy = Math.round(it.transform[5]); if (y !== null && Math.abs(yy - y) > 2) { out.push(line); line = ''; } y = yy; line += it.str + ' '; }); out.push(line);
    }
    return out;
  }
  function findContractAmount(lines) {
    const money = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{4,}(?:\.\d{2})?)/g, key = /(contract (price|amount|sum|total)|total (contract|price|amount|cost)|grand total|project total|total)/i;
    const all = [], keyed = [];
    lines.forEach((ln, i) => { for (const m of (ln + ' ' + (key.test(ln) ? lines[i + 1] || '' : '')).matchAll(money)) { const v = parseFloat(m[1].replace(/,/g, '')); if (v >= 1000) { all.push(v); if (key.test(ln)) keyed.push({ v, label: (ln.match(key) || [''])[0] }); } } });
    if (keyed.length) { const k = keyed.sort((a, b) => b.v - a.v)[0]; return { amount: k.v, label: k.label.trim() }; }
    return all.length ? { amount: Math.max(...all), label: 'largest amount' } : null;
  }
  async function maybeContract(job, f, force) {
    const isPdf = /pdf/i.test(f.mime || '') || /\.pdf$/i.test(f.name || ''), named = force || /contract|agreement|proposal|estimate|signed/i.test(f.name || '');
    if (!isPdf) { if (named) openPick('Is this the contract?', [{ label: '💵 Yes, enter the contract amount', fn: () => { dealJob = job; openDl('contract'); } }, { label: 'No', fn: () => {} }]); return; }
    let lines; try { lines = await pdfText(f.blob); } catch { if (named) openPick('Is this the contract?', [{ label: '💵 Yes, enter the contract amount', fn: () => { dealJob = job; openDl('contract'); } }, { label: 'No', fn: () => {} }]); return; }
    const text = lines.join(' ');
    if (!named && !/contract|agreement|proposal|estimate/i.test(text)) return;
    const r = findContractAmount(lines);
    if (!r) { if (named) openPick('Contract file saved', [{ label: '💵 Enter the contract amount', fn: () => { dealJob = job; openDl('contract'); } }, { label: 'Not a contract', fn: () => {} }]); return; }
    const j = jobs[job] || {};
    openPick('Contract found: ' + money0(r.amount) + (j.contract && j.contract !== r.amount ? ' (now ' + money0(j.contract) + ')' : ''), [
      { label: '✅ Record ' + money0(r.amount) + ' as the contract', fn: () => { const jj = jobs[job] = jobs[job] || {}; jj.contract = r.amount; if (!jj.soldOn) jj.soldOn = todayISO(); saveJobs(); logMsg(job, 'note', '📄 Contract recorded: ' + money0(r.amount) + '. Estimated pay so far: ' + money0(jobNet(jj).net) + ' (after ' + money0(jobNet(jj).lead) + ' lead cost and ' + money0(jobNet(jj).costs) + ' expenses, your share ' + +jobNet(jj).pct.toFixed(2) + '%).'); render(); toast('Contract recorded'); } },
      { label: '✏️ Use a different amount', fn: () => { dealJob = job; openDl('contract'); } },
      { label: '✖ Not a contract', fn: () => {} }]);
  }
  function sendChat() {
    const text = $('#chatIn').value.trim();
    const mx = !pending.length && !skipExp && text.match(/^(?:expense|exp|cost)\s+(.+?)\s+\$?([\d,]+(?:\.\d{1,2})?)\s*$/i);
    const mu = !pending.length && !skipExp && text.match(/^(?:upsell|up)\s+(.+?)\s+\$?([\d,]+(?:\.\d{1,2})?)(?:\s+(?:cost|exp|expenses?)\s+\$?([\d,]+(?:\.\d{1,2})?))?\s*$/i), ms = !pending.length && !skipExp && text.match(/^(?:sold|contract)\s+\$?([\d,]+(?:\.\d{1,2})?)\s*$/i);
    if (mu) { const t1 = mu[1].replace(/^./, c => c.toUpperCase()), v1 = amt(mu[2]), c1 = amt(mu[3] || ''); return openPick('Add upsell: ' + t1 + ' ' + money0(v1) + (c1 ? ' · expenses ' + money0(c1) : '') + '?', [{ label: '✅ Add the upsell', fn: () => { const j = jobs[curJob] = jobs[curJob] || {}; j.upsells = [...(j.upsells || []), { id: uid(), title: t1, amount: v1, costs: c1 ? [{ id: uid(), title: 'Expenses', amount: c1, date: todayISO() }] : [], status: 'won', at: todayISO(), wonAt: todayISO() }]; saveJobs(); logMsg(curJob, 'note', '⬆️ Upsell: ' + t1 + ' ' + money0(v1) + '. You get ' + money0(jobNet(j).sales.slice(-1)[0].share) + '.'); $('#chatIn').value = ''; autoGrow(); render(); toast('Upsell added'); } }, { label: '💬 Send as a message instead', fn: () => { skipExp = true; sendChat(); skipExp = false; } }]); }
    if (ms) { const v2 = amt(ms[1]); return openPick('Record contract ' + money0(v2) + '?', [{ label: '✅ Record as the prime contract', fn: () => { const j = jobs[curJob] = jobs[curJob] || {}; j.contract = v2; if (!j.soldOn) j.soldOn = todayISO(); saveJobs(); logMsg(curJob, 'note', '📄 Contract recorded: ' + money0(v2) + '. Estimated pay so far: ' + money0(jobNet(j).net) + '.'); $('#chatIn').value = ''; autoGrow(); render(); toast('Contract recorded'); } }, { label: '💬 Send as a message instead', fn: () => { skipExp = true; sendChat(); skipExp = false; } }]); }
    if (mx) { const t0 = mx[1].replace(/^./, c => c.toUpperCase()), v0 = amt(mx[2]); return openPick('Add expense: ' + t0 + ' ' + money0(v0) + '?', [{ label: '✅ Add as an expense', fn: () => { $('#chatIn').value = ''; autoGrow(); exJob = curJob; $('#ex-title').value = t0; $('#ex-amt').value = fmtAmt(v0); saveExpense(false); } }, { label: '💬 Send as a message instead', fn: () => { skipExp = true; sendChat(); skipExp = false; } }]); }
    if (!text && !pending.length) { toast('Tap the 🎤 on your keyboard to dictate'); $('#chatIn').focus(); return; }
    if (pending.length) {
      const files = pending.map(p => new File([p.blob], p.name, { type: p.mime }));
      const attach = pending.map(p => { memBlobs[p.id] = p.blob; putFile({ id: p.id, job: curJob, name: p.name, mime: p.mime, size: p.size, blob: p.blob }).catch(() => toast('Could not save a file on this phone')); return { id: p.id, kind: p.kind, name: p.name, size: p.size, mime: p.mime }; });
      pending.forEach(p => p.preview && URL.revokeObjectURL(p.preview));
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
      let shared = null;
      if (navigator.canShare && navigator.canShare({ files })) shared = navigator.share({ files, text: text || undefined }).catch(() => {});
      logMsg(curJob, 'out', text, { attach, via: 'share' });
      const chk = pending.map(p => ({ name: p.name, mime: p.mime, blob: p.blob })), chkJob = curJob; setTimeout(() => chk.forEach(f => maybeContract(chkJob, f)), 700);
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
  // ---- import a whole WhatsApp chat (paste or exported .txt) ----
  const h32 = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  function parseWAChat(raw) {
    const clean = String(raw).replace(/[\u200e\u200f\u202a-\u202e\u00a0\u202f]/g, ' ').replace(/\r/g, '');
    const head = /^\[?(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp]\.?[Mm]\.?)?\]?\s*(?:[-–—]\s*)?(.*)$/;
    const recs = []; let cur = null, dmCount = 0;
    for (const line of clean.split('\n')) {
      const m = line.replace(/^\s+/, '').match(head);
      if (m && m[1].length <= 2) {
        const nm = m[8].match(/^([^:]{1,60}?):\s?([\s\S]*)$/);
        if (+m[1] > 12) dmCount++;
        if (nm) { cur = { a: +m[1], b: +m[2], c: +m[3], hh: +m[4], mi: +m[5], ss: +(m[6] || 0), ap: m[7], who: nm[1].trim(), text: nm[2] }; recs.push(cur); } else cur = null;
      } else if (cur) cur.text += '\n' + line;
    }
    const dmy = dmCount > 0, msgs = [];
    recs.forEach(r => {
      let day = dmy ? r.a : r.b, mon = dmy ? r.b : r.a, yr = r.c < 100 ? 2000 + r.c : r.c, hh = r.hh;
      if (r.ap) { const ap = r.ap.toLowerCase().replace(/\./g, ''); if (ap === 'pm' && hh < 12) hh += 12; if (ap === 'am' && hh === 12) hh = 0; }
      const d = new Date(yr, mon - 1, day, hh, r.mi, r.ss);
      if (isNaN(d) || mon < 1 || mon > 12 || day < 1 || day > 31) return;
      const text = r.text.replace(/\s+$/, ''); if (!text) return;
      msgs.push({ at: d.toISOString(), who: r.who, text });
    });
    return { msgs, dmy };
  }
  let impParsed = null, impMe = '';
  // ---- zip support: read WhatsApp "Export Chat -> Attach Media" files without loading the whole zip into memory ----
  let impZip = null, impWin = 'all', impAbort = false, impBusy = false;
  async function readZipIndex(file) {
    const tail = await file.slice(Math.max(0, file.size - 66000), file.size).arrayBuffer(), dv = new DataView(tail); let p = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { p = i; break; }
    if (p < 0) throw new Error('That does not look like a zip file.');
    const count = dv.getUint16(p + 10, true), cdSize = dv.getUint32(p + 12, true), cdOff = dv.getUint32(p + 16, true);
    if (cdOff === 0xFFFFFFFF || count === 0xFFFF) throw new Error('That zip is too big (over 4 GB). Export a smaller chat or fewer messages.');
    const cd = await file.slice(cdOff, cdOff + cdSize).arrayBuffer(), v = new DataView(cd), u8 = new Uint8Array(cd), td = new TextDecoder('utf-8'), out = [];
    let o = 0;
    while (o + 46 <= cd.byteLength && v.getUint32(o, true) === 0x02014b50) {
      const nl = v.getUint16(o + 28, true), el = v.getUint16(o + 30, true), cl = v.getUint16(o + 32, true);
      out.push({ name: td.decode(u8.subarray(o + 46, o + 46 + nl)), method: v.getUint16(o + 10, true), csize: v.getUint32(o + 20, true), usize: v.getUint32(o + 24, true), lho: v.getUint32(o + 42, true) });
      o += 46 + nl + el + cl;
    }
    return out;
  }
  let fflateP = null;
  const loadFflate = () => fflateP ||= new Promise((res, rej) => { if (window.fflate) return res(window.fflate); const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js'; sc.onload = () => res(window.fflate); sc.onerror = () => rej(new Error('Could not load the unzip helper.')); document.head.appendChild(sc); });
  async function zipBlob(file, e) {
    const lh = new DataView(await file.slice(e.lho, e.lho + 30).arrayBuffer());
    if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('Damaged zip file.');
    const start = e.lho + 30 + lh.getUint16(26, true) + lh.getUint16(28, true), raw = file.slice(start, start + e.csize);
    if (e.method === 0) return raw;
    if (e.method !== 8) throw new Error('Unsupported zip compression.');
    if (typeof DecompressionStream !== 'undefined') return await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    if (e.usize > 80e6) throw new Error('This file is too big for your phone\'s older browser.');
    const ff = await loadFflate(); return new Blob([ff.inflateSync(new Uint8Array(await raw.arrayBuffer()))]);
  }
  const baseName = n => String(n).split('/').pop().toLowerCase();
  function attachRef(text) {
    let m = text.match(/<attached:\s*([^>\n]+)>/i); if (m) return { name: m[1].trim(), rest: text.replace(m[0], '').trim() };
    m = text.match(/^\s*([^\n]+?\.[A-Za-z0-9]{2,5})\s*\((?:file|fichier|archivo|archivo adjunto|datei)\s+(?:attached|joint|adjunto|angehängt)\)\s*([\s\S]*)$/i);
    return m ? { name: m[1].trim(), rest: m[2].trim() } : null;
  }
  const MIMES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', '3gp': 'video/3gpp', pdf: 'application/pdf', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg' };
  const mimeOf = n => MIMES[(String(n).split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
  const winCutoff = () => impWin === 'none' ? '9999' : impWin === 'all' ? '' : new Date(Date.now() - (+impWin) * 864e5).toISOString();
  const mediaMsgs = () => (impParsed ? impParsed.msgs : []).filter(m => m.entry && (!winCutoff() || m.at >= winCutoff()) && m.entry.usize <= 150e6);
  async function handleZip(file) {
    $('#impSummary').innerHTML = '<div class="cstat">Reading the zip…</div>';
    try {
      const entries = await readZipIndex(file), txt = entries.find(e => /_chat\.txt$/i.test(e.name)) || entries.find(e => /\.txt$/i.test(e.name));
      if (!txt) throw new Error('I could not find the chat text inside that zip.');
      const text = await (await zipBlob(file, txt)).text(), map = new Map(); entries.forEach(e => map.set(baseName(e.name), e));
      impParsed = parseWAChat(text);
      impParsed.msgs.forEach(m => { m.ref = attachRef(m.text); if (m.ref) m.entry = map.get(baseName(m.ref.name)); });
      impZip = { file, count: entries.length };
      const total = impParsed.msgs.filter(m => m.entry).reduce((a, m) => a + m.entry.usize, 0);
      impWin = total <= 250e6 ? 'all' : '90'; $('#imp-text').value = '';
      paintImport();
    } catch (e) { impZip = null; impParsed = null; $('#impSummary').innerHTML = `<div class="cerr">${esc(e.message || 'Could not read that zip.')}</div>`; $('#impGo').disabled = true; }
  }
  async function importZip() {
    if (impBusy) return; impBusy = true; impAbort = false;
    const j = jobs[curJob] = jobs[curJob] || {}, have = new Map((j.chat || []).map(m => [m.id, m])), media = new Set(mediaMsgs());
    const total = media.size; let done = 0, added = 0, files = 0, failed = 0; const add = [];
    $('#impGo').disabled = true; $('#impProg').hidden = false;
    for (const m of impParsed.msgs.slice(0, 8000)) {
      if (impAbort) break;
      const id = 'wa-' + h32(m.at + '|' + m.who + '|' + m.text), mine = impMe !== '__none' && m.who === impMe;
      let attach, text = m.text;
      if (m.ref) text = m.ref.rest;
      if (media.has(m)) {
        $('#impProg').textContent = `Bringing in photos and files… ${++done} of ${total}`;
        const ex = have.get(id);
        if (!(ex && ex.attach && ex.attach.length)) {
          try {
            let blob = await zipBlob(impZip.file, m.entry); const nm = m.ref.name, mime = mimeOf(nm), k = /^image\//.test(mime) ? 'image' : /^video\//.test(mime) ? 'video' : 'file';
            if (k === 'image' && blob.size > 900e3) { const sh = await shrinkImage(new File([blob], nm, { type: mime })); blob = sh; }
            const mid = 'wam-' + h32(m.at + nm);
            await putFile({ id: mid, job: curJob, name: nm, mime: blob.type || mime, size: blob.size, blob });
            attach = [{ id: mid, kind: k, name: nm, size: blob.size, mime: blob.type || mime }]; files++;
          } catch (e) { failed++; text = (text ? text + '\n' : '') + '📎 ' + m.ref.name + ' (could not import)'; }
        }
        if (done % 6 === 0) await new Promise(r => setTimeout(r, 0));
      } else if (m.ref) text = (text ? text + '\n' : '') + '📎 ' + m.ref.name;
      const ex = have.get(id);
      if (ex) { if (attach && !(ex.attach && ex.attach.length)) { ex.attach = attach; ex.text = text; added++; } continue; }
      const rec = { id, at: m.at, kind: mine ? 'out' : 'in', ...(mine ? { by: m.who } : { who: m.who }), text, via: 'wa', imp: true, ...(attach ? { attach } : {}) };
      have.set(id, rec); add.push(rec); added++;
    }
    j.chat = [...(j.chat || []), ...add].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    saveJobs(); impBusy = false; $('#impProg').hidden = true; $('#impBg').classList.remove('open'); chatLimit = 300; render();
    toast(impAbort ? `Stopped. Imported ${added} messages so far.` : `Imported ${added} messages and ${files} files${failed ? ` (${failed} could not be read)` : ''}`);
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
  }
  function paintImport() {
    const el = $('#impSummary'), r = impParsed;
    if (!r || !r.msgs.length) { el.innerHTML = $('#imp-text').value.trim() ? '<div class="cerr">I could not find WhatsApp messages in that text. Paste the chat the way WhatsApp copies it, or choose the exported .txt file.</div>' : ''; $('#impGo').disabled = true; return; }
    const by = {}; r.msgs.forEach(m => by[m.who] = (by[m.who] || 0) + 1);
    const names = Object.keys(by).sort((a, b) => by[b] - by[a]);
    if (!names.includes(impMe) && impMe !== '__none') impMe = names.find(n => OWNER && n.toLowerCase().includes(OWNER.toLowerCase())) || '__none';
    const first = new Date(r.msgs[0].at), last = new Date(r.msgs[r.msgs.length - 1].at), f = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    el.innerHTML = `<div class="cok">Found <b>${r.msgs.length}</b> messages<br><small>${f(first)} to ${f(last)} · dates read as ${r.dmy ? 'day/month' : 'month/day'}</small></div>
      <label>Which person is you?</label>` + names.map(n => `<label class="rcpt"><input type="radio" name="impme" value="${esc(n)}" ${impMe === n ? 'checked' : ''}><span><b>${esc(n)}</b><small>${by[n]} messages</small></span></label>`).join('')
      + `<label class="rcpt"><input type="radio" name="impme" value="__none" ${impMe === '__none' ? 'checked' : ''}><span><b>None of them</b><small>I wasn't in this chat</small></span></label>`;
    if (impZip) {
      const all = r.msgs.filter(m => m.entry), sel = mediaMsgs(), mb = x => (x.reduce((a, m) => a + m.entry.usize, 0) / 1048576).toFixed(0);
      el.innerHTML += `<label>Photos, videos and files to bring in</label>
        <div class="chips" id="impWin">${[['all', 'Everything'], ['90', 'Last 90 days'], ['30', 'Last 30 days'], ['none', 'None']].map(([k, l]) => `<button type="button" class="chip ${impWin === k ? 'on' : ''}" data-w="${k}">${l}</button>`).join('')}</div>
        <div class="cstat">${all.length} files in this chat. Bringing in <b>${sel.length}</b> (${mb(sel)} MB). They are saved on your phone.</div>`;
    }
    $('#impGo').disabled = false; $('#impGo').textContent = impZip ? `Import messages + ${mediaMsgs().length} files` : `Import ${r.msgs.length} messages`;
  }
  let impTimer = null;
  $('#imp-text').addEventListener('input', () => { impZip = null; clearTimeout(impTimer); impTimer = setTimeout(() => { impParsed = parseWAChat($('#imp-text').value); paintImport(); }, 250); });
  $('#imp-file').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    impZip = null;
    if (/\.zip$/i.test(f.name) || /zip/.test(f.type)) return handleZip(f);
    try { const t = await f.text(); $('#imp-text').value = t.length > 400000 ? t.slice(0, 400000) : t; impParsed = parseWAChat(t); paintImport(); } catch { toast('Could not read that file'); }
  };
  $('#impSummary').addEventListener('click', e => { const c = e.target.closest('[data-w]'); if (c) { impWin = c.dataset.w; paintImport(); } });
  $('#impSummary').onchange = e => { if (e.target.name === 'impme') impMe = e.target.value; };
  $('#impCancel').onclick = () => { if (impBusy) { impAbort = true; return; } $('#impBg').classList.remove('open'); };
  $('#impBg').onclick = e => { if (e.target.id === 'impBg' && !impBusy) $('#impBg').classList.remove('open'); };
  $('#impGo').onclick = () => {
    if (!impParsed || !impParsed.msgs.length) return;
    if (impZip) return importZip();
    const j = jobs[curJob] = jobs[curJob] || {}, have = new Set((j.chat || []).map(m => m.id)); let added = 0;
    const add = [];
    impParsed.msgs.slice(0, 8000).forEach((m, i) => {
      const id = 'wa-' + h32(m.at + '|' + m.who + '|' + m.text + '|' + (i < 3 ? 0 : 0));
      if (have.has(id)) return; have.add(id);
      const mine = impMe !== '__none' && m.who === impMe;
      add.push({ id, at: m.at, kind: mine ? 'out' : 'in', ...(mine ? { by: m.who } : { who: m.who }), text: m.text, via: 'wa', imp: true }); added++;
    });
    j.chat = [...(j.chat || []), ...add].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    saveJobs(); $('#impBg').classList.remove('open'); chatLimit = 300; render();
    toast(`Imported ${added} messages${impParsed.msgs.length - added > 0 ? ` (${impParsed.msgs.length - added} were already here)` : ''}`);
  };
  function openImport() { impParsed = null; impMe = ''; impZip = null; impBusy = false; $('#impProg').hidden = true; $('#imp-text').value = ''; $('#impSummary').innerHTML = ''; $('#impGo').disabled = true; $('#impGo').textContent = 'Import'; $('#impBg').classList.add('open'); }

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
  // ---- money: commissions, overrides, upsells ----
  const money0 = n => { const v = Math.round(n || 0); return (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US'); };
  function periodRange(p) {
    const d = new Date(), y = d.getFullYear(), m = d.getMonth();
    if (p === 'month') return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    if (p === 'last') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    return [y + '-01-01', y + '-12-31'];
  }
  const inR = (d, r) => d && d >= r[0] && d <= r[1];
  const amt = v => parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0;
  const fmtAmt = n => n ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';
  document.addEventListener('input', e => {
    const el = e.target; if (!el.classList || !el.classList.contains('moneyin')) return;
    const p = el.value.replace(/[^0-9.]/g, '').split('.'), int = p[0].replace(/^0+(?=\d)/, ''), dec = p.length > 1 ? '.' + p.slice(1).join('').slice(0, 2) : '';
    el.value = (int ? Number(int).toLocaleString('en-US') : '') + dec;
  }, true);
  const leadPctOf = j => (j && j.leadPct !== undefined && j.leadPct !== '' && j.leadPct !== null) ? +j.leadPct : cfg.leadFirst;
  const repsOf = j => Array.isArray(j && j.repNames) ? 1 + j.repNames.length : Math.max(1, Math.min(10, parseInt(j && j.reps, 10) || 1));
  // Every sale (the first one and each upsell) works the same way: amount - lead cost - expenses = profit, then your share divided by the reps on it.
  const upCostsOf = u => Array.isArray(u.costs) ? u.costs : (u.cost ? [{ id: 'c0', title: 'Expenses', amount: u.cost }] : []);
  function saleCalc(s) {
    const lead = s.amount * s.leadPct / 100, cost = s.costs.reduce((t, c) => t + (c.amount || 0), 0), k = 1 + s.reps.length, profit = s.amount - lead - cost, pct = cfg.split / k;
    return { ...s, lead, cost, k, profit, pct, share: profit * pct / 100 };
  }
  function salesOf(j) {
    const out = [], who = OWNER || 'Owner';
    if (j.contract) {
      if (!asRep) { if (!j.seller) out.push(saleCalc({ key: 'first', kind: 'first', title: 'Prime contract', amount: j.contract, leadPct: leadPctOf(j), costs: j.costs || [], reps: j.repNames || [], date: soldDay(j) })); }
      else {
        // a rep's view: the people sharing the first sale are the seller and the other reps (or you and the reps, if you sold it)
        const names = j.seller ? jobReps(j) : (j.repNames || []);
        if (names.includes(asRep)) out.push(saleCalc({ key: 'first', kind: 'first', title: 'Prime contract', amount: j.contract, leadPct: leadPctOf(j), costs: j.costs || [], reps: [...names.filter(x => x !== asRep), ...(j.seller ? [] : [who])], date: soldDay(j) }));
      }
    }
    (j.upsells || []).forEach(u => {
      const names = u.repNames || [];
      if (asRep && !names.includes(asRep)) return;
      out.push(saleCalc({ key: u.id, kind: 'upsell', title: u.title || 'Upsell', amount: u.amount || 0, leadPct: u.leadPct !== undefined && u.leadPct !== '' && u.leadPct !== null ? +u.leadPct : cfg.leadUp, costs: upCostsOf(u), reps: asRep ? [who, ...names.filter(x => x !== asRep)] : names, date: u.wonAt || u.at || '' }));
    });
    return out;
  }
  function earnings(range) {
    const r = { deals: 0, contracts: 0, revenue: 0, upWon: 0, upPlay: 0, upOff: 0, leadFirst: 0, leadUp: 0, costs: 0, over: 0, share: 0 };
    Object.values(jobs).forEach(j => {
      if (!j) return;
      if (j.contract && inR(soldDay(j), range) && (!asRep || salesOf(j).some(s => s.kind === 'first'))) { r.deals++; r.contracts += j.contract; if (!asRep && j.seller) r.over += j.contract * cfg.override / 100; }
      salesOf(j).forEach(s => {
        if (!inR(s.date || soldDay(j), range)) return;
        r.revenue += s.amount; r.costs += s.cost; r.share += s.share;
        if (s.kind === 'first') r.leadFirst += s.lead; else { r.leadUp += s.lead; r.upWon += s.amount; }
      });
    });
    r.lead = r.leadFirst + r.leadUp; r.profit = r.revenue - r.lead - r.costs; r.net = r.share + r.over; return r;
  }
  function jobNet(j) {
    const sales = salesOf(j), sum = f => sales.reduce((t, s) => t + f(s), 0), first = sales.find(s => s.kind === 'first');
    const over = !asRep && j.seller && j.contract ? j.contract * cfg.override / 100 : 0, revenue = sum(s => s.amount), lead = sum(s => s.lead), costs = sum(s => s.cost), share = sum(s => s.share);
    return { sales, revenue, lead, costs, profit: revenue - lead - costs, share, over, reps: first ? first.k : repsOf(j), pct: first ? first.pct : cfg.split / repsOf(j), net: share + over, names: j.repNames || [] };
  }
  function screenMoney() {
    const range = periodRange(moneyPer), e = earnings(range), ytd = earnings(periodRange('year'));
    const now = new Date(), dayOfYear = Math.max(1, Math.round((now - new Date(now.getFullYear(), 0, 0)) / 864e5));
    const pace = ytd.net / dayOfYear * 365, pct = cfg.goal ? Math.min(100, Math.round(ytd.net / cfg.goal * 100)) : 0;
    const seg = (k, l) => `<button class="${moneyPer === k ? 'on' : ''}" data-act="mper" data-t="${k}">${l}</button>`;
    const list = Object.entries(jobs).filter(([, j]) => j && (j.contract || (j.upsells || []).length)).sort((a, b) => String(b[1].soldOn || '').localeCompare(String(a[1].soldOn || '')));
    const noCon = Object.entries(jobs).filter(([, j]) => j && !j.contract && !(j.upsells || []).length);
    const jr = ([n, j]) => { const ups = j.upsells || [], won = ups.reduce((a, u) => a + (u.amount || 0), 0), off = 0;
      return `<button class="srow" data-act="moneyjob" data-p="${esc(n)}"><span class="sico">💼</span><span class="slbl"><b>${esc(j.addr || n)}</b><small>${esc(n)}${j.seller ? ' · sold by ' + esc(jobReps(j).join(' + ')) : ''}${won ? ' · ' + money0(won) + ' upsell won' : ''}${off ? ' · ' + money0(off) + ' offered' : ''}${(j.repNames || []).length ? ' · with ' + esc(j.repNames.join(', ')) : ''}${j.contract ? ' · you keep ' + money0(jobNet(j).net) : ''}</small></span><span class="sval">${j.contract ? money0(j.contract) : 'Add $'}</span><span class="schev">›</span></button>`; };
    return `<div class="seg">${seg('month', 'This month')}${seg('last', 'Last month')}${seg('year', 'This year')}</div>
      <div class="bigcard"><div class="bl">You keep</div><div class="bn">${money0(e.net)}</div><div class="bs">${money0(e.revenue)} sales − ${money0(e.lead)} lead cost − ${money0(e.costs)} expenses = ${money0(e.profit)} profit<br>Your share (${cfg.split}%, divided when reps share a file) ${money0(e.share)}${e.over ? ' + ' + money0(e.over) + ' overrides' : ''}<br>${e.deals} ${e.deals === 1 ? 'job' : 'jobs'} sold · ${money0(e.contracts)} in contracts</div></div>
      ${asRep ? '' : (() => {
        const rows = repNames().map(nm => ({ nm, s: repStats(nm, range) })).filter(r => r.s.mine || r.s.open).sort((x, y) => y.s.mine - x.s.mine), tot = rows.reduce((t, r) => t + r.s.mine, 0), life = rows.reduce((t, r) => t + r.s.life, 0);
        return `<div class="ssec">From my reps · your ${cfg.override}%</div>` + (rows.length ? `<div class="scard">${rows.map(r => `<button class="srow" data-act="repopen" data-r="${esc(r.nm)}"><span class="sico">👤</span><span class="slbl"><b>${esc(r.nm)}</b><small>${r.s.deals} ${r.s.deals === 1 ? 'job' : 'jobs'} sold · ${money0(r.s.sold)} in contracts</small></span><span class="sval"><b>${money0(r.s.mine)}</b></span><span class="schev">›</span></button>`).join('')}
          <div class="mrow"><span class="sico">🤝</span><span class="mbody"><b>Total from my reps</b><small>All time ${money0(life)}. Counted once per file, split between the reps on it</small></span><b>${money0(tot)}</b></div></div>` : '<div class="hint">No rep jobs yet. Open a job, tap <b>Sold by</b> and pick the rep.</div>');
      })()}
      <div class="ssec">The numbers</div>
      <div class="scard">
        <div class="mrow"><span class="sico">💼</span><span class="mbody"><b>Sales and upsells</b><small>Contracts you sold + upsells won (${money0(e.upWon)})</small></span><b>${money0(e.revenue)}</b></div>
        <div class="mrow"><span class="sico">🎯</span><span class="mbody"><b>Lead cost</b><small>${cfg.leadFirst}% of the contract, ${cfg.leadUp}% of upsells</small></span><b>−${money0(e.lead)}</b></div>
        <div class="mrow"><span class="sico">🧾</span><span class="mbody"><b>Expenses</b><small>Turf, materials, fees you added to jobs</small></span><b>−${money0(e.costs)}</b></div>
        <div class="mrow"><span class="sico">📊</span><span class="mbody"><b>Profit to split</b><small>Sales side gets ${cfg.split}% (shared by the reps on a file), company ${100 - cfg.split}%</small></span><b>${money0(e.profit)}</b></div>
        <div class="mrow"><span class="sico">🤝</span><span class="mbody"><b>Rep overrides</b><small>${cfg.override}% of rep deals</small></span><b>${money0(e.over)}</b></div>
      </div>
      <div class="ssec">Yearly goal</div>
      <div class="scard goal"><div class="grow"><b>${money0(ytd.net)}</b><span>of ${money0(cfg.goal)} · ${pct}%</span></div>
        <div class="prog"><i style="width:${pct}%"></i></div>
        <div class="gnote">At this pace you finish the year at <b>${money0(pace)}</b>${cfg.goal && pace < cfg.goal ? ` (${money0(cfg.goal - pace)} short)` : cfg.goal ? ' 🎉' : ''}</div>
        <button class="spill" data-act="cfgedit">⚙ Rates &amp; goal</button></div>
      ${(() => {
        const act = Object.entries(jobs).filter(([, j]) => j && !j.archived).map(([n, j]) => [n, j, finSummary(j)]).filter(x => x[2].room > 0).sort((a, b) => b[2].room - a[2].room);
        const tot = act.reduce((a, x) => a + x[2].room, 0), off = act.reduce((a, x) => a + Math.min(x[2].offered, x[2].room), 0);
        return act.length ? `<div class="ssec">Max it out</div><div class="bigcard soft"><div class="bl">Approved financing still unused</div><div class="bn">${money0(tot)}</div><div class="bs">across ${act.length} ${act.length === 1 ? 'job' : 'jobs'} · ${money0(off)} already offered as upsells · ${money0(Math.max(0, tot - off))} left to pitch</div></div>
          <div class="scard">${act.slice(0, 12).map(([n, j, sm]) => `<button class="srow" data-act="openjob" data-p="${esc(n)}"><span class="sico">💡</span><span class="slbl"><b>${esc(j.addr || n)}</b><small>${esc(n)} · approved ${money0(sm.approved)} · used ${money0(sm.used)}${sm.offered ? ' · ' + money0(sm.offered) + ' offered' : ''}</small></span><span class="sval"><b>${money0(sm.room)}</b></span><span class="schev">›</span></button>`).join('')}</div>` : '';
      })()}
      ${(() => { const fm = {}; Object.values(jobs).forEach(j => { if (!(j && j.contract && inR(j.soldOn, range))) return; const fins = getFins(j);
          if (!fins.length) { (fm['Not set'] ||= { n: 0, v: 0 }); fm['Not set'].n++; fm['Not set'].v += j.contract; return; }
          fins.forEach(f => { const v = f.amount || (fins.length === 1 ? j.contract : 0); (fm[f.company] ||= { n: 0, v: 0 }); fm[f.company].n++; fm[f.company].v += v; }); });
        const rows = Object.entries(fm).sort((a, b) => b[1].v - a[1].v);
        return rows.length ? `<div class="ssec">By finance company</div><div class="scard">${rows.map(([k, x]) => `<div class="mrow"><span class="sico">🏦</span><span class="mbody"><b>${esc(k)}</b><small>${x.n} ${x.n === 1 ? 'job' : 'jobs'}</small></span><b>${money0(x.v)}</b></div>`).join('')}</div>` : ''; })()}
      <div class="ssec">Jobs</div>
      <div class="scard">${list.length ? list.map(jr).join('') : '<div class="empty small">No contracts entered yet. Tap a job below to add one.</div>'}
        ${noCon.map(([n, j]) => `<button class="srow" data-act="moneyjob" data-p="${esc(n)}"><span class="sico">➕</span><span class="slbl"><b>${esc(j.addr || n)}</b><small>${esc(n)}</small></span><span class="sval">Add $</span><span class="schev">›</span></button>`).join('')}</div>`;
  }
  // ---- leads pipeline ----
  const STAGES = [['new', 'New'], ['meeting', 'Meeting set'], ['quoted', 'Quoted'], ['sold', 'Sold'], ['lost', 'Lost']];
  const stageName = k => (STAGES.find(x => x[0] === k) || [0, k])[1];
  let leadF = 'open', editLeadId = null, leadStageSel = 'new', pendingLead = null;
  const isOpenLead = l => l.stage !== 'sold' && l.stage !== 'lost';
  const leadsDue = () => leads.filter(l => isOpenLead(l) && l.next && l.next <= todayISO());
  function leadLine(l) {
    const bits = []; if (l.value) bits.push(money0(l.value)); if (l.source) bits.push(l.source);
    if (l.rep) bits.push('rep: ' + l.rep);
    return bits.join(' · ');
  }
  function screenLeads() {
    const t0 = todayISO(), open = leads.filter(isOpenLead), due = leadsDue();
    const list = (leadF === 'today' ? due : leadF === 'sold' ? leads.filter(l => l.stage === 'sold') : leadF === 'lost' ? leads.filter(l => l.stage === 'lost') : open)
      .slice().sort((a, b) => (a.next || '9999').localeCompare(b.next || '9999') || a.name.localeCompare(b.name));
    const seg = (k, l, c) => `<button class="${leadF === k ? 'on' : ''}" data-act="lfilter" data-t="${k}">${l} ${c}</button>`;
    const fun = ['new', 'meeting', 'quoted'].map(k => `<div><b>${leads.filter(l => l.stage === k).length}</b><span>${stageName(k)}</span></div>`).join('');
    const card = l => {
      const late = isOpenLead(l) && l.next && l.next < t0, today = isOpenLead(l) && l.next === t0;
      return `<div class="lcard ${late ? 'late' : ''}" data-id="${l.id}">
        <div class="ltop"><div class="lbody"><b class="lname">${esc(l.name)}</b><div class="lsub">${esc(l.addr || l.phone || 'No contact info yet')}</div></div><span class="stg stg-${l.stage}">${stageName(l.stage)}</span></div>
        <div class="lmeta">${esc(leadLine(l))}</div>
        <div class="lmeta">${l.meetAt ? '📅 ' + fmtDate(l.meetAt) + (l.meetTime ? ' · ' + fmtTime(l.meetTime) : '') + '  ' : ''}${l.next && isOpenLead(l) ? `<span class="${late ? 'date late' : today ? 'date today' : 'date'}">☎ Follow up ${fmtDate(l.next).toLowerCase()}</span>` : ''}</div>
        ${l.notes ? `<div class="lnote">${esc(l.notes)}</div>` : ''}
        <div class="vbtns">
          ${l.phone ? `<button data-act="lcall">📞 Call</button><button data-act="ltext">💬 Text</button>` : ''}
          ${l.addr ? `<button data-act="lgo">🧭 Go</button>` : ''}
          ${isOpenLead(l) ? `<button data-act="lsnz">+3d</button>` : ''}
          <button data-act="lstage" class="${isOpenLead(l) ? 'pri' : ''}">${l.stage === 'sold' ? '✅ Sold' : l.stage === 'lost' ? 'Reopen' : 'Stage ▾'}</button>
          <button data-act="ledit" aria-label="Edit">✎</button>
        </div></div>`;
    };
    return `<div class="jobactions"><button class="jbtn primary" data-act="lnew">＋ New lead</button></div>
      <div class="funnel">${fun}</div>
      <div class="seg">${seg('open', 'Open', open.length)}${seg('today', 'Follow up', due.length)}${seg('sold', 'Sold', leads.filter(l => l.stage === 'sold').length)}${seg('lost', 'Lost', leads.filter(l => l.stage === 'lost').length)}</div>
      ${list.length ? list.map(card).join('') : `<div class="empty small"><div class="big">☎️</div>${leadF === 'open' ? 'No open leads. Tap ＋ New lead to add one.' : 'Nothing here.'}</div>`}`;
  }
  function openLead(id) {
    editLeadId = id || null; const l = id ? leads.find(x => x.id === id) : null;
    $('#ldTitle').textContent = l ? 'Edit lead' : 'New lead';
    $('#l-name').value = l ? l.name : ''; $('#l-phone').value = l ? l.phone || '' : ''; $('#l-addr').value = l ? l.addr || '' : ''; $('#l-src').value = l ? l.source || '' : '';
    $('#l-val').value = l && l.value ? l.value : ''; $('#l-next').value = l ? l.next || '' : addDays(1); $('#l-mdate').value = l ? l.meetAt || '' : ''; $('#l-mtime').value = l ? l.meetTime || '' : '';
    $('#l-notes').value = l ? l.notes || '' : '';
    $('#l-rep').innerHTML = '<option value="">Me</option>' + team.map(x => `<option ${l && l.rep === x.name ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    leadStageSel = l ? l.stage : 'new'; paintLeadStage(); paintNext();
    $('#ldDel').hidden = !l; $('#leadBg').classList.add('open'); if (!l) setTimeout(() => $('#l-name').focus(), 60);
  }
  const paintLeadStage = () => { $('#l-stages').innerHTML = STAGES.map(([k, n]) => `<button type="button" class="chip ${leadStageSel === k ? 'on' : ''}" data-s="${k}">${n}</button>`).join(''); };
  const paintNext = () => document.querySelectorAll('#l-nchips .chip').forEach(c => c.classList.toggle('on', !!$('#l-next').value && addDays(+c.dataset.d) === $('#l-next').value));
  $('#l-stages').onclick = e => { const c = e.target.closest('[data-s]'); if (c) { leadStageSel = c.dataset.s; paintLeadStage(); } };
  $('#l-nchips').onclick = e => { const c = e.target.closest('[data-d]'); if (c) { $('#l-next').value = addDays(+c.dataset.d); paintNext(); } };
  $('#l-next').onchange = paintNext;
  $('#ldCancel').onclick = () => $('#leadBg').classList.remove('open');
  $('#leadBg').onclick = e => { if (e.target.id === 'leadBg') $('#leadBg').classList.remove('open'); };
  $('#ldDel').onclick = () => { if (editLeadId && confirm('Delete this lead?')) { leads = leads.filter(x => x.id !== editLeadId); saveLeads(); $('#leadBg').classList.remove('open'); render(); } };
  $('#ldSave').onclick = () => {
    const name = $('#l-name').value.trim(); if (!name) { $('#l-name').focus(); return; }
    const data = { name, phone: $('#l-phone').value.trim(), addr: $('#l-addr').value.trim(), source: $('#l-src').value.trim(), value: parseInt($('#l-val').value.replace(/[^0-9]/g, ''), 10) || 0,
      next: $('#l-next').value, meetAt: $('#l-mdate').value, meetTime: $('#l-mtime').value, notes: $('#l-notes').value.trim(), rep: $('#l-rep').value, stage: leadStageSel };
    let l; if (editLeadId) { l = leads.find(x => x.id === editLeadId); Object.assign(l, data); } else { l = { id: uid(), createdAt: todayISO(), ...data }; leads.push(l); }
    saveLeads(); $('#leadBg').classList.remove('open'); render();
    if (data.stage === 'sold' && !l.job) leadToJob(l);
  };
  function leadToJob(l) {
    pendingLead = l.id; openJob('new'); $('#j-addr').value = l.addr || ''; $('#j-name').value = l.name || ''; $('#j-contract').value = l.value || '';
  }
  function leadStageMenu(l) {
    const items = STAGES.filter(x => x[0] !== l.stage).map(([k, n]) => ({ label: (k === 'sold' ? '✅ ' : k === 'lost' ? '✖ ' : '→ ') + n, danger: k === 'lost', fn: () => { l.stage = k; saveLeads(); render(); if (k === 'sold' && !l.job) leadToJob(l); } }));
    openPick(l.name + ' · ' + stageName(l.stage), items);
  }

  // per-job money sheet
  let moneyJob = '';
  function addUpRow(u = {}) {
    const d = document.createElement('div'); d.className = 'uprow'; d.dataset.id = u.id || ''; d.dataset.at = u.at || ''; d.dataset.won = u.wonAt || '';
    d.innerHTML = `<input class="u-title" placeholder="What was offered (e.g. backsplash)" value="${esc(u.title || '')}" autocomplete="off">
      <input class="u-amt moneyin" inputmode="decimal" placeholder="$" value="${fmtAmt(u.amount)}">
      <select class="u-st"><option value="offered" ${u.status === 'offered' || !u.status ? 'selected' : ''}>Offered</option><option value="won" ${u.status === 'won' ? 'selected' : ''}>Won ✓</option><option value="lost" ${u.status === 'lost' ? 'selected' : ''}>Lost</option></select>
      <button type="button" class="s-del" aria-label="Remove">×</button>`;
    $('#upRows').appendChild(d);
  }
  function addCostRow(c = {}) {
    const d = document.createElement('div'); d.className = 'uprow costrow'; d.dataset.id = c.id || ''; d.dataset.date = c.date || '';
    d.innerHTML = `<input class="u-title c-title" placeholder="What was it (gas, materials, permit…)" value="${esc(c.title || '')}" autocomplete="off">
      <input class="u-amt c-amt moneyin" inputmode="decimal" placeholder="$" value="${fmtAmt(c.amount)}">
      <button type="button" class="s-del" aria-label="Remove">×</button>`;
    $('#costRows').appendChild(d);
  }
  function openMoney(n) { openDeal(n); }
  function openMoneyLegacy(n) {
    moneyJob = n; const j = jobs[n] || {};
    $('#mnTitle').textContent = j.addr || n; $('#mn-contract').value = fmtAmt(j.contract); $('#mn-sold').value = j.soldOn || '';
    $('#mn-seller').innerHTML = '<option value="">Me (you sold it)</option>' + team.map(x => `<option ${j.seller === x.name ? 'selected' : ''}>${esc(x.name)}</option>`).join('') + (j.seller && !team.some(x => x.name === j.seller) ? `<option selected>${esc(j.seller)}</option>` : '');
    $('#upRows').innerHTML = ''; (j.upsells || []).forEach(addUpRow);
    $('#costRows').innerHTML = ''; (j.costs || []).forEach(addCostRow); $('#mn-lead').value = j.leadPct !== undefined && j.leadPct !== '' ? j.leadPct : ''; $('#mn-lead').placeholder = cfg.leadFirst; mnRepSel = Array.isArray(j.repNames) ? j.repNames.slice() : (parseInt(j.reps, 10) > 1 ? Array.from({ length: parseInt(j.reps, 10) - 1 }, (_, i) => 'Rep ' + (i + 2)) : []); paintReps();
    mnRoom(); $('#moneyBg').classList.add('open');
  }
  function mnRoom() {
    const j = jobs[moneyJob] || {}, c = amt($('#mn-contract').value), sm = finSummary({ ...j, contract: c });
    mnNet();
    $('#mnRoom').innerHTML = sm.approved ? `💡 Approved up to <b>${money0(sm.approved)}</b>. Room left to upsell: <b>${money0(sm.room)}</b>` : '';
  }
  let mnRepSel = [];
  function paintReps() {
    const names = [...new Set([...team.map(x => x.name).filter(n => n && n !== OWNER), ...mnRepSel])];
    $('#mn-reps').innerHTML = names.map(nm => `<button type="button" class="chip ${mnRepSel.includes(nm) ? 'on' : ''}" data-r="${esc(nm)}">${esc(nm)}</button>`).join('') + '<button type="button" class="chip addsub" data-addrep="1">＋ Add a rep</button>';
    mnNet();
  }
  $('#mn-reps').onclick = e => {
    if (e.target.closest('[data-addrep]')) { const nm = (window.prompt('Rep name') || '').trim(); if (nm && !mnRepSel.includes(nm)) { mnRepSel.push(nm); paintReps(); } return; }
    const c = e.target.closest('[data-r]'); if (!c) return; const nm = c.dataset.r; mnRepSel = mnRepSel.includes(nm) ? mnRepSel.filter(x => x !== nm) : [...mnRepSel, nm]; paintReps(); };
  function mnNet() {
    const num = amt, lp = $('#mn-lead').value.trim();
    const j = { contract: num($('#mn-contract').value), seller: $('#mn-seller').value, repNames: mnRepSel.slice(), leadPct: lp === '' ? undefined : parseFloat(lp) || 0,
      upsells: [...document.querySelectorAll('#upRows .uprow')].map(r => ({ status: r.querySelector('.u-st').value, amount: num(r.querySelector('.u-amt').value) })),
      costs: [...document.querySelectorAll('#costRows .uprow')].map(r => ({ amount: num(r.querySelector('.c-amt').value) })) };
    const n = jobNet(j);
    $('#mnNet').innerHTML = (j.contract || j.upsells.length) ? `<b>Estimated pay on this job: ${money0(n.net)}</b><br><small>${money0(n.revenue)} sale − ${money0(n.lead)} lead cost − ${money0(n.costs)} expenses = ${money0(n.profit)} profit. ${n.reps > 1 ? 'Each person gets ' : 'Your share: '}${+n.pct.toFixed(2)}%${n.reps > 1 ? ' (' + cfg.split + '% ÷ ' + n.reps + ' people)' : ''}${n.over ? ' + ' + money0(n.over) + ' override' : ''}.${n.names.length ? '<br>You ' + money0(n.share) + ' · ' + n.names.map(nm => esc(nm) + ' ' + money0(n.share)).join(' · ') : ''}</small>` : '';
  }
  ['#mn-contract', '#mn-lead', '#mn-seller'].forEach(s => $(s).addEventListener('input', mnNet));
  $('#mn-seller').addEventListener('change', mnNet); $('#upRows').addEventListener('input', mnNet); $('#upRows').addEventListener('change', mnNet); $('#costRows').addEventListener('input', mnNet);
  $('#mnAddCost').onclick = () => addCostRow({});
  $('#costRows').onclick = e => { if (e.target.classList.contains('s-del')) { e.target.closest('.uprow').remove(); mnNet(); } };
  $('#mn-contract').addEventListener('input', mnRoom);
  $('#mnAddUp').onclick = () => addUpRow({});
  $('#upRows').onclick = e => { if (e.target.classList.contains('s-del')) { e.target.closest('.uprow').remove(); mnNet(); } };
  $('#mnCancel').onclick = () => $('#moneyBg').classList.remove('open');
  $('#moneyBg').onclick = e => { if (e.target.id === 'moneyBg') $('#moneyBg').classList.remove('open'); };
  $('#mnSave').onclick = () => {
    const j = jobs[moneyJob] = jobs[moneyJob] || {}, num = amt;
    j.contract = num($('#mn-contract').value); j.soldOn = $('#mn-sold').value || (j.contract ? (j.soldOn || todayISO()) : ''); j.seller = $('#mn-seller').value;
    j.upsells = [...document.querySelectorAll('#upRows .uprow')].map(r => {
      const st = r.querySelector('.u-st').value, amt = num(r.querySelector('.u-amt').value);
      return { id: r.dataset.id || uid(), title: r.querySelector('.u-title').value.trim(), amount: amt, status: st, at: r.dataset.at || todayISO(), wonAt: st === 'won' ? (r.dataset.won || todayISO()) : '' };
    }).filter(u => u.title || u.amount);
    if (mnRepSel.length) j.repNames = mnRepSel.slice(); else delete j.repNames; delete j.reps;
    const lp = $('#mn-lead').value.trim(); if (lp === '') delete j.leadPct; else j.leadPct = parseFloat(lp) || 0;
    j.costs = [...document.querySelectorAll('#costRows .costrow')].map(r => ({ id: r.dataset.id || uid(), title: r.querySelector('.c-title').value.trim(), amount: num(r.querySelector('.c-amt').value), date: r.dataset.date || todayISO() })).filter(c => c.title || c.amount);
    saveJobs(); $('#moneyBg').classList.remove('open'); render(); toast('Saved');
  };
  $('#cfgCancel').onclick = () => $('#cfgBg').classList.remove('open');
  $('#cfgBg').onclick = e => { if (e.target.id === 'cfgBg') $('#cfgBg').classList.remove('open'); };
  $('#cfgSave').onclick = () => {
    const f = v => parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0;
    cfg.split = Math.min(100, f($('#cf-pct').value)); cfg.override = f($('#cf-over').value); cfg.goal = f($('#cf-goal').value); cfg.leadFirst = f($('#cf-lead1').value); cfg.leadUp = f($('#cf-lead2').value);
    saveCfg(); $('#cfgBg').classList.remove('open'); render();
  };
  function openCfg() { $('#cf-pct').value = cfg.split; $('#cf-over').value = cfg.override; $('#cf-goal').value = cfg.goal; $('#cf-lead1').value = cfg.leadFirst; $('#cf-lead2').value = cfg.leadUp; $('#cfgBg').classList.add('open'); }

  // ---- delete a job for good ----
  function deleteJobMenu(n) {
    const j = jobs[n] || {};
    openPick('Delete ' + (j.addr || n) + '?', [
      { label: '🗑 Yes, delete it forever', danger: true, fn: () => deleteJob(n) },
      { label: j.archived ? '↩️ Reopen it instead' : '✅ Mark complete instead (just hides it)', fn: () => { j.archived = !j.archived; saveJobs(); view = 'projects'; render(); } },
    ]);
  }
  function deleteJob(n) {
    const j = jobs[n] || {};
    (j.chat || []).forEach(m => (m.attach || []).forEach(a => delFile(a.id)));
    tasks = tasks.filter(t => t.project !== n);
    leads.forEach(l => { if (l.job === n) l.job = ''; });
    delete jobs[n];
    if (window.OAF) window.OAF.deleteOK = true;
    save(); saveJobs(); saveLeads();
    view = 'projects'; tabHist = []; render(); window.scrollTo(0, 0); toast('Job deleted');
  }
  // ---- job stages ----
  let stN = '';
  function toggleStage(n, st) {
    const j = jobs[n] = jobs[n] || {}, cur = getStages(j), on = !cur.includes(st), now = new Date().toISOString();
    const next = (on ? [...cur, st] : cur.filter(x => x !== st)).sort((x, y) => JSTAGES.indexOf(x) - JSTAGES.indexOf(y));
    j.stages = next; j.stage = next[next.length - 1] || ''; j.stageAt = now;
    j.stageLog = [...(j.stageLog || []), { stage: st, on, at: now, by: OWNER || '' }];
    if (st === 'MONEY RECEIVED') { j.archived = on; if (on) toast('💰 Money received. Job moved to Completed jobs.'); }
    saveJobs(); render(); paintStages();
  }
  function paintStages() {
    const g = getStages(jobs[stN]);
    $('#stList').innerHTML = JSTAGES.map((st, i) => `<button class="strow ${g.includes(st) ? 'on' : ''}" style="--c:${SCOL[i]}" data-st="${st}"><span class="stick">${g.includes(st) ? '✓' : ''}</span><b>${st}</b></button>`).join('');
  }
  function stageMenu(n) { stN = n; paintStages(); $('#stBg').classList.add('open'); }
  $('#stList').onclick = e => { const b = e.target.closest('[data-st]'); if (b) toggleStage(stN, b.dataset.st); };
  $('#stClear').onclick = () => { const j = jobs[stN] = jobs[stN] || {}; getStages(j).slice().forEach(st => toggleStage(stN, st)); };
  $('#stDone').onclick = () => $('#stBg').classList.remove('open');
  $('#stBg').onclick = e => { if (e.target.id === 'stBg') $('#stBg').classList.remove('open'); };
  // ---- finance company per job ----
  let lnJob = '', lnIdx = -1;
  function lnPreview() {
    const j = jobs[lnJob] || {}, num = v => parseInt(String(v).replace(/[^0-9]/g, ''), 10) || 0;
    const fins = getFins(j).map(f => ({ ...f })), cur = { company: $('#ln-comp').value, amount: num($('#ln-amt').value), approved: num($('#ln-appr').value) };
    if (lnIdx >= 0) fins[lnIdx] = { ...fins[lnIdx], ...cur }; else fins.push(cur);
    const sm = finSummary({ ...j, fins });
    $('#lnRoom').innerHTML = sm.approved ? `Approved <b>${money0(sm.approved)}</b> · used <b>${money0(sm.used)}</b> · room to upsell <b>${money0(sm.room)}</b>` : 'Add the max approval to see how much room is left to upsell.';
  }
  function openLoan(n, idx) {
    lnJob = n; lnIdx = idx; const j = jobs[n] || {}, fins = getFins(j), f = idx >= 0 ? fins[idx] : null, sm = finSummary(j);
    $('#lnTitle').textContent = f ? 'Finance · ' + f.company : 'Add a finance company';
    $('#ln-comp').innerHTML = finOptions(f ? f.company : '').replace('<option value="">Not set</option>', '<option value="">Choose…</option>');
    $('#ln-stat').innerHTML = finStatusOptions(f ? f.status : 'Applied');
    $('#ln-amt').value = f ? f.amount || '' : Math.max(0, (j.contract || 0) - sm.amounts) || '';
    $('#ln-appr').value = f ? f.approved || '' : ''; $('#lnDel').hidden = !f;
    lnPreview(); $('#lnBg').classList.add('open');
  }
  ['#ln-comp', '#ln-amt', '#ln-appr'].forEach(i => { $(i).addEventListener('input', lnPreview); $(i).addEventListener('change', lnPreview); });
  $('#lnCancel').onclick = () => $('#lnBg').classList.remove('open');
  $('#lnBg').onclick = e => { if (e.target.id === 'lnBg') $('#lnBg').classList.remove('open'); };
  $('#lnDel').onclick = () => { const j = jobs[lnJob]; if (!j || lnIdx < 0 || !confirm('Remove this finance company from the job?')) return; const f = getFins(j).map(x => ({ ...x })); f.splice(lnIdx, 1); j.fins = f; j.finance = ''; j.finStatus = ''; saveJobs(); $('#lnBg').classList.remove('open'); render(); };
  $('#lnSave').onclick = () => {
    const comp = $('#ln-comp').value; if (!comp) { toast('Choose a finance company'); return; }
    const j = jobs[lnJob] = jobs[lnJob] || {}, num = v => parseInt(String(v).replace(/[^0-9]/g, ''), 10) || 0, f = getFins(j).map(x => ({ ...x, id: x.id === 'legacy' ? uid() : x.id }));
    const rec = { id: lnIdx >= 0 ? f[lnIdx].id : uid(), company: comp, status: comp === 'Cash' ? '' : $('#ln-stat').value, amount: num($('#ln-amt').value), approved: comp === 'Cash' ? 0 : num($('#ln-appr').value) };
    if (lnIdx >= 0) f[lnIdx] = rec; else f.push(rec);
    j.fins = f; j.finance = ''; j.finStatus = ''; saveJobs(); $('#lnBg').classList.remove('open'); render();
  };
  function openFin() { $('#fin-list').value = finList().join('\n'); $('#finBg').classList.add('open'); }
  $('#finCancel').onclick = () => $('#finBg').classList.remove('open');
  $('#finBg').onclick = e => { if (e.target.id === 'finBg') $('#finBg').classList.remove('open'); };
  $('#finSave').onclick = () => {
    cfg.finance = [...new Set($('#fin-list').value.split('\n').map(x => x.trim()).filter(Boolean))];
    if (!cfg.finance.length) cfg.finance = FIN_DEFAULT.slice();
    saveCfg(); $('#finBg').classList.remove('open'); render(); toast('Finance list saved');
  };
  // ---- contractors: a shared list reps pick from, grouped by trade ----
  const TRADES = [
    ['General contractor', '🏗️', '#0f2747', /general|\bgc\b|contractor/i], ['Plumbing', '🚰', '#2563eb', /plumb/i], ['Electrical', '⚡', '#ca8a04', /electr/i],
    ['HVAC', '❄️', '#0891b2', /hvac|air|heat|cool/i], ['Roofing', '🏠', '#b45309', /roof/i], ['Tile', '🔲', '#0d9488', /tile/i], ['Flooring', '🪵', '#a16207', /floor/i],
    ['Painting', '🎨', '#db2777', /paint/i], ['Drywall', '🧱', '#78716c', /drywall|sheetrock|plaster/i], ['Framing & carpentry', '🪚', '#92400e', /fram|carpent|wood/i],
    ['Concrete & masonry', '🏗', '#57534e', /concrete|mason|brick|stucco/i], ['Landscaping', '🌿', '#16a34a', /landsc|turf|garden|irrig|sprinkl/i], ['Solar', '☀️', '#d97706', /solar|panel/i],
    ['Windows & doors', '🪟', '#0284c7', /window|door|glass/i], ['Cabinets & counters', '🗄️', '#7c3aed', /cabinet|counter|granite|quartz/i], ['Demolition', '🔨', '#dc2626', /demo/i],
    ['Pool', '🏊', '#0ea5e9', /pool|spa/i], ['Permits & plans', '📋', '#475569', /permit|plan|engineer|architect|expedit/i], ['Cleaning', '🧹', '#059669', /clean|junk|haul/i], ['Other', '🔧', '#64748b', /^$/],
  ];
  const PAL = ['#0f766e', '#7c3aed', '#be123c', '#1d4ed8', '#b45309', '#4d7c0f', '#a21caf'];
  function tradeInfo(name) {
    const t = String(name || '').trim(); if (!t) return { label: 'Other', emoji: '🔧', color: '#64748b' };
    const hit = TRADES.find(x => x[0].toLowerCase() === t.toLowerCase()) || TRADES.slice(0, -1).find(x => x[3].test(t));
    if (hit) return { label: hit[0], emoji: hit[1], color: hit[2] };
    return { label: t.charAt(0).toUpperCase() + t.slice(1), emoji: '🔧', color: PAL[[...t].reduce((h, c) => h + c.charCodeAt(0), 0) % PAL.length] };
  }
  const dirKey = x => (x.name || '').trim().toLowerCase() + '|' + String(x.phone || '').replace(/\D/g, '');
  const jobsUsing = x => Object.values(jobs).filter(j => j && getSubs(j).some(sb => (sb.dirId && sb.dirId === x.id) || dirKey(sb) === dirKey(x))).length;
  function importSubsFromJobs() {
    const have = new Set(subsDir.map(dirKey)); let n = 0;
    Object.values(jobs).forEach(j => { if (!j || j.demo) return; getSubs(j).forEach(x => { if (!x.name) return; const k = dirKey(x); if (have.has(k)) return; have.add(k); subsDir.push({ id: uid(), name: x.name, trade: x.trade || '', phone: x.phone || '', company: '', notes: '', fav: false }); n++; }); });
    if (n) saveSubsDir(); return n;
  }
  let subQ = '', subTrade = 'all', pickJob = '', pickSel = new Set(), cnEditId = null, cnTradeSel = '';
  function callChoice(name, phone) {
    if (!hasPhone(phone)) { toast('No phone number saved for ' + (name || 'this person')); return; }
    openPick('Call ' + (name || ''), [
      { label: '📞 Phone call', fn: () => { location.href = 'tel:' + cleanPhone(phone); } },
      { label: '🟢 WhatsApp (opens the chat, tap its call icon)', fn: () => { location.href = 'https://wa.me/' + waNum(phone); } },
      { label: '💬 Text message', fn: () => { location.href = smsHref(phone, ''); } },
    ]);
  }
  function openSubPicker(n) {
    if (!subsDir.length) importSubsFromJobs();
    const j = jobs[n] || {}, sel = new Set();
    getSubs(j).forEach(sb => { const d = subsDir.find(x => (sb.dirId && sb.dirId === x.id) || dirKey(x) === dirKey(sb)); if (d) sel.add(d.id); });
    pickJob = n; pickSel = sel; subQ = ''; subTrade = 'all'; view = 'subs'; render(); window.scrollTo(0, 0);
  }
  function applyPick() {
    const j = jobs[pickJob] = jobs[pickJob] || {}, chosen = subsDir.filter(x => pickSel.has(x.id));
    const keepManual = getSubs(j).filter(sb => !sb.dirId && !subsDir.some(d => dirKey(d) === dirKey(sb)));
    j.subs = [...keepManual, ...chosen.map(x => ({ name: x.name, trade: x.trade || '', phone: x.phone || '', dirId: x.id }))]; j.sub = undefined; j.phone = undefined;
    saveJobs(); const n = pickJob; pickJob = ''; curJob = n; jobTab = 'info'; tabHist = ['chat']; view = 'job'; render(); window.scrollTo(0, 0);
    toast(chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'sub' : 'subs'} on this job` : 'No subs on this job');
  }
  function screenContractors() {
    const picking = !!pickJob, groups = {};
    subsDir.forEach(x => { const ti = tradeInfo(x.trade); (groups[ti.label] ||= { ti, items: [] }).items.push(x); });
    const labels = Object.keys(groups).sort((a, b) => a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b));
    if (subTrade !== 'all' && !groups[subTrade]) subTrade = 'all';
    const chips = `<div class="stagef trades"><button class="${subTrade === 'all' ? 'on' : ''}" data-act="subtrade" data-t="all">All ${subsDir.length}</button>${labels.map(l => `<button class="${subTrade === l ? 'on' : ''}" style="--c:${groups[l].ti.color}" data-act="subtrade" data-t="${esc(l)}">${groups[l].ti.emoji} ${esc(l)} ${groups[l].items.length}</button>`).join('')}</div>`;
    const card = x => { const ti = tradeInfo(x.trade), sel = pickSel.has(x.id), used = jobsUsing(x);
      return `<div class="ccard ${sel ? 'sel' : ''}" style="--c:${ti.color}" data-id="${x.id}" data-act="${picking ? 'subpick' : 'subopen'}" data-q="${esc((x.name + ' ' + (x.trade || '') + ' ' + (x.company || '') + ' ' + (x.phone || '')).toLowerCase())}">
        <span class="cav">${ti.emoji}</span>
        <span class="cbody"><b>${esc(x.name)}${x.fav ? ' <i class="favs">♥</i>' : ''}</b><small>${esc([x.company, x.phone].filter(Boolean).join(' · ') || 'No phone yet')}</small>${used ? `<small class="cused">Used on ${used} ${used === 1 ? 'job' : 'jobs'}</small>` : ''}</span>
        ${picking ? `<span class="ccheck">${sel ? '✓' : ''}</span>` : `<span class="cright"><button class="cfav ${x.fav ? 'on' : ''}" data-act="subfav" aria-label="Favorite">${x.fav ? '♥' : '♡'}</button>${hasPhone(x.phone) ? `<button class="ccall" data-act="subcall" aria-label="Call">📞</button>` : ''}</span>`}</div>`; };
    const body = labels.filter(l => subTrade === 'all' || subTrade === l).map(l => { const g = groups[l];
      return `<div class="tgroup"><div class="thead" style="--c:${g.ti.color}"><span class="temoji">${g.ti.emoji}</span><b>${esc(l)}</b><span class="tcount">${g.items.length}</span></div>${g.items.slice().sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || a.name.localeCompare(b.name)).map(card).join('')}</div>`; }).join('');
    const jb = pickJob ? (jobs[pickJob] || {}) : null;
    return (picking ? `<div class="pickbanner">Choose the subs for <b>${esc(jb.addr || pickJob)}</b>. Tap a contractor to select.</div>` : '')
      + `<div class="schat"><input id="subq" value="${esc(subQ)}" placeholder="Search by name, trade or company" autocomplete="off"></div>` + chips
      + `<div class="jobactions"><button class="jbtn primary" data-act="subnew">＋ Add contractor</button>${subsDir.length ? '' : `<button class="jbtn" data-act="subimport">⬇ Add the subs from my jobs</button>`}</div>`
      + (subsDir.length ? body : `<div class="empty small"><div class="big">🧰</div>Your contractor list is empty. Add your subs once, and every rep can pick them from here, sorted by trade.</div>`)
      + (picking ? `<div class="pickbar"><span><b>${pickSel.size}</b> selected</span><button data-act="pickdone">Add to this job</button></div>` : '');
  }
  function applySubFilter() {
    const q = subQ.trim().toLowerCase();
    document.querySelectorAll('.ccard').forEach(r => { r.style.display = !q || r.dataset.q.includes(q) ? '' : 'none'; });
    document.querySelectorAll('.tgroup').forEach(g => { g.style.display = [...g.querySelectorAll('.ccard')].some(c => c.style.display !== 'none') ? '' : 'none'; });
  }
  function contractorMenu(id) {
    const x = subsDir.find(y => y.id === id); if (!x) return; const used = Object.entries(jobs).filter(([, j]) => j && getSubs(j).some(sb => (sb.dirId && sb.dirId === x.id) || dirKey(sb) === dirKey(x))).map(([n]) => n);
    const items = [{ label: '📞 Call or message ' + x.name, fn: () => callChoice(x.name, x.phone) }, { label: '✎ Edit', fn: () => openContractor(x.id) }];
    used.slice(0, 5).forEach(n => items.push({ label: '📁 ' + ((jobs[n] || {}).addr || n), fn: () => { curJob = n; jobTab = 'chat'; tabHist = []; view = 'job'; render(); } }));
    openPick(`${tradeInfo(x.trade).emoji} ${x.name}`, items);
  }
  function paintTradeChips() {
    $('#cn-trades').innerHTML = TRADES.map(t => `<button type="button" class="chip ${cnTradeSel.toLowerCase() === t[0].toLowerCase() ? 'on' : ''}" data-tr="${esc(t[0])}">${t[1]} ${esc(t[0])}</button>`).join('');
  }
  function openContractor(id) {
    cnEditId = id || null; const x = id ? subsDir.find(y => y.id === id) : null;
    $('#cnTitle').textContent = x ? 'Edit contractor' : 'Add contractor';
    $('#cn-name').value = x ? x.name : ''; $('#cn-phone').value = x ? x.phone || '' : ''; $('#cn-co').value = x ? x.company || '' : ''; $('#cn-notes').value = x ? x.notes || '' : '';
    cnTradeSel = x ? tradeInfo(x.trade).label : (subTrade !== 'all' ? subTrade : ''); $('#cn-trade').value = x && !TRADES.some(t => t[0] === tradeInfo(x.trade).label) ? x.trade : '';
    paintTradeChips(); $('#cnDel').hidden = !x; $('#cnBg').classList.add('open'); if (!x) setTimeout(() => $('#cn-name').focus(), 60);
  }
  $('#cn-trades').onclick = e => { const c = e.target.closest('[data-tr]'); if (c) { cnTradeSel = c.dataset.tr; $('#cn-trade').value = ''; paintTradeChips(); } };
  $('#cn-trade').addEventListener('input', () => { cnTradeSel = ''; paintTradeChips(); });
  $('#cnCancel').onclick = () => $('#cnBg').classList.remove('open');
  $('#cnBg').onclick = e => { if (e.target.id === 'cnBg') $('#cnBg').classList.remove('open'); };
  $('#cnDel').onclick = () => { if (cnEditId && confirm('Remove this contractor from the list? Jobs keep their copy.')) { subsDir = subsDir.filter(y => y.id !== cnEditId); pickSel.delete(cnEditId); saveSubsDir(); $('#cnBg').classList.remove('open'); render(); } };
  $('#cnSave').onclick = () => {
    const name = $('#cn-name').value.trim(); if (!name) { $('#cn-name').focus(); return; }
    const trade = ($('#cn-trade').value.trim() || cnTradeSel || '');
    const data = { name, trade, phone: $('#cn-phone').value.trim(), company: $('#cn-co').value.trim(), notes: $('#cn-notes').value.trim() };
    if (cnEditId) Object.assign(subsDir.find(y => y.id === cnEditId), data); else { const rec = { id: uid(), fav: false, ...data }; subsDir.push(rec); if (pickJob) pickSel.add(rec.id); }
    saveSubsDir(); $('#cnBg').classList.remove('open'); render(); toast('Saved');
  };
  const subDirectory = () => subsDir;
  const screenSubs = screenContractors;

  // ---- WhatsApp-style group info screens ----
  let todayScope = 'now'; let tabHist = [], mediaTab = 'media', chatSearch = false, pendingJump = null;
  const waNum = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '1' + d : d; };
  function goTab(t) { if (t !== jobTab) tabHist.push(jobTab); jobTab = t; chatSearch = false; render(); window.scrollTo(0, 0); }
  function backTab() { jobTab = tabHist.pop() || 'chat'; chatSearch = false; render(); if (jobTab !== 'chat') window.scrollTo(0, 0); }
  function defaultGroupPhones(j) { return getSubs(j).filter(x => hasPhone(x.phone)).map(x => cleanPhone(x.phone)); }
  // A job's group has only the people you added to it (plus the rep who sold it and reps on its sales). Subs are listed separately.
  // reps on a rep-sold file: the one who sold it plus the others you add. Your override is paid once per file, so it is split between them on each rep's board.
  const jobReps = j => (j && j.seller) ? [...new Set([j.seller, ...(j.repNames || [])])] : [];
  // everyone named anywhere on the file (seller, reps on the first sale, reps on any upsell): the file shows on each of their boards
  const fileReps = j => j ? [...new Set([j.seller, ...(j.repNames || []), ...(j.upsells || []).flatMap(u => u.repNames || [])].filter(Boolean))] : [];
  const repOn = (j, rep) => fileReps(j).includes(rep);
  const soldDay = j => (j && (j.soldOn || (j.stageAt ? String(j.stageAt).slice(0, 10) : ''))) || '';
  const defaultMemberIds = j => { const names = new Set(fileReps(j)); return team.filter(x => names.has(x.name)).map(x => x.id); };
  const memberIds = j => Array.isArray(j.members) ? j.members : defaultMemberIds(j);
  function membersOf(n) { const j = jobs[n] || {}, ids = memberIds(j); return team.filter(x => ids.includes(x.id)).map(x => ({ ...x, kind: 'team' })); }
  // once you've chosen members by hand, a rep you pick on a sale joins the job too
  function syncMembers(j) { if (!Array.isArray(j.members)) return; defaultMemberIds(j).forEach(id => { if (!j.members.includes(id)) j.members.push(id); }); }
  function openPick(title, items) {
    $('#pickTitle').textContent = title;
    $('#pickList').innerHTML = items.map((it, i) => `<button class="pickbtn ${it.danger ? 'dng' : ''}" data-i="${i}">${esc(it.label)}</button>`).join('');
    $('#pickList').onclick = ev => { const b = ev.target.closest('[data-i]'); if (!b) return; $('#pickBg').classList.remove('open'); items[+b.dataset.i].fn(); };
    $('#pickBg').classList.add('open');
  }
  const label2 = x => `${x.name}${x.role ? ' · ' + x.role : ''}`;
  function callPeople(n) {
    const m = [...membersOf(n), ...getSubs(jobs[n]).map(x => ({ ...x, role: x.trade || 'Sub', kind: 'sub' }))].filter(x => hasPhone(x.phone));
    if (!m.length) { toast('Add a phone number first (Edit job, or My team in More)'); return; }
    if (m.length === 1) { callChoice(m[0].name, m[0].phone); return; }
    openPick('Who do you want to call?', m.map(x => ({ label: '📞 ' + label2(x), fn: () => callChoice(x.name, x.phone) })));
  }
  function personMenu(x, extra = []) {
    const items = [];
    if (hasPhone(x.phone)) items.push({ label: '📞 Call ' + x.name, fn: () => { location.href = 'tel:' + cleanPhone(x.phone); } },
      { label: '💬 Text ' + x.name, fn: () => { location.href = smsHref(x.phone, ''); } },
      { label: '🟢 WhatsApp ' + x.name, fn: () => { location.href = 'https://wa.me/' + waNum(x.phone); } });
    else items.push({ label: 'No phone number saved', fn: () => {} });
    openPick(label2(x), [...items, ...extra]);
  }
  function memberMenu(n, i) {
    const x = membersOf(n)[i]; if (!x) return; const j = jobs[n] = jobs[n] || {};
    personMenu(x, [{ label: 'Remove from this job', danger: true, fn: () => { j.members = memberIds(j).filter(id => id !== x.id); saveJobs(); render(); toast(x.name + ' removed'); } }]);
  }
  function subMenu(n, i) {
    const x = getSubs(jobs[n])[i]; if (!x) return;
    personMenu({ ...x, role: x.trade || 'Sub' }, [{ label: '✎ Edit subs on this job', fn: () => openEdit(n) }]);
  }
  function addMemberMenu(n) {
    const j = jobs[n] = jobs[n] || {}, ids = memberIds(j), out = team.filter(x => !ids.includes(x.id));
    const items = out.map(x => ({ label: '＋ ' + label2(x), fn: () => { j.members = [...memberIds(j), x.id]; saveJobs(); render(); toast(x.name + ' added'); } }));
    items.push({ label: '＋ New partner or sales rep…', fn: () => { teamFromMsg = false; openTeam(); addTeamRow({ role: 'Sales rep' }); } });
    openPick(out.length ? 'Add to this job' : 'Everyone on your team is already here', items);
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
    const j = jobs[n] || {}, mem = membersOf(n), subsL = getSubs(j), media = jobMedia(n), starred = timeline(n).filter(x => x.star && x.kind !== 'sys').length;
    const openN = tasks.filter(t => !t.done && t.project === n).length, links = linksOf(n).length;
    const avatar = x => `<span class="mav" style="background:${nameColor(x.name)}">${esc((x.name || '?').trim()[0].toUpperCase())}</span>`;
    return `<div class="sbar"><button class="sback" data-act="back" aria-label="Back">‹</button><div class="sright"><button class="spill" data-act="editjobd">✎ Edit</button></div></div>
      <div class="ginfo"><div class="gavatar"><svg viewBox="0 0 24 24" width="54" height="54" fill="currentColor"><path d="M16 11a3 3 0 100-6 3 3 0 000 6zM8 11a3 3 0 100-6 3 3 0 000 6zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div>
        <h2 class="gtitle">${esc(j.addr || n)}</h2>
        <div class="gsub">Group · <b>${mem.length + 1 + BOTS.length} members</b></div>
        <div class="gsub2">${esc(n)}</div></div>
      <div class="gactions">
        <button data-act="callall"><i>📞</i>Call</button>
        <button data-act="${j.addr ? 'navjob' : 'editjobd'}"><i>🧭</i>Navigate</button>
        <button data-act="addmember"><i>＋</i>Add</button>
        <button data-act="search"><i>🔍</i>Search</button></div>
      ${(() => { const mm = jobNet(j); return `<button class="moneycard" data-act="moneyjob" data-p="${esc(n)}">${j.contract ? `<span class="mcl">Contract <b>${money0(j.contract)}</b></span><span class="mcr">You keep <b>${money0(mm.net)}</b></span><small>${j.seller && !asRep ? 'Sold by ' + esc(jobReps(j).join(' + ')) + ' · your ' + cfg.override + '% override' : money0(mm.lead) + ' lead cost · ' + money0(mm.costs) + ' expenses' + (mm.reps > 1 ? ' · split ' + mm.reps + ' ways' : '')} · tap to edit</small>` : '<span class="mcl"><b>💵 Add the contract amount</b></span><small>See what you keep after lead cost and expenses</small>'}</button>`; })()}
      <div class="ssec">Media</div><div class="scard">
        ${srow('🖼️', 'Media, links and docs', media.length + links, 'jtab', 'data-tab="media"')}
        ${srow('⭐', 'Starred messages', starred, 'jtab', 'data-tab="starred"')}
        ${srow('✅', 'To-do &amp; checklists', openN ? openN + ' open' : '✓', 'jtab', 'data-tab="tasks"')}
        ${srow('📍', 'Job stages', getStages(j).length ? esc(getStages(j).join(' + ')) : 'Set', 'stagepick')}
        ${srow('👤', 'Sold by', esc(jobReps(j).join(' + ') || (asRep ? asRep : 'Me')), 'soldby')}
        ${srow('💵', 'Contract &amp; upsells', j.contract ? money0(j.contract) : 'Add', 'moneyjob', `data-p="${esc(n)}"`)}
        ${srow('📝', 'Job summary', '', 'summary')}</div>
      <div class="ssec">Financing</div><div class="scard">
        ${(() => { const sm = finSummary(j);
          const rows = sm.fins.map((f, i) => { const pc = f.approved ? Math.min(100, Math.round((f.amount || 0) / f.approved * 100)) : 0;
            return `<button class="srow" data-act="finrow" data-i="${i}"><span class="sico">🏦</span><span class="slbl"><b>${esc(f.company)}</b><small>${esc(f.status || (f.company === 'Cash' ? 'Paid in cash' : 'No status'))}${f.approved ? ' · approved up to ' + money0(f.approved) : ''}</small>${f.approved ? `<span class="fbar"><i style="width:${pc}%"></i></span>` : ''}</span><span class="sval">${f.amount ? money0(f.amount) : 'Add $'}</span><span class="schev">›</span></button>`; }).join('');
          const box = sm.approved ? `<div class="roombox"><div class="rtop"><span>💡 Room to upsell</span><b>${money0(sm.room)}</b></div><div class="rsub">Approved ${money0(sm.approved)} · used ${money0(sm.used)}${sm.offered ? ` · ${money0(sm.offered)} already offered, <b>${money0(sm.toPitch)}</b> left to pitch` : ''}</div></div>` : (sm.fins.length ? `<div class="roombox dim"><div class="rsub">Tap a finance company and add the <b>max approval</b> to see how much room is left to upsell.</div></div>` : '');
          return rows + box; })()}
        <button class="srow addm" data-act="finadd"><span class="sico">＋</span><span class="slbl">Add finance company</span></button></div>
      <div class="ssec">${mem.length + 1 + BOTS.length} members</div><div class="scard">
        <div class="mrow me">${`<span class="mav" style="background:#0f2747">${esc((OWNER || 'Y')[0])}</span>`}<span class="mbody"><b>${esc(OWNER || 'You')}</b><small>You</small></span></div>
        ${mem.map((x, i) => `<div class="mrow" data-act="member" data-i="${i}">${avatar(x)}<span class="mbody"><b>${esc(x.name)}</b><small>${esc(x.role || '')}${x.phone ? ' · ' + esc(x.phone) : ' · no phone'}</small></span>${hasPhone(x.phone) ? `<a class="mcall" href="tel:${esc(cleanPhone(x.phone))}" data-name="${esc(x.name)}" data-phone="${esc(x.phone)}" aria-label="Call">📞</a>` : ''}<button type="button" class="mrm" data-act="memberrm" data-i="${i}" aria-label="Remove person">✕</button></div>`).join('')}
        ${BOTS.map(b => `<div class="mrow"><span class="mav" style="background:#ff6a1a">🤖</span><span class="mbody"><b>${esc(b.name)}</b><small>${esc(b.role)}</small></span></div>`).join('')}
        <button class="srow addm" data-act="addmember"><span class="sico">＋</span><span class="slbl">Add a partner or rep to this job</span></button></div>
      <div class="ssec">${subsL.length} ${subsL.length === 1 ? 'sub' : 'subs'} on this job</div><div class="scard">
        ${subsL.map((x, i) => `<div class="mrow" data-act="subrow" data-i="${i}"><span class="mav sq" style="background:${nameColor(x.name)}">🔧</span><span class="mbody"><b>${esc(x.name)}</b><small>${esc(x.trade || 'Sub')}${x.phone ? ' · ' + esc(x.phone) : ' · no phone'}</small></span>${hasPhone(x.phone) ? `<a class="mcall" href="tel:${esc(cleanPhone(x.phone))}" data-name="${esc(x.name)}" data-phone="${esc(x.phone)}" aria-label="Call">📞</a>` : ''}<button type="button" class="mrm" data-act="subrm" data-i="${i}" aria-label="Remove sub">✕</button></div>`).join('')}
        <button class="srow addm" data-act="addsub"><span class="sico">＋</span><span class="slbl">Add sub</span></button></div>
      <div class="ssec">Job settings</div><div class="scard">
        ${srow('💰', 'Upsell potential', j.upsell ? money(j.upsell) : 'Set', 'upsell', `data-p="${esc(n)}"`)}
        ${srow('🚗', 'Site check every', (j.every || 5) + ' days', 'editjobd')}
        ${srow('🕒', 'Last site check', j.last ? agoText(j.last) : 'none', 'editjobd')}
        ${srow(j.archived ? '↩️' : '✅', j.archived ? 'Reopen this job' : 'Mark job complete', '', 'archive')}
        <button class="srow danger" data-act="deljob"><span class="sico">🗑</span><span class="slbl">Delete this job</span></button>
        ${srow('🔗', 'WhatsApp group link', j.wa ? 'Open' : 'Add', j.wa ? 'openwa' : 'editjobd')}
        ${srow('📤', 'Send chat messages via', sendVia === 'wa' ? 'WhatsApp' : 'Messages', 'togvia')}</div>`;
  }
  let showDoneT = false;
  function screenTasks(n) {
    const all = tasks.filter(t => t.project === n), chk = all.filter(t => t.ord !== undefined).sort((a, b) => a.ord - b.ord);
    const todo = all.filter(t => !t.done && t.ord === undefined).sort(cmp), doneT = all.filter(t => t.done && t.ord === undefined);
    const dn = chk.filter(t => t.done).length, next = chk.find(t => !t.done), O = { hide: true };
    let h = sbar(0, 'To-do &amp; checklists', `<button class="spill primary" data-act="addto" data-p="${esc(n)}">＋ Task</button>`);
    if (!chk.length) h += `<div class="roombox dim kickcard"><div class="rtop"><span>🏈 No Game Day plan on this job yet</span></div><div class="rsub">Add the 3-day playbook: the 8–9 AM kickoff, the evening call, the upsell push, and the day-3 check.</div><button class="jbtn primary wide" data-act="addkick">Add the Game Day plan</button></div>`;
    else {
      const pc = Math.round(dn / chk.length * 100);
      h += `<div class="chkhead"><div class="ring" style="--p:${pc}"><b>${dn}/${chk.length}</b></div><div class="chkt"><b>🏈 Game Day</b><small>${dn === chk.length ? '🎉 All done. Nice work!' : dn ? `${chk.length - dn} steps to go` : 'Let’s get this job started'}</small></div></div>`;
      if (next) h += `<div class="task nextcard" data-id="${next.id}"><div class="nlabel">NEXT STEP</div><div class="ntitle" data-act="edit">${catOf(next.cat) ? catOf(next.cat).icon + ' ' : ''}${esc(next.title)}</div><div class="nwhen">${next.due ? fmtDate(next.due) + (next.allDay ? ' · open all day' : next.time ? ' · ' + fmtRange(next.time, next.timeEnd) : '') : ''}</div>${next.link && ({ video: 1, photo: 1, stage: 1 })[next.link] ? `<button class="ngo" data-act="tlink" data-l="${next.link}">${({ video: '🎥 Record the video', photo: '📸 Take the pictures', stage: '📍 Update the stage' })[next.link]}</button>` : ''}<button class="ndone" data-act="toggle">✓ Mark done</button></div>`;
      const days = []; chk.forEach(t => { const k = t.allDay ? (t.due || '') + '|all' : (t.due || '') + '|' + (t.time || '') + '|' + (t.timeEnd || ''); let g = days.find(x => x.k === k); if (!g) days.push(g = { k, due: t.due, time: t.time, timeEnd: t.timeEnd, allDay: t.allDay, gd: t.gd, items: [] }); g.items.push(t); });
      days.forEach(g => { const d = g.items.filter(t => t.done).length, eve = g.time && g.time >= '17:00';
        const lab = g.allDay ? 'open all day' : g.time ? fmtRange(g.time, g.timeEnd) : '';
        h += `<div class="dayh"><span>${eve ? '🌙' : g.allDay ? '📌' : '☀️'} ${g.gd ? 'Day ' + g.gd + ' · ' : ''}${g.due ? fmtDate(g.due) : 'No date'}${lab ? ' · ' + lab : ''}</span><em>${d}/${g.items.length}</em></div>` + g.items.map(t => taskHTML(t, { hide: true, nodate: true })).join(''); });
    }
    h += `<div class="ssec">To-do · ${todo.length} open</div>` + (todo.length ? todo.map(t => taskHTML(t, O)).join('') : `<div class="empty small">Nothing on your list. Tap ＋ Task to add one.</div>`);
    if (doneT.length) h += `<button class="older" data-act="showdonet">${showDoneT ? 'Hide' : 'Show'} ${doneT.length} finished ${doneT.length === 1 ? 'task' : 'tasks'}</button>` + (showDoneT ? doneT.map(t => taskHTML(t, O)).join('') : '');
    return h;
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
  const hm = t => { const [h, m] = t.split(':').map(Number); return { h, m, ap: h < 12 ? 'AM' : 'PM', s: `${h % 12 || 12}:${pad(m)}` }; };
  function fmtRange(a, b) { if (!a) return ''; const x = hm(a); if (!b) return x.s + ' ' + x.ap; const y = hm(b); return x.ap === y.ap ? `${x.s}–${y.s} ${y.ap}` : `${x.s} ${x.ap} – ${y.s} ${y.ap}`; }
  const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const cmp = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99:99').localeCompare(b.time || '99:99') || (b.star ? 1 : 0) - (a.star ? 1 : 0) || (a.ord ?? 99) - (b.ord ?? 99) || a.title.localeCompare(b.title);

  // compact, calm task rows: one line of title, a small date, and a single ⋯ menu for the extras
  function taskHTML(t, opts) {
    const t0 = todayISO(), c = catOf(t.cat), o = (opts && typeof opts === 'object') ? opts : {}, nw = nowHM();
    let dcls = !t.done && t.due ? (t.due < t0 ? 'late' : t.due === t0 ? 'today' : '') : '';
    const inWin = !t.done && t.due === t0 && t.time && t.timeEnd && !t.allDay && nw >= t.time && nw < t.timeEnd;
    const passed = !t.done && t.due === t0 && t.timeEnd && !t.allDay && nw >= t.timeEnd;
    if (passed) dcls = 'late';
    const when = !t.due ? 'No date' : (t.allDay ? fmtDate(t.due) + ' · open all day' + (t.time ? ' (ideal ' + fmtRange(t.time) + ')' : '') : fmtDate(t.due) + (t.time ? ' · ' + fmtRange(t.time, t.timeEnd) : ''));
    const missed = t.carry && !t.done && t.due && t.due < t0;
    const links = { video: '🎥 Record the video', photo: '📸 Take the pictures', stage: '📍 Update the stage' };
    return `<div class="task ${t.done ? 'done' : ''} ${t.star ? 'starred' : ''} ${inWin ? 'nowrow' : ''}" data-id="${t.id}">
      <button class="check" data-act="toggle" aria-label="Mark done">${t.done ? '✓' : ''}</button>
      <div class="body" data-act="edit">
        <div class="title">${t.star && !t.done ? '<i class="tst">★</i> ' : ''}${c ? `<span class="tic">${c.icon}</span> ` : ''}${esc(t.title)}</div>
        <div class="meta">${inWin ? '<span class="nowpill">NOW</span>' : ''}${missed ? '<span class="misspill">Missed. Do it today</span>' : ''}${t.project && !o.hide ? `<span class="proj">${esc(t.project)}</span>` : ''}${o.nodate ? '' : `<span class="date ${dcls}">${when}</span>`}</div>
        ${t.notes ? `<div class="notes">${esc(t.notes)}</div>` : ''}
        ${t.link && links[t.link] && !t.done ? `<button class="tlink" data-act="tlink" data-l="${t.link}">${links[t.link]}</button>` : ''}
      </div>
      ${t.done ? '' : `<button class="tmore" data-act="tmenu" aria-label="More">⋯</button>`}
    </div>`;
  }
  function taskMenu(id) {
    const t = tasks.find(x => x.id === id); if (!t) return;
    const base = t.due && t.due > todayISO() ? t.due : todayISO();
    openPick(t.title.length > 40 ? t.title.slice(0, 38) + '…' : t.title, [
      { label: t.star ? '☆ Remove priority' : '⭐ Mark as priority', fn: () => { t.star = !t.star; save(); render(); } },
      { label: '⏰ Move to tomorrow', fn: () => { const prev = t.due; t.due = addDays(1, base === todayISO() ? todayISO() : base); save(); render(); toast('Moved to ' + fmtDate(t.due), () => { t.due = prev; save(); render(); }); } },
      { label: '📅 Move to next week', fn: () => { t.due = addDays(7); save(); render(); toast('Moved to ' + fmtDate(t.due)); } },
      { label: '✎ Edit', fn: () => openSheet(t.id) },
      { label: '🗑 Delete task', danger: true, fn: () => { tasks = tasks.filter(x => x.id !== t.id); save(); render(); toast('Task deleted'); } },
    ]);
  }


  // ---- map of jobs and leads (Leaflet + OpenStreetMap data) ----
  const SOCAL = [[32.3, -120.7], [35.7, -114.2]], HOME_KEY = 'oaf-home-v1', DAY_KEY = 'oaf-day-v1';
  let cmpSel = [], lmap = null, mapView = null, pinLayer = null, geoBusy = false, myPos = null, nearOn = false, dayStops = [];
  try { dayStops = JSON.parse(localStorage.getItem(DAY_KEY)) || []; } catch {}
  const saveDay = () => { try { localStorage.setItem(DAY_KEY, JSON.stringify(dayStops)); } catch {} };
  const getHome = () => { try { return JSON.parse(localStorage.getItem(HOME_KEY)) || { lat: 34.0522, lng: -118.2437, name: 'Los Angeles' }; } catch { return { lat: 34.0522, lng: -118.2437, name: 'Los Angeles' }; } };
  const appleMaps = addr => 'https://maps.apple.com/?dirflg=d&daddr=' + encodeURIComponent(addr);
  const milesBetween = (a, b) => { const R = 3958.8, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng), h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  function mapItems() {
    const out = [];
    Object.keys(jobs).filter(n => jobs[n] && !jobs[n].archived && !jobs[n].demo && jobs[n].addr && (!asRep || repOn(jobs[n], asRep))).forEach(n => { const j = jobs[n], i = stageIdx(j); out.push({ k: 'job:' + n, kind: 'job', key: n, title: j.addr, sub: n, addr: j.addr, rec: j, save: saveJobs, color: i >= 0 ? SCOL[i] : '#94a3b8' }); });
    leads.filter(l => isOpenLead(l) && l.addr && (!asRep || l.rep === asRep)).forEach(l => out.push({ k: 'lead:' + l.id, kind: 'lead', key: l.id, title: l.name || l.addr, sub: l.addr, addr: l.addr, rec: l, save: saveLeads, color: '#f59e0b' }));
    return out;
  }
  const mapPlaced = it => it.rec.lat != null && it.rec.geoAddr === it.addr;
  function mapStatus() {
    const el = document.getElementById('mapStatus'); if (!el) return;
    const all = mapItems(), placed = all.filter(mapPlaced).length, fail = all.filter(i => !mapPlaced(i) && i.rec.geoFail === i.addr).length;
    el.textContent = !all.length ? 'No addresses yet. Add an address to a job or lead and it appears here.' : placed + ' of ' + all.length + ' placed' + (geoBusy ? ' · finding the rest…' : '') + (fail ? ' · ' + fail + " couldn't be found (check the address)" : '');
  }
  async function geocodeList(list, stillOn, step) {
    if (geoBusy) return; geoBusy = true; mapStatus();
    try {
      for (const it of list.filter(i => !mapPlaced(i) && i.rec.geoFail !== i.addr)) {
        if (!stillOn()) break;
        let d = []; try { const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&viewbox=-121,36,-113,32&q=' + encodeURIComponent(it.addr)); d = await r.json(); } catch { break; }
        if (d && d[0]) { it.rec.lat = +d[0].lat; it.rec.lng = +d[0].lon; it.rec.geoAddr = it.addr; delete it.rec.geoFail; } else it.rec.geoFail = it.addr;
        it.save(); step(); mapStatus();
        await new Promise(r => setTimeout(r, 1100));
      }
    } catch {}
    geoBusy = false; mapStatus();
  }
  const geocodeMissing = () => geocodeList(mapItems(), () => view === 'map', drawPins);
  let holdAt = 0, pulseKey = null; const HOLD_MS = 650;
  function buzz() {
    try { if (navigator.vibrate) navigator.vibrate(40); } catch {}
    try { const h = document.getElementById('hapt'); if (h) { const i = h.querySelector('input'); h.click(); if (i) i.checked = !i.checked; } } catch {}
  }
  function drawPins() {
    if (!lmap || !pinLayer) return; pinLayer.clearLayers();
    const items = mapItems().filter(mapPlaced), anchored = cmpSel.length > 0, mk = {};
    items.forEach(it => {
      const sel = cmpSel.indexOf(it.k), icon = L.divIcon({ className: 'pinwrap', html: `<span class="pin ${it.kind}${sel >= 0 ? ' sel' : ''}" style="background:${it.color}">${sel >= 0 ? '<b>' + (sel === 0 ? 'A' : sel) + '</b>' : ''}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] });
      const m = L.marker([it.rec.lat, it.rec.lng], { icon, keyboard: false }).addTo(pinLayer); mk[it.k] = m;
      const el = m.getElement();
      if (el && pulseKey === it.k) el.classList.add('pulse');
      if (el) {
        let t = null, x0 = 0, y0 = 0;
        const stop = () => { clearTimeout(t); t = null; };
        el.addEventListener('contextmenu', ev => ev.preventDefault());
        el.addEventListener('pointerdown', ev => { x0 = ev.clientX; y0 = ev.clientY; stop(); t = setTimeout(() => { t = null; holdAt = Date.now(); buzz(); pulseKey = it.k; setTimeout(() => { pulseKey = null; }, 800); cmpSel = [it.k]; toast('Starting point: ' + it.title + '. Now tap other pins.'); drawPins(); }, HOLD_MS); });
        el.addEventListener('pointermove', ev => { if (t && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) stop(); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => el.addEventListener(n, stop));
      }
      if (anchored) { m.on('click', () => { if (Date.now() - holdAt < 700) return; const i = cmpSel.indexOf(it.k); if (i === 0) cmpSel = []; else if (i > 0) cmpSel.splice(i, 1); else if (cmpSel.length < 4) cmpSel.push(it.k); else toast('Up to 3 pins from your starting point'); drawPins(); }); return; }
      const org = myPos || getHome();
      m.bindPopup(`<b>${esc(it.title)}</b><br><small>${esc(it.kind === 'job' ? it.sub : it.addr)}</small><div class="drv popdrv" data-f="${org.lat},${org.lng}" data-t="${it.rec.lat},${it.rec.lng}"><small>Checking drive time…</small></div><div class="pbtns"><button data-act="mapnav" data-a="${esc(it.addr)}">🧭 Go</button><button data-act="mapday" data-k="${esc(it.k)}">＋ Day</button><button data-act="mapopen" data-k="${esc(it.k)}">Open</button></div>`);
    });
    const pts = cmpSel.map(k => items.find(i => i.k === k)).filter(Boolean);
    for (let j = 1; j < pts.length; j++) L.polyline([[pts[0].rec.lat, pts[0].rec.lng], [pts[j].rec.lat, pts[j].rec.lng]], { color: '#ff6a1a', weight: 3, dashArray: '2 7', interactive: false }).addTo(pinLayer);
    pts.slice(1).forEach(p => driveInfo(pts[0].rec, p.rec).then(r => { if (mk[p.k] && lmap) mk[p.k].bindTooltip('🚗 ' + fmtDrive(r.s), { permanent: true, direction: 'top', offset: [0, -10], className: 'drvtip' }).openTooltip(); }).catch(() => {}));
    paintCmp(pts);
  }
  function paintCmp(pts) {
    const box = document.getElementById('cmpBox'); if (!box) return;
    if (!cmpSel.length) { box.innerHTML = ''; return; }
    if (!pts) pts = cmpSel.map(k => mapItems().find(i => i.k === k)).filter(i => i && mapPlaced(i));
    if (!pts.length) { box.innerHTML = ''; return; }
    const rows = pts.slice(1).map((p, n) => `<div class="srow"><span class="sico">${n + 1}</span><span class="slbl"><b>${esc(p.title)}</b><small><span class="drv" data-f="${pts[0].rec.lat},${pts[0].rec.lng}" data-t="${p.rec.lat},${p.rec.lng}">…</span> from ${esc(pts[0].title)}</small></span><button class="spill" data-act="mapnav" data-a="${esc(p.addr)}">🧭 Go</button></div>`);
    box.innerHTML = `<div class="ssec">From: ${esc(pts[0].title)} (A)</div>${rows.length ? `<div class="scard">${rows.join('')}</div>` : '<div class="hint">Now tap other pins to see how long it takes to get there.</div>'}<div class="mapbar2"><button data-act="mapcmpday">＋ Add to My day</button><button data-act="mapcmpclear">✖ Clear</button></div>`;
    fillDrive(box);
  }
  function addBaseLayer(map) {
    let base = null;
    if (window.maplibregl && L.maplibreGL) { try { base = L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/bright', attribution: '© OpenFreeMap © OpenMapTiles · Data © OpenStreetMap' }).addTo(map); } catch { base = null; } }
    if (!base) L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, detectRetina: true, attribution: '© OpenStreetMap contributors' }).addTo(map);
  }
  function initMap() {
    const box = document.getElementById('jmap'); if (!box) return;
    if (lmap) { try { lmap.remove(); } catch {} lmap = null; }
    if (!window.L) {
      box.innerHTML = '<div class="empty small"><div class="big">🗺️</div>Loading the map…</div>';
      ensureMapLibs().then(() => { if (view === 'map') initMap(); }).catch(() => { box.innerHTML = '<div class="empty small"><div class="big">🗺️</div>The map needs an internet connection to load. Try again in a moment.</div>'; });
      return;
    }
    box.innerHTML = ''; lmap = L.map(box, { zoomControl: true, attributionControl: true });
    if (mapView) lmap.setView(mapView.c, mapView.z, { animate: false }); else lmap.fitBounds(SOCAL);
    lmap.on('moveend', () => { if (lmap) mapView = { c: lmap.getCenter(), z: lmap.getZoom() }; });
    addBaseLayer(lmap);
    const h = getHome(); L.circle([h.lat, h.lng], { radius: 300 * 1609.34, color: '#0f2747', weight: 1.5, dashArray: '6 6', fillOpacity: 0.03, interactive: false }).addTo(lmap);
    L.marker([h.lat, h.lng], { icon: L.divIcon({ className: 'pinwrap', html: '<span class="pin home">🏠</span>', iconSize: [26, 26], iconAnchor: [13, 13] }), interactive: false }).addTo(lmap);
    pinLayer = L.layerGroup().addTo(lmap); fillDrive();
    lmap.on('popupopen', ev => { fillDrive(ev.popup.getElement()); ev.popup.getElement().querySelectorAll('[data-act]').forEach(b => { b.onclick = () => { mapAct(b.dataset.act, b); }; }); });
    drawPins(); mapStatus(); geocodeMissing();
    setTimeout(() => lmap && lmap.invalidateSize(), 150);
  }
  let mapLibsP = null;
  function ensureMapLibs() {
    if (window.L && window.maplibregl && L.maplibreGL) return Promise.resolve();
    const css = href => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); };
    const js = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    return mapLibsP || (mapLibsP = (async () => {
      css('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'); css('https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css');
      await js('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
      try { await js('https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js'); await js('https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js'); } catch {}
    })().catch(e => { mapLibsP = null; throw e; }));
  }
  function destroyMap() { if (lmap) { try { lmap.remove(); } catch {} lmap = null; } if (view !== 'map') { mapView = null; cmpSel = []; } }
  function dayList() {
    const all = mapItems(), items = dayStops.map(k => all.find(i => i.k === k)).filter(i => i && mapPlaced(i));
    let cur = myPos || getHome(), left = items.slice(), out = [];
    while (left.length) { left.sort((x, y) => milesBetween(cur, x.rec) - milesBetween(cur, y.rec)); const n = left.shift(); out.push({ it: n, mi: milesBetween(cur, n.rec), from: cur }); cur = n.rec; }
    return out;
  }
  const driveCache = {};
  const fmtDrive = s => { const m = Math.max(1, Math.round(s / 60)), h = Math.floor(m / 60); return (h ? h + ' hr ' + (m % 60) + ' min' : m + ' min'); };
  async function driveInfo(f, t) {
    const key = [f.lat, f.lng, t.lat, t.lng].map(x => (+x).toFixed(4)).join(',');
    if (driveCache[key]) return driveCache[key];
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${f.lng},${f.lat};${t.lng},${t.lat}?overview=false`);
    const d = await r.json(); const rt = d && d.routes && d.routes[0]; if (!rt) throw new Error('no route');
    return (driveCache[key] = { s: rt.duration, mi: rt.distance / 1609.34 });
  }
  async function fillDrive(root) {
    const els = [...(root || document).querySelectorAll('.drv:not([data-done])')];
    for (const el of els) {
      const [fa, fo] = el.dataset.f.split(',').map(Number), [ta, to] = el.dataset.t.split(',').map(Number);
      try { const r = await driveInfo({ lat: fa, lng: fo }, { lat: ta, lng: to }); el.textContent = '🚗 ' + fmtDrive(r.s) + ' · ' + Math.round(r.mi) + ' mi'; el.dataset.s = r.s; el.dataset.done = '1'; }
      catch { el.textContent = ''; el.dataset.done = '1'; }
    }
    const tot = document.getElementById('dayTot');
    if (tot) { const legs = [...document.querySelectorAll('.drv.day')]; const secs = legs.reduce((s, e) => s + (+e.dataset.s || 0), 0); tot.textContent = legs.length && secs ? ' · about ' + fmtDrive(secs) + ' of driving' : ''; }
  }
  function mapAct(act, el) {
    if (act === 'mapcmpclear') { cmpSel = []; return drawPins(); }
    if (act === 'mapcmpday') { cmpSel.forEach(k => { if (!dayStops.includes(k)) dayStops.push(k); }); saveDay(); cmpSel = []; toast('Added to My day'); return render(); }
      if (act === 'mapnav') return window.open(appleMaps(el.dataset.a), '_blank');
      if (act === 'mapfit') { mapView = null; if (lmap) lmap.fitBounds(SOCAL); return; }
      if (act === 'mapopen') { const [kd, ...r] = el.dataset.k.split(':'), id = r.join(':'); if (kd === 'job') { curJob = id; jobTab = 'chat'; tabHist = []; chatSearch = false; chatLimit = 300; view = 'job'; render(); } else { view = 'leads'; render(); } return; }
      if (act === 'mapday') { if (!dayStops.includes(el.dataset.k)) { dayStops.push(el.dataset.k); saveDay(); } toast('Added to My day'); const keep = lmap && { c: lmap.getCenter(), z: lmap.getZoom() }; render(); if (keep && lmap) lmap.setView(keep.c, keep.z, { animate: false }); return; }
      if (act === 'mapundo') { dayStops = dayStops.filter(k => k !== el.dataset.k); saveDay(); return render(); }
      if (act === 'mapclear') { dayStops = []; saveDay(); return render(); }
      if (act === 'maplocate') { if (!navigator.geolocation) return toast('Location is not available'); navigator.geolocation.getCurrentPosition(p => { myPos = { lat: p.coords.latitude, lng: p.coords.longitude }; nearOn = true; render(); if (lmap) lmap.setView([myPos.lat, myPos.lng], 9); }, () => toast('Allow location for this site in Settings to use Near me'), { enableHighAccuracy: false, timeout: 10000 }); return; }
      if (act === 'maphome') return openPick('Set your home base', [{ label: '📍 Use my current location', fn: () => { if (!navigator.geolocation) return toast('Location is not available'); navigator.geolocation.getCurrentPosition(p => { try { localStorage.setItem(HOME_KEY, JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude, name: 'My location' })); } catch {} render(); }, () => toast('Allow location for this site in Settings')); } }, { label: '🏙️ Los Angeles', fn: () => { try { localStorage.setItem(HOME_KEY, JSON.stringify({ lat: 34.0522, lng: -118.2437, name: 'Los Angeles' })); } catch {} render(); } }, { label: '🌴 Palm Springs', fn: () => { try { localStorage.setItem(HOME_KEY, JSON.stringify({ lat: 33.8303, lng: -116.5453, name: 'Palm Springs' })); } catch {} render(); } }, { label: '⛱️ San Diego', fn: () => { try { localStorage.setItem(HOME_KEY, JSON.stringify({ lat: 32.7157, lng: -117.1611, name: 'San Diego' })); } catch {} render(); } }]);
  }
  function mapHTML() {
    const day = dayList(), h = getHome();
    const near = nearOn && myPos ? mapItems().filter(mapPlaced).map(i => ({ i, mi: milesBetween(myPos, i.rec) })).sort((x, y) => x.mi - y.mi).slice(0, 10) : [];
    return `<div class="mapbar"><button data-act="mapfit">🗺️ All SoCal</button><button data-act="maplocate">📍 Near me</button><button data-act="maphome">🏠 Home: ${esc(h.name)}</button></div>
      <div id="jmap" class="jmap"></div><div class="mapnote" id="mapStatus"></div><div class="mapnote">💡 Hold a pin for a moment, then tap other pins to see how long it takes to get there.</div><div id="cmpBox"></div>
      <div class="mapkey"><span><i style="background:#f59e0b"></i>Lead</span><span><i style="background:#2563eb"></i>Job</span><span><i style="background:#16a34a"></i>Late stage</span><span>Dashed circle = 300 mi from home</span></div>
      ${near.length ? `<div class="ssec">Closest to you</div><div class="scard">${near.map(x => `<button class="srow" data-act="mapopen" data-k="${esc(x.i.k)}"><span class="sico">${x.i.kind === 'job' ? '💼' : '☎️'}</span><span class="slbl"><b>${esc(x.i.title)}</b><small>${esc(x.i.kind === 'job' ? x.i.sub : x.i.addr)}</small></span><span class="sval">${Math.round(x.mi)} mi</span><span class="schev">›</span></button>`).join('')}</div>` : ''}
      <div class="ssec">My day${day.length ? ' · ' + day.length + ' stops' : ''}<span id="dayTot"></span></div>
      ${day.length ? `<div class="scard">${day.map((x, n) => `<div class="srow"><span class="sico">${n + 1}</span><span class="slbl"><b>${esc(x.it.title)}</b><small><span class="drv day" data-f="${x.from.lat},${x.from.lng}" data-t="${x.it.rec.lat},${x.it.rec.lng}">…</span> from ${n ? 'previous stop' : myPos ? 'you' : 'home'}</small></span><button class="spill" data-act="mapnav" data-a="${esc(x.it.addr)}">🧭 Go</button><button class="cx" data-act="mapundo" data-k="${esc(x.it.k)}" aria-label="Remove">×</button></div>`).join('')}</div><button class="jbtn wide" data-act="mapclear">Clear my day</button>` : '<div class="hint">Tap a pin and choose <b>＋ Day</b>. The app orders your stops from nearest to farthest and shows the drive time between them. Times do not include live traffic. Apple Maps shows traffic when you tap Go.</div>'}`;
  }

  // ---- my reps: table, then one rep's jobs, map and what you earn from them ----
  let repName = '', repMap = null;
  const repNames = () => { const s = new Set(team.map(x => x.name).filter(n => n && n !== OWNER)); Object.values(jobs).forEach(j => { if (j && !j.demo) fileReps(j).forEach(x => s.add(x)); }); return [...s].sort((x, y) => x.localeCompare(y)); };
  const repJobs = rep => Object.entries(jobs).filter(([, j]) => j && !j.demo && repOn(j, rep));
  function lastAct(j) {
    const t = x => { const v = x ? new Date(x).getTime() : 0; return isNaN(v) ? 0 : v; };
    return Math.max(...(j.chat || []).map(m => t(m.at)), t(j.stageAt), t(j.soldOn && j.soldOn + 'T12:00:00'), t(j.last && j.last + 'T12:00:00'), 0);
  }
  const agoDays = ts => ts ? Math.floor((Date.now() - ts) / 864e5) : null;
  const agoTxt = d => d === null ? 'No activity yet' : d <= 0 ? 'Active today' : d === 1 ? 'Active yesterday' : d + ' days ago';
  function repStats(rep, range) {
    const o = { deals: 0, sold: 0, mine: 0, open: 0, quiet: 0, life: 0, total: 0 };
    repJobs(rep).forEach(([, j]) => {
      o.total++;
      if (!j.archived) { o.open++; const d = agoDays(lastAct(j)); if (d === null || d >= 7) o.quiet++; }
      if (j.contract && jobReps(j).includes(rep)) { const n = jobReps(j).length, m = j.contract * cfg.override / 100 / n; o.life += m; if (inR(soldDay(j), range)) { o.deals++; o.sold += j.contract / n; o.mine += m; } }
    });
    return o;
  }
  function screenReps() {
    $('#h1').textContent = 'My reps'; $('#sub').textContent = 'Their jobs, and your ' + cfg.override + '% from each';
    const range = periodRange(moneyPer), names = repNames(), rows = names.map(nm => ({ nm, s: repStats(nm, range) })).sort((a, b) => b.s.mine - a.s.mine || a.nm.localeCompare(b.nm));
    const tot = rows.reduce((t, r) => ({ open: t.open + r.s.open, sold: t.sold + r.s.sold, mine: t.mine + r.s.mine, quiet: t.quiet + r.s.quiet }), { open: 0, sold: 0, mine: 0, quiet: 0 });
    const seg = (k, l) => `<button class="${moneyPer === k ? 'on' : ''}" data-act="mper" data-t="${k}">${l}</button>`;
    if (!names.length) return `<div class="empty"><div class="big">👥</div>No reps yet.<br>Add them under More → 👥 My team, then pick them in <b>Sold by</b> on a job's first sale.</div>`;
    return `<div class="seg">${seg('month', 'This month')}${seg('last', 'Last month')}${seg('year', 'This year')}</div>
      <div class="bigcard"><div class="bl">You earn from your reps</div><div class="bn">${money0(tot.mine)}</div><div class="bs">${money0(tot.sold)} sold by ${names.length} ${names.length === 1 ? 'rep' : 'reps'} · ${tot.open} open ${tot.open === 1 ? 'job' : 'jobs'}${tot.quiet ? ' · <b class="red">' + tot.quiet + ' quiet</b>' : ''}</div></div>
      <div class="reptable"><div class="rth"><span>Rep</span><span>Open</span><span>Sold</span><span>Your ${cfg.override}%</span></div>
      ${rows.map(r => `<button class="rtr" data-act="repopen" data-r="${esc(r.nm)}"><span class="rn"><b>${esc(r.nm)}</b><small>${r.s.quiet ? '<em class="red">' + r.s.quiet + ' quiet 7+ days</em>' : r.s.open ? 'All active' : 'No open jobs'}</small></span><span>${r.s.open}</span><span>${money0(r.s.sold)}</span><span class="mine">${money0(r.s.mine)}</span></button>`).join('')}
      <div class="rtr tot"><span class="rn"><b>Total</b></span><span>${tot.open}</span><span>${money0(tot.sold)}</span><span class="mine">${money0(tot.mine)}</span></div></div>
      <div class="hint">Tap a rep to open their app: their jobs, tasks, money and map, the same screens you use. A job counts for a rep when you pick them in <b>Sold by</b>.</div>`;
  }
  function screenRep() {
    const nm = repName, range = periodRange(moneyPer), s = repStats(nm, range), per = { month: 'this month', last: 'last month', year: 'this year' }[moneyPer];
    $('#h1').textContent = nm; $('#sub').textContent = 'Jobs and what you earn from this rep';
    const seg = (k, l) => `<button class="${moneyPer === k ? 'on' : ''}" data-act="mper" data-t="${k}">${l}</button>`;
    const rows = repJobs(nm).map(([n, j]) => ({ n, j, d: agoDays(lastAct(j)) })), open = rows.filter(r => !r.j.archived).sort((a, b) => (b.d === null ? 999 : b.d) - (a.d === null ? 999 : a.d)), done = rows.filter(r => r.j.archived);
    const card = r => { const g = getStages(r.j), i = stageIdx(r.j), nr = Math.max(1, jobReps(r.j).length), mine = jobReps(r.j).includes(nm) ? (r.j.contract || 0) * cfg.override / 100 / nr : 0, quiet = !r.j.archived && (r.d === null || r.d >= 7);
      return `<button class="repjob" data-act="openjob" data-p="${esc(r.n)}"><span class="rjtop"><b>${esc(r.j.addr || r.n)}</b><span class="rjmoney">${r.j.contract ? money0(r.j.contract) : 'No contract'}</span></span>
        <span class="rjmid"><span class="stg" style="--c:${i >= 0 ? SCOL[i] : '#94a3b8'}">${g.length ? esc(g.length <= 2 ? g.join(' + ') : g[0] + ' + ' + (g.length - 1) + ' more') : 'No stage yet'}</span><span class="${quiet ? 'red' : 'muted'}">${agoTxt(r.d)}</span></span>
        <span class="rjmid"><span class="muted">${esc(r.n)}${fileReps(r.j).length > 1 ? ' · with ' + esc(fileReps(r.j).filter(x => x !== nm).join(', ')) : ''}</span><span class="rjmine">${r.j.contract && mine ? 'You get ' + money0(mine) + (nr > 1 ? ' (1% ÷ ' + nr + ')' : '') : ''}</span></span></button>`; };
    const ph = (team.find(x => x.name === nm) || {}).phone;
    return `<div class="seg">${seg('month', 'This month')}${seg('last', 'Last month')}${seg('year', 'This year')}</div>
      <div class="bigcard"><div class="bl">You earn from ${esc(nm)} ${per}</div><div class="bn">${money0(s.mine)}</div><div class="bs">${s.deals} ${s.deals === 1 ? 'job' : 'jobs'} sold · ${money0(s.sold)} in contracts<br>All time: ${money0(s.life)} · ${s.open} open ${s.open === 1 ? 'job' : 'jobs'}${s.quiet ? ' · ' + s.quiet + ' quiet' : ''}</div></div>
      ${ph ? `<div class="mapbar"><button class="mcall" data-name="${esc(nm)}" data-phone="${esc(ph)}">📞 Call ${esc(nm)}</button></div>` : ''}
      <div class="ssec">Where their jobs are</div><div id="repmap" class="jmap"></div><div class="mapnote" id="repMapNote"></div>
      <div class="ssec">Open jobs · ${open.length}</div>${open.length ? open.map(card).join('') : '<div class="hint">No open jobs for this rep.</div>'}
      ${done.length ? `<div class="ssec">Completed · ${done.length}</div>${done.map(card).join('')}` : ''}`;
  }
  function initRepMap() {
    const box = document.getElementById('repmap'); if (!box) return;
    if (repMap) { try { repMap.remove(); } catch {} repMap = null; }
    if (!window.L) {
      box.innerHTML = '<div class="empty small"><div class="big">🗺️</div>Loading the map…</div>';
      ensureMapLibs().then(() => { if (view === 'rep') initRepMap(); }).catch(() => { box.innerHTML = '<div class="empty small"><div class="big">🗺️</div>The map needs an internet connection.</div>'; });
      return;
    }
    box.innerHTML = ''; repMap = L.map(box, { zoomControl: true }); addBaseLayer(repMap);
    const layer = L.layerGroup().addTo(repMap), mine = () => mapItems().filter(i => i.kind === 'job' && repOn(jobs[i.key] || {}, repName));
    const draw = () => {
      if (!repMap) return; layer.clearLayers(); const pts = [];
      mine().filter(mapPlaced).forEach(it => {
        pts.push([it.rec.lat, it.rec.lng]); const j = jobs[it.key], g = getStages(j);
        L.marker([it.rec.lat, it.rec.lng], { icon: L.divIcon({ className: 'pinwrap', html: `<span class="pin job" style="background:${it.color}"></span>`, iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(layer)
          .bindPopup(`<b>${esc(it.title)}</b><br><small>${esc(g.length ? g.join(' + ') : 'No stage yet')}${j.contract ? ' · ' + money0(j.contract) : ''}</small><div class="pbtns"><button data-act="mapnav" data-a="${esc(it.addr)}">🧭 Go</button><button data-act="mapopen" data-k="${esc(it.k)}">Open</button></div>`);
      });
      if (pts.length !== repMap._n) { repMap._n = pts.length; if (pts.length) repMap.fitBounds(pts, { padding: [40, 40], maxZoom: 11 }); else repMap.fitBounds(SOCAL); }
      const all = mine(), n = all.filter(mapPlaced).length, note = document.getElementById('repMapNote'); if (note) note.textContent = !all.length ? 'No addresses yet for this rep.' : n + ' of ' + all.length + ' placed' + (n < all.length ? ' · finding the rest…' : '');
    };
    repMap.on('popupopen', ev => { ev.popup.getElement().querySelectorAll('[data-act]').forEach(b => { b.onclick = () => mapAct(b.dataset.act, b); }); });
    draw(); geocodeList(mine(), () => view === 'rep', draw); setTimeout(() => repMap && repMap.invalidateSize(), 150);
  }
  function destroyRepMap() { if (repMap) { try { repMap.remove(); } catch {} repMap = null; } }

  // "View as a rep": every screen shows only that rep's jobs, tasks and leads, with their pay worked out the same way as yours.
  function paintAsBar() { const b = $('#asbar'); if (!b) return; b.hidden = !asRep; if (asRep) $('#asName').textContent = asRep; }
  function render() {
    if (!asRep) { renderCore(); paintAsBar(); return; }
    const J = jobs, T = tasks, L = leads, jr = Object.fromEntries(Object.entries(J).filter(([, j]) => j && repOn(j, asRep)));
    jobs = jr; tasks = T.filter(t => t.project && jr[t.project]); leads = L.filter(l => l.rep === asRep); swapping = true;
    try { renderCore(); } finally { jobs = J; tasks = T; leads = L; swapping = false; }
    paintAsBar();
  }
  function renderCore() {
    const t0 = todayISO();
    const open = tasks.filter(t => !t.done).sort(cmp);
    const open_ = n => open.filter(t => t.project === n);
    let html = '', stats = '';

    if (view === 'today') {
      const h = new Date().getHours();
      $('#h1').textContent = `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${OWNER ? ', ' + OWNER : ''}`;
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
      const ldA = leadsDue().length;
      const evlink = (ldA && filter === 'all' ? `<button class="alert warn" data-go="leads">☎️ <b>${ldA}</b> ${ldA === 1 ? 'lead' : 'leads'} to follow up<span>Open ›</span></button>` : '') + `<button class="evlink" data-go="evening">🌙 <b>Evening review</b><span>Open ›</span></button>`;
      if (!html) html = !tasks.length && !Object.keys(jobs).length && filter === 'all'
        ? `<div class="welcome"><div class="wbig">👋</div><h3>Welcome</h3><p>This is a work-in-progress app for managing jobs, subs, and the team chat. Take a look around and tell us what you think.</p>
            <button class="jbtn primary wide" data-act="demoload">✨ Load sample jobs</button>
            <button class="jbtn wide" data-act="feedback">💬 Send feedback</button>
            <div class="hint">Sample jobs are made-up examples. You can remove them anytime from the Projects tab.</div></div>`
        : `<div class="empty"><div class="big">✓</div>${filter === 'all' ? 'Nothing due. Tap + to add a task.' : 'Nothing here.'}</div>`;
      if (filter === 'all') { const k = html.startsWith('<button class="alert"') ? html.indexOf('</button>') + 9 : 0; html = html.slice(0, k) + evlink + html.slice(k); }
      // scope switch: due now / next 7 days / every open task
      const week = open.filter(t => t.due && t.due > t0 && t.due <= addDays(7)), welcome = html.includes('class="welcome"');
      if (todayScope === 'week') {
        stats = ''; $('#sub').textContent = week.length ? `${week.length} ${week.length === 1 ? 'task' : 'tasks'} in the next 7 days` : 'Nothing coming up this week';
        html = ''; let last = null; week.forEach(t => { if (t.due !== last) { html += `<div class="section-title">${fmtDate(t.due)}</div>`; last = t.due; } html += taskHTML(t); });
        if (!week.length) html = `<div class="empty"><div class="big">📅</div>No tasks due in the next 7 days.</div>`;
      } else if (todayScope === 'all') {
        stats = ''; $('#sub').textContent = `${open.length} open ${open.length === 1 ? 'task' : 'tasks'} across ${new Set(open.map(t => t.project || '')).size} ${new Set(open.map(t => t.project || '')).size === 1 ? 'job' : 'jobs'}`;
        html = ''; const by = {}; open.forEach(t => (by[t.project || ''] ||= []).push(t));
        Object.keys(by).sort((a, b) => (a ? (jobs[a] || {}).addr || a : '~').localeCompare(b ? (jobs[b] || {}).addr || b : '~')).forEach(k => {
          html += `<div class="section-title">${k ? esc((jobs[k] || {}).addr || k) : 'Not tied to a job'}${k && (jobs[k] || {}).addr ? ` <span class="sname">· ${esc(k)}</span>` : ''}</div>` + by[k].map(taskHTML).join('');
        });
        if (!open.length) html = `<div class="empty"><div class="big">✓</div>No open tasks. Tap + to add one.</div>`;
      } else if (!welcome && !need && filter === 'all' && !html.includes('class="task')) {
        html = html.replace(/<div class="empty">[\s\S]*?<\/div>/, `<div class="empty"><div class="big">✓</div>Nothing due today.${open.length ? ` You have <b>${open.length}</b> open ${open.length === 1 ? 'task' : 'tasks'}: tap <b>All open</b> above to see them.` : ' Tap + to add a task.'}</div>`);
      }
      if (!welcome) html = `<div class="seg scope"><button class="${todayScope === 'now' ? 'on' : ''}" data-act="tscope" data-t="now">Due now ${need || ''}</button><button class="${todayScope === 'week' ? 'on' : ''}" data-act="tscope" data-t="week">Next 7 days ${week.length || ''}</button><button class="${todayScope === 'all' ? 'on' : ''}" data-act="tscope" data-t="all">All open ${open.length || ''}</button></div>` + html;
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
    } else if (view === 'leads') {
      const dueN = leadsDue().length;
      $('#h1').textContent = 'Leads'; $('#sub').textContent = dueN ? `${dueN} to follow up today` : 'Your pipeline';
      html += screenLeads();
    } else if (view === 'subs') {
      $('#h1').textContent = pickJob ? 'Pick your subs' : 'Contractors'; $('#sub').textContent = pickJob ? 'Select as many as you need' : 'Your subs, sorted by trade';
      html += screenContractors();
    } else if (view === 'money') {
      $('#h1').textContent = 'Money'; $('#sub').textContent = 'Commissions, overrides and upsells';
      html += screenMoney();
    } else if (view === 'more') {
      const lateV = visitList().filter(v => v.state === 'late').length;
      $('#h1').textContent = 'More'; $('#sub').textContent = 'Tools and settings';
      html += `<div class="scard">
        ${srow('🚗', 'Site visits', lateV ? `<b class="red">${lateV} overdue</b>` : '', 'go', 'data-v="visits"')}
        ${srow('🗓️', 'Upcoming tasks', '', 'go', 'data-v="upcoming"')}
        ${srow('☎️', 'Leads pipeline', leadsDue().length ? `<b class="red">${leadsDue().length} to follow up</b>` : '', 'go', 'data-v="leads"')}
        ${srow('🏦', 'Finance companies', '', 'finedit')}
        ${srow('👥', 'My reps', repNames().length ? repNames().length + ' reps' : '', 'go', 'data-v="reports"')}
        ${srow('🌙', 'Evening review', '', 'go', 'data-v="evening"')}</div>
        <div class="ssec">Settings</div><div class="tools">
        <button id="teamBtn">👥 My team</button>
        <button id="cloudBtn">☁️ Cloud · ${window.OAFsync ? window.OAFsync.label() : '…'}</button>
        <button id="exportBtn">⬇ Back up</button>
        <button id="importBtn">⬆ Restore</button>
        <button id="demoBtn">${Object.values(jobs).some(j => j && j.demo) ? '🧹 Remove sample jobs' : '✨ Add sample jobs'}</button>
        <button id="fbBtn">💬 Send feedback</button>
        <button id="updateBtn">🔄 Update app</button>
        <button id="clearDone">🧹 Clear completed</button>
        <input type="file" id="importFile" accept="application/json" hidden></div>
        <div class="hint">Your data is stored on this phone${window.OAFsync && window.OAFsync.label() === 'Synced' ? ' and in the cloud' : ' only. Back up now and then'}. Photos, videos and files are not in the backup yet.<br>Version ${APP_VERSION}</div>`;
    } else if (view === 'reports') {
      html += screenReps();
    } else if (view === 'rep') {
      html += screenRep();
    } else if (view === 'deal') {
      html += screenDeal();
    } else if (view === 'map') {
      $('#h1').textContent = 'Job map'; $('#sub').textContent = 'Every job and lead in Southern California';
      html += mapHTML();
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
      $('#h1').textContent = 'Jobs';
      const allNames = activeProjects(), names = stageF === 'all' ? allNames : allNames.filter(n => getStages(jobs[n]).includes(stageF));
      if (allNames.length > 1 || stageF !== 'all') {
        const cnt = st => allNames.filter(n => getStages(jobs[n]).includes(st)).length;
        html += `<div class="stagef"><button class="${stageF === 'all' ? 'on' : ''}" data-act="stagef" data-s="all">All ${allNames.length}</button>${JSTAGES.map((st, i) => cnt(st) ? `<button class="${stageF === st ? 'on' : ''}" style="--c:${SCOL[i]}" data-act="stagef" data-s="${st}">${st} ${cnt(st)}</button>` : '').join('')}</div>`;
      }
      $('#sub').textContent = names.length ? `${names.length} active ${names.length === 1 ? 'job' : 'jobs'}` : 'No active jobs yet';
      const cityOf = n => { const a = (jobs[n]?.addr || '').split(',').map(x => x.trim()).filter(Boolean); return a.length > 1 ? a[1] : (a.length ? 'Other' : ''); };
      const sections = {};
      names.forEach(n => (sections[cityOf(n) || 'No address yet'] ||= []).push(n));
      const secNames = Object.keys(sections).sort((a, b) => a === 'No address yet' ? 1 : b === 'No address yet' ? -1 : a.localeCompare(b));
      if (!names.length) html = `<div class="empty"><div class="big">📁</div>No jobs yet. Tap New job sold to add one.</div>`;
      const folder = n => {
        const j = jobs[n] || {}, mine = open.filter(t => t.project === n);
        const late = mine.filter(t => t.due && t.due < t0).length, nxt = mine[0];
        return `<button class="folder ${late ? 'hasLate' : ''}" data-act="openjob" data-p="${esc(n)}">
            <span class="ficon">${j.archived ? '✅' : '📁'}</span>
            <span class="fbody">
              <span class="faddr ${j.addr ? '' : 'none'}">${esc(j.addr || 'No address yet')}</span>
              <span class="fclient">${esc(n)}</span>
              ${getStages(j).length ? `<span class="stgchips">${getStages(j).map(st => `<span class="stgchip" style="--c:${SCOL[JSTAGES.indexOf(st)]}">${esc(st)}</span>`).join('')}</span>` : ''}
              ${getSubs(j).length ? `<span class="subchips">${subChips(j)}</span>` : ''}
              <span class="fmeta">${mine.length} open${late ? ` · <em>${late} late</em>` : nxt && nxt.due ? ' · next ' + fmtDate(nxt.due) : ''}${getFins(j).length ? ` · <span class="fintag">🏦 ${esc(finTag(j))}</span>` : ''}</span>
            </span>
            <span class="fright">${j.upsell ? `<span class="pup set">${money(j.upsell)}</span>` : ''}<i>›</i></span>
          </button>`;
      };
      secNames.forEach(city => {
        html += `<div class="section-title">${esc(city)}</div>`;
        sections[city].sort((a, b) => (jobs[a]?.addr || a).localeCompare(jobs[b]?.addr || b)).forEach(n => { html += folder(n); });
      });
      const doneJobs = Object.keys(jobs).filter(k => jobs[k] && jobs[k].archived).sort();
      if (doneJobs.length) html += `<button class="older" data-act="showdone">${showDoneJobs ? 'Hide' : 'Show'} completed jobs (${doneJobs.length})</button>` + (showDoneJobs ? doneJobs.map(folder).join('') : '');
      html = `<button class="jbtn wide oldbtn" data-act="oldjob">📥 Add a job that's already in progress</button>` + html;
    }
    $('#stats').innerHTML = stats; $('#stats').hidden = !stats;
    const SUBS = ['visits', 'calendar', 'deal', 'upcoming', 'reports', 'rep', 'leads'];
    $('#jobbar').hidden = !['today', 'projects'].includes(view);
    $('#back').hidden = !(view === 'job' || view === 'evening' || SUBS.includes(view) || (view === 'subs' && pickJob));
    $('#back').textContent = view === 'rep' ? '‹ My reps' : view === 'deal' ? '‹ Back' : view === 'evening' ? '‹ Today' : view === 'job' ? '‹ Jobs' : view === 'subs' && pickJob ? '‹ Job' : '‹ More';
    const lateN = visitList().filter(v => v.state === 'late').length;
    $('#mbadge').textContent = lateN || ''; $('#mbadge').hidden = !lateN;
    const ldN = leadsDue().length; $('#lbadge').textContent = ldN || ''; $('#lbadge').hidden = !ldN;
    const inPlay = [...new Set(open.map(t => t.project).filter(Boolean))].reduce((a, n) => a + (jobs[n]?.upsell || 0), 0);
    $('#pot').innerHTML = inPlay ? `Upsell potential in play <b>${money(inPlay)}</b>` : 'Add upsell potential to each job';
    $('#main').innerHTML = html;
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === ({ job: 'projects', visits: 'more', calendar: 'more', deal: dealFrom === 'money' ? 'money' : 'projects', upcoming: 'more', reports: 'more', leads: 'more', subs: 'subs', evening: 'today' }[view] || view)));
    const inChat = view === 'job' && jobTab === 'chat';
    $('#composer').hidden = !inChat; $('#chatHead').hidden = !inChat; $('#fab').hidden = !!asRep || view === 'job' || view === 'map' || view === 'deal' || view === 'rep' || view === 'reports';
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
    hydrateMedia(); if (view === 'subs') applySubFilter();
    if (view === 'map') initMap(); else destroyMap();
    if (view === 'rep') initRepMap(); else destroyRepMap();
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
  const saveTeam = () => { try { localStorage.setItem(TEAM_KEY, JSON.stringify(team)); } catch {} changed(); };
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
    team = [...document.querySelectorAll('#teamRows .subrow')].map(r => ({ id: '', name: r.querySelector('.s-name').value.trim(), role: r.querySelector('.s-trade').value.trim(), phone: r.querySelector('.s-phone').value.trim() })).filter(x => x.name).map(x => ({ ...x, id: ((team.find(o => o.name === x.name && o.phone === x.phone) || {}).id) || uid() }));
    saveTeam(); closeTeam(); toast(`${team.length} ${team.length === 1 ? 'person' : 'people'} saved`);
  };

  const TEMPLATES = [
    ['📷 Photos', (n, a) => `Hi team, it's ${OWNER || 'me'}. Can you send photos or a quick video of the current work at ${n}${a}? Please include anything about to get covered up. Thanks!`],
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
  $('#vClose').onclick = () => { $('#viewer').hidden = true; $('#vBody').innerHTML = ''; $('#vBody').dataset.tok = ''; if (pdfObs) pdfObs.disconnect(); };
  $('#vBody').addEventListener('click', e => { if (e.target.closest('[data-vopen]')) openExternal($('#viewer').dataset.mid, $('#viewer').dataset.name); });
  $('#vShare').onclick = () => shareFile($('#viewer').dataset.mid, $('#viewer').dataset.name);
  $('#cQuick').onclick = () => doAction('quick');
  $('#cBack').onclick = () => { view = 'projects'; tabHist = []; render(); window.scrollTo(0, 0); };
  $('#cTitle').onclick = () => goTab('info');
  $('#cStage').onclick = () => stageMenu(curJob);
  $('#todoOpen').onclick = () => goTab('tasks');
  $('#todoDone').onclick = () => { const t = nextStep(curJob); if (!t) return; t.done = true; t.doneOn = todayISO(); t.doneAt = new Date().toISOString(); save(); render(); toast('Done: ' + t.title, () => { t.done = false; t.doneOn = null; t.doneAt = null; save(); render(); }); };
  $('#cCall').onclick = () => callPeople(curJob);
  function doAction(a) {
    $('#apanel').hidden = true; layoutComposer();
    const j = jobs[curJob] || {}, ad = j.addr ? ' (' + j.addr + ')' : '';
    if (a === 'cam') $('#fCam').click();
    else if (a === 'vid') $('#fVid').click();
    else if (a === 'lib') $('#fLib').click();
    else if (a === 'doc') $('#fDoc').click();
    else if (a === 'expense') openExpense(curJob);
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
    } else if (a === 'import') { openImport(); }
    else if (a === 'note') {
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
    if (e.target.id === 'subq') { subQ = e.target.value; applySubFilter(); return; }
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
      [A]: { demo: true, stage: 'PRE UPSELL', stages: ['IN PROGRESS', 'PRE UPSELL'], stageLog: [{ stage: 'PRE NTP', at: ago(160) }, { stage: 'POST NTP', at: ago(150) }, { stage: 'IN PROGRESS', at: ago(140) }], fins: [{ id: 'demo-f1', company: 'Aqua', status: 'Approved', amount: 24500, approved: 38000 }], addr: '123 Main St, Palm Springs, CA', upsell: 30000, contract: 24500, soldOn: d(-6),
        upsells: [{ id: 'demo-u1', title: 'Backsplash', amount: 3200, status: 'won', at: d(-3), wonAt: d(-3) }, { id: 'demo-u2', title: 'Under-cabinet lighting', amount: 1800, status: 'offered', at: d(-1) }, { id: 'demo-u3', title: 'Hallway flooring', amount: 5400, status: 'offered', at: d(-1) }], last: d(-6), kind: 'visit', every: 5, kick: d(-6),
        subs: [{ name: 'Carlos', trade: 'Plumber', phone: '760 555 0101' }, { name: 'Mike', trade: 'Electrician', phone: '760 555 0102' }],
        chat: [{ id: 'demo-m1', at: ago(50), kind: 'out', text: 'Hi team, it\'s ' + (OWNER || 'me') + '. Can you send photos of the current work at Martinez kitchen? Thanks!', to: ['Carlos', 'Mike'] },
               { id: 'demo-m2', at: ago(48), kind: 'in', who: 'Carlos', text: 'Rough-in is done. Sending photos in a bit. Tile arrives Thursday.', star: true },
               { id: 'demo-m3', at: ago(47), kind: 'in', who: 'Mike', text: 'Panel upgrade is scheduled for Friday. Customer asked about adding under-cabinet lighting.' },
               { id: 'demo-m4', at: ago(3), kind: 'out', text: 'Great. Martinez wants a backsplash too. Let\'s price it.' }],
        notes: [{ id: 'demo-n1', at: ago(30), text: 'Customer mentioned she may want new flooring in the hallway.' }] },
      [B]: { demo: true, stage: 'PRE UPSELL', stages: ['PRE UPSELL'], stageLog: [{ stage: 'PRE UPSELL', at: ago(40) }], fins: [{ id: 'demo-f2', company: 'Cash', status: '', amount: 11800, approved: 0 }], addr: '45 Oak Ave, Barstow, CA', upsell: 12000, contract: 11800, soldOn: d(-8), seller: 'Sam (rep)', last: d(-2), kind: 'photos', every: 5, kick: d(-8),
        subs: [{ name: 'Dave', trade: 'Tile', phone: '760 555 0103' }],
        chat: [{ id: 'demo-m5', at: ago(20), kind: 'in', who: 'Dave', text: 'Shower pan is in. Waiting on the inspector.' }] },
      [C]: { demo: true, stage: 'PRE NTP', stages: ['PRE NTP'], stageLog: [{ stage: 'PRE NTP', at: ago(10) }], fins: [{ id: 'demo-f3', company: 'Homerun', status: 'Applied', amount: 0, approved: 60000 }, { id: 'demo-f4', company: 'Figure', status: 'Approved', amount: 0, approved: 25000 }], addr: '900 Sunset Blvd, San Bernardino, CA', upsell: 45000, kick: d(1), every: 5,
        subs: [{ name: 'Tony', trade: 'General', phone: '909 555 0104' }], chat: [] },
    };
    const D = (n, trade, phone, co, fav) => ({ id: 'demo-c' + n, demo: true, name: n, trade, phone, company: co || '', notes: '', fav: !!fav });
    subsDir = [...subsDir.filter(x => !x.demo), D('Carlos Ramirez', 'Plumbing', '760 555 0101', 'Ramirez Plumbing', 1), D('Mike Dunn', 'Electrical', '760 555 0102', 'Dunn Electric'), D('Tony Vega', 'General contractor', '909 555 0104', 'Vega Builders', 1),
      D('Dave Kim', 'Tile', '760 555 0103', 'Kim Tile & Stone'), D('Ana Lopez', 'Tile', '951 555 0120', 'Lopez Tile'), D('Sam Ortiz', 'Roofing', '951 555 0121', 'Ortiz Roofing'), D('Priya Shah', 'Painting', '310 555 0122', 'Fresh Coat'),
      D('Luis Mora', 'HVAC', '626 555 0123', 'CoolAir'), D('Jen Park', 'Landscaping', '760 555 0124', 'Green Desert'), D('Omar Haddad', 'Flooring', '909 555 0125', 'Haddad Floors'), D('Bree Cole', 'Solar', '760 555 0126', 'SunPeak')];
    saveSubsDir();
    tasks = [...tasks.filter(x => !x.demo), ...t]; Object.assign(jobs, jb);
    save(); saveJobs(); view = 'today'; filter = 'all'; render(); window.scrollTo(0, 0);
    toast('Sample jobs added. Tap Projects to explore.');
  }
  function clearDemo() {
    subsDir = subsDir.filter(x => !x.demo); saveSubsDir();
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
  // GAME DAY: day 1 is 8-9 AM on site (+ a 7:30 PM call), day 2 is the upsell push (stays open all day, carries over), day 3 confirms the upsell meeting and the stage
  const kickoffPlan = (name, subTxt) => [
    { off: 0, gd: 1, title: 'Coffee + donuts', cat: 'coffee', time: '08:00', timeEnd: '09:00' },
    { off: 0, gd: 1, title: 'Meet ' + subTxt + ' and introduce them to the client', cat: 'meet', time: '08:00', timeEnd: '09:00' },
    { off: 0, gd: 1, title: 'Take a video with the client', notes: 'Explain exactly what is going to happen and have the client confirm it on camera.', cat: 'video', link: 'video', time: '08:00', timeEnd: '09:00' },
    { off: 0, gd: 1, title: 'Take pictures of the job', cat: 'photo', link: 'photo', time: '08:00', timeEnd: '09:00' },
    { off: 0, gd: 1, title: 'Take a video testimonial with the client', notes: 'Ask them to say, in their own words, why they chose us and how excited they are about the project.', cat: 'video', link: 'video', key: 'testimonial', time: '08:00', timeEnd: '09:00' },
    { off: 0, gd: 1, title: 'Sign the NTP', cat: 'sign', link: 'stage', time: '08:00', timeEnd: '09:00' },
    { off: 0, gd: 1, title: 'Sniff for upsell', cat: 'upsell', star: true, time: '08:00', timeEnd: '09:00' },
    { off: 0, gd: 1, title: 'Make sure ' + name + ' saved the sales rep\'s number', cat: 'contact', time: '08:00', timeEnd: '09:00' },
    { off: 0, gd: 1, title: 'Call ' + name + ' and ask how the first day went', cat: 'call', time: '19:30', timeEnd: '20:00' },
    { off: 1, gd: 2, title: 'Be on site at 8 AM and pump the client for an upsell', notes: 'Can\'t make it today? Go tomorrow. This one stays open all day.', cat: 'upsell', star: true, time: '08:00', allDay: true, carry: true },
    { off: 1, gd: 2, title: 'Set up the upsell meeting', notes: 'Same day is ideal. If not, the day after.', cat: 'meet', star: true, allDay: true, carry: true },
    { off: 2, gd: 3, title: 'Make sure the upsell meeting is on the calendar', cat: 'meet', star: true, allDay: true, carry: true },
    { off: 2, gd: 3, title: 'Update the job status', cat: 'sign', link: 'stage', allDay: true },
  ];
  const planTask = (x, i, n, kick) => ({ id: uid(), done: false, title: x.title, project: n, due: addDays(x.off, kick), cat: x.cat, star: !!x.star, notes: x.notes || '', ord: i, gd: x.gd,
    ...(x.time ? { time: x.time } : {}), ...(x.timeEnd ? { timeEnd: x.timeEnd } : {}), ...(x.allDay ? { allDay: true } : {}), ...(x.carry ? { carry: true } : {}), ...(x.link ? { link: x.link } : {}), ...(x.key ? { key: x.key } : {}) });
  function addKickoff(n, startOff) {
    const subs = getSubs(jobs[n]), subTxt = subs.length ? subs.map(x => x.name).join(' & ') : 'the sub', kick = addDays(startOff);
    kickoffPlan(n, subTxt).forEach((x, i) => tasks.push(planTask(x, i, n, kick)));
    save(); render(); toast('Game Day plan added');
  }
  let jobMode = 'new';
  function paintMode() { document.querySelectorAll('#j-mode .chip').forEach(c => c.classList.toggle('on', c.dataset.m === jobMode)); $('#j-kickwrap').hidden = jobMode === 'old'; $('#jHelp').textContent = jobMode === 'old' ? 'Adds a job that is already underway. No Game Day plan. You can paste its WhatsApp chat in right after.' : 'Creates your Game Day plan: the 8–9 AM kickoff, the evening call, the upsell push on day 2 and the day-3 check.'; }
  $('#j-mode').onclick = e => { const c = e.target.closest('[data-m]'); if (c) { jobMode = c.dataset.m; paintMode(); $('#j-stage').value = jobMode === 'old' ? 'IN PROGRESS' : 'PRE NTP'; } };
  function openJob(mode) {
    jobMode = mode || 'new'; paintMode(); $('#j-stage').innerHTML = JSTAGES.map(x => `<option>${x}</option>`).join(''); $('#j-stage').value = jobMode === 'old' ? 'IN PROGRESS' : 'PRE NTP'; $('#j-fin').innerHTML = finOptions(''); $('#j-appr').value = '';
    ['#j-name', '#j-sub', '#j-phone', '#j-addr', '#j-upsell', '#j-contract'].forEach(i => { $(i).value = ''; $(i).classList.remove('err'); });
    $('#j-seller').innerHTML = (asRep ? `<option value="${esc(asRep)}">${esc(asRep)}</option>` : '<option value="">Me (I sold it)</option>') + team.filter(x => x.name !== OWNER && x.name !== asRep).map(x => `<option>${esc(x.name)}</option>`).join('');
    setKick(addDays(1)); $('#j-time').value = '08:00';
    $('#jobBg').classList.add('open'); setTimeout(() => $('#j-addr').focus(), 60);
  }
  const closeJob = () => $('#jobBg').classList.remove('open');
  function saveJob() {
    const name = $('#j-name').value.trim(), addrIn = $('#j-addr').value.trim();
    ['#j-addr', '#j-name'].forEach(i => $(i).classList.remove('err'));
    if (!addrIn) { $('#j-addr').classList.add('err'); $('#j-addr').focus(); toast('Enter the job address'); return; }
    if (!name) { $('#j-name').classList.add('err'); $('#j-name').focus(); toast('Enter the customer name'); return; }
    if (jobMode === 'old' && jobs[name]) { toast('A job with that name already exists. Add the street or a number to tell them apart.'); return; }
    const kick = $('#j-kick').value || addDays(1), time = $('#j-time').value || '08:00';
    const sub = $('#j-sub').value.trim(), amt = parseInt($('#j-upsell').value.replace(/[^0-9]/g, ''), 10) || 0;
    const newSubs = sub ? [{ name: sub, phone: $('#j-phone').value.trim() }] : [];
    const subs = newSubs.length ? newSubs : getSubs(jobs[name]);
    const subTxt = subs.length ? subs.map(x => x.name).join(' & ') : 'the sub';
    const plan = kickoffPlan(name, subTxt);
    if (jobMode === 'new') plan.forEach((x, i) => tasks.push(planTask(x, i, name, kick)));
    const contract = parseInt(($('#j-contract').value || '').replace(/[^0-9]/g, ''), 10) || 0;
    if (pendingLead) { const l = leads.find(x => x.id === pendingLead); if (l) { l.stage = 'sold'; l.job = name; saveLeads(); } pendingLead = null; }
    const finCo = $('#j-fin').value, apprIn = parseInt(($('#j-appr').value || '').replace(/[^0-9]/g, ''), 10) || 0;
    const stNew = $('#j-stage').value || 'PRE NTP';
    jobs[name] = { ...(jobs[name] || {}), ...($('#j-seller').value ? { seller: $('#j-seller').value } : {}), stage: stNew, stages: [stNew], stageAt: new Date().toISOString(), stageLog: [{ stage: stNew, at: new Date().toISOString(), by: OWNER || '' }], ...(finCo ? { fins: [{ id: uid(), company: finCo, status: finCo === 'Cash' ? '' : 'Applied', amount: contract || 0, approved: finCo === 'Cash' ? 0 : apprIn }], finance: '', finStatus: '' } : {}), upsell: amt, ...(contract ? { contract, ...(jobMode === 'new' ? { soldOn: todayISO() } : {}) } : {}), subs, sub: undefined, phone: undefined, addr: $('#j-addr').value.trim(), ...(jobMode === 'new' ? { kick } : {}), every: jobs[name]?.every || 5 };
    saveJobs(); save(); closeJob();
    if (jobMode === 'old') { curJob = name; jobTab = 'chat'; tabHist = []; chatLimit = 300; view = 'job'; render(); toast('Job added. Tap ＋ then Import WhatsApp chat to bring in the history.'); return; }
    view = 'today'; filter = 'all'; render(); window.scrollTo(0, 0);
    toast(`Game Day plan created for ${name}`);
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
  $('#pickFromList').onclick = () => { const n = editName; closeEdit(); openSubPicker(n); };
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

  $('#newJobBtn').onclick = () => openJob('new');
  $('#jCancel').onclick = closeJob;
  $('#jSave').onclick = saveJob;
  $('#jobBg').onclick = e => { if (e.target.id === 'jobBg') closeJob(); };
  $('#kickChips').onclick = e => { const c = e.target.closest('.chip'); if (c) setKick(addDays(+c.dataset.d)); };
  $('#j-kick').onchange = e => setKick(e.target.value);

  // ---- events ----
  $('#fab').onclick = () => openSheet(null, view === 'job' ? curJob : '');
  $('#asExit').onclick = () => { asRep = ''; view = 'reports'; render(); window.scrollTo(0, 0); };
  $('#asSum').onclick = () => { repName = asRep; asRep = ''; view = 'rep'; render(); window.scrollTo(0, 0); };
  $('#back').onclick = () => { if (view === 'rep') { view = 'reports'; render(); window.scrollTo(0, 0); return; } if (view === 'deal') { if (dealFrom === 'job') { curJob = dealJob; jobTab = 'info'; view = 'job'; } else view = dealFrom || 'money'; render(); window.scrollTo(0, 0); return; } if (view === 'subs' && pickJob) { const n = pickJob; pickJob = ''; curJob = n; jobTab = 'info'; tabHist = ['chat']; view = 'job'; render(); window.scrollTo(0, 0); return; } view = view === 'evening' ? 'today' : view === 'job' ? 'projects' : 'more'; render(); window.scrollTo(0, 0); };
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
    view = b.dataset.view; filter = 'all'; pickJob = ''; render(); window.scrollTo(0, 0);
  };
  $('#stats').onclick = e => {
    const b = e.target.closest('[data-filter]'); if (!b) return;
    filter = filter === b.dataset.filter ? 'all' : b.dataset.filter; render();
  };

  $('#main').onclick = e => {
    const mc = e.target.closest('.mcall'); if (mc) { e.preventDefault(); callChoice(mc.dataset.name, mc.dataset.phone); return; }
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
        const send = x => location.href = smsHref(x && x.phone, `Hi${x && x.name ? ' ' + x.name : ''}, it's ${OWNER || 'me'}. Can you send me photos or a quick video of the current work at ${n}${j.addr ? ' (' + j.addr + ')' : ''}? Please include anything about to get covered up. Thanks!`);
        if (subs.length <= 1) send(subs[0]);
        else openPick('Who do you want to text?', subs.map(x => ({ label: '💬 ' + subLabel(x), fn: () => send(x) })));
      } else if (act === 'navto') window.open(appleMaps(j.addr), '_blank');
      else if (act === 'editjob') openEdit(n);
      return;
    }
    if (el) {
      const act = el.dataset.act;
      if (act === 'collapse') { const p = el.dataset.p; collapsed.has(p) ? collapsed.delete(p) : collapsed.add(p); return render(); }
      if (act === 'addto') return openSheet(null, el.dataset.p);
      if (act.startsWith('map')) return void mapAct(act, el);
      if (act.startsWith('deal')) return void dealAct(act, el);
      if (act === 'repopen') { asRep = el.dataset.r; view = 'projects'; render(); window.scrollTo(0, 0); return; }
      if (act === 'openjob') { curJob = el.dataset.p; jobTab = 'chat'; tabHist = []; chatSearch = false; chatLimit = 300; view = 'job'; render(); return; }
      if (act === 'go') { view = el.dataset.v; filter = 'all'; render(); window.scrollTo(0, 0); return; }
      if (act === 'addkick') return openPick('Add the kickoff checklist', [{ label: 'Start today', fn: () => addKickoff(curJob, 0) }, { label: 'Start tomorrow at 8:00 AM', fn: () => addKickoff(curJob, 1) }, { label: 'Start in 2 days', fn: () => addKickoff(curJob, 2) }]);
      if (act === 'tlink') {
        const t = tasks.find(x => x.id === el.closest('.task').dataset.id); if (!t) return;
        if (t.link === 'stage') return stageMenu(t.project);
        if (t.project) { curJob = t.project; jobTab = 'chat'; tabHist = []; view = 'job'; render(); }
        return void $(t.link === 'video' ? '#fVid' : '#fCam').click();
      }
      if (act === 'showdonet') { showDoneT = !showDoneT; return render(); }
      if (act === 'tmenu') return taskMenu(el.closest('.task').dataset.id);
      if (act === 'tscope') { todayScope = el.dataset.t; filter = 'all'; return render(); }
      if (act === 'oldjob') return openJob('old');
      if (act === 'showdone') { showDoneJobs = !showDoneJobs; return render(); }
      if (act === 'archive') { const j = jobs[curJob] = jobs[curJob] || {}; j.archived = !j.archived; saveJobs(); view = 'projects'; render(); window.scrollTo(0, 0); return toast(j.archived ? 'Job marked complete' : 'Job reopened'); }
      if (act === 'lnew') return openLead();
      if (act === 'lfilter') { leadF = el.dataset.t; return render(); }
      if (act === 'lcall' || act === 'ltext' || act === 'lgo' || act === 'lsnz' || act === 'lstage' || act === 'ledit') {
        const l = leads.find(x => x.id === el.closest('.lcard').dataset.id); if (!l) return;
        if (act === 'lcall') callChoice(l.name, l.phone);
        else if (act === 'ltext') location.href = smsHref(l.phone, `Hi ${l.name.split(' ')[0]}, it's ${OWNER || 'me'}. `);
        else if (act === 'lgo') window.open(appleMaps(l.addr), '_blank');
        else if (act === 'lsnz') { l.next = addDays(3, l.next && l.next > todayISO() ? l.next : todayISO()); saveLeads(); render(); toast('Follow up ' + fmtDate(l.next)); }
        else if (act === 'lstage') { if (l.stage === 'lost') { l.stage = 'new'; saveLeads(); render(); } else if (l.stage === 'sold') toast('Already sold'); else leadStageMenu(l); }
        else openLead(l.id);
        return;
      }
      if (act === 'older') { chatLimit += 300; const h0 = document.body.scrollHeight; render(); window.scrollTo(0, 0); return; }
      if (act === 'mper') { moneyPer = el.dataset.t; return render(); }
      if (act === 'soldby') {
        const j = jobs[curJob] = jobs[curJob] || {};
        const open = () => {
          const reps = jobReps(j), toggle = nm => {
            if (reps.includes(nm)) { if (j.seller === nm) { const rest = (j.repNames || []).filter(x => x !== nm); j.seller = rest[0] || ''; j.repNames = rest.slice(1); } else j.repNames = (j.repNames || []).filter(x => x !== nm); }
            else if (!j.seller && !(j.repNames || []).length) j.seller = nm; else j.repNames = [...(j.repNames || []), nm];
            if (!j.repNames || !j.repNames.length) delete j.repNames; syncMembers(j); saveJobs(); render(); open();
          };
          openPick('Who is on this file? Tap to add or remove', [...team.filter(x => x.name !== OWNER).map(x => ({ label: (reps.includes(x.name) ? '✓ ' : '＋ ') + label2(x), fn: () => toggle(x.name) })), { label: 'Me (I sold it myself)', fn: () => { j.seller = ''; delete j.repNames; saveJobs(); render(); toast('Marked as sold by you'); } }, { label: 'Done', fn: () => toast(jobReps(j).length ? jobReps(j).join(' + ') + (jobReps(j).length > 1 ? ' are on this file. Your ' + cfg.override + '% is split between them.' : ' sold it. You get ' + cfg.override + '% of the contract.') : 'Sold by you') }]);
        };
        return open();
      }
      if (act === 'moneyjob') return openMoney(el.dataset.p || curJob);
      if (act === 'cfgedit') return openCfg();
      if (act === 'demoload') return loadDemo();
      if (act === 'feedback') return openFeedback();
      if (act === 'jtab') return goTab(el.dataset.tab);
      if (act === 'back') return backTab();
      if (act === 'callall') return callPeople(curJob);
      if (act === 'addmember') return addMemberMenu(curJob);
      if (act === 'subrow') { if (e.target.closest('.mcall')) return; return subMenu(curJob, +el.dataset.i); }
      if (act === 'addsub') return openSubPicker(curJob);
      if (act === 'deljob') return deleteJobMenu(curJob);
      if (act === 'stagepick') return stageMenu(curJob);
      if (act === 'stagef') { stageF = el.dataset.s; return render(); }
      if (act === 'finrow') return openLoan(curJob, +el.dataset.i);
      if (act === 'finadd') return openLoan(curJob, -1);
      if (act === 'finedit') return openFin();
      if (act === 'subtrade') { subTrade = el.dataset.t; return render(); }
      if (act === 'subnew') return openContractor();
      if (act === 'subimport') { const n = importSubsFromJobs(); toast(n ? `${n} contractors added` : 'No subs found in your jobs yet'); return render(); }
      if (act === 'subfav') { const x = subsDir.find(y => y.id === el.closest('.ccard').dataset.id); if (x) { x.fav = !x.fav; saveSubsDir(); render(); } return; }
      if (act === 'subcall') { const x = subsDir.find(y => y.id === el.closest('.ccard').dataset.id); if (x) callChoice(x.name, x.phone); return; }
      if (act === 'subopen') return contractorMenu(el.dataset.id);
      if (act === 'subpick') { const id = el.dataset.id; pickSel.has(id) ? pickSel.delete(id) : pickSel.add(id); const sc = window.scrollY; render(); window.scrollTo(0, sc); return; }
      if (act === 'pickdone') return applyPick();
      if (act === 'memberrm') { const j = jobs[curJob] || {}, x = membersOf(curJob)[+el.dataset.i]; if (!x) return; const before = memberIds(j).slice(); j.members = before.filter(id => id !== x.id); saveJobs(); render(); return toast(x.name + ' removed from this job', () => { j.members = before; saveJobs(); render(); }); }
      if (act === 'subrm') { const j = jobs[curJob] || {}, subs = getSubs(j).slice(), x = subs[+el.dataset.i]; if (!x) return; j.subs = subs.filter((_, k) => k !== +el.dataset.i); saveJobs(); render(); return toast(x.name + ' removed from this job', () => { j.subs = subs; saveJobs(); render(); }); }
      if (act === 'member') { if (e.target.closest('.mcall')) return; return memberMenu(curJob, +el.dataset.i); }
      if (act === 'mtab') { mediaTab = el.dataset.t; return render(); }
      if (act === 'openlink') return void window.open(el.dataset.u, '_blank');
      if (act === 'openwa') { const w = (jobs[curJob] || {}).wa; if (w) location.href = w; return; }
      if (act === 'togvia') { sendVia = sendVia === 'wa' ? 'sms' : 'wa'; try { localStorage.setItem('oaf-via-v1', sendVia); } catch {} render(); return toast(sendVia === 'wa' ? 'Sending via WhatsApp' : 'Sending via Messages'); }
      if (act === 'search') { tabHist = []; jobTab = 'chat'; chatSearch = true; render(); window.scrollTo(0, 0); setTimeout(() => $('#sq').focus(), 80); return; }
      if (act === 'searchx') { chatSearch = false; render(); return; }
      if (act === 'jump') { pendingJump = el.dataset.id; tabHist = []; jobTab = 'chat'; render(); return; }
      if (act === 'navjob') return void window.open(appleMaps((jobs[curJob] || {}).addr || ''), '_blank');
      if (act === 'addto') return openSheet(null, el.dataset.p);
      if (act === 'openjob') { curJob = el.dataset.p; jobTab = 'chat'; view = 'job'; render(); return; }
      if (act === 'jtab') { jobTab = el.dataset.tab; render(); if (jobTab !== 'chat') window.scrollTo(0, 0); return; }
      if (act === 'navjob') return void window.open(appleMaps((jobs[curJob] || {}).addr || ''), '_blank');
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
    else if (id === 'cloudBtn') { window.OAFsync ? window.OAFsync.open() : toast('Cloud is not available right now'); }
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
  window.OAF = {
    getState: () => ({ tasks, jobs, team, leads, reports, cfg, subsDir }),
    setState(st) {
      tasks = st.tasks; jobs = st.jobs; team = st.team; leads = st.leads || leads; reports = st.reports || reports; cfg = st.cfg || cfg; subsDir = st.subsDir || subsDir;
      try { localStorage.setItem('oaf-subsdir-v1', JSON.stringify(subsDir)); } catch {}
      try { localStorage.setItem('oaf-leads-v1', JSON.stringify(leads)); localStorage.setItem('oaf-reports-v1', JSON.stringify(reports)); localStorage.setItem('oaf-cfg-v1', JSON.stringify(cfg)); } catch {}
      try { localStorage.setItem(KEY, JSON.stringify(tasks)); localStorage.setItem(JOBS_KEY, JSON.stringify(jobs)); localStorage.setItem(TEAM_KEY, JSON.stringify(team)); } catch {}
      render();
    },
    onChange: null, blobOf,
    setName(n) { if (n) { OWNER = n; try { localStorage.setItem('oaf-name-v1', n); } catch {} render(); } },
  };
  try { if (!subsDir.length && !localStorage.getItem('oaf-subs-imported')) { importSubsFromJobs(); localStorage.setItem('oaf-subs-imported', '1'); if (subsDir.length) render(); } } catch {}
  // add the testimonial step to Game Day plans created before it existed (only where day 1 hasn't passed)
  try {
    const t0m = todayISO(); let added = 0;
    [...new Set(tasks.filter(t => t.gd === 1 && t.project).map(t => t.project))].forEach(n => {
      if (tasks.some(t => t.project === n && t.key === 'testimonial')) return;
      const anchor = tasks.find(t => t.project === n && t.gd === 1 && t.time === '08:00' && t.timeEnd === '09:00'); if (!anchor || anchor.due < t0m) return;
      tasks.push({ id: uid(), done: false, title: 'Take a video testimonial with the client', project: n, due: anchor.due, cat: 'video', star: false, notes: 'Ask them to say, in their own words, why they chose us and how excited they are about the project.', ord: 3.5, gd: 1, time: '08:00', timeEnd: '09:00', link: 'video', key: 'testimonial' }); added++;
    });
    if (added) { save(); render(); }
  } catch {}
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
