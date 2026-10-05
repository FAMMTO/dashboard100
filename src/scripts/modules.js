// One entry per side-menu section (except the dashboard). Each is a full page: `render(ctx)` fills ctx.body.
// `preview: false` hides the 3D preview and vehicle card so the page uses the whole width.
// ctx: { body, actions, fleet, state, branches, branch, select(vehicleId), flyTo(x, z, zoom), mark(), tip(event, text),
//        config, saveConfig(), alerts, alertsChanged() } — see showView() in app.js.
import { getRoutes, getWarehouse, getReports, getOnTime, getOnTimePeriods, orderProfit } from './data.js';
import { h, badge, card, section, stats, empty, pesos } from './ui.js';
import { costos } from './costos.js';
import { clientes } from './clientes.js';
import { catalogo } from './catalogo.js';
import { proveedores } from './proveedores.js';
import { askAgent, SUGGESTIONS } from './agent.js';

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
const BLUE = '#2457e6', GRID = '#eef1f6', MUTED = '#a9b4c7';
const STATUS_COLORS = { 'En tránsito': '#2457e6', 'En almacén': '#8a5cd6', 'Entregado': '#18a957' };

function barChart({ width, labels, values, max, step, unit, label = v => `${v} ${unit}` }, tip) {
  const H = 190, m = { l: 34, r: 8, t: 10, b: 24 }, pw = width - m.l - m.r, ph = H - m.t - m.b, band = pw / values.length;
  const y = v => m.t + ph - v / max * ph, root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${H}`, height: H, role: 'img' });
  for (let t = 0; t <= max; t += step) root.append(svg('line', { x1: m.l, x2: width - m.r, y1: y(t), y2: y(t), stroke: GRID }), svg('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, String(t)));
  values.forEach((v, i) => {
    const bw = Math.min(28, band * 0.5), x = m.l + band * i + (band - bw) / 2, top = y(v), r = 4;
    const bar = svg('path', { d: `M${x},${y(0)}V${top + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${y(0)}z`, fill: BLUE });
    const hit = svg('rect', { x: m.l + band * i, y: m.t, width: band, height: ph, fill: 'transparent' });
    hit.addEventListener('mousemove', e => { bar.setAttribute('fill', '#1a44bd'); tip(e, `${labels[i]}: ${label(v)}`); });
    hit.addEventListener('mouseleave', () => { bar.setAttribute('fill', BLUE); tip(null); });
    root.append(bar, svg('text', { x: m.l + band * (i + 0.5), y: H - 6, 'text-anchor': 'middle' }, labels[i]), hit);
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
    title: 'Almacén', sub: 'Andenes, zonas e inventario. Selecciona un andén o zona para ubicarlo en el mapa.',
    async render({ body, flyTo, branch }) {
      const { docks, zones, inventory } = await getWarehouse(branch && branch.id);
      const free = docks.filter(d => d.status === 'Libre').length, used = zones.reduce((a, z) => a + z.used, 0), cap = zones.reduce((a, z) => a + z.capacity, 0);
      const maxInv = Math.max(...inventory.map(i => i.pallets));
      body.replaceChildren(
        stats([[docks.length, 'Andenes'], [free, 'Libres'], [Math.round(used / cap * 100) + '%', 'Ocupación'], [inventory.reduce((a, i) => a + i.pallets, 0), 'Tarimas']]),
        section(branch ? `Andenes · ${branch.city}` : 'Andenes', h('div', { class: 'docks' }, docks.map(d => h('button', { class: 'dock', onclick: () => flyTo(d.x, d.z, 2.2) },
          h('div', { class: 'item__title' }, d.name), badge(d.status), h('div', { class: 'item__sub' }, d.detail))))),
        section('Zonas', h('div', { class: 'list' }, zones.map(z => h('button', { class: 'item item--zone', onclick: () => flyTo(z.x, z.z, z.zoom) },
          h('div', { class: 'item__title' }, z.name), meter(z.used / z.capacity * 100), h('div', { class: 'item__right' }, `${z.used} / ${z.capacity}`))))),
        section('Inventario por categoría (tarimas)', inventory.map(i => h('div', { class: 'hbar' }, h('div', null, i.name), meter(i.pallets / maxInv * 100), h('div', { class: 'hbar__value' }, String(i.pallets))))),
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
        const scope = state.reportScope || 'general', r = await getReports(scope), bars = h('div'), money = h('div'), onTime = onTimeCard(scope, state, tip, await getOnTimePeriods());
        if (scope !== (state.reportScope || 'general')) return; // another scope was picked while loading
        const pick = id => { state.reportScope = id; draw(); };
        actions.replaceChildren(h('div', { class: 'chips', role: 'group', 'aria-label': 'Sucursal del reporte' },
          h('button', { class: 'chipbtn chipbtn--all' + (scope === 'general' ? ' is-on' : ''), onclick: () => pick('general') }, 'Vista general'),
          branches.map(b => h('button', { class: 'chipbtn' + (b.id === scope ? ' is-on' : ''), onclick: () => pick(b.id) }, b.city))));
        const t = r.totals, topSales = Math.max(...r.branches.map(b => b.sales)), allSales = r.branches.reduce((a, b) => a + b.sales, 0);
        body.replaceChildren(
          stats([[t.shipments, 'Envíos'], [t.onTime + '%', 'A tiempo'], [t.processingHours + ' h', 'Tiempo de proceso'], [t.incidents, 'Incidencias']]),
          stats([[pesos(t.sales), 'Ventas'], [pesos(t.cost), 'Costo'], [pesos(t.profit), 'Profit'], [(t.profit / t.sales * 100).toFixed(1) + '%', 'Margen']]),
          h('div', { class: 'grid2' }, section('Ventas por día (miles de MXN)', money), section('Ventas por sucursal',
            r.branches.map(b => h('button', { class: 'hbar hbar--pick' + (scope === 'general' || scope === b.id ? '' : ' is-muted'), title: `Ver reporte de ${b.name}`, onclick: () => pick(b.id) },
              h('div', null, b.name), meter(b.sales / topSales * 100), h('div', { class: 'hbar__value' }, millions(b.sales)))),
            h('div', { class: 'item__sub' }, scope === 'general' ? 'Selecciona una sucursal para ver su reporte.' : `${(t.sales / allSales * 100).toFixed(1)}% de las ventas de todas las sucursales.`))),
          h('div', { class: 'grid2' }, section('Envíos por día', bars), onTime.el),
          h('div', { class: 'grid2' }, section('Envíos por estado',
            h('div', { class: 'stack' }, r.status.map(s => h('div', { class: 'stack__seg', style: `flex:${s.value};background:${STATUS_COLORS[s.name]}`, onmousemove: e => tip(e, `${s.name}: ${s.value}%`), onmouseleave: () => tip(null) }))),
            h('div', { class: 'legend' }, r.status.map(s => h('div', { class: 'legend__item' }, h('span', { class: 'legend__swatch', style: `background:${STATUS_COLORS[s.name]}` }), `${s.name} · ${s.value}%`)))),
          section('Destinos principales (envíos)', r.destinations.map(d => h('div', { class: 'hbar' }, h('div', null, d.name), meter(d.value / r.destinations[0].value * 100), h('div', { class: 'hbar__value' }, String(d.value)))))),
        );
        // The charts are drawn to the width their cards ended up with.
        const thousands = r.sales.map(v => Math.round(v / 1000));
        money.append(barChart({ width: money.clientWidth || 480, labels: r.days, values: thousands, ...niceScale(Math.max(...thousands)), label: v => pesos(v * 1000) }, tip));
        bars.append(barChart({ width: bars.clientWidth || 480, labels: r.days, values: r.shipments, ...niceScale(Math.max(...r.shipments)), unit: 'envíos' }, tip));
        onTime.draw();
      };
      await draw();
    },
  },

  costos, clientes, proveedores, catalogo,

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
    render({ body, config, saveConfig, resetConfig }) {
      const setting = (title, sub, control) => h('div', { class: 'setting' }, h('div', { class: 'setting__text' }, h('div', { class: 'item__title' }, title), h('div', { class: 'item__sub' }, sub)), h('div', { class: 'setting__control' }, control));
      const toggle = key => { const b = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(config[key]), onclick: () => { config[key] = !config[key]; b.setAttribute('aria-checked', String(config[key])); saveConfig(); } }); return b; };
      const draw = () => {
        const speedLabel = h('span', null, config.animationSpeed.toFixed(1) + '×');
        const speed = h('input', { type: 'range', min: 0, max: 3, step: 0.1, value: config.animationSpeed, 'aria-label': 'Velocidad de animación', oninput: e => { config.animationSpeed = Number(e.target.value); speedLabel.textContent = config.animationSpeed.toFixed(1) + '×'; saveConfig(); } });
        body.replaceChildren(h('div', { class: 'narrow' }, section('Escena 3D',
          setting('Velocidad de animación', 'Qué tan rápido se mueven los vehículos. En 0 se detienen.', [speed, speedLabel]),
          setting('Balanceo de cámara', 'Movimiento suave de la cámara cuando no se arrastra el mapa.', toggle('cameraSway')),
          setting('Mostrar colisionadores', 'Dibuja el contorno de colisión de cada vehículo; en rojo cuando está bloqueado.', toggle('showColliders')),
        )), h('div', null, h('button', { class: 'btn-small', onclick: () => { resetConfig(); draw(); } }, 'Restablecer valores')));
      };
      draw();
    },
  },
};
