// One entry per side-menu section (except the dashboard). Each is a full page: `render(ctx)` fills ctx.body.
// `preview: false` hides the 3D preview and vehicle card so the page uses the whole width.
// ctx: { body, actions, fleet, state, branches, branch, select(vehicleId), flyTo(x, z, zoom), mark(), tip(event, text),
//        config, saveConfig(), alerts, alertsChanged() } — see showView() in app.js.
import { getRoutes, getWarehouse, getReports, getOnTime, getOnTimePeriods, orderProfit, getPurchases, getInventory, getUsers, saveUser, deleteUser, USER_ROLES, saveBranch, deleteBranch, getRouteCities } from './data.js';
import { h, badge, card, section, foldedSection, stats, empty, pesos, label } from './ui.js';
import { pedidos } from './pedidos.js';
import { mensajes } from './mensajes.js';
import { clientes, newId } from './clientes.js';
import { catalogo } from './catalogo.js';
import { proveedores } from './proveedores.js';
import { askAgent, SUGGESTIONS } from './agent.js';
import { getTemplate, saveTemplate, resetTemplate, fillTemplate, PLACEHOLDERS, PLACEHOLDER_LABELS, getMailServer, saveMailServer, SECURITY, isEmail } from './ocmail.js';
import { tokenEditor, paletteToken } from './tokeneditor.js';

const svg = (tag, attrs, ...kids) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  e.append(...kids);
  return e;
};

const STAR_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.9 5.6a2 2 0 001.5 1.5L21 12l-5.6 1.9a2 2 0 00-1.5 1.5L12 21l-1.9-5.6a2 2 0 00-1.5-1.5L3 12l5.6-1.9a2 2 0 001.5-1.5z"></path></svg>';
const SEND_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>';
const TRUCK_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M2 6h12v10H2zM14 9h4l3 3.5V16h-7z"></path><circle cx="6" cy="17.5" r="1.8"></circle><circle cx="17" cy="17.5" r="1.8"></circle></svg>';
const LIFT_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16V8h6l2 4v4z"></path><path d="M15 4v13M15 17h6"></path><circle cx="6" cy="18" r="2"></circle><circle cx="11" cy="18" r="2"></circle></svg>';

const meter = pct => h('div', { class: 'meter' }, h('div', { class: 'meter__fill', style: `width:${Math.max(0, Math.min(100, pct))}%` }));
// Sale, cost and profit of an order; the profit turns red when the order loses money.
const moneyFact = (label, value, cls) => h('div', { class: 'money' + (cls ? ' ' + cls : '') }, h('span', { class: 'money__label' }, label), h('span', { class: 'money__value' }, pesos(value)));
const orderMoney = s => h('div', { class: 'item__money' }, moneyFact('Venta', s.sale), moneyFact('Costo', s.cost), moneyFact('Profit', orderProfit(s), orderProfit(s) < 0 ? 'is-loss' : 'is-gain'));
const chips = (options, current, onPick) => h('div', { class: 'chips' }, options.map(o => h('button', { class: 'chipbtn' + (o === current ? ' is-on' : ''), onclick: () => onPick(o) }, o)));

// ---- charts (single blue series; values are read from the axis and the hover tooltip) ----
// Tonnes with at most two decimals: 6.5 → "6.5 t".
const tonnes = v => (Math.round(v * 100) / 100).toLocaleString('es-MX') + ' t';
const BLUE = '#2457e6', GRID = '#eef1f6', MUTED = '#a9b4c7', GAIN = '#18a957';
const STATUS_COLORS = { 'En tránsito': '#2457e6', 'En almacén': '#8a5cd6', 'Entregado': '#18a957' };

