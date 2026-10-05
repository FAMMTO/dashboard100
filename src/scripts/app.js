import { createDASH100Scene } from './scene.js';
import { getRecentShipments, getVehicleDetails, getFleet, getAlerts, getBranches, orderProfit } from './data.js';
import { modules } from './modules.js';
import { h, pesos, badge } from './ui.js';
import { initRouteMap, openRouteMap } from './routemap.js';
import { initShipmentModal, openShipmentModal } from './shipmentmodal.js';

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
let scene = null, branch = null, branchList = [], tagArgs = null, request = 0, selected = DEFAULT_VEHICLE, selectedKind = 'truck', selectedShipment = null, alerts = [], viewToken = 0, lastView = 'panel';

function renderClock() {
  const d = new Date(), mon = d.toLocaleString('es-MX', { month: 'short' }).replace('.', '');
  $('clock').textContent = `${d.getDate()} ${mon} ${d.getFullYear()} • ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

let kpiRun = 0;
function animateKpis(kpis) {
  const t0 = performance.now(), run = ++kpiRun;
  const tick = () => {
    if (run !== kpiRun) return; // another branch was picked mid-animation
    const k = Math.min(1, (performance.now() - t0) / 1400), ek = 1 - Math.pow(1 - k, 3);
    $('k1').textContent = Math.round(kpis.shipments * ek);
    $('k2').textContent = (kpis.onTime * ek).toFixed(1) + '%';
    $('k3').textContent = (kpis.hours * ek).toFixed(1) + ' h';
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---- branch picker (top bar chip) ----
function setBranch(b) {
  const switched = branch && branch !== b;
  branch = b;
  moduleState.reportScope = b.id; // the reports page follows the branch picked here
  if (switched && ['reportes', 'almacen', 'chat', 'clientes'].includes(currentView())) showView(); // pages that show the branch's own figures
  store.set('wt-branch', b.id);
  $('branch-name').textContent = b.name;
  [...$('branch-menu').children].forEach(item => {
    const on = item.dataset.branch === b.id;
    item.classList.toggle('is-active', on); item.setAttribute('aria-selected', String(on));
  });
  animateKpis(b.kpis);
  if (scene) scene.setBranch(b.id, b.city);
}

function initBranches(branches) {
  const btn = $('branch'), menu = $('branch-menu');
  branchList = branches;
  const toggle = open => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    const r = btn.getBoundingClientRect();
    menu.style.top = r.bottom + 8 + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  };
  menu.replaceChildren(...branches.map(b => h('button', { class: 'menu__item', role: 'option', dataset: { branch: b.id }, onclick: () => { toggle(false); if (b !== branch) setBranch(b); btn.focus(); } },
    h('div', { class: 'chip__text' }, h('div', { class: 'chip__title' }, b.name), h('div', { class: 'chip__sub' }, b.detail)),
    h('span', { class: 'menu__check' }, '✓'))));
  btn.addEventListener('click', () => toggle(menu.hidden));
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) toggle(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { toggle(false); btn.focus(); } });
  window.addEventListener('resize', () => toggle(false));
  setBranch(branches.find(b => b.id === store.get('wt-branch')) || branches[0]);
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
    facts: [['Origen', s.origin], ['Destino', s.dest], ['Transportista', 'DASH100 Logistics'], ['Llegada estimada', s.etaLong]],
    money: [['Venta', s.sale], ['Costo', s.cost], ['Profit', orderProfit(s)]],
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
  // Order economics (shipments only): the profit turns red when the order loses money.
  $('sel-money').hidden = !card.money;
  $('sel-money').replaceChildren(...(card.money || []).map(([label, value]) => {
    const fact = el('div', 'fact' + (label === 'Profit' ? value < 0 ? ' is-loss' : ' is-gain' : ''));
    fact.append(el('div', 'fact__label', label), el('div', 'fact__value', pesos(value)));
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
  selectedShipment = details.kind === 'truck' ? details.shipment : null;
  $('sel-route').hidden = !selectedShipment; // only trucks travel a route
  // Tag floating over the vehicle in the 3D scene, so it is clear which order it carries.
  tagArgs = details.kind === 'truck' ? [vehicle.id, `Pedido #${details.shipment.id}`, details.shipment.product] : [vehicle.id, `Montacargas #${details.forklift.id}`, details.forklift.task];
  if (scene) scene.setLabel(...tagArgs);
  renderCard(cardFor[details.kind](details));
  // The tracking timeline only applies to shipments, so it is hidden while a forklift is selected (see global.css).
  app.dataset.kind = details.kind;
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
  // A page that fails to load says so, instead of staying on "Cargando…" forever.
  try { await m.render({
    body, actions, fleet, branches: branchList, branch, state: moduleState, mark: markSelected, tip: showTip, alerts,
    select: id => selectVehicle(vehicleById(id), true),
    flyTo: (x, z, zoom) => scene.flyTo(x, z, zoom),
    alertsChanged: updateAlertBadges,
    config,
    saveConfig: () => store.set('wt-config', JSON.stringify(config)),
    resetConfig: () => { Object.assign(config, CONFIG_DEFAULTS); store.set('wt-config', JSON.stringify(config)); },
  }); } catch (e) {
    console.error(`Página "${view}":`, e);
    if (token === viewToken) body.replaceChildren(h('div', { class: 'form__error' }, `No se pudo cargar ${m.title}. Recarga la página; si sigue igual, revisa la consola del navegador.`));
  }
}

