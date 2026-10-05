// One entry per side-menu section (except the dashboard). Each is a full page: `render(ctx)` fills ctx.body.
// `preview: false` hides the 3D preview and vehicle card so the page uses the whole width.
// ctx: { body, actions, fleet, state, select(vehicleId), flyTo(x, z, zoom), mark(), tip(event, text),
//        config, saveConfig(), alerts, alertsChanged() } — see showView() in app.js.
import { getRoutes, getWarehouse, getReports } from './data.js';
import { h, badge, card, section, stats, empty } from './ui.js';
import { costos } from './costos.js';

const svg = (tag, attrs, ...kids) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  e.append(...kids);
  return e;
};

const TRUCK_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M2 6h12v10H2zM14 9h4l3 3.5V16h-7z"></path><circle cx="6" cy="17.5" r="1.8"></circle><circle cx="17" cy="17.5" r="1.8"></circle></svg>';
const LIFT_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16V8h6l2 4v4z"></path><path d="M15 4v13M15 17h6"></path><circle cx="6" cy="18" r="2"></circle><circle cx="11" cy="18" r="2"></circle></svg>';

const meter = pct => h('div', { class: 'meter' }, h('div', { class: 'meter__fill', style: `width:${Math.max(0, Math.min(100, pct))}%` }));
const chips = (options, current, onPick) => h('div', { class: 'chips' }, options.map(o => h('button', { class: 'chipbtn' + (o === current ? ' is-on' : ''), onclick: () => onPick(o) }, o)));

// ---- charts (single blue series; values are read from the axis and the hover tooltip) ----
const BLUE = '#2457e6', GRID = '#eef1f6';
const STATUS_COLORS = { 'En tránsito': '#2457e6', 'En almacén': '#8a5cd6', 'Entregado': '#18a957' };