// `second`: another value per label, drawn as a green bar beside the first; `label(v, i)` is the text of the tooltip.
function barChart({ width, labels, values, second, max, step, unit, label = v => `${v} ${unit}` }, tip) {
  const H = 190, m = { l: 34, r: 8, t: 10, b: 24 }, pw = width - m.l - m.r, ph = H - m.t - m.b, band = pw / values.length;
  const y = v => m.t + ph - v / max * ph, root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${H}`, height: H, role: 'img' });
  for (let t = 0; t <= max; t += step) root.append(svg('line', { x1: m.l, x2: width - m.r, y1: y(t), y2: y(t), stroke: GRID }), svg('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, String(t)));
  values.forEach((v, i) => {
    const gap = second ? 3 : 0, bw = second ? Math.min(20, band * 0.34) : Math.min(28, band * 0.5), x = m.l + band * i + (band - (second ? bw * 2 + gap : bw)) / 2, r = Math.min(4, bw / 2);
    const shape = (left, value, fill) => { const top = Math.min(y(Math.max(value, 0)), y(0) - r); return svg('path', { d: `M${left},${y(0)}V${top + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${y(0)}z`, fill }); };
    const bar = shape(x, v, BLUE), other = second ? shape(x + bw + gap, second[i], GAIN) : null;
    const hit = svg('rect', { x: m.l + band * i, y: m.t, width: band, height: ph, fill: 'transparent' });
    hit.addEventListener('mousemove', e => { bar.setAttribute('fill', '#1a44bd'); tip(e, `${labels[i]}: ${label(v, i)}`); });
    hit.addEventListener('mouseleave', () => { bar.setAttribute('fill', BLUE); tip(null); });
    root.append(bar, other || '', svg('text', { x: m.l + band * (i + 0.5), y: H - 6, 'text-anchor': 'middle' }, labels[i]), hit);
  });
  return root;
}

// `compare` ({ name, values }) draws a second, dashed series behind the main one; the tooltip then shows both and their difference.
function lineChart({ width, labels, values, min, max, step, unit, name, compare }, tip) {
  const H = 190, m = { l: 34, r: 48, t: 12, b: 24 }, pw = width - m.l - m.r, ph = H - m.t - m.b, band = pw / (values.length - 1);
  const x = i => m.l + band * i, y = v => m.t + ph - (v - min) / (max - min) * ph, path = vals => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${H}`, height: H, role: 'img' });
  for (let t = min; t <= max; t += step) root.append(svg('line', { x1: m.l, x2: width - m.r, y1: y(t), y2: y(t), stroke: GRID }), svg('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, String(t)));
  if (compare) root.append(svg('path', { d: path(compare.values), fill: 'none', stroke: MUTED, 'stroke-width': 2, 'stroke-dasharray': '5 5', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  root.append(svg('path', { d: path(values), fill: 'none', stroke: BLUE, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const last = values.length - 1;
  root.append(svg('circle', { cx: x(last), cy: y(values[last]), r: 4, fill: BLUE, stroke: '#fff', 'stroke-width': 2 }), svg('text', { class: 'chart__label', x: x(last) + 8, y: y(values[last]) + 4 }, values[last] + unit));
  const cross = svg('line', { y1: m.t, y2: m.t + ph, stroke: '#c9d3e3', visibility: 'hidden' }), dot = svg('circle', { r: 4.5, fill: BLUE, stroke: '#fff', 'stroke-width': 2, visibility: 'hidden' });
  const dot2 = svg('circle', { r: 4, fill: MUTED, stroke: '#fff', 'stroke-width': 2, visibility: 'hidden' });
  root.append(cross, dot2, dot);
  const every = Math.ceil(values.length / 12); // long periods only label some of their points
  values.forEach((v, i) => {
    const hit = svg('rect', { x: x(i) - band / 2, y: m.t, width: band, height: ph, fill: 'transparent' });
    hit.addEventListener('mousemove', e => {
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(v));
      cross.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');
      if (!compare) return tip(e, `${labels[i]}: ${v}${unit}`);
      const c = compare.values[i];
      dot2.setAttribute('cx', x(i)); dot2.setAttribute('cy', y(c)); dot2.setAttribute('visibility', 'visible');
      tip(e, `${labels[i]} · ${name}: ${v}${unit} · ${compare.name}: ${c}${unit} (${signed(v - c)} pts)`);
    });
    hit.addEventListener('mouseleave', () => { [cross, dot, dot2].forEach(n => n.setAttribute('visibility', 'hidden')); tip(null); });
    if (i % every === 0) root.append(svg('text', { x: x(i), y: H - 6, 'text-anchor': 'middle' }, labels[i]));
    root.append(hit);
  });
  return root;
}

const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
const mean = list => list.reduce((a, v) => a + v, 0) / list.length;

// "Entregas a tiempo" card: broken down by day, week, month or year and, optionally, compared with an earlier period.
// The choice lives in state.onTime so it survives redraws. Call draw() once the card is in the page (the chart needs its width).
function onTimeCard(scope, state, tip, periods) {
  const opt = state.onTime || (state.onTime = { period: 'semana', compare: 'prev' });
  const controls = h('div', { class: 'toolbar' }), chart = h('div'), summary = h('div', { class: 'versus' });
  const draw = async () => {
    const period = periods.find(p => p.id === opt.period) || periods[0];
    if (!period.compare.some(c => c.id === opt.compare)) opt.compare = 'prev'; // e.g. a year has no "same period last year"
    const r = await getOnTime(scope, period.id, opt.compare), all = r.current.values.concat(r.compare ? r.compare.values : []);
    const min = Math.floor(Math.min(...all) / 2) * 2 - 2, max = Math.ceil(Math.max(...all) / 2) * 2;
    controls.replaceChildren(
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Desglose' }, periods.map(p => h('button', { class: 'chipbtn' + (p === period ? ' is-on' : ''), onclick: () => { opt.period = p.id; draw(); } }, p.title))),
      h('label', { class: 'versus__pick' }, 'vs', h('select', { class: 'select', 'aria-label': 'Comparar con', onchange: e => { opt.compare = e.target.value; draw(); } },
        period.compare.map(c => h('option', { value: c.id, selected: c.id === opt.compare }, c.name)))));
    chart.replaceChildren(lineChart({ width: chart.clientWidth || 480, labels: r.labels, values: r.current.values, min, max, step: max - min > 12 ? 4 : 2, unit: '%', name: r.current.name, compare: r.compare }, tip));
    const now = mean(r.current.values), entry = (cls, name, value) => h('div', { class: 'legend__item' }, h('span', { class: 'legend__swatch ' + cls }), `${name} · ${value.toFixed(1)}%`);
    if (!r.compare) return summary.replaceChildren(entry('legend__swatch--now', r.current.name + ' (promedio)', now));
    const before = mean(r.compare.values), diff = Math.round((now - before) * 10) / 10;
    summary.replaceChildren(entry('legend__swatch--now', r.current.name, now), entry('legend__swatch--before', r.compare.name, before),
      h('div', { class: 'versus__diff ' + (diff < 0 ? 'is-loss' : 'is-gain') }, `${signed(diff)} pts`), h('div', { class: 'item__sub' }, 'Promedio del periodo'));
  };
  return { el: h('div', { class: 'card section' }, h('div', { class: 'section__head' }, h('div', { class: 'section__title' }, 'Entregas a tiempo (%)'), controls), chart, summary), draw };
}

// Axis for a bar chart: a round step that gives at most 5 gridlines.
const niceScale = top => { const step = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find(s => top / s <= 5) || 20000; return { max: Math.ceil(top / step) * step, step }; };
const millions = n => '$' + (n / 1e6).toFixed(2) + ' M';

// ---- modules ----
export const modules = {
  // Chat with the AI agent (see agent.js). Empty, it is a centred prompt with suggestions; once there are messages
  // they fill the page and the prompt stays at the bottom. The conversation lives in state.chat, so it survives leaving the page.
  chat: {
    title: 'Chat', sub: 'Agente IA de DASH100.', preview: false,
    render({ body, fleet, alerts, branch, state }) {
      const chat = state.chat || (state.chat = { messages: [], busy: false });
      const thread = h('div', { class: 'chat__thread', role: 'log', 'aria-live': 'polite' });
      const input = h('textarea', { class: 'chat__input', rows: 1, placeholder: 'Pregunta al agente de DASH100…', 'aria-label': 'Mensaje para el agente' });
      const send = h('button', { class: 'chat__send', type: 'submit', title: 'Enviar', 'aria-label': 'Enviar', html: SEND_ICON });
      const reset = h('button', { class: 'link-btn', type: 'button', onclick: () => { chat.messages.length = 0; draw(); input.focus(); } }, 'Nueva conversación');
      const bubble = m => h('div', { class: 'msg msg--' + m.role }, m.role === 'agent' ? h('span', { class: 'msg__avatar', html: STAR_ICON }) : null, h('div', { class: 'msg__text' }, m.text));
      const draw = () => {
        root.classList.toggle('is-empty', !chat.messages.length);
        thread.replaceChildren(...chat.messages.map(bubble));
        if (chat.busy) thread.append(h('div', { class: 'msg msg--agent' }, h('span', { class: 'msg__avatar', html: STAR_ICON }), h('div', { class: 'msg__text msg__typing', 'aria-label': 'El agente está escribiendo' }, h('i'), h('i'), h('i'))));
        send.disabled = chat.busy || !input.value.trim();
        reset.hidden = !chat.messages.length || chat.busy;
        thread.scrollTop = thread.scrollHeight;
      };
      const ask = async text => {
        text = text.trim();
        if (!text || chat.busy) return;
        chat.messages.push({ role: 'user', text }); chat.busy = true;
        input.value = ''; input.style.height = ''; draw();
        let reply;
        try { reply = await askAgent(text, { history: chat.messages, fleet, alerts, branch }); } catch { reply = 'No pude responder en este momento. Intenta de nuevo.'; }
        chat.messages.push({ role: 'agent', text: reply }); chat.busy = false;
        draw(); // redraws this page's nodes; harmless if the user already left it
      };
      input.addEventListener('input', () => { input.style.height = ''; input.style.height = Math.min(160, input.scrollHeight) + 'px'; send.disabled = chat.busy || !input.value.trim(); });
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
      const root = h('div', { class: 'chat' },
        h('div', { class: 'chat__hello' }, h('span', { class: 'chat__star', html: STAR_ICON }), '¿En qué trabajamos hoy?'),
        thread,
        h('form', { class: 'chat__composer', onsubmit: e => { e.preventDefault(); ask(input.value); } }, input,
          h('div', { class: 'chat__bar' },
            h('span', { class: 'chat__model' }, h('span', { class: 'chat__star', html: STAR_ICON }), `Agente DASH100 · ${branch ? branch.city : 'Todas las sucursales'}`),
            reset,
            send)),
        h('div', { class: 'chat__ideas' }, SUGGESTIONS.map(([title, text, question]) => h('button', { class: 'idea', onclick: () => ask(question) }, h('div', { class: 'item__title' }, title), h('div', { class: 'item__sub' }, text)))),
        h('div', { class: 'chat__note' }, 'Versión de demostración: responde con los datos del panel. Verifica la información importante.'));
      body.replaceChildren(root);
      draw();
      input.focus();
    },
  },

  envios: {
    title: 'Envíos', sub: 'Todos los envíos activos. Selecciona uno para verlo en el mapa.',
    render({ body, fleet, state, select, mark }) {
      const ships = fleet.filter(f => f.kind === 'truck').map(f => f.shipment);
      let status = 'Todos', query = state.query || '';
      state.query = '';
      const search = h('input', { class: 'field', placeholder: 'Buscar por ID, producto o ciudad…', value: query, 'aria-label': 'Buscar envíos', oninput: e => { query = e.target.value; draw(); } });
      const toolbar = h('div', { class: 'toolbar' }), list = h('div', { class: 'list' });
      const draw = () => {
        const q = query.trim().toLowerCase();
        const rows = ships.filter(s => (status === 'Todos' || s.status === status) && `${s.id} ${s.product} ${s.origin} ${s.dest}`.toLowerCase().includes(q));
        toolbar.replaceChildren(search, chips(['Todos', 'En tránsito', 'En almacén', 'Entregado'], status, o => { status = o; draw(); }));
        list.replaceChildren(...(rows.length ? rows.map(s => h('button', { class: 'item item--ship', dataset: { vehicle: s.vehicleId }, onclick: () => select(s.vehicleId) },
          h('div', { class: 'item__id' }, '#' + s.id),
          h('div', null, h('div', { class: 'item__title' }, s.product), h('div', { class: 'item__sub' }, `${s.origin} → ${s.dest}`)),
          badge(s.status),
          h('div', { class: 'item__right' }, s.eta),
          orderMoney(s),
        )) : [empty('Ningún envío coincide con la búsqueda.')]));
        mark();
      };
      const sale = ships.reduce((a, s) => a + s.sale, 0), cost = ships.reduce((a, s) => a + s.cost, 0);
      body.replaceChildren(stats([[pesos(sale), 'Venta total'], [pesos(cost), 'Costo total'], [pesos(sale - cost), 'Profit total'], [(sale ? (sale - cost) / sale * 100 : 0).toFixed(1) + '%', 'Margen']]), card(toolbar, list));
      draw();
    },
  },

  flota: {
    title: 'Flota', sub: 'Tráileres y montacargas en operación.',
    render({ body, fleet, select, mark }) {
      const trucks = fleet.filter(f => f.kind === 'truck'), lifts = fleet.filter(f => f.kind === 'forklift');
      let kind = 'Todos';
      const toolbar = h('div', { class: 'toolbar' }), list = h('div', { class: 'list' });
      const row = f => f.kind === 'truck'
        ? h('button', { class: 'item item--unit', dataset: { vehicle: f.vehicle.id }, onclick: () => select(f.vehicle.id) },
          h('span', { class: 'item__icon', html: TRUCK_ICON }),
          h('div', null, h('div', { class: 'item__title' }, 'Tráiler ' + f.vehicle.id), h('div', { class: 'item__sub' }, `Envío #${f.shipment.id} · ${f.shipment.product}`)),
          badge(f.vehicle.parked ? 'Estacionado' : 'En ruta'),
          h('div', { class: 'item__right' }, f.shipment.pallets + ' tarimas'))
        : h('button', { class: 'item item--unit', dataset: { vehicle: f.vehicle.id }, onclick: () => select(f.vehicle.id) },
          h('span', { class: 'item__icon item__icon--lift', html: LIFT_ICON }),
          h('div', null, h('div', { class: 'item__title' }, 'Montacargas ' + f.forklift.id), h('div', { class: 'item__sub' }, `${f.forklift.task} · ${f.forklift.operator}`)),
          badge(f.forklift.status),
          h('div', { class: 'item__right' }, `Batería ${f.forklift.battery}%`));
      const draw = () => {
        toolbar.replaceChildren(chips(['Todos', 'Tráileres', 'Montacargas'], kind, o => { kind = o; draw(); }));
        list.replaceChildren(...(kind === 'Tráileres' ? trucks : kind === 'Montacargas' ? lifts : fleet).map(row));
        mark();
      };
      body.replaceChildren(stats([
        [trucks.length, 'Tráileres'], [trucks.filter(f => !f.vehicle.parked).length, 'En ruta'],
        [lifts.length, 'Montacargas'], [lifts.filter(f => !f.vehicle.parked).length, 'Activos'],
      ]), card(toolbar, list));
      draw();
    },
  },

  almacen: {
    title: 'Almacén', sub: 'Andenes, zonas e inventario de los productos del catálogo. Selecciona un andén o zona para ubicarlo en el mapa.',
    async render({ body, flyTo, branch }) {
      // Inventory: the products of the catalogue, with what the branch's purchase orders brought in minus what its sales took out.
      const stock = await getInventory(branch && branch.id).catch(() => null);
      const inventory = () => {
        if (!stock) return section('Inventario por producto (toneladas)', empty('No se pudo abrir el almacenamiento de este navegador, así que no es posible calcular el inventario.'));
        const top = Math.max(1, ...stock.map(p => p.stock));
        return section('Inventario por producto (toneladas)',
          stock.length ? stock.map(p => h('div', { class: 'hbar hbar--wide', title: `Entró ${tonnes(p.bought)} en órdenes de compra · salió ${tonnes(p.sold)} en ventas` },
            h('div', null, p.name), meter(Math.max(0, p.stock) / top * 100), h('div', { class: 'hbar__value' + (p.stock < 0 ? ' is-loss' : '') }, h('span', { class: 'money__value' }, tonnes(p.stock)))))
            : empty('El catálogo está vacío. Agrega productos en Catálogo.'),
          h('div', { class: 'item__sub' }, 'Productos del Catálogo. Existencia = lo que entró con las órdenes de compra de la sucursal menos lo que salió en sus ventas.'));
      };
      if (branch && branch.hasData === false) { body.replaceChildren(card(empty(`${branch.name} es una sucursal nueva: aún no tiene andenes ni zonas registrados.`)), inventory()); return; }
      const { docks, zones } = await getWarehouse(branch && branch.id);
      const free = docks.filter(d => d.status === 'Libre').length, used = zones.reduce((a, z) => a + z.used, 0), cap = zones.reduce((a, z) => a + z.capacity, 0);
      body.replaceChildren(
        stats([[docks.length, 'Andenes'], [free, 'Libres'], [Math.round(used / cap * 100) + '%', 'Ocupación'], [stock ? tonnes(stock.reduce((a, p) => a + p.stock, 0)) : '—', 'En inventario']]),
        section(branch ? `Andenes · ${branch.city}` : 'Andenes', h('div', { class: 'docks' }, docks.map(d => h('button', { class: 'dock', onclick: () => flyTo(d.x, d.z, 2.2) },
          h('div', { class: 'item__title' }, d.name), badge(d.status), h('div', { class: 'item__sub' }, d.detail))))),
        section('Zonas', h('div', { class: 'list' }, zones.map(z => h('button', { class: 'item item--zone', onclick: () => flyTo(z.x, z.z, z.zoom) },
          h('div', { class: 'item__title' }, z.name), meter(z.used / z.capacity * 100), h('div', { class: 'item__right' }, `${z.used} / ${z.capacity}`))))),
        inventory(),
      );
    },
  },

  rutas: {
    title: 'Rutas', sub: 'Rutas activas y el avance de cada envío.',
    async render({ body, fleet, select, mark }) {
      const routes = await getRoutes(fleet), km = routes.reduce((a, r) => a + r.km, 0);
      body.replaceChildren(
        stats([[routes.length, 'Rutas activas'], [routes.reduce((a, r) => a + r.shipments.length, 0), 'Envíos'], [km.toLocaleString('es-MX'), 'Km totales'], [Math.round(km / routes.length), 'Km promedio']]),
        ...routes.map(r => h('div', { class: 'route' },
          h('div', { class: 'route__head' }, h('div', { class: 'item__title' }, `${r.origin} → ${r.dest}`), h('div', { class: 'item__sub' }, `${r.km} km · ${r.shipments.length} ${r.shipments.length === 1 ? 'envío' : 'envíos'}`)),
          r.shipments.map(s => h('button', { class: 'item item--leg', dataset: { vehicle: s.vehicleId }, title: `Avance: ${s.track} de 4 etapas`, onclick: () => select(s.vehicleId) },
            h('div', { class: 'item__id' }, '#' + s.id), meter(s.track / 4 * 100), badge(s.status))))),
      );
      mark();
    },
  },

  reportes: {
    title: 'Reportes', sub: 'Resumen de los últimos 7 días, por sucursal o de todas juntas.', preview: false,
    async render({ body, actions, tip, state, branches }) {
      // state.reportScope: a branch id or 'general' (every branch). It starts on the branch picked in the top bar.
      const draw = async () => {
        const scope = state.reportScope || 'general', r = await getReports(scope), bought = await getPurchases(scope), bars = h('div'), money = h('div'), onTime = onTimeCard(scope, state, tip, await getOnTimePeriods());
        if (scope !== (state.reportScope || 'general')) return; // another scope was picked while loading
        const pick = id => { state.reportScope = id; draw(); };
        actions.replaceChildren(h('div', { class: 'chips', role: 'group', 'aria-label': 'Sucursal del reporte' },
          h('button', { class: 'chipbtn chipbtn--all' + (scope === 'general' ? ' is-on' : ''), onclick: () => pick('general') }, 'Vista general'),
          branches.map(b => h('button', { class: 'chipbtn' + (b.id === scope ? ' is-on' : ''), onclick: () => pick(b.id) }, b.city))));
        // Compras: how much material is being bought, from the purchase orders (OC) of Pedidos.
        const compras = () => section('Compras · material comprado en los últimos 7 días',
          stats([[tonnes(bought.totals.tons), 'Toneladas compradas'], [pesos(bought.totals.amount), 'Importe de compras'], [bought.totals.orders, 'Órdenes de compra'], [bought.totals.approved, 'Solicitudes aprobadas']]),
          bought.materials.length
            ? bought.materials.map(m => h('div', { class: 'hbar hbar--wide' }, h('div', null, m.name), meter(m.amount / bought.materials[0].amount * 100), h('div', { class: 'hbar__value' }, [...(m.tons ? [tonnes(m.tons)] : []), ...m.others, pesos(m.amount)].join(' · '))))
            : empty('Aún no hay órdenes de compra en los últimos 7 días' + (scope === 'general' ? '.' : ' para esta sucursal.') + ' Regístralas en Pedidos con "Nueva OC".'),
          h('div', { class: 'item__sub' }, 'Sale de las órdenes de compra (OC) registradas en Pedidos. Las barras comparan el importe de cada material.'));
        // A branch added in Configuración has no figures of its own yet: only its purchases can be shown.
        const own = branches.find(b => b.id === scope);
        if (own && own.hasData === false) { body.replaceChildren(card(empty(`${own.name} es una sucursal nueva: aún no tiene envíos ni ventas que reportar.`)), compras()); return; }
        const t = r.totals, topSales = Math.max(...r.branches.map(b => b.sales)), allSales = r.branches.reduce((a, b) => a + b.sales, 0);
        body.replaceChildren(
          stats([[t.shipments, 'Envíos'], [t.onTime + '%', 'A tiempo'], [t.processingHours + ' h', 'Tiempo de proceso'], [t.incidents, 'Incidencias']]),
          stats([[pesos(t.sales), 'Ventas'], [pesos(t.cost), 'Costo'], [pesos(t.profit), 'Profit'], [(t.profit / t.sales * 100).toFixed(1) + '%', 'Margen']]),
          h('div', { class: 'grid2' }, section('Ventas y profit por día (miles de MXN)', money,
            h('div', { class: 'legend' }, h('div', { class: 'legend__item' }, h('span', { class: 'legend__swatch', style: `background:${BLUE}` }), 'Ventas'), h('div', { class: 'legend__item' }, h('span', { class: 'legend__swatch', style: `background:${GAIN}` }), 'Profit (ventas − costo)'))), section('Ventas por sucursal',
            r.branches.map(b => h('button', { class: 'hbar hbar--pick' + (scope === 'general' || scope === b.id ? '' : ' is-muted'), title: `Ver reporte de ${b.name}`, onclick: () => pick(b.id) },
              h('div', null, b.name), meter(b.sales / topSales * 100), h('div', { class: 'hbar__value' }, millions(b.sales)))),
            h('div', { class: 'item__sub' }, scope === 'general' ? 'Selecciona una sucursal para ver su reporte.' : `${(t.sales / allSales * 100).toFixed(1)}% de las ventas de todas las sucursales.`))),
          compras(),
          h('div', { class: 'grid2' }, section('Envíos por día', bars), onTime.el),
          h('div', { class: 'grid2' }, section('Envíos por estado',
            h('div', { class: 'stack' }, r.status.map(s => h('div', { class: 'stack__seg', style: `flex:${s.value};background:${STATUS_COLORS[s.name]}`, onmousemove: e => tip(e, `${s.name}: ${s.value}%`), onmouseleave: () => tip(null) }))),
            h('div', { class: 'legend' }, r.status.map(s => h('div', { class: 'legend__item' }, h('span', { class: 'legend__swatch', style: `background:${STATUS_COLORS[s.name]}` }), `${s.name} · ${s.value}%`)))),
          section('Destinos principales (envíos)', r.destinations.map(d => h('div', { class: 'hbar' }, h('div', null, d.name), meter(d.value / r.destinations[0].value * 100), h('div', { class: 'hbar__value' }, String(d.value)))))),
        );
        // The charts are drawn to the width their cards ended up with.
        const thousands = r.sales.map(v => Math.round(v / 1000));
        money.append(barChart({ width: money.clientWidth || 480, labels: r.days, values: thousands, second: r.profit.map(v => Math.round(v / 1000)), ...niceScale(Math.max(...thousands)),
          label: (v, i) => `Ventas ${pesos(r.sales[i])} · Profit ${pesos(r.profit[i])} (margen ${(r.profit[i] / r.sales[i] * 100).toFixed(1)}%)` }, tip));
        bars.append(barChart({ width: bars.clientWidth || 480, labels: r.days, values: r.shipments, ...niceScale(Math.max(...r.shipments)), unit: 'envíos' }, tip));
        onTime.draw();
      };
      await draw();
    },
  },

  pedidos, mensajes, clientes, proveedores, catalogo,

  alertas: {
    title: 'Alertas', sub: 'Selecciona una alerta para ver dónde ocurre.',
    render({ body, actions, alerts, alertsChanged, select, flyTo }) {
      const list = h('div', { class: 'list' });
      const open = a => { a.read = true; alertsChanged(); draw(); if (a.vehicleId) select(a.vehicleId); else if (a.spot) flyTo(a.spot.x, a.spot.z, 2.2); };
      const draw = () => {
        const unread = alerts.filter(a => !a.read).length;
        actions.replaceChildren(unread ? h('button', { class: 'btn-small', onclick: () => { alerts.forEach(a => { a.read = true; }); alertsChanged(); draw(); } }, 'Marcar todas como leídas') : '');
        list.replaceChildren(...alerts.map(a => h('button', { class: 'item item--alert' + (a.read ? ' is-read' : ''), onclick: () => open(a) },
          h('span', { class: 'dot', dataset: { level: a.level } }),
          h('div', null, h('div', { class: 'item__title' }, a.title), h('div', { class: 'item__sub' }, a.detail), h('div', { class: 'item__sub' }, a.time)),
          badge(a.level))));
      };
      body.replaceChildren(card(list));
      draw();
    },
  },

  ajustes: {
    title: 'Configuración', sub: 'Los cambios se aplican al instante y se guardan en este navegador.',
    async render({ body, config, saveConfig, resetConfig, branches, branch, reloadBranches }) {
      const setting = (title, sub, control) => h('div', { class: 'setting' }, h('div', { class: 'setting__text' }, h('div', { class: 'item__title' }, title), h('div', { class: 'item__sub' }, sub)), h('div', { class: 'setting__control' }, control));
      const block = (title, key, ...kids) => foldedSection(title, 'cfg-' + key, ...kids); // the contents of one tab: folded until it is opened, and it remembers it
      const toggle = key => { const b = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(config[key]), onclick: () => { config[key] = !config[key]; b.setAttribute('aria-checked', String(config[key])); saveConfig(); } }); return b; };
      // Template of the e-mail a purchase order (OC) is sent with. The fields the order fills in show as boxes that
      // are dragged (or clicked) from the palette into the subject or the message. It is saved as it is edited; the
      // example under it shows how it reads with a sample order.
      const mailTemplate = () => {
        const t = getTemplate(), sample = { proveedor: 'Recicladora del Norte', contacto: 'Sergio Garza', material: 'Cartón', cantidad: '12', unidad: 'toneladas', precio: '$2,650.00 por tonelada', total: '$31,800.00', folio: 'OC-0001', fecha: '5 oct 2026', sucursal: 'Monterrey', notas: '' };
        const preview = h('pre', { class: 'mailpreview' }), company = h('input', { class: 'input', value: t.company, placeholder: 'Nombre de la empresa', oninput: () => save() }), sender = h('input', { class: 'input', value: t.sender, placeholder: 'Nombre de quien firma' });
        const save = () => {
          const now = { company: company.value, sender: sender.value, subject: subject.getValue(), body: message.getValue() }, values = { ...sample, usuario: now.sender, empresa: now.company };
          saveTemplate(now);
          preview.textContent = `Asunto: ${fillTemplate(now.subject, values)}\n\n${fillTemplate(now.body, values)}`;
        };
        const subject = tokenEditor({ value: t.subject, labels: PLACEHOLDER_LABELS, multiline: false, onChange: save, label: 'Asunto' }), message = tokenEditor({ value: t.body, labels: PLACEHOLDER_LABELS, onChange: save, label: 'Mensaje' });
        let target = message; // the box a clicked field goes to: the last one of the two that was used
        subject.el.addEventListener('focus', () => { target = subject; }); message.el.addEventListener('focus', () => { target = message; });
        const fields = h('div', { class: 'form__grid', oninput: save },
          label('Quien envía (firma)', sender, 'span2'),
          h('div', { class: 'lbl span4' }, 'Asunto', subject.el),
          h('div', { class: 'lbl span4' }, 'Datos de la orden',
            h('div', { class: 'tokens' }, PLACEHOLDERS.map(([name, what, text]) => paletteToken(name, text, what, picked => target.insert(picked)))),
            h('span', { class: 'lbl__hint' }, 'Arrastra un dato al asunto o al mensaje, o haz clic para insertarlo donde está el cursor. Dentro del texto puedes moverlo arrastrándolo y quitarlo con la tecla de borrar.')),
          h('div', { class: 'lbl span4' }, 'Mensaje', message.el));
        save();
        // The company's name is shown in the General block; it is saved with the template because the e-mails are signed with it.
        return [company, block('Correo de las órdenes de compra (OC)', 'correo',
          h('div', { class: 'item__sub' }, 'Plantilla del mensaje que se envía al proveedor al dar "Enviar" en una OC. Cada dato en azul se sustituye con el de la orden.'),
          fields,
          h('div', { class: 'item__title' }, 'Así se ve con una orden de ejemplo'), preview,
          h('div', null, h('button', { class: 'btn-small', onclick: () => { resetTemplate(); draw(); } }, 'Restablecer plantilla')))];
      };
      // The account and outgoing server the e-mails are sent from. Saved as it is typed, except the password (see ocmail.js).
      const mailServer = () => {
        const s = getMailServer(), field = (name, attrs) => h('input', { class: 'input', name, value: s[name] ?? '', autocomplete: 'off', ...attrs });
        const status = h('div', { class: 'lbl__hint span4' });
        const security = h('select', { class: 'input', name: 'security' }, SECURITY.map(([id, text]) => h('option', { value: id, selected: id === s.security }, text)));
        const port = field('port', { type: 'number', min: 1, max: 65535, inputmode: 'numeric', placeholder: '587' });
        const grid = h('div', { class: 'form__grid',
          onchange: e => { if (e.target === security) { port.value = SECURITY.find(([id]) => id === security.value)[2]; save(); } },
          oninput: () => save() },
          label('Dominio', [field('domain', { placeholder: 'tuempresa.mx' }), h('span', { class: 'lbl__hint' }, 'El dominio de tus correos.')], 'span2'),
          label('Correo remitente', [field('fromEmail', { type: 'email', placeholder: 'compras@tuempresa.mx' }), h('span', { class: 'lbl__hint' }, 'La dirección desde la que salen las órdenes.')], 'span2'),
          label('Nombre del remitente', field('fromName', { placeholder: 'Compras · Tu Empresa' }), 'span2'),
          label('Responder a', [field('replyTo', { type: 'email', placeholder: 'Opcional' }), h('span', { class: 'lbl__hint' }, 'A dónde llegan las respuestas, si no es al remitente.')], 'span2'),
          label('Servidor de salida (SMTP)', field('host', { placeholder: 'smtp.tuempresa.mx' }), 'span2'),
          label('Seguridad', security),
          label('Puerto de salida', port),
          label('Usuario', [field('user', { placeholder: 'compras@tuempresa.mx' }), h('span', { class: 'lbl__hint' }, 'Casi siempre es el correo completo.')], 'span2'),
          label('Contraseña', [h('input', { class: 'input', type: 'password', name: 'password', autocomplete: 'new-password', placeholder: 'Contraseña o clave de aplicación' }),
            h('span', { class: 'lbl__hint' }, 'No se guarda en este navegador: se registrará en el servidor cuando el envío esté conectado.')], 'span2'),
          status);
        const save = () => {
          const now = Object.fromEntries(['domain', 'fromEmail', 'fromName', 'replyTo', 'host', 'user'].map(name => [name, grid.querySelector(`[name="${name}"]`).value.trim()]));
          saveMailServer({ ...now, port: Number(port.value) || 587, security: security.value });
          const missing = [[now.fromEmail, 'correo remitente'], [now.host, 'servidor de salida'], [now.user, 'usuario']].filter(([value]) => !value).map(([, name]) => name);
          status.textContent = now.fromEmail && !isEmail(now.fromEmail) ? 'El correo remitente no parece una dirección válida.'
            : now.replyTo && !isEmail(now.replyTo) ? 'El correo de "Responder a" no parece una dirección válida.'
            : missing.length ? `Falta: ${missing.join(', ')}.` : 'Datos de la cuenta completos y guardados.';
        };
        save();
        return block('Cuenta y servidor de correo', 'servidor',
          h('div', { class: 'item__sub' }, 'La cuenta desde la que se enviarán los correos. Tu proveedor de correo te da el servidor, el puerto y el tipo de seguridad.'),
          grid,
          h('div', { class: 'module__note' }, 'El envío directo aún no está conectado: por ahora "Enviar" en una OC abre tu programa de correo con el mensaje listo. Estos datos quedan listos para cuando se conecte.'));
      };
      // Users: a directory with the role of each one, kept in this browser. `users` is null if the storage can't be opened.
      let users = await getUsers().catch(() => null), editingUser = null, confirmingUser = null; // editingUser: the user in the form ({} for a new one)
      const reloadUsers = async () => { users = await getUsers(); editingUser = null; confirmingUser = null; draw(); };
      const branchName = id => { const b = (branches || []).find(x => x.id === id); return b ? b.city : 'Todas las sucursales'; };
      const userForm = u => {
        const error = h('div', { class: 'form__error', hidden: true }), fail = text => { error.textContent = text; error.hidden = false; };
        const text = (name, attrs) => h('input', { class: 'input', name, value: u[name] || '', autocomplete: 'off', ...attrs });
        const pick = (name, options, chosen) => h('select', { class: 'input', name, required: name === 'role' }, options.map(([value, shown]) => h('option', { value, selected: value === chosen }, shown)));
        const f = h('form', { class: 'userform', onsubmit: async e => {
          e.preventDefault();
          const d = new FormData(f), get = key => String(d.get(key) || '').trim();
          const user = { ...u, id: u.id || newId(), name: get('name'), role: get('role'), email: get('email'), phone: get('phone'), branchId: get('branchId'), active: get('active') === 'si' };
          if (user.email && users.some(x => x.id !== user.id && x.email && x.email.toLowerCase() === user.email.toLowerCase())) return fail(`Ya hay un usuario con el correo ${user.email}.`);
          try { await saveUser(user); } catch { return fail('No se pudo guardar. Revisa el espacio disponible del navegador e inténtalo de nuevo.'); }
          await reloadUsers();
        } },
          h('div', { class: 'item__title' }, u.id ? `Editar usuario · ${u.name}` : 'Nuevo usuario'),
          h('div', { class: 'form__grid' },
            label('Nombre completo', text('name', { placeholder: 'Nombre y apellidos', required: true }), 'span2'),
            label('Rol', pick('role', [['', 'Selecciona…'], ...USER_ROLES.map(r => [r, r]), ...(u.role && !USER_ROLES.includes(u.role) ? [[u.role, u.role]] : [])], u.role || ''), 'span2'),
            label('Correo', text('email', { type: 'email', placeholder: 'correo@empresa.mx' }), 'span2'),
            label('Teléfono', text('phone', { type: 'tel', placeholder: '81 0000 0000' }), 'span2'),
            label('Sucursal', pick('branchId', [['', 'Todas las sucursales'], ...(branches || []).map(b => [b.id, b.city])], u.branchId || ''), 'span2'),
            label('Estado', pick('active', [['si', 'Activo'], ['no', 'Inactivo']], u.active === false ? 'no' : 'si'), 'span2')),
          error,
          h('div', { class: 'toolbar' }, h('button', { class: 'btn-primary', type: 'submit' }, 'Guardar'), h('button', { class: 'btn-small', type: 'button', onclick: () => { editingUser = null; draw(); } }, 'Cancelar')));
        return f;
      };
      const userRow = u => setting(u.name, [u.role || 'Sin rol', branchName(u.branchId), u.email, u.phone].filter(Boolean).join(' · '), [
        badge(u.active === false ? 'Inactivo' : 'Activo'),
        ...(confirmingUser === u.id
          ? [h('button', { class: 'link-btn link-btn--danger', onclick: async () => { await deleteUser(u.id); await reloadUsers(); } }, 'Confirmar'), h('button', { class: 'link-btn', onclick: () => { confirmingUser = null; draw(); } }, 'Cancelar')]
          : [h('button', { class: 'link-btn', onclick: () => { editingUser = u; confirmingUser = null; draw(); } }, 'Editar'),
            u.fixed ? null : h('button', { class: 'link-btn link-btn--danger', onclick: () => { confirmingUser = u.id; draw(); } }, 'Eliminar')])]);
      const usersBlock = () => !users ? block('Usuarios', 'usuarios', empty('No se pudo abrir el almacenamiento de este navegador, así que no es posible guardar usuarios aquí.'))
        : block('Usuarios', 'usuarios',
          editingUser ? userForm(editingUser) : h('div', null, h('button', { class: 'btn-primary', onclick: () => { editingUser = {}; confirmingUser = null; draw(); } }, 'Nuevo usuario')),
          users.map(userRow),
          h('div', { class: 'module__note' }, 'Por ahora es un directorio: aún no hay inicio de sesión, así que el rol todavía no limita lo que cada usuario puede ver o hacer.'));
      // Branches: the starting ones can be edited (not removed); new ones are added here. Kept in this browser.
      const YARDS = [['mty', 'Azul (como Monterrey)'], ['gdl', 'Verde azulado (como Guadalajara)'], ['mid', 'Naranja (como Mérida)']];
      const cities = await getRouteCities();
      let editingBranch = null, confirmingBranch = null; // editingBranch: the branch in the form ({} for a new one)
      const refreshBranches = async () => { ({ branches, branch } = await reloadBranches()); editingBranch = null; confirmingBranch = null; draw(); };
      const branchAddress = b => [b.street, b.neighborhood, [b.zip, b.city].filter(Boolean).join(' '), b.state].filter(Boolean).join(', ');
      const branchForm = b => {
        const error = h('div', { class: 'form__error', hidden: true }), fail = text => { error.textContent = text; error.hidden = false; };
        const text = (name, attrs) => h('input', { class: 'input', name, value: b[name] || '', autocomplete: 'off', ...attrs });
        const pick = (name, options, chosen, required) => h('select', { class: 'input', name, required }, options.map(([value, shown]) => h('option', { value, selected: value === chosen }, shown)));
        const people = (users || []).filter(u => u.active !== false).map(u => [u.name, `${u.name} · ${u.role}`]);
        const f = h('form', { class: 'userform', onsubmit: async e => {
          e.preventDefault();
          const d = new FormData(f), get = key => String(d.get(key) || '').trim();
          const saved = { ...b, id: b.id || 'suc-' + newId(), name: get('name'), detail: get('detail'), city: get('city'), street: get('street'), neighborhood: get('neighborhood'), zip: get('zip'), state: get('state'),
            phone: get('phone'), email: get('email'), manager: get('manager'), hours: get('hours'), theme: get('theme') };
          if (branches.some(x => x.id !== saved.id && x.name.trim().toLowerCase() === saved.name.toLowerCase())) return fail(`Ya existe una sucursal llamada "${saved.name}".`);
          try { await saveBranch(saved); } catch { return fail('No se pudo guardar. Revisa el espacio disponible del navegador e inténtalo de nuevo.'); }
          await refreshBranches();
        } },
          h('div', { class: 'item__title' }, b.id ? `Editar sucursal · ${b.name}` : 'Nueva sucursal'),
          h('div', { class: 'form__grid' },
            label('Nombre de la sucursal', text('name', { placeholder: 'Querétaro, México', required: true }), 'span2'),
            label('Descripción', text('detail', { placeholder: 'Centro de distribución Bajío' }), 'span2'),
            label('Calle y número', text('street', { placeholder: 'Av. Industrial 100' }), 'span2'),
            label('Colonia', text('neighborhood', { placeholder: 'Colonia o parque industrial' }), 'span2'),
            label('Ciudad', [pick('city', [['', 'Selecciona…'], ...cities.map(c => [c, c]), ...(b.city && !cities.includes(b.city) ? [[b.city, b.city]] : [])], b.city || '', true),
              h('span', { class: 'lbl__hint' }, 'De aquí salen las rutas de sus pedidos.')], 'span2'),
            label('Estado', text('state', { placeholder: 'Nuevo León' })),
            label('Código postal', text('zip', { placeholder: '64000', inputmode: 'numeric', maxlength: 5, pattern: '[0-9]{5}', title: '5 dígitos' })),
            label('Teléfono', text('phone', { type: 'tel', placeholder: '81 0000 0000' }), 'span2'),
            label('Correo', text('email', { type: 'email', placeholder: 'sucursal@empresa.mx' }), 'span2'),
            label('Responsable', pick('manager', [['', 'Sin asignar'], ...people, ...(b.manager && !people.some(([name]) => name === b.manager) ? [[b.manager, b.manager]] : [])], b.manager || ''), 'span2'),
            label('Horario', text('hours', { placeholder: 'Lun a Vie 8:00–18:00 · Sáb 8:00–13:00' }), 'span2'),
            label('Apariencia del patio 3D', [pick('theme', YARDS, b.theme || 'mty'), h('span', { class: 'lbl__hint' }, 'Colores del patio en el panel cuando esta sucursal está en uso.')], 'span2')),
          error,
          h('div', { class: 'toolbar' }, h('button', { class: 'btn-primary', type: 'submit' }, 'Guardar'), h('button', { class: 'btn-small', type: 'button', onclick: () => { editingBranch = null; draw(); } }, 'Cancelar')));
        return f;
      };
      const branchRow = b => setting(b.name, [b.detail, branchAddress(b), b.phone, b.manager ? `Responsable: ${b.manager}` : '', b.hours].filter(Boolean).join(' · ') || 'Sin datos registrados', [
        branch && b.id === branch.id ? badge('En uso') : null,
        ...(confirmingBranch === b.id
          ? [h('button', { class: 'link-btn link-btn--danger', onclick: async () => { try { await deleteBranch(b.id); } catch {} await refreshBranches(); } }, 'Confirmar'), h('button', { class: 'link-btn', onclick: () => { confirmingBranch = null; draw(); } }, 'Cancelar')]
          : [h('button', { class: 'link-btn', onclick: () => { editingBranch = b; confirmingBranch = null; draw(); } }, 'Editar'),
            b.fixed ? null : h('button', { class: 'link-btn link-btn--danger', title: 'Sus pedidos y proveedores se conservan', onclick: () => { confirmingBranch = b.id; draw(); } }, 'Eliminar')])]);
      const branchesBlock = () => block('Sucursales', 'sucursales',
        editingBranch ? branchForm(editingBranch) : h('div', null, h('button', { class: 'btn-primary', onclick: () => { editingBranch = {}; confirmingBranch = null; draw(); } }, 'Nueva sucursal')),
        (branches || []).map(branchRow),
        h('div', { class: 'module__note' }, 'La sucursal en uso se cambia en la barra superior. Una sucursal nueva empieza sin cifras: sus reportes y su almacén se llenan cuando haya datos reales.'));
      const TABS = [['general', 'General'], ['correo', 'Correo'], ['dashboard', 'Dashboard'], ['usuarios', 'Usuarios'], ['sucursales', 'Sucursales']];
      let tab = 'general';
      const draw = () => {
        const speedLabel = h('span', null, config.animationSpeed.toFixed(1) + '×');
        const speed = h('input', { type: 'range', min: 0, max: 3, step: 0.1, value: config.animationSpeed, 'aria-label': 'Velocidad de animación', oninput: e => { config.animationSpeed = Number(e.target.value); speedLabel.textContent = config.animationSpeed.toFixed(1) + '×'; saveConfig(); } });
        const [company, mail] = mailTemplate();
        const blocks = {
          general: () => block('General', 'general', setting('Nombre de la empresa', 'Con él se firman los correos de las órdenes de compra.', company)),
          correo: () => [mailServer(), mail],
          dashboard: () => block('Dashboard', 'dashboard',
            setting('Velocidad de animación', 'Qué tan rápido se mueven los vehículos. En 0 se detienen.', [speed, speedLabel]),
            setting('Balanceo de cámara', 'Movimiento suave de la cámara cuando no se arrastra el mapa.', toggle('cameraSway')),
            setting('Mostrar colisionadores', 'Dibuja el contorno de colisión de cada vehículo; en rojo cuando está bloqueado.', toggle('showColliders')),
            h('div', null, h('button', { class: 'btn-small', onclick: () => { resetConfig(); draw(); } }, 'Restablecer valores del dashboard'))),
          usuarios: usersBlock,
          sucursales: branchesBlock,
        };
        body.replaceChildren(h('div', { class: 'narrow' },
          h('div', { class: 'chips', role: 'tablist' }, TABS.map(([id, name]) => h('button', { class: 'chipbtn' + (id === tab ? ' is-on' : ''), role: 'tab', 'aria-selected': String(id === tab), onclick: () => { tab = id; draw(); } }, name))),
          blocks[tab]()));
      };
      draw();
    },
  },
};