// ---- alerts modal (bell in the top bar) ----
// A change made here (or on the Alertas page) shows in both places: the page is redrawn if it is the one open.
function alertsUpdated() {
  updateAlertBadges();
  if (currentView() === 'alertas') showView();
}

// Marks the alert as read and shows where it happens: on its vehicle, or on a spot of the yard.
function openAlert(a) {
  a.read = true;
  alertsUpdated();
  $('alerts-modal').close();
  // Pages without the 3D preview can't show it, so go back to the dashboard first.
  if (app.dataset.preview === 'off') { location.hash = 'panel'; showView(); }
  if (a.vehicleId) selectVehicle(vehicleById(a.vehicleId), true);
  else if (a.spot && scene) scene.flyTo(a.spot.x, a.spot.z, 2.2);
}

function renderAlertsModal() {
  const unread = alerts.filter(a => !a.read).length;
  $('alerts-sub').textContent = unread ? `${unread} sin leer. Selecciona una para ver dónde ocurre.` : 'No hay alertas sin leer.';
  $('alerts-read').hidden = !unread;
  $('alerts-list').replaceChildren(...alerts.map(a => h('button', { class: 'item item--alert' + (a.read ? ' is-read' : ''), onclick: () => openAlert(a) },
    h('span', { class: 'dot', dataset: { level: a.level } }),
    h('div', null, h('div', { class: 'item__title' }, a.title), h('div', { class: 'item__sub' }, a.detail), h('div', { class: 'item__sub' }, a.time)),
    badge(a.level))));
}

function initAlertsModal() {
  const modal = $('alerts-modal');
  $('bell').addEventListener('click', () => { renderAlertsModal(); modal.showModal(); });
  $('alerts-close').addEventListener('click', () => modal.close());
  $('alerts-all').addEventListener('click', () => modal.close());
  $('alerts-read').addEventListener('click', () => { alerts.forEach(a => { a.read = true; }); alertsUpdated(); renderAlertsModal(); });
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); }); // click on the backdrop
}

function initScene() {
  scene = createDASH100Scene($('scene'), Object.assign(config, { onSelect: selectVehicle }));
  scene.select(selected.id);
  if (branch) scene.setBranch(branch.id, branch.city);
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
getBranches().then(initBranches);
getRecentShipments().then(buildRows).then(() => selectVehicle(selected));
getAlerts().then(list => { alerts.push(...list); updateAlertBadges(); });

initAlertsModal();
initRouteMap();
$('sel-route').addEventListener('click', () => { if (selectedShipment) openRouteMap(selectedShipment); });
initShipmentModal();
// A truck opens its shipment's full record; a forklift has none, so it goes to the fleet page.
$('sel-details').addEventListener('click', () => { if (selectedShipment) openShipmentModal(selectedShipment); else goTo('flota'); });
$('search').addEventListener('keydown', e => { if (e.key === 'Enter') { moduleState.query = e.target.value; goTo('envios'); } });
window.addEventListener('hashchange', showView);
window.addEventListener('resize', onLayoutChange);

// The truck livery and dock numbers are drawn to canvas with Manrope, so wait for it (briefly) first.
const fontsReady = document.fonts ? Promise.all([document.fonts.load('800 54px Manrope'), document.fonts.load('bold 42px Manrope')]) : Promise.resolve();
const sceneReady = Promise.race([fontsReady, new Promise(r => setTimeout(r, 1500))]).catch(() => {}).then(initScene);
const fleetReady = sceneReady.then(s => getFleet(s.vehicles));
showView();
