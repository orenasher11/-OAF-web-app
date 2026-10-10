(() => {
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

  let tasks = [], view = 'today', filter = 'all', editingId = null, curJob = '';
  let formCat = '', formStar = false, lastUndo = null, toastTimer = null;
  const collapsed = new Set();
  const $ = s => document.querySelector(s);

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
      if (!html) html = `<div class="empty"><div class="big">✓</div>${filter === 'all' ? 'Nothing due. Tap + to add a task.' : 'Nothing here.'}</div>`;
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
    } else if (view === 'job') {
      const n = curJob, j = jobs[n] || {};
      $('#h1').textContent = n;
      $('#sub').textContent = j.addr || 'No address yet. Tap Edit job to add it.';
      const mine = open.filter(t => t.project === n);
      const doneT = tasks.filter(t => t.done && t.project === n);
      if (getSubs(j).length) html += `<div class="subchips jobsubs">${subChips(j, true)}</div>`;
      html += `<div class="jobactions">
        <button class="jbtn primary" data-act="addto" data-p="${esc(n)}">＋ Add task</button>
        <button class="jbtn" data-act="editjobd">✎ Edit job</button>
        <button class="jbtn" data-act="upsell" data-p="${esc(n)}">${j.upsell ? money(j.upsell) + ' upsell' : '+ Upsell $'}</button>
      </div>`;
      html += mine.length ? mine.map(taskHTML).join('') : `<div class="empty"><div class="big">✓</div>No open tasks on this job.</div>`;
      if (doneT.length) html += `<div class="section-title">Done (${doneT.length})</div>` + doneT.map(taskHTML).join('');
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
        <button id="clearDone">🧹 Clear completed</button>
        <input type="file" id="importFile" accept="application/json" hidden>
      </div><div class="hint">Your tasks are stored on this phone only. Back up now and then.</div>`;
    }
    $('#stats').innerHTML = stats; $('#stats').hidden = !stats;
    $('#jobbar').hidden = view === 'upcoming' || view === 'visits' || view === 'job';
    $('#back').hidden = view !== 'job';
    const lateN = visitList().filter(v => v.state === 'late').length;
    $('#vbadge').textContent = lateN || ''; $('#vbadge').hidden = !lateN;
    const inPlay = [...new Set(open.map(t => t.project).filter(Boolean))].reduce((a, n) => a + (jobs[n]?.upsell || 0), 0);
    $('#pot').innerHTML = inPlay ? `Upsell potential in play <b>${money(inPlay)}</b>` : 'Add upsell potential to each job';
    $('#main').innerHTML = html;
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === (view === 'job' ? 'projects' : view)));
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

  // ---- new job sold: creates the whole first-48-hours playbook ----
  function setKick(v) {
    $('#j-kick').value = v || '';
    document.querySelectorAll('#kickChips .chip').forEach(c => c.classList.toggle('on', !!v && addDays(+c.dataset.d) === v));
  }
  function openJob() {
    ['#j-name', '#j-sub', '#j-phone', '#j-addr', '#j-upsell'].forEach(i => $(i).value = '');
    setKick(addDays(1)); $('#j-time').value = '08:00';
    $('#jobBg').classList.add('open'); setTimeout(() => $('#j-name').focus(), 60);
  }
  const closeJob = () => $('#jobBg').classList.remove('open');
  function saveJob() {
    const name = $('#j-name').value.trim();
    if (!name) { $('#j-name').focus(); return; }
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
    $('#e-addr').value = j.addr || ''; $('#e-upsell').value = j.upsell || '';
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
    jobs[editName] = { ...(jobs[editName] || {}), addr: $('#e-addr').value.trim(), sub: undefined, phone: undefined,
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
  $('#back').onclick = () => { view = 'projects'; render(); window.scrollTo(0, 0); };
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
        else {
          $('#pickList').innerHTML = subs.map((x, i) => `<button class="pickbtn" data-i="${i}">💬 ${esc(subLabel(x))}</button>`).join('');
          $('#pickBg').classList.add('open');
          $('#pickList').onclick = ev => { const b = ev.target.closest('[data-i]'); if (b) { $('#pickBg').classList.remove('open'); send(subs[+b.dataset.i]); } };
        }
      } else if (act === 'navto') window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(j.addr), '_blank');
      else if (act === 'editjob') openEdit(n);
      return;
    }
    if (el) {
      const act = el.dataset.act;
      if (act === 'collapse') { const p = el.dataset.p; collapsed.has(p) ? collapsed.delete(p) : collapsed.add(p); return render(); }
      if (act === 'addto') return openSheet(null, el.dataset.p);
      if (act === 'openjob') { curJob = el.dataset.p; view = 'job'; render(); window.scrollTo(0, 0); return; }
      if (act === 'editjobd') return openEdit(curJob);
      if (act === 'upsell') {
        const n = el.dataset.p; if (!n) return;
        const v = prompt(`Upsell potential for ${n} (in dollars, e.g. 30000):`, jobs[n]?.upsell || '');
        if (v === null) return;
        const amt = parseInt(String(v).replace(/[^0-9]/g, ''), 10) || 0;
        jobs[n] = { ...(jobs[n] || {}), upsell: amt }; saveJobs(); return render();
      }
      const t = tasks.find(x => x.id === el.closest('.task').dataset.id); if (!t) return;
      if (act === 'toggle') {
        t.done = !t.done; t.doneOn = t.done ? todayISO() : null; save(); render();
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
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ tasks, jobs }, null, 2)], { type: 'application/json' }));
      a.download = `tasks-backup-${todayISO()}.json`; a.click();
    } else if (id === 'importBtn') $('#importFile').click();
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
          render();
        }
      } catch { alert('That file is not a valid backup.'); }
    });
  });
  $('#toast').onclick = e => { if (e.target.id === 'undoBtn' && lastUndo) { lastUndo(); lastUndo = null; $('#toast').classList.remove('show'); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