function barChart({ width, labels, values, max, step, unit }, tip) {
  const H = 190, m = { l: 34, r: 8, t: 10, b: 24 }, pw = width - m.l - m.r, ph = H - m.t - m.b, band = pw / values.length;
  const y = v => m.t + ph - v / max * ph, root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${H}`, height: H, role: 'img' });
  for (let t = 0; t <= max; t += step) root.append(svg('line', { x1: m.l, x2: width - m.r, y1: y(t), y2: y(t), stroke: GRID }), svg('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, String(t)));
  values.forEach((v, i) => {
    const bw = Math.min(28, band * 0.5), x = m.l + band * i + (band - bw) / 2, top = y(v), r = 4;
    const bar = svg('path', { d: `M${x},${y(0)}V${top + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${y(0)}z`, fill: BLUE });
    const hit = svg('rect', { x: m.l + band * i, y: m.t, width: band, height: ph, fill: 'transparent' });
    hit.addEventListener('mousemove', e => { bar.setAttribute('fill', '#1a44bd'); tip(e, `${labels[i]}: ${v} ${unit}`); });
    hit.addEventListener('mouseleave', () => { bar.setAttribute('fill', BLUE); tip(null); });
    root.append(bar, svg('text', { x: m.l + band * (i + 0.5), y: H - 6, 'text-anchor': 'middle' }, labels[i]), hit);
  });
  return root;
}

function lineChart({ width, labels, values, min, max, step, unit }, tip) {
  const H = 170, m = { l: 34, r: 48, t: 12, b: 24 }, pw = width - m.l - m.r, ph = H - m.t - m.b, band = pw / (values.length - 1);
  const x = i => m.l + band * i, y = v => m.t + ph - (v - min) / (max - min) * ph;
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${H}`, height: H, role: 'img' });
  for (let t = min; t <= max; t += step) root.append(svg('line', { x1: m.l, x2: width - m.r, y1: y(t), y2: y(t), stroke: GRID }), svg('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, String(t)));
  root.append(svg('path', { d: values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(''), fill: 'none', stroke: BLUE, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const last = values.length - 1;
  root.append(svg('circle', { cx: x(last), cy: y(values[last]), r: 4, fill: BLUE, stroke: '#fff', 'stroke-width': 2 }), svg('text', { class: 'chart__label', x: x(last) + 8, y: y(values[last]) + 4 }, values[last] + unit));
  const cross = svg('line', { y1: m.t, y2: m.t + ph, stroke: '#c9d3e3', visibility: 'hidden' }), dot = svg('circle', { r: 4.5, fill: BLUE, stroke: '#fff', 'stroke-width': 2, visibility: 'hidden' });
  root.append(cross, dot);
  values.forEach((v, i) => {
    const hit = svg('rect', { x: x(i) - band / 2, y: m.t, width: band, height: ph, fill: 'transparent' });
    hit.addEventListener('mousemove', e => {
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(v));
      cross.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible'); tip(e, `${labels[i]}: ${v}${unit}`);
    });
    hit.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip(null); });
    root.append(svg('text', { x: x(i), y: H - 6, 'text-anchor': 'middle' }, labels[i]), hit);
  });
  return root;
}

// ---- modules ----
export const modules = {
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
        )) : [empty('Ningún envío coincide con la búsqueda.')]));
        mark();
      };
      body.replaceChildren(card(toolbar, list));
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
    async render({ body, flyTo }) {
      const { docks, zones, inventory } = await getWarehouse();
      const free = docks.filter(d => d.status === 'Libre').length, used = zones.reduce((a, z) => a + z.used, 0), cap = zones.reduce((a, z) => a + z.capacity, 0);
      const maxInv = Math.max(...inventory.map(i => i.pallets));
      body.replaceChildren(
        stats([[docks.length, 'Andenes'], [free, 'Libres'], [Math.round(used / cap * 100) + '%', 'Ocupación'], [inventory.reduce((a, i) => a + i.pallets, 0), 'Tarimas']]),
        section('Andenes', h('div', { class: 'docks' }, docks.map(d => h('button', { class: 'dock', onclick: () => flyTo(d.x, d.z, 2.2) },
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
    title: 'Reportes', sub: 'Resumen de los últimos 7 días.', preview: false,
    async render({ body, tip }) {
      const r = await getReports(), bars = h('div'), line = h('div');
      body.replaceChildren(
        stats([[r.totals.shipments, 'Envíos'], [r.totals.onTime + '%', 'A tiempo'], [r.totals.processingHours + ' h', 'Tiempo de proceso'], [r.totals.incidents, 'Incidencias']]),
        h('div', { class: 'grid2' }, section('Envíos por día', bars), section('Entregas a tiempo (%)', line)),
        h('div', { class: 'grid2' }, section('Envíos por estado',
          h('div', { class: 'stack' }, r.status.map(s => h('div', { class: 'stack__seg', style: `flex:${s.value};background:${STATUS_COLORS[s.name]}`, onmousemove: e => tip(e, `${s.name}: ${s.value}%`), onmouseleave: () => tip(null) }))),
          h('div', { class: 'legend' }, r.status.map(s => h('div', { class: 'legend__item' }, h('span', { class: 'legend__swatch', style: `background:${STATUS_COLORS[s.name]}` }), `${s.name} · ${s.value}%`)))),
        section('Destinos principales (envíos)', r.destinations.map(d => h('div', { class: 'hbar' }, h('div', null, d.name), meter(d.value / r.destinations[0].value * 100), h('div', { class: 'hbar__value' }, String(d.value)))))),
      );
      // The charts are drawn to the width their cards ended up with.
      bars.append(barChart({ width: bars.clientWidth || 480, labels: r.days, values: r.shipments, max: 150, step: 50, unit: 'envíos' }, tip));
      line.append(lineChart({ width: line.clientWidth || 480, labels: r.days, values: r.onTime, min: 86, max: 96, step: 2, unit: '%' }, tip));
    },
  },

  costos,

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
