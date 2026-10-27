// Admin dashboard. Uses the public anon key + the admin's own login; every
// query is gated server-side by is_admin() (RLS + admin_metrics()).
/* global supabase, SOUL_SYNC_CONFIG */
const db = supabase.createClient(SOUL_SYNC_CONFIG.supabaseUrl, SOUL_SYNC_CONFIG.supabaseAnonKey);
const $ = (id) => document.getElementById(id);

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function tile(label, value, sub, cls = '') {
  return `<div class="tile"><div class="label">${esc(label)}</div><div class="value ${cls}">${esc(value)}</div><div class="sub">${esc(sub ?? '')}</div></div>`;
}

async function loadMetrics() {
  const { data: m, error } = await db.rpc('admin_metrics', { window_days: Number($('window').value) });
  if (error) {
    $('adoption').innerHTML = tile('Error', '—', error.message, 'bad');
    return;
  }
  const r = m.retention ?? {};
  const ret = (k) => r[k] ?? { eligible: 0, retained: 0, rate: null };
  $('adoption').innerHTML = [
    tile('Users', m.users_total, `${m.users_onboarded} finished onboarding`),
    tile('Day-1 retention', pct(ret('d1').rate), `${ret('d1').retained} of ${ret('d1').eligible} eligible`),
    tile('Day-7 retention', pct(ret('d7').rate), `${ret('d7').retained} of ${ret('d7').eligible} eligible`),
    tile('Day-30 retention', pct(ret('d30').rate), `${ret('d30').retained} of ${ret('d30').eligible} eligible`),
  ].join('');

  const s = m.session_seconds ?? {};
  const under = s.share_under_2min;
  $('engagement').innerHTML = [
    tile('Check-in rate', pct(m.checkin_rate), 'share of active days with a check-in'),
    tile('Action completion', pct(m.action_completion?.rate), `${m.action_completion?.done ?? 0} done · ${m.action_completion?.skipped ?? 0} rest days · ${m.action_completion?.cards ?? 0} cards`),
    tile('Avg session', s.avg == null ? '—' : `${Math.round(s.avg)}s`, `median ${s.median == null ? '—' : Math.round(s.median) + 's'} · target under 120s`, s.avg != null && s.avg <= 120 ? 'ok' : 'bad'),
    tile('Sessions under 2 min', pct(under), `${s.sessions ?? 0} sessions`, under != null && under >= 0.7 ? 'ok' : ''),
  ].join('');

  const w = m.who5 ?? {};
  $('outcomes').innerHTML = [
    tile('"It helped" rate', pct(m.helped?.yes_rate), `yes or somewhat: ${pct(m.helped?.yes_or_somewhat_rate)} · ${m.helped?.answers ?? 0} answers`),
    tile('WHO-5 change', w.avg_change == null ? '—' : `${w.avg_change > 0 ? '+' : ''}${w.avg_change}`, `avg points, first → latest · ${w.users_with_followup ?? 0} users`, w.avg_change > 0 ? 'ok' : ''),
    tile('Meaningful WHO-5 gains', w.meaningful_up ?? 0, `≥10 points up · ${w.meaningful_down ?? 0} down ≥10`),
  ].join('');

  const dau = m.daily_active ?? [];
  const max = Math.max(1, ...dau.map((d) => d.users));
  $('dau').innerHTML = dau.map((d) => `<div title="${esc(d.date)}: ${d.users}" style="height:${(d.users / max) * 100}%"></div>`).join('') || '<span class="muted">No sessions yet.</span>';

  const { data: versions } = await db.from('engine_prompt_versions').select('id, model, created_at').order('id', { ascending: false }).limit(20);
  const stats = Object.fromEntries((m.by_prompt_version ?? []).map((v) => [v.version, v]));
  document.querySelector('#versions tbody').innerHTML = (versions ?? []).map((v) => {
    const st = stats[v.id] ?? {};
    return `<tr><td>v${v.id}</td><td>${esc(v.model)}</td><td>${new Date(v.created_at).toLocaleString()}</td><td>${st.cards ?? 0}</td><td>${st.answers ?? 0}</td><td>${pct(st.yes_rate)}</td></tr>`;
  }).join('');
}

async function loadConfig() {
  const { data } = await db.from('app_config').select('key, value');
  const cfg = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  $('prompt').value = cfg.engine_prompt ?? '';
  $('model').value = cfg.model ?? 'claude-opus-5-5';
  $('effort').value = cfg.effort ?? 'low';
}

async function saveConfig() {
  const prompt = $('prompt').value.trim();
  if (prompt.length < 50) {
    $('status').textContent = 'Prompt looks too short to be intentional; not saved.';
    return;
  }
  $('status').textContent = 'Saving…';
  const { data: u } = await db.auth.getUser();
  const rows = [
    { key: 'engine_prompt', value: prompt, updated_by: u.user.id, updated_at: new Date().toISOString() },
    { key: 'model', value: $('model').value.trim(), updated_by: u.user.id, updated_at: new Date().toISOString() },
    { key: 'effort', value: $('effort').value, updated_by: u.user.id, updated_at: new Date().toISOString() },
  ];
  const { error } = await db.from('app_config').upsert(rows);
  $('status').textContent = error ? `Not saved: ${error.message}` : 'Saved. The next card uses this version.';
  if (!error) loadMetrics();
}

async function loadOriginal() {
  const { data } = await db.from('engine_prompt_versions').select('prompt').order('id', { ascending: true }).limit(1).maybeSingle();
  if (data) {
    $('prompt').value = data.prompt;
    $('status').textContent = 'Original loaded. Save to make it live.';
  }
}

async function show() {
  const { data } = await db.auth.getSession();
  if (!data.session) {
    $('login').classList.remove('hidden');
    $('app').classList.add('hidden');
    return;
  }
  const { data: isAdmin } = await db.rpc('is_admin');
  if (!isAdmin) {
    $('login').classList.remove('hidden');
    $('login').insertAdjacentHTML('beforeend', '<p class="bad">This account is not an admin.</p>');
    await db.auth.signOut();
    return;
  }
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  await Promise.all([loadMetrics(), loadConfig()]);
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { error } = await db.auth.signInWithPassword({ email: $('email').value, password: $('password').value });
  if (error) alert(error.message);
  else show();
});
$('signout').addEventListener('click', async () => { await db.auth.signOut(); show(); });
$('refresh').addEventListener('click', loadMetrics);
$('window').addEventListener('change', loadMetrics);
$('save').addEventListener('click', saveConfig);
$('reset').addEventListener('click', loadOriginal);
show();
