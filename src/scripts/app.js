import { createWavetrackScene } from './scene.js';
import { getRecentShipments, getVehicleDetails, getFleet, getAlerts } from './data.js';
import { modules } from './modules.js';
import { h } from './ui.js';

const CONFIG_DEFAULTS = { animationSpeed: 1, cameraSway: true, showColliders: false };
const DEFAULT_VEHICLE = { id: 'T11', kind: 'truck', parked: false };

const $ = id => document.getElementById(id);
const pad2 = n => String(n).padStart(2, '0');
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
};

const app = document.querySelector('.app');
// Scene options. The scene reads this object every frame, so the settings module edits it in place.
const config = { ...CONFIG_DEFAULTS, ...JSON.parse(store.get('wt-config') || '{}') };
const moduleState = { query: '' };
let scene = null, tagArgs = null, request = 0, selected = DEFAULT_VEHICLE, selectedKind = 'truck', alerts = [], viewToken = 0, lastView = 'panel';

function renderClock() {
  const d = new Date(), mon = d.toLocaleString('es-MX', { month: 'short' }).replace('.', '');
  $('clock').textContent = `${d.getDate()} ${mon} ${d.getFullYear()} • ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function animateKpis() {
  const t0 = performance.now();
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / 1400), ek = 1 - Math.pow(1 - k, 3);
    $('k1').textContent = Math.round(810 * ek);
    $('k2').textContent = (92.3 * ek).toFixed(1) + '%';
    $('k3').textContent = (6.2 * ek).toFixed(1) + ' h';
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const ROW_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3d4a60" stroke-width="2"><path d="M12 2l9 5v10l-9 5-9-5V7z"></path></svg>';

function buildRows(shipments) {
  $('rows').replaceChildren(...shipments.map(s => {
    const row = el('button', 'row');
    row.dataset.shipment = s.id;
    const id = el('div', 'row__id'), icon = el('span', 'row__icon'), status = el('div'), badge = el('span', 'badge', s.status);
    icon.innerHTML = ROW_ICON; id.append(icon, '#' + s.id);
    badge.dataset.status = s.status; status.append(badge);
    row.append(id, el('div', null, s.product), status, el('div', null, s.eta));
    row.addEventListener('click', () => selectVehicle(vehicleById(s.vehicleId)));
    return row;
  }));
}

// What the top-right card shows for each kind of vehicle. `stage: null` hides the progress steps.
const cardFor = {
  truck: ({ shipment: s }) => ({
    title: `Envío #${s.id}`, status: s.status, code: s.code, desc: `${s.product} • ${s.pallets} tarimas`, stage: s.stage,
    facts: [['Origen', s.origin], ['Destino', s.dest], ['Transportista', 'Wavetrack Logistics'], ['Llegada estimada', s.etaLong]],
  }),
  forklift: ({ forklift: f }) => ({
    title: `Montacargas #${f.id}`, status: f.status, code: f.task, desc: `Unidad ${f.vehicleId}`, stage: null,
    facts: [['Operador', f.operator], ['Zona', f.zone], ['Batería', f.battery + '%'], ['Modelo', f.model]],
  }),
};

function renderCard(card) {
  $('sel-title').textContent = card.title;
  $('sel-status').textContent = card.status;
  $('sel-status').dataset.status = card.status;
  $('sel-code').textContent = card.code;
  $('sel-desc').textContent = card.desc;
  $('sel-facts').replaceChildren(...card.facts.map(([label, value]) => {
    const fact = el('div', 'fact');
    fact.append(el('div', 'fact__label', label), el('div', 'fact__value', value));
    return fact;
  }));

  $('sel-steps').hidden = card.stage == null;
  if (card.stage == null) return;
  $('card-fill').style.width = Math.min(100, card.stage / 3 * 100) + '%';
  [...$('card-steps').children].forEach((step, i) => {
    step.classList.toggle('is-done', i < card.stage);
    step.classList.toggle('is-current', i === card.stage);
  });
}

function renderTracking(s) {
  $('track-fill').style.width = (s.track / 4 * 100) + '%';
  [...$('track-steps').children].forEach((step, i) => {
    step.classList.toggle('is-reached', i <= s.track);
    step.querySelector('.tstep__date').textContent = s.dates[i];
  });
}

const vehicleById = id => (scene && scene.vehicles.find(v => v.id === id)) || { id, kind: id[0] === 'F' ? 'forklift' : 'truck', parked: false };
// Highlights the rows of the open module that belong to the selected vehicle.
const markSelected = () => document.querySelectorAll('#module [data-vehicle]').forEach(row => row.classList.toggle('is-selected', row.dataset.vehicle === selected.id));

// Single entry point for selection, whether it comes from the 3D scene, the dashboard table or a module.
// `follow` also moves the camera to the vehicle and keeps it there (used by the module pages' 3D preview).
async function selectVehicle(vehicle, follow = false) {
  selected = vehicle;
  if (scene) follow ? scene.focus(vehicle.id) : scene.select(vehicle.id);
  markSelected();
  const mine = ++request;
  const details = await getVehicleDetails(vehicle);
  if (mine !== request) return; // a newer selection finished first
  selectedKind = details.kind;
  // Tag floating over the vehicle in the 3D scene, so it is clear which order it carries.
  tagArgs = details.kind === 'truck' ? [vehicle.id, `Pedido #${details.shipment.id}`, details.shipment.product] : [vehicle.id, `Montacargas #${details.forklift.id}`, details.forklift.task];
  if (scene) scene.setLabel(...tagArgs);
  renderCard(cardFor[details.kind](details));
  // The tracking timeline only applies to shipments, so a forklift leaves the last shipment's timeline in place.
  if (details.kind === 'truck') renderTracking(details.shipment);
  const shipmentId = details.kind === 'truck' ? details.shipment.id : null;
  [...$('rows').children].forEach(row => row.classList.toggle('is-selected', row.dataset.shipment === shipmentId));
}

