// Cloud sync: shared jobs, tasks, chat, team and media through Supabase.
// The app stays local-first. This file copies changes to the cloud and brings other people's changes in.
(() => {
  const CFG = window.OAF_CFG || {}, A = window.OAF;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enabled = !!(A && CFG.url && CFG.anon && window.supabase && window.supabase.createClient);
  window.OAFsync = { enabled, open() { openSheet(); }, label: () => label() };
  if (!A) return;

  const sb = enabled ? window.supabase.createClient(CFG.url, CFG.anon) : null;
  const META_KEY = 'oaf-sync-v1';
  let ws = null, user = null, profile = null, channel = null, poller = null, pushTimer = null;
  let ui = enabled ? 'loading' : 'off', email = '', err = '', lastSync = null, busy = false, members = [], invites = [], again = false;
  let meta = { synced: {}, lastPull: '', up: {} };
  try { meta = { ...meta, ...(JSON.parse(localStorage.getItem(META_KEY)) || {}) }; } catch {}
  const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {} };

  // ---- hashing and document model ----
  function stable(o) {
    if (Array.isArray(o)) return '[' + o.map(stable).join(',') + ']';
    if (o && typeof o === 'object') return '{' + Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
    return JSON.stringify(o) ?? 'null';
  }
  const hash = o => { const s = stable(o); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h + ':' + s.length; };

  function buildDocs(st) {
    const d = {};
    (st.tasks || []).filter(t => !t.demo).forEach(t => { d[t.id] = { kind: 'task', data: t }; });
    Object.entries(st.jobs || {}).filter(([, j]) => !(j && j.demo)).forEach(([name, j]) => {
      const { chat, notes, ...rest } = j || {};
      d['job:' + name] = { kind: 'job', data: { ...rest, name } };
      (chat || []).forEach(m => { d[m.id] = { kind: 'msg', data: { ...m, job: name } }; });
      (notes || []).forEach(m => { d[m.id] = { kind: 'note', data: { ...m, job: name } }; });
    });
    (st.team || []).forEach(x => { d['team:' + x.id] = { kind: 'team', data: x }; });
    (st.leads || []).forEach(l => { d[l.id] = { kind: 'lead', data: l }; });
    (st.reports || []).forEach(r => { d[r.id] = { kind: 'report', data: r }; });
    (st.subsDir || []).filter(x => !x.demo).forEach(x => { d['sub:' + x.id] = { kind: 'sub', data: x }; });
    if (st.cfg) d['cfg:main'] = { kind: 'cfg', data: st.cfg };
    return d;
  }
  function applyRow(st, row) {
    const id = row.id, dat = row.data || {}, del = row.deleted;
    if (row.kind === 'sub') { const sid = id.slice(4); st.subsDir = (st.subsDir || []).filter(x => x.id !== sid); if (!del) st.subsDir.push(dat); }
    else if (row.kind === 'lead' || row.kind === 'report') { const key = row.kind === 'lead' ? 'leads' : 'reports'; st[key] = (st[key] || []).filter(x => x.id !== id); if (!del) st[key].push(dat); }
    else if (row.kind === 'cfg') { if (!del) st.cfg = { ...(st.cfg || {}), ...dat }; }
    else if (row.kind === 'task') { st.tasks = st.tasks.filter(t => t.id !== id); if (!del) st.tasks.push(dat); }
    else if (row.kind === 'team') { const tid = id.slice(5); st.team = st.team.filter(x => x.id !== tid); if (!del) st.team.push(dat); }
    else if (row.kind === 'job') {
      if (del) { delete st.jobs[id.slice(4)]; return; } const { name, ...rest } = dat; if (!name) return;
      st.jobs[name] = { ...(st.jobs[name] || {}), ...rest };
    } else if (row.kind === 'msg' || row.kind === 'note') {
      const key = row.kind === 'msg' ? 'chat' : 'notes', name = dat.job;
      if (!name && !del) return;
      const names = del ? Object.keys(st.jobs) : [name];
      names.forEach(n => {
        const j = st.jobs[n] = st.jobs[n] || {}; j[key] = (j[key] || []).filter(m => m.id !== id);
        if (!del) { const { job, ...m } = dat; j[key].push(m); j[key].sort((a, b) => String(a.at).localeCompare(String(b.at))); }
      });
    }
  }

  // ---- pull / push ----
  function applyRows(rows) {
    if (!rows.length) return false;
    const st = A.getState(), local = buildDocs(st), applied = [];
    for (const row of rows) {
      const loc = local[row.id], s = meta.synced[row.id];
      const pending = loc && (!s || hash(loc) !== s.h);
      if (pending && row.updated_by !== (user && user.id)) continue;   // my newer edit wins; it will be pushed
      applyRow(st, row); applied.push(row);
    }
    if (applied.length) {
      const after = buildDocs(st);
      applied.forEach(r => { if (after[r.id]) meta.synced[r.id] = { h: hash(after[r.id]), k: r.kind }; else delete meta.synced[r.id]; });
      A.setState(st);
    }
    const last = rows[rows.length - 1].updated_at; if (last && last > (meta.lastPull || '')) meta.lastPull = last;
    saveMeta(); return applied.length > 0;
  }
  async function pull() {
    if (!ws) return;
    const since = meta.lastPull || '1970-01-01T00:00:00Z';
    let more = true, guard = 0;
    while (more && guard++ < 20) {
      const { data, error } = await sb.from('docs').select('*').eq('workspace_id', ws).gte('updated_at', since).order('updated_at').limit(1000);
      if (error) throw error;
      applyRows(data || []); more = false;
    }
  }
  async function push() {
    if (!ws || !user) return;
    const st = A.getState(), docs = buildDocs(st), rows = [];
    Object.entries(docs).forEach(([id, d]) => { const h = hash(d); if (!meta.synced[id] || meta.synced[id].h !== h) rows.push({ workspace_id: ws, id, kind: d.kind, data: d.data, deleted: false, h }); });
    const gone = Object.keys(meta.synced).filter(id => !docs[id]);
    const total = Object.keys(meta.synced).length;
    const suspicious = gone.length > 20 && gone.length > total * 0.5 && !A.deleteOK;
    if (!suspicious) gone.forEach(id => rows.push({ workspace_id: ws, id, kind: meta.synced[id].k || 'task', data: {}, deleted: true, h: null }));
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await sb.from('docs').upsert(chunk.map(({ h, ...r }) => r), { onConflict: 'workspace_id,id' });
      if (error) throw error;
      chunk.forEach(r => { if (r.deleted) delete meta.synced[r.id]; else meta.synced[r.id] = { h: r.h, k: r.kind }; });
      saveMeta();
    }
    A.deleteOK = false;
    await syncMedia(docs);
  }
  async function syncMedia(docs) {
    for (const d of Object.values(docs)) {
      if (d.kind !== 'msg' || !d.data.attach) continue;
      for (const a of d.data.attach) {
        if (meta.up[a.id]) continue;
        const blob = await A.blobOf(a.id, true); if (!blob) continue;
        const { error } = await sb.storage.from('media').upload(ws + '/' + a.id, blob, { contentType: a.mime || blob.type || 'application/octet-stream', upsert: true });
        if (!error) { meta.up[a.id] = 1; saveMeta(); } else { err = 'Some files could not upload yet.'; }
      }
    }
  }
  async function run() {
    if (!ws || busy) { again = true; return; }
    busy = true; err = '';
    try { await pull(); await push(); lastSync = new Date(); }
    catch (e) { err = (e && e.message) || String(e); }
    busy = false; paint();
    if (again) { again = false; schedulePush(300); }
  }
  function schedulePush(ms = 1200) { clearTimeout(pushTimer); pushTimer = setTimeout(run, ms); }

  function subscribe() {
    try { if (channel) sb.removeChannel(channel); } catch {}
    channel = sb.channel('docs-' + ws).on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'workspace_id=eq.' + ws }, p => {
      const row = p.new; if (!row || !row.id || row.updated_by === (user && user.id)) return;
      applyRows([row]);
    }).subscribe();
  }

  // ---- media bridge used by the app ----
  window.OAFsync.fetchMedia = async id => {
    if (!ws) return null;
    const { data, error } = await sb.storage.from('media').download(ws + '/' + id);
    return error ? null : data;
  };
  window.OAFsync.removeMedia = id => { if (ws) sb.storage.from('media').remove([ws + '/' + id]).catch(() => {}); delete meta.up[id]; saveMeta(); };
  window.OAFsync.pullNow = () => run();

  // ---- sign in / out ----
  async function afterLogin(u) {
    user = u; window.OAF_ME = u.id;
    const { data, error } = await sb.rpc('bootstrap');
    if (error) { err = error.message; ui = 'noaccess'; paint(); return; }
    ws = data;
    const { data: p } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
    profile = p;
    if (!p || !p.name) { ui = 'name'; paint(); return; }
    A.setName(p.name); ui = 'in'; paint(); await start();
  }
  async function start() {
    A.onChange = () => schedulePush();
    await run(); subscribe(); loadPeople();
    clearInterval(poller); poller = setInterval(() => { if (!document.hidden) run(); }, 30000);
  }
  async function loadPeople() {
    try {
      const m = await sb.from('members').select('user_id, role').eq('workspace_id', ws);
      const ids = (m.data || []).map(x => x.user_id);
      const pr = ids.length ? await sb.from('profiles').select('id, name, email').in('id', ids) : { data: [] };
      members = (m.data || []).map(x => ({ ...x, ...((pr.data || []).find(p => p.id === x.user_id) || {}) }));
      const iv = await sb.from('invites').select('email, role').eq('workspace_id', ws);
      invites = iv.data || [];
    } catch {} paint();
  }
  async function signOut() {
    clearInterval(poller); A.onChange = null; try { await sb.auth.signOut(); } catch {}
    user = null; ws = null; window.OAF_ME = null; ui = 'out'; paint();
  }

  // ---- sheet UI ----
  const label = () => !enabled ? 'Not set up' : ui === 'in' ? (busy ? 'Syncing…' : err ? 'Problem' : 'Synced') : 'Signed out';
  function openSheet() { $('#cloudBg').classList.add('open'); paint(); }
  function paint() {
    const b = $('#cloudBody'); if (!b) return;
    const btn = $('#cloudBtn'); if (btn) btn.textContent = '☁️ Cloud · ' + label();
    const e = err ? `<div class="cerr">${esc(err)}</div>` : '';
    let h = '';
    if (!enabled) h = `<p class="help">Cloud sharing isn't switched on yet. The setup guide takes about 10 minutes and works from your phone.</p><a class="btn primary" style="display:block;text-align:center;text-decoration:none" href="setup.html">Open setup guide</a>`;
    else if (ui === 'loading') h = `<p class="help">Checking your sign-in…</p>`;
    else if (ui === 'out' || ui === 'noaccess') h = `${ui === 'noaccess' ? `<div class="cerr">${esc(err || 'This email has not been invited yet.')} Ask the owner to invite you, then try again.</div>` : ''}
      <label for="c-email">Your email</label><input id="c-email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value="${esc(email)}">
      <div class="actions"><button class="btn primary" id="c-send">Email me a sign-in link</button></div>${ui === 'noaccess' ? '' : e}`;
    else if (ui === 'code') h = `<p class="help">We emailed <b>${esc(email)}</b>. It can take a minute. Check spam too.<br><br><b>Don't tap the link.</b> Touch and hold the sign-in link in the email, tap <b>Copy Link</b>, come back here and paste it below.</p>
      <label for="c-code">Paste the link here</label><input id="c-code" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…supabase.co/auth/v1/verify?…">
      <div class="actions"><button class="btn ghost" id="c-back">Different email</button><button class="btn primary" id="c-verify">Sign in</button></div>${e}`;
    else if (ui === 'name') h = `<p class="help">Last step. Your name shows next to your messages.</p>
      <label for="c-name">Your name</label><input id="c-name" autocomplete="name" placeholder="e.g. Oren">
      <div class="actions"><button class="btn primary" id="c-savename">Continue</button></div>${e}`;
    else if (ui === 'in') h = `<div class="cok">✓ Signed in as <b>${esc(profile?.name || '')}</b><br><small>${esc(user?.email || '')}</small></div>
      <div class="cstat">${busy ? 'Syncing…' : lastSync ? 'Last synced ' + lastSync.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Not synced yet'}</div>${e}
      <div class="actions"><button class="btn ghost" id="c-sync">Sync now</button><button class="btn ghost" id="c-out">Sign out</button></div>
      <div class="ssec">People who can use the app</div>
      <div class="scard">${members.map(m => `<div class="mrow"><span class="mbody"><b>${esc(m.name || m.email || 'Member')}</b><small>${esc(m.role === 'owner' ? 'Owner' : 'Member')} · ${esc(m.email || '')}</small></span></div>`).join('')}
        ${invites.map(i => `<div class="mrow"><span class="mbody"><b>${esc(i.email)}</b><small>Invited · hasn't signed in yet</small></span><button class="cx" data-rm="${esc(i.email)}" aria-label="Remove invite">×</button></div>`).join('')}</div>
      <label for="c-inv">Invite someone by email</label><input id="c-inv" type="email" inputmode="email" placeholder="partner@example.com">
      <div class="actions"><button class="btn primary" id="c-invite">Send invite</button></div>
      <div class="hint">After you invite them, tell them to open the app, tap Cloud, and sign in with that email.</div>`;
    b.innerHTML = h;
  }
  async function guard(fn) { err = ''; try { await fn(); } catch (e) { err = (e && e.message) || String(e); paint(); } }
  document.addEventListener('click', e => {
    const id = e.target.id || (e.target.closest && e.target.closest('[id^="c-"]') || {}).id;
    if (e.target.id === 'cloudBg') { $('#cloudBg').classList.remove('open'); return; }
    if (id === 'c-close') { $('#cloudBg').classList.remove('open'); return; }
    if (!enabled) return;
    const rm = e.target.closest && e.target.closest('[data-rm]');
    if (rm) { guard(async () => { await sb.from('invites').delete().eq('workspace_id', ws).eq('email', rm.dataset.rm); await loadPeople(); }); return; }
    if (id === 'c-send') guard(async () => {
      email = ($('#c-email').value || '').trim().toLowerCase(); if (!email) { err = 'Enter your email.'; return paint(); }
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw error; ui = 'code'; paint();
    });
    else if (id === 'c-back') { ui = 'out'; err = ''; paint(); }
    else if (id === 'c-verify') guard(async () => {
      const raw = ($('#c-code').value || '').trim();
      let res;
      if (/^\d{6,8}$/.test(raw)) res = await sb.auth.verifyOtp({ email, token: raw, type: 'email' });
      else {
        let u; try { u = new URL(raw.replace(/\s/g, '')); } catch { throw new Error('Paste the whole link from the email.'); }
        const th = u.searchParams.get('token') || u.searchParams.get('token_hash'); let ty = u.searchParams.get('type') || 'magiclink';
        if (!th) throw new Error('That link is missing its sign-in part. Copy the link again from the email.');
        res = await sb.auth.verifyOtp({ token_hash: th, type: ty });
      }
      if (res.error) throw new Error(/expired|invalid/i.test(res.error.message) ? 'That link was already used or has expired. Go back and ask for a new one. Copy it without tapping it.' : res.error.message);
      await afterLogin(res.data.user);
    });
    else if (id === 'c-savename') guard(async () => {
      const name = ($('#c-name').value || '').trim(); if (!name) { err = 'Enter your name.'; return paint(); }
      const { error } = await sb.from('profiles').upsert({ id: user.id, email: user.email, name });
      if (error) throw error; profile = { ...(profile || {}), name }; A.setName(name); ui = 'in'; paint(); await start();
    });
    else if (id === 'c-sync') { run(); }
    else if (id === 'c-out') { signOut(); }
    else if (id === 'c-invite') guard(async () => {
      const em = ($('#c-inv').value || '').trim().toLowerCase(); if (!em) return;
      const { error } = await sb.from('invites').upsert({ workspace_id: ws, email: em, role: 'member' }); if (error) throw error;
      $('#c-inv').value = ''; await loadPeople();
    });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ws) run(); });

  // ---- start ----
  if (enabled) {
    (async () => {
      try {
        const { data } = await sb.auth.getSession();
        if (data && data.session) await afterLogin(data.session.user); else { ui = 'out'; paint(); }
      } catch (e) { err = (e && e.message) || String(e); ui = 'out'; paint(); }
    })();
  } else paint();
})();
