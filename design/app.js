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

  let tasks = [], view = 'today', filter = 'all', editingId = null;
  let formCat = '', formStar = false, lastUndo = null, toastTimer = null;
  const collapsed = new Set();
  const $ = s => document.querySelector(s);

  try { tasks = JSON.parse(localStorage.getItem(KEY)) || []; } catch { tasks = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch {} };

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
  const cmp = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.star ? 1 : 0) - (a.star ? 1 : 0) || a.title.localeCompare(b.title);

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
          <span class="date ${dcls}">${fmtDate(t.due)}</span>
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
      if (!html) html = `<div class="empty"><div class="big">✓</div>${filter === 'all' ? 'Nothing due. Tap + to add a task.' : 'Nothing here.'}</div>`;
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
    } else {
      $('#h1').textContent = 'Projects';
      $('#sub').textContent = 'Open tasks by customer';
      const groups = {};
      open.forEach(t => (groups[t.project || 'No project'] ||= []).push(t));
      const names = Object.keys(groups).sort((a, b) => a.localeCompare(b));
      if (!names.length) html = `<div class="empty"><div class="big">🏗️</div>No open tasks.</div>`;
      names.forEach(n => {
        const g = groups[n], late = g.filter(t => t.due && t.due < t0).length, shut = collapsed.has(n);
        html += `<div class="pgroup">
          <div class="phead">
            <button class="ptoggle" data-act="collapse" data-p="${esc(n)}">
              <span class="pname">${esc(n)}</span>
              <span class="pcount">${g.length} open${late ? ` · <em>${late} late</em>` : ''}</span>
              <span class="chev">${shut ? '▸' : '▾'}</span>
            </button>
            <button class="padd" data-act="addto" data-p="${n === 'No project' ? '' : esc(n)}" aria-label="Add task to ${esc(n)}">+</button>
          </div>
          ${shut ? '' : g.map(taskHTML).join('')}
        </div>`;
      });
      html += `<div class="tools">
        <button id="exportBtn">⬇ Back up</button>
        <button id="importBtn">⬆ Restore</button>
        <button id="clearDone">🧹 Clear completed</button>
        <input type="file" id="importFile" accept="application/json" hidden>
      </div><div class="hint">Your tasks are stored on this phone only. Back up now and then.</div>`;
    }
    $('#stats').innerHTML = stats; $('#stats').hidden = !stats;
    $('#main').innerHTML = html;
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
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

  // ---- events ----
  $('#fab').onclick = () => openSheet();
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
    const el = e.target.closest('[data-act]');
    if (el) {
      const act = el.dataset.act;
      if (act === 'collapse') { const p = el.dataset.p; collapsed.has(p) ? collapsed.delete(p) : collapsed.add(p); return render(); }
      if (act === 'addto') return openSheet(null, el.dataset.p);
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
      a.href = URL.createObjectURL(new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' }));
      a.download = `tasks-backup-${todayISO()}.json`; a.click();
    } else if (id === 'importBtn') $('#importFile').click();
    else if (id === 'clearDone' && confirm('Remove all completed tasks?')) { tasks = tasks.filter(t => !t.done); save(); render(); }
  };
  $('#main').addEventListener('change', e => {
    if (e.target.id !== 'importFile') return;
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => {
      try {
        const d = JSON.parse(txt); if (!Array.isArray(d)) throw 0;
        if (confirm(`Replace current tasks with ${d.length} from the backup?`)) { tasks = d; save(); render(); }
      } catch { alert('That file is not a valid backup.'); }
    });
  });
  $('#toast').onclick = e => { if (e.target.id === 'undoBtn' && lastUndo) { lastUndo(); lastUndo = null; $('#toast').classList.remove('show'); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  render();
})();
