// Script diario: genera los cobros quincenales de franquicias y manda
// recordatorios por Telegram. Pensado para correr sin dependencias (Node 18+)
// vía GitHub Actions. No requiere npm install.

const SUPABASE_URL = 'https://ecljqfqzdatbanzvzxai.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

if (!SERVICE_KEY || !TG_TOKEN || !TG_CHAT) {
  console.error('Faltan variables de entorno (SUPABASE_SERVICE_ROLE_KEY / TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).');
  process.exit(1);
}

const SPACE_NAME = 'Cobros Franquicias';
const SPACE_COLOR = '#7c3aed';
const TAG_COBRO = { name: 'Cobro', color: '#7c3aed' };

const FRANQUICIAS = [
  { name: 'Independencia', color: '#1e88e5' },
  { name: 'Perón', color: '#8e24aa' },
  { name: 'Barrio Sur', color: '#43a047' },
  { name: 'Flip', color: '#fb8c00' },
  { name: 'Portal', color: '#e53935' },
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function pad(n) { return String(n).padStart(2, '0'); }

function iso(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }

function lastDayOfMonth(y, m) { return new Date(y, m, 0).getDate(); }

function argParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const o = {};
  parts.forEach(p => { o[p.type] = p.value; });
  return { year: +o.year, month: +o.month, day: +o.day };
}

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${path} -> ${res.status}: ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getOrCreateSpace() {
  const found = await sb(`spaces?name=eq.${encodeURIComponent(SPACE_NAME)}&select=id,name`);
  if (found && found.length) return found[0].id;
  const id = uid();
  await sb('spaces', {
    method: 'POST',
    body: JSON.stringify({ id, name: SPACE_NAME, color: SPACE_COLOR }),
  });
  console.log(`Espacio "${SPACE_NAME}" creado (${id}).`);
  return id;
}

function buildPeriod({ year, month, day }) {
  if (day === 1) {
    return {
      start: iso(year, month, 1),
      end: iso(year, month, 15),
      due: iso(year, month, 20),
      label: `01-15/${pad(month)}`,
    };
  }
  if (day === 16) {
    const last = lastDayOfMonth(year, month);
    let ny = year, nm = month + 1;
    if (nm === 13) { nm = 1; ny += 1; }
    return {
      start: iso(year, month, 16),
      end: iso(year, month, last),
      due: iso(ny, nm, 5),
      label: `16-${last}/${pad(month)}`,
    };
  }
  return null;
}

async function generarCobros(spaceId, period) {
  for (const f of FRANQUICIAS) {
    const title = `Cobro ${f.name} — período ${period.label}`;
    const exists = await sb(`tasks?title=eq.${encodeURIComponent(title)}&select=id`);
    if (exists && exists.length) continue;
    await sb('tasks', {
      method: 'POST',
      body: JSON.stringify({
        id: uid(),
        title,
        description: `Período ${period.start} al ${period.end}.`,
        status: 'pendiente',
        priority: 'normal',
        project_id: spaceId,
        due_date: period.due,
        due_time: '',
        comments: [],
        subtasks: [],
        tags: [TAG_COBRO, { name: f.name, color: f.color }],
      }),
    });
    console.log(`Creado: ${title} (vence ${period.due})`);
  }
}

async function enviarTelegram(text) {
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) console.error('Error enviando Telegram:', await res.text());
}

async function recordatorios(spaceId, todayIso) {
  const pendientes = await sb(
    `tasks?project_id=eq.${spaceId}&status=eq.pendiente&select=title,due_date,tags`
  );
  if (!pendientes || !pendientes.length) return;

  const tomorrow = new Date(`${todayIso}T00:00:00-03:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);

  const atrasados = pendientes.filter(t => t.due_date && t.due_date < todayIso);
  const hoy = pendientes.filter(t => t.due_date === todayIso);
  const mañana = pendientes.filter(t => t.due_date === tomorrowIso);

  if (!atrasados.length && !hoy.length && !mañana.length) return;

  const lines = ['<b>📋 Cobros Franquicias</b>'];
  if (atrasados.length) {
    lines.push('', '⚠️ <b>Atrasados:</b>');
    atrasados.forEach(t => lines.push(`• ${t.title} (venció ${t.due_date})`));
  }
  if (hoy.length) {
    lines.push('', '🔴 <b>Vencen hoy:</b>');
    hoy.forEach(t => lines.push(`• ${t.title}`));
  }
  if (mañana.length) {
    lines.push('', '🟡 <b>Vencen mañana:</b>');
    mañana.forEach(t => lines.push(`• ${t.title}`));
  }
  await enviarTelegram(lines.join('\n'));
}

async function main() {
  const parts = argParts();
  const todayIso = iso(parts.year, parts.month, parts.day);
  const spaceId = await getOrCreateSpace();

  const period = buildPeriod(parts);
  if (period) await generarCobros(spaceId, period);

  await recordatorios(spaceId, todayIso);
  console.log('Listo.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