// ---- views ----
const currentView = () => { const v = location.hash.slice(1); return modules[v] ? v : 'panel'; };
const goTo = view => { if (currentView() === view) showView(); else location.hash = view; };

function showTip(event, text) {
  const tip = $('tip');
  tip.hidden = !event;
  if (!event) return;
  tip.textContent = text;
  tip.style.left = Math.min(event.clientX + 14, window.innerWidth - tip.offsetWidth - 8) + 'px';
  tip.style.top = event.clientY - 34 + 'px';
}

function updateAlertBadges() {
  const unread = alerts.filter(a => !a.read).length;
  for (const badge of [$('nav-badge'), $('bell-count')]) { badge.textContent = unread; badge.hidden = !unread; }
}

async function showView() {
  const view = currentView(), token = ++viewToken, mod = $('module');
  app.dataset.view = view;
  document.querySelectorAll('.nav__item[data-view]').forEach(item => {
    item.classList.toggle('is-active', item.dataset.view === view);
    if (item.dataset.view === view) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
  });
  mod.hidden = view === 'panel';
  showTip(null);
  // Pages with `preview: false` use the full width; the rest keep the 3D preview and vehicle card on the right.
  app.dataset.preview = view !== 'panel' && modules[view].preview === false ? 'off' : 'on';
  if (view === 'panel') {
    // Coming back from a page, undo the close-up the preview was using.
    if (scene && lastView !== 'panel') scene.recenter();
    lastView = view;
    return;
  }
  lastView = view;

  const m = modules[view], actions = h('div'), body = h('div', { class: 'module__body' }, h('div', { class: 'module__note' }, 'Cargando…'));
  mod.replaceChildren(h('div', { class: 'module__head' }, h('div', null, h('div', { class: 'module__title' }, m.title), h('div', { class: 'module__sub' }, m.sub)), actions), body);
  const fleet = await fleetReady;
  if (token !== viewToken) return; // the user moved to another view while loading
  await m.render({
    body, actions, fleet, state: moduleState, mark: markSelected, tip: showTip, alerts,
    select: id => selectVehicle(vehicleById(id), true),
    flyTo: (x, z, zoom) => scene.flyTo(x, z, zoom),
    alertsChanged: updateAlertBadges,
    config,
    saveConfig: () => store.set('wt-config', JSON.stringify(config)),
    resetConfig: () => { Object.assign(config, CONFIG_DEFAULTS); store.set('wt-config', JSON.stringify(config)); },
  });
}

function initScene() {
  scene = createWavetrackScene($('scene'), Object.assign(config, { onSelect: selectVehicle }));
  scene.select(selected.id);
  if (tagArgs) scene.setLabel(...tagArgs);
  $('zoom-in').addEventListener('click', () => scene.zoomBy(1.25));
  $('zoom-out').addEventListener('click', () => scene.zoomBy(0.8));
  $('recenter').addEventListener('click', () => scene.recenter());
  return scene;
}

// Collapsible side menu. The choice is remembered; on narrow windows it starts collapsed so the KPI cards fit.
function initSidebar() {
  const toggle = $('sidebar-toggle');
  const setCollapsed = collapsed => {
    app.classList.toggle('is-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.title = collapsed ? 'Expandir menú' : 'Contraer menú';
  };
  const stored = store.get('wt-sidebar');
  setCollapsed(stored ? stored === 'collapsed' : window.innerWidth < 1440);
  toggle.addEventListener('click', () => {
    const collapsed = !app.classList.contains('is-collapsed');
    setCollapsed(collapsed);
    store.set('wt-sidebar', collapsed ? 'collapsed' : 'expanded');
    onLayoutChange();
  });
  document.querySelectorAll('.nav__item[data-view]').forEach(item => item.addEventListener('click', () => goTo(item.dataset.view)));
}

// The charts are drawn to the module's width, so they are redrawn once the layout settles.
let layoutTimer = 0;
function onLayoutChange() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => { if (currentView() === 'reportes') showView(); }, 300);
}

initSidebar();
renderClock();
setInterval(renderClock, 15000);
animateKpis();
getRecentShipments().then(buildRows).then(() => selectVehicle(selected));
getAlerts().then(list => { alerts.push(...list); updateAlertBadges(); });

$('bell').addEventListener('click', () => goTo('alertas'));
$('sel-details').addEventListener('click', () => goTo(selectedKind === 'forklift' ? 'flota' : 'envios'));
$('search').addEventListener('keydown', e => { if (e.key === 'Enter') { moduleState.query = e.target.value; goTo('envios'); } });
window.addEventListener('hashchange', showView);
window.addEventListener('resize', onLayoutChange);

// The truck livery and dock numbers are drawn to canvas with Manrope, so wait for it (briefly) first.
const fontsReady = document.fonts ? Promise.all([document.fonts.load('800 54px Manrope'), document.fonts.load('bold 42px Manrope')]) : Promise.resolve();
const sceneReady = Promise.race([fontsReady, new Promise(r => setTimeout(r, 1500))]).catch(() => {}).then(initScene);
const fleetReady = sceneReady.then(s => getFleet(s.vehicles));
showView();
