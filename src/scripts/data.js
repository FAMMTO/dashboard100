// Data layer. Everything the UI shows about shipments and vehicles comes through the two
// async functions exported here. They return mock data for now; to connect the database,
// replace their bodies with real calls (e.g. `return (await fetch('/api/shipments')).json()`)
// that return objects of the same shape. Nothing else in the app needs to change.
//
// Status values double as badge styles (see `.badge[data-status=…]` in global.css):
// shipments use 'En tránsito' | 'En almacén' | 'Entregado'; forklifts use 'Activo' | 'Inactivo'.

// sale: what the order was sold for; cost: what it costs us to fulfil it (both MXN). Profit is derived: see orderProfit().
// vehicleId links a shipment to the vehicle that carries it in the 3D scene (see scene.js ids: T01…, F01…).
const SHIPMENTS = [
  { id:'WT-2847', vehicleId:'T11', product:'Refrigerados', status:'En tránsito', eta:'21 may, 10:00', etaLong:'21 may 2025 • 10:00', code:'FL-07', pallets:12, origin:'Monterrey, MX', dest:'Guadalajara, MX', sale:186400, cost:131900, stage:2, track:3, dates:['19 may, 08:14','19 may, 16:32','20 may, 09:17','20 may, 12:43','—'] },
  { id:'WT-2846', vehicleId:'T12', product:'Electrónicos', status:'En almacén', eta:'20 may, 18:20', etaLong:'20 may 2025 • 18:20', code:'EL-12', pallets:8, origin:'Monterrey, MX', dest:'Ciudad de México, MX', sale:243500, cost:178200, stage:2, track:2, dates:['18 may, 10:05','19 may, 07:40','20 may, 11:02','—','—'] },
  { id:'WT-2845', vehicleId:'T14', product:'Ropa', status:'Entregado', eta:'19 may, 14:15', etaLong:'19 may 2025 • 14:15', code:'CL-03', pallets:5, origin:'Saltillo, MX', dest:'Monterrey, MX', sale:64800, cost:47300, stage:4, track:4, dates:['17 may, 09:30','17 may, 15:10','18 may, 08:45','19 may, 09:20','19 may, 14:15'] },
  { id:'WT-2844', vehicleId:'T01', product:'Electrodomésticos', status:'En tránsito', eta:'21 may, 11:30', etaLong:'21 may 2025 • 11:30', code:'HA-21', pallets:10, origin:'Querétaro, MX', dest:'Monterrey, MX', sale:152000, cost:119600, stage:1, track:1, dates:['20 may, 07:55','20 may, 13:20','—','—','—'] },
];

// ---- mock generators for vehicles without a fixed record ----
const PRODUCTS = [['Autopartes', 'AP'], ['Bebidas', 'BV'], ['Muebles', 'FN'], ['Farmacéuticos', 'PH'], ['Alimentos empacados', 'PF'], ['Materiales de construcción', 'BM'], ['Textiles', 'TX']];
const CITIES = ['Monterrey, MX', 'Guadalajara, MX', 'Saltillo, MX', 'Querétaro, MX', 'Ciudad de México, MX', 'Puebla, MX', 'León, MX'];
const OPERATORS = ['María López', 'Jorge Ramírez', 'Ana Torres', 'Luis Herrera', 'Carla Méndez', 'Diego Salinas', 'Sofía Garza', 'Raúl Ortiz'];
const ZONES = ['Andenes 1–3', 'Zona de maniobras', 'Almacén de tarimas', 'Almacén de tarimas', 'Almacén de tarimas', 'Patio de contenedores', 'Patio de contenedores', 'Andenes norte'];
const TASKS = ['Descarga en andén 3', 'Traslado de tarimas', 'Reabasto de almacén', 'Carga de contenedores', 'Clasificación de tarimas'];
const pad2 = n => String(n).padStart(2, '0');
const num = id => parseInt(id.slice(1), 10) || 0;

function mockShipment({ id, parked }) {
  const n = num(id), [product, prefix] = PRODUCTS[n % PRODUCTS.length];
  const status = !parked ? 'En tránsito' : n % 2 ? 'Entregado' : 'En almacén';
  const [stage, track] = status === 'Entregado' ? [4, 4] : status === 'En almacén' ? [2, 2] : n % 2 ? [1, 1] : [2, 3];
  const time = k => `${pad2(7 + (n * 3 + k * 5) % 12)}:${pad2((n * 7 + k * 13) % 60)}`;
  const dates = [0, 1, 2, 3, 4].map(k => k <= track ? `${18 + Math.ceil(k / 2)} may, ${time(k)}` : '—');
  const eta = `${pad2(8 + n % 4)}:${pad2((n * 5) % 60)}`;
  const pallets = 4 + n % 11, sale = pallets * (9800 + (n * 1370) % 6400), cost = Math.round(sale * (0.62 + (n * 7) % 23 / 100) / 100) * 100;
  return {
    id: `WT-${2700 + n}`, vehicleId: id, product, status, code: `${prefix}-${pad2(n)}`, pallets, sale, cost,
    origin: CITIES[n % CITIES.length], dest: CITIES[(n + 3) % CITIES.length],
    eta: `21 may, ${eta}`, etaLong: `21 may 2025 • ${eta}`,
    stage, track, dates,
  };
}

function mockForklift({ id, parked }) {
  const n = num(id);
  return {
    id: `FK-${pad2(n)}`, vehicleId: id, model: 'Eléctrico 2.5 t', status: parked ? 'Inactivo' : 'Activo',
    operator: parked ? 'Sin asignar' : OPERATORS[n % OPERATORS.length], zone: ZONES[(n - 1) % ZONES.length],
    battery: 45 + (n * 17) % 50, task: parked ? 'Estacionado' : TASKS[n % TASKS.length],
  };
}

// Branches the user can switch between in the top bar. `id` also picks the yard's look in the 3D scene (see THEMES in scene.js).
const BRANCHES = [
  { id: 'mty', city: 'Monterrey', name: 'Monterrey, México', detail: 'Centro de distribución Norte', kpis: { shipments: 810, onTime: 92.3, hours: 6.2 } },
  { id: 'gdl', city: 'Guadalajara', name: 'Guadalajara, México', detail: 'Centro de distribución Occidente', kpis: { shipments: 642, onTime: 94.1, hours: 5.4 } },
  { id: 'mid', city: 'Mérida', name: 'Mérida, México', detail: 'Centro de distribución Sureste', kpis: { shipments: 388, onTime: 89.7, hours: 7.1 } },
];

// ---- public API ----

/** Profit of an order: what it sold for minus what it cost us. */
export const orderProfit = s => s.sale - s.cost;

// Branches are kept in this browser's IndexedDB (store 'branches'), so they can be edited and new ones added in
// Configuración. The three above are the starting ones: only they have figures (kpis, reports, warehouse) and a
// yard of their own in the 3D scene. A branch added by the user has none yet (`hasData: false`) and borrows the look
// of one of them (`theme`).
// Branch: { id, name, city (one of getRouteCities(): where its routes start), detail, street, neighborhood, zip, state,
//           phone, email, manager, hours, theme: 'mty' | 'gdl' | 'mid', fixed?: true, hasData, kpis }
const NO_KPIS = { shipments: 0, onTime: 0, hours: 0, sales: 0, profit: 0 };
// Sales and profit of each branch's dashboard card are those of its report (last 7 days), so both always agree.
const withFigures = b => {
  const base = BRANCHES.find(x => x.id === b.id), r = REPORTS[b.id];
  if (!base || !r) return { ...b, hasData: false, kpis: { ...NO_KPIS } };
  const sales = r.sales.reduce((a, v) => a + v, 0);
  return { ...b, hasData: true, kpis: { ...base.kpis, sales, profit: sales - r.cost } };
};

/** Branches for the picker in the top bar; the first one is the default. */
export async function getBranches() {
  const starting = BRANCHES.map(({ kpis, ...b }) => ({ ...b, theme: b.id, fixed: true }));
  let rows;
  try { await seedOnce('branches', starting); rows = await inStore('readonly', store => store.getAll(), 'branches'); } catch { rows = starting; }
  if (!rows.length) rows = starting; // the storage can't be used: the starting ones still work
  const order = id => { const at = BRANCHES.findIndex(b => b.id === id); return at < 0 ? BRANCHES.length : at; };
  return rows.sort((a, b) => order(a.id) - order(b.id) || a.name.localeCompare(b.name, 'es')).map(withFigures);
}

/** Creates the branch, or replaces the one with the same id. */
export async function saveBranch(branch) {
  const { kpis, hasData, ...kept } = branch; // figures are worked out, not saved
  await inStore('readwrite', store => store.put(kept), 'branches');
}

export async function deleteBranch(id) {
  await inStore('readwrite', store => store.delete(id), 'branches');
}

/** Shipments for the "Envíos recientes" table. */
export async function getRecentShipments() {
  return SHIPMENTS;
}

/**
 * Details for a vehicle clicked in the 3D scene.
 * @param {{ id: string, kind: 'truck' | 'forklift', parked: boolean }} vehicle
 * @returns {Promise<{ kind: 'truck', shipment: object } | { kind: 'forklift', forklift: object }>}
 */
export async function getVehicleDetails(vehicle) {
  if (vehicle.kind === 'forklift') return { kind: 'forklift', forklift: mockForklift(vehicle) };
  return { kind: 'truck', shipment: SHIPMENTS.find(s => s.vehicleId === vehicle.id) || mockShipment(vehicle) };
}

/** Every vehicle in the scene joined with its details: [{ vehicle, kind, shipment | forklift }]. */
export async function getFleet(vehicles) {
  return Promise.all(vehicles.map(async vehicle => ({ vehicle, ...(await getVehicleDetails(vehicle)) })));
}

/** Routes (origin → destination) with the shipments travelling on each, busiest first. */
export async function getRoutes(fleet) {
  const routes = new Map();
  for (const { kind, shipment: s } of fleet) {
    if (kind !== 'truck') continue;
    const key = s.origin + '→' + s.dest;
    if (!routes.has(key)) {
      routes.set(key, { origin: s.origin, dest: s.dest, km: Math.round((await getShipmentRoute(s)).km), shipments: [] }); // same km as the route map
    }
    routes.get(key).shipments.push(s);
  }
  return [...routes.values()].sort((a, b) => b.shipments.length - a.shipments.length);
}

// ---- everything about one shipment (for the "Ver detalles" modal) ----
const CLIENTS = [
  ['Grupo Comercial del Norte', 'Laura Treviño', 'GCN090312AB4'], ['Distribuidora Azteca', 'Ricardo Peña', 'DAZ110825KJ2'], ['Tiendas La Económica', 'Mónica Villarreal', 'TLE970604QX8'],
  ['Farmacias San Rafael', 'Héctor Cantú', 'FSR050917MN1'], ['Constructora Bajío', 'Patricia Rangel', 'CBA130201TR6'], ['Muebles y Hogar Regio', 'Óscar Lozano', 'MHR080430PL9'],
];
// Splits an amount into named parts by percentage; the last part takes what is left, so they always add up.
const split = (total, parts) => { let left = total; return parts.map(([name, pct], i) => { const amount = i === parts.length - 1 ? left : Math.round(total * pct / 100); left -= amount; return [name, amount]; }); };
// A handwriting-like stroke, always the same for the same seed.
function signaturePath(seed) {
  let d = '';
  for (let i = 0; i <= 140; i++) {
    const t = i / 140, x = 18 + t * 284, y = 58 + Math.sin(t * 19 + seed) * 20 * (1 - t * 0.5) + Math.sin(t * 43 + seed * 1.7) * 9 - Math.exp(-((t - 0.16) ** 2) * 220) * 24 + t * 6;
    d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d + 'M40,92L286,84';
}

/**
 * Full record of a shipment: client, unit, what the sale and the cost are made of, invoices, payment receipts and,
 * once delivered, who signed for it and the evidence. Mock data derived from the shipment; `file` names stand for
 * documents that are not stored yet. Replace with a call to the database (same shape).
 * @returns {Promise<{ client, purchaseOrder, driver, plates, weightKg, address, saleLines, costLines, invoices, payments, delivery: object | null }>}
 */
export async function getShipmentDetails(s) {
  const n = parseInt(s.id.replace(/\D/g, ''), 10) || 0, [name, contact, rfc] = CLIENTS[n % CLIENTS.length], delivered = s.status === 'Entregado';
  const saleLines = split(s.sale, [[`Flete ${s.origin} → ${s.dest}`, 78], ['Maniobras de carga y descarga', 12], ['Seguro de mercancía', 10]]);
  const costLines = split(s.cost, [['Combustible', 38], ['Operador y viáticos', 24], ['Casetas', 14], ['Mantenimiento de la unidad', 12], ['Seguro y permisos', 12]]);
  const day = k => s.dates[k] === '—' ? '—' : s.dates[k].split(',')[0] + ' 2025', half = Math.round(s.sale / 2);
  return {
    client: { name, contact, rfc, phone: `81 ${String(2000 + n * 37 % 8000).padStart(4, '0')} ${String(1000 + n * 53 % 9000).padStart(4, '0')}` },
    purchaseOrder: `OC-${40000 + n * 7}`, driver: OPERATORS[n % OPERATORS.length], plates: `${String(10 + n % 89)}-AK-${String(1 + n * 3 % 9)}${String.fromCharCode(65 + n % 26)}`,
    weightKg: s.pallets * (620 + n % 5 * 40), address: `Av. Industrial ${100 + n % 900}, Parque Logístico, ${s.dest}`,
    saleLines, costLines,
    invoices: [
      { folio: `F-${n}-A`, date: day(0), concept: 'Flete', amount: saleLines[0][1], status: delivered ? 'Pagada' : 'Pendiente', file: `factura-F${n}A.pdf` },
      { folio: `F-${n}-B`, date: day(0), concept: 'Maniobras y seguro', amount: saleLines[1][1] + saleLines[2][1], status: 'Pagada', file: `factura-F${n}B.pdf` },
    ],
    payments: [
      { reference: `SPEI-${880000 + n * 13}`, date: day(0), method: 'Transferencia SPEI · Anticipo 50%', amount: half, status: 'Confirmado', file: `pago-${n}-anticipo.pdf` },
      { reference: delivered ? `SPEI-${910000 + n * 17}` : '—', date: delivered ? day(4) : '—', method: 'Transferencia SPEI · Liquidación', amount: s.sale - half, status: delivered ? 'Confirmado' : 'Pendiente', file: delivered ? `pago-${n}-liquidacion.pdf` : null },
    ],
    delivery: delivered ? {
      receivedBy: contact, role: 'Jefe de almacén', date: s.dates[4] === '—' ? s.eta : s.dates[4], idCheck: 'INE verificada por el operador', signature: signaturePath(n),
      evidence: [{ caption: 'Unidad en el andén del cliente', time: 'Llegada' }, { caption: 'Mercancía descargada y contada', time: 'Descarga' }, { caption: 'Acuse con sello de recibido', time: 'Cierre' }],
      comment: 'Mercancía completa y en buen estado. Sin daños ni faltantes.',
    } : null,
  };
}

// ---- the road a shipment travels (for the "Ver ruta" map) ----
// [lat, lng] of the cities shipments move between, plus the towns the highways pass through.
const PLACES = {
  'Monterrey': [25.6866, -100.3161], 'Saltillo': [25.4383, -100.9737], 'Matehuala': [23.6469, -100.6433], 'San Luis Potosí': [22.1565, -100.9855],
  'Querétaro': [20.5888, -100.3899], 'Ciudad de México': [19.4326, -99.1332], 'Puebla': [19.0414, -98.2063], 'León': [21.1250, -101.6860],
  'Guadalajara': [20.6597, -103.3496], 'Zacatecas': [22.7709, -102.5832], 'Aguascalientes': [21.8853, -102.2916],
  'Villahermosa': [17.9869, -92.9303], 'Campeche': [19.8301, -90.5349], 'Mérida': [20.9674, -89.5926],
};
// Highways between them; used to trace an approximate route when the routing service can't be reached.
const ROADS = [['Monterrey', 'Saltillo'], ['Saltillo', 'Matehuala'], ['Matehuala', 'San Luis Potosí'], ['San Luis Potosí', 'Querétaro'], ['Querétaro', 'Ciudad de México'],
  ['Ciudad de México', 'Puebla'], ['San Luis Potosí', 'León'], ['León', 'Querétaro'], ['León', 'Guadalajara'], ['León', 'Aguascalientes'], ['Aguascalientes', 'Zacatecas'],
  ['Zacatecas', 'Saltillo'], ['Zacatecas', 'Guadalajara'], ['Aguascalientes', 'Guadalajara'], ['Puebla', 'Villahermosa'], ['Villahermosa', 'Campeche'], ['Campeche', 'Mérida']];
const kmBetween = (a, b) => {
  const rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad, x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
// Shortest way through ROADS, as a list of place names.
function roadPath(from, to) {
  const dist = { [from]: 0 }, prev = {}, todo = new Set(Object.keys(PLACES));
  while (todo.size) {
    const at = [...todo].filter(p => p in dist).sort((a, b) => dist[a] - dist[b])[0];
    if (!at || at === to) break;
    todo.delete(at);
    for (const [a, b] of ROADS) {
      const next = a === at ? b : b === at ? a : null;
      if (!next || !todo.has(next)) continue;
      const d = dist[at] + kmBetween(PLACES[at], PLACES[next]);
      if (!(next in dist) || d < dist[next]) { dist[next] = d; prev[next] = at; }
    }
  }
  const path = [to];
  while (path[0] !== from && prev[path[0]]) path.unshift(prev[path[0]]);
  return path[0] === from ? path : [from, to];
}
// How far along its route a shipment is, from its tracking step (0 recolectado … 4 entregado).
const ROUTE_PROGRESS = [0.04, 0.45, 0.8, 0.93, 1];
const cityName = city => city.replace(/,\s*MX$/, '');
// Hardcoded road between two cities (routes-data.js, loaded only when a route is needed), in either direction; null if there is none.
async function testRoute(from, to) {
  const { ROUTES } = await import('./routes-data.js'), there = ROUTES[from + '→' + to], back = ROUTES[to + '→' + from];
  return there || (back ? { ...back, points: [...back.points].reverse() } : null);
}

// ---- where a postal code is (to place a client on the map) ----
// Looked up in OpenStreetMap's geocoder (Nominatim). It is a shared public service: at most one request per second
// and every answer is kept (in this browser), so a code is only asked for once. For production use a geocoder of your own.
const zipLookups = new Map();
let zipTurn = Promise.resolve();
const ZIP_GAP_MS = 1100;

/**
 * Centre of a Mexican postal code: { lat, lng, state, place } (place: the neighbourhood or town it names), or null if
 * it is not known. Rejects when the service can't be reached.
 */
export function locatePostalCode(zip) {
  zip = String(zip || '').trim();
  if (!/^\d{5}$/.test(zip)) return Promise.resolve(null);
  if (zipLookups.has(zip)) return zipLookups.get(zip);
  const key = 'd100-zip-' + zip;
  try { const saved = localStorage.getItem(key); if (saved) { const hit = Promise.resolve(JSON.parse(saved)); zipLookups.set(zip, hit); return hit; } } catch {}
  // Requests wait their turn, so they never go out faster than the service allows.
  const lookup = zipTurn.then(async () => {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${zip}&countrycodes=mx&format=jsonv2&limit=1&addressdetails=1&accept-language=es`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('Geocodificador: ' + res.status);
    const [hit] = await res.json();
    if (!hit) return null;
    const a = hit.address || {}, spot = { lat: Number(hit.lat), lng: Number(hit.lon), state: a.state || '', place: [a.city_district || a.suburb || a.borough, a.city || a.town || a.county || a.municipality].filter(Boolean).join(', ') };
    try { localStorage.setItem(key, JSON.stringify(spot)); } catch {}
    return spot;
  });
  zipTurn = lookup.catch(() => {}).then(() => new Promise(resolve => setTimeout(resolve, ZIP_GAP_MS)));
  zipLookups.set(zip, lookup);
  lookup.catch(() => zipLookups.delete(zip)); // a failed request can be tried again
  return lookup;
}

/** The route city closest to a point, if one is within `maxKm` (to suggest a client's delivery city from its postal code). */
export function nearestRouteCity(lat, lng, maxKm = 90) {
  const [city, km] = Object.entries(PLACES).map(([name, at]) => [name, kmBetween([lat, lng], at)]).sort((a, b) => a[1] - b[1])[0];
  return km <= maxKm ? city : null;
}

/** Cities a route can start or end in (the ones a client's delivery address can be in). */
export async function getRouteCities() {
  return Object.keys(PLACES).sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * The road between two cities (by name, as in PLACES).
 * For now the routes are hardcoded test data (routes-data.js); a pair of cities without one is traced city to
 * city along ROADS. Replace this with the carrier's GPS track or a routing service.
 * @returns {Promise<{ points: [lat, lng][], km: number, hours: number, exact: boolean }>}
 */
export async function getRouteBetween(from, to) {
  if (!PLACES[from] || !PLACES[to]) throw new Error(`Ruta desconocida: ${from} → ${to}`);
  const route = await testRoute(from, to);
  if (route) return { ...route, exact: true };
  const points = roadPath(from, to).map(p => PLACES[p]), km = points.slice(1).reduce((a, p, i) => a + kmBetween(points[i], p), 0) * 1.18; // roads wind more than straight lines
  return { points, km, hours: km / 75, exact: false };
}

/** The road from a shipment's origin to its destination, and how far along it the shipment is (`progress`, 0 to 1). */
export async function getShipmentRoute(shipment) {
  return { ...(await getRouteBetween(cityName(shipment.origin), cityName(shipment.dest))), progress: ROUTE_PROGRESS[shipment.track] ?? 0.5 };
}

// Every branch has the same yard (the 3D scene), so docks and zones sit in the same places: x/z are positions
// in the scene, used to fly the camera there. What changes per branch is how busy they are and what is stored.
const DOCK_SPOTS = [[9, 2], [9, 10], [9, 18], [-40, -38], [-33, -38], [-26, -38], [-19, -38]];
const ZONE_SPOTS = [
  { name: 'Almacén de tarimas', x: -17, z: -4, zoom: 2 }, { name: 'Zona de maniobras', x: 2, z: 18, zoom: 2 },
  { name: 'Patio de contenedores', x: 68, z: 15, zoom: 1.2 }, { name: 'Estacionamiento de tráileres', x: -53, z: 20, zoom: 1.2 },
];
// Per branch (keys are branch ids). docks: [status, detail] per dock; zones: [used, capacity] per zone; inventory: pallets per category.
const WAREHOUSES = {
  mty: {
    docks: [['Libre', 'Tarimas listas'], ['Cargando', 'Envío #WT-2847'], ['Libre', 'Tarimas listas'], ['Ocupado', 'Envío #WT-2846'], ['Libre', 'Sin asignar'], ['Ocupado', 'Envío #WT-2713'], ['Libre', 'Sin asignar']],
    zones: [[68, 90], [6, 20], [142, 180], [10, 14]],
    inventory: { 'Refrigerados': 124, 'Electrónicos': 96, 'Electrodomésticos': 88, 'Ropa': 61, 'Autopartes': 54, 'Otros': 73 },
  },
  gdl: {
    docks: [['Cargando', 'Envío #WT-2708'], ['Ocupado', 'Envío #WT-2715'], ['Libre', 'Tarimas listas'], ['Libre', 'Sin asignar'], ['Cargando', 'Envío #WT-2722'], ['Libre', 'Sin asignar'], ['Ocupado', 'Envío #WT-2705']],
    zones: [[54, 80], [11, 20], [96, 150], [7, 12]],
    inventory: { 'Bebidas': 138, 'Muebles': 84, 'Electrónicos': 67, 'Textiles': 52, 'Alimentos empacados': 49, 'Otros': 41 },
  },
  mid: {
    docks: [['Libre', 'Tarimas listas'], ['Libre', 'Sin asignar'], ['Cargando', 'Envío #WT-2719'], ['Libre', 'Sin asignar'], ['Libre', 'Sin asignar'], ['Ocupado', 'Envío #WT-2702'], ['Libre', 'Sin asignar']],
    zones: [[31, 60], [4, 16], [58, 110], [5, 10]],
    inventory: { 'Alimentos empacados': 92, 'Materiales de construcción': 71, 'Bebidas': 58, 'Farmacéuticos': 34, 'Ropa': 27, 'Otros': 22 },
  },
};

/** Warehouse state of a branch (its id; the first branch if unknown). */
export async function getWarehouse(branchId) {
  const w = WAREHOUSES[branchId] || WAREHOUSES[BRANCHES[0].id];
  return {
    docks: w.docks.map(([status, detail], i) => ({ name: `Andén ${i + 1}`, status, detail, x: DOCK_SPOTS[i][0], z: DOCK_SPOTS[i][1] })),
    zones: w.zones.map(([used, capacity], i) => ({ ...ZONE_SPOTS[i], used, capacity })),
    inventory: Object.entries(w.inventory).map(([name, pallets]) => ({ name, pallets })),
  };
}

// Last 7 days per branch (keys are branch ids). sales[] is MXN sold each day; cost is what those orders cost us.
const REPORT_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const REPORTS = {
  mty: {
    processingHours: 6.2, incidents: 14, cost: 8680000,
    shipments: [98, 112, 121, 105, 134, 128, 112], onTime: [89.5, 91.2, 93.0, 90.8, 94.1, 93.6, 92.3],
    sales: [1420000, 1650000, 1790000, 1530000, 1980000, 1880000, 1640000],
    status: { 'En tránsito': 46, 'En almacén': 22, 'Entregado': 32 },
    destinations: { 'Guadalajara': 186, 'Ciudad de México': 164, 'Monterrey': 142, 'Querétaro': 121, 'Saltillo': 104, 'Puebla': 93 },
  },
  gdl: {
    processingHours: 5.4, incidents: 9, cost: 5870000,
    shipments: [78, 88, 96, 84, 106, 101, 89], onTime: [92.0, 93.4, 94.8, 93.1, 95.2, 94.6, 94.1],
    sales: [1010000, 1150000, 1260000, 1090000, 1390000, 1320000, 1160000],
    status: { 'En tránsito': 41, 'En almacén': 19, 'Entregado': 40 },
    destinations: { 'Ciudad de México': 158, 'León': 131, 'Monterrey': 112, 'Querétaro': 97, 'Guadalajara': 82, 'Puebla': 62 },
  },
  mid: {
    processingHours: 7.1, incidents: 11, cost: 3540000,
    shipments: [47, 53, 58, 51, 64, 61, 54], onTime: [87.2, 88.5, 90.1, 88.9, 91.0, 90.4, 89.7],
    sales: [560000, 640000, 700000, 610000, 770000, 730000, 650000],
    status: { 'En tránsito': 52, 'En almacén': 25, 'Entregado': 23 },
    destinations: { 'Ciudad de México': 104, 'Puebla': 86, 'Mérida': 71, 'Querétaro': 52, 'Guadalajara': 43, 'Monterrey': 32 },
  },
};
const sum = list => list.reduce((a, v) => a + v, 0);
const round1 = v => Math.round(v * 10) / 10;

// What a branch's orders cost on each day. Only the week's total is on record (`cost`), so it is shared out by
// each day's sales with a small fixed variation: the margin changes a little from day to day, and the days still
// add up to the total. Replace with the real cost per day.
function dailyCost(r, seed) {
  const weights = r.sales.map((v, i) => v * (1 + (Math.sin((seed + i) * 2.3) * 0.5) * 0.14)), all = weights.reduce((a, v) => a + v, 0);
  let left = r.cost;
  return weights.map((w, i) => { const cost = i === weights.length - 1 ? left : Math.round(r.cost * w / all / 1000) * 1000; left -= cost; return cost; });
}
/**
 * Figures for the last 7 days. `scope` is a branch id, or 'general' for every branch added together.
 * `branches` always lists each branch's sales and shipments, to compare them.
 */
export async function getReports(scope = 'general') {
  const picked = REPORTS[scope] ? [REPORTS[scope]] : Object.values(REPORTS);
  const perDay = key => REPORT_DAYS.map((_, i) => sum(picked.map(r => r[key][i])));
  // Averages across branches are weighted by how many shipments each one moved.
  const weighted = value => { let total = 0, weight = 0; picked.forEach(r => r.shipments.forEach((n, i) => { total += value(r, i) * n; weight += n; })); return total / weight; };
  const merged = key => { const out = {}; picked.forEach(r => Object.entries(r[key]).forEach(([name, v]) => { out[name] = (out[name] || 0) + v * (key === 'status' ? sum(r.shipments) : 1); })); return out; };
  const shipments = perDay('shipments'), sales = perDay('sales'), cost = sum(picked.map(r => r.cost)), statusTotal = sum(shipments);
  const costs = picked.map(r => dailyCost(r, Object.values(REPORTS).indexOf(r) * 7)), profit = sales.map((v, i) => v - sum(costs.map(c => c[i]))); // per day; adds up to totals.profit
  return {
    totals: { shipments: sum(shipments), onTime: round1(weighted((r, i) => r.onTime[i])), processingHours: round1(weighted(r => r.processingHours)), incidents: sum(picked.map(r => r.incidents)), sales: sum(sales), cost, profit: sum(sales) - cost },
    days: REPORT_DAYS, shipments, sales, profit,
    onTime: REPORT_DAYS.map((_, i) => round1(sum(picked.map(r => r.onTime[i] * r.shipments[i])) / shipments[i])),
    status: Object.entries(merged('status')).map(([name, v]) => ({ name, value: Math.round(v / statusTotal) })),
    destinations: Object.entries(merged('destinations')).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6),
    branches: BRANCHES.map(b => ({ id: b.id, name: b.city, sales: sum(REPORTS[b.id].sales), shipments: sum(REPORTS[b.id].shipments) })),
  };
}

// ---- on-time deliveries over time ----
// Breakdowns of the "Entregas a tiempo" chart: the points of each period and what its periods are called
// (current, the one before, the same one a year ago).
const ON_TIME_PERIODS = {
  dia: { title: 'Día', labels: ['08 h', '10 h', '12 h', '14 h', '16 h', '18 h', '20 h'], names: ['Hoy', 'Ayer', 'Mismo día, año pasado'] },
  semana: { title: 'Semana', labels: REPORT_DAYS, names: ['Esta semana', 'Semana pasada', 'Misma semana, año pasado'] },
  mes: { title: 'Mes', labels: Array.from({ length: 30 }, (_, i) => String(i + 1)), names: ['Este mes', 'Mes pasado', 'Mismo mes, año pasado'] },
  anio: { title: 'Año', labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'], names: ['Este año', 'Año pasado'] },
};
const noise = seed => { const x = Math.sin(seed * 127.1) * 43758.5453; return x - Math.floor(x); };
// Mock series for one branch. `back`: 0 current period, 1 the one before, 2 a year ago. This week's is the real one above.
function onTimeSeries(id, period, back) {
  const r = REPORTS[id], labels = ON_TIME_PERIODS[period].labels;
  if (period === 'semana' && !back) return r.onTime;
  const base = sum(r.onTime) / r.onTime.length - back * 1.1, key = id.charCodeAt(0) + id.charCodeAt(1) * 3 + Object.keys(ON_TIME_PERIODS).indexOf(period) * 17 + back * 31;
  return labels.map((_, i) => Math.min(99.5, base + Math.sin((i + key) * 0.9) * 1.1 + (noise(key * 7 + i) - 0.5) * 1.8 + i / (labels.length - 1) * 0.8));
}

/** Periods the on-time chart can be broken down by, and what each can be compared with: [{ id, title, compare: [{ id, name }] }]. */
export async function getOnTimePeriods() {
  return Object.entries(ON_TIME_PERIODS).map(([id, p]) => ({ id, title: p.title, compare: [{ id: 'none', name: 'Sin comparar' }, ...p.names.slice(1).map((name, i) => ({ id: i ? 'year' : 'prev', name }))] }));
}

/**
 * On-time deliveries (%) for a branch id or 'general'. period: 'dia' | 'semana' | 'mes' | 'anio';
 * compare: 'none' | 'prev' (the period before) | 'year' (the same period a year ago).
 * @returns {Promise<{ labels: string[], current: { name, values }, compare: { name, values } | null }>}
 */
export async function getOnTime(scope = 'general', period = 'semana', compare = 'none') {
  const p = ON_TIME_PERIODS[period], ids = REPORTS[scope] ? [scope] : Object.keys(REPORTS), back = compare === 'prev' ? 1 : compare === 'year' && p.names[2] ? 2 : 0;
  // Branches are averaged by how many shipments each one moves.
  const weight = ids.map(id => sum(REPORTS[id].shipments)), total = sum(weight);
  const series = b => { const all = ids.map(id => onTimeSeries(id, period, b)); return p.labels.map((_, i) => round1(sum(all.map((v, k) => v[i] * weight[k])) / total)); };
  return { labels: p.labels, current: { name: p.names[0], values: series(0) }, compare: back ? { name: p.names[back], values: series(back) } : null };
}

/** Alerts, newest first. vehicleId or spot ({ x, z }) says where to look in the 3D scene. */
export async function getAlerts() {
  return [
    { id: 'A-105', level: 'Alta', title: 'Retraso en envío #WT-2844', detail: 'Lleva 45 min de retraso sobre la llegada estimada.', time: 'Hace 8 min', vehicleId: 'T01', read: false },
    { id: 'A-104', level: 'Media', title: 'Batería baja en montacargas FK-06', detail: 'Batería al 47 %. Programar recarga al terminar la tarea.', time: 'Hace 21 min', vehicleId: 'F06', read: false },
    { id: 'A-103', level: 'Media', title: 'Andén 2 ocupado más de 2 h', detail: 'La carga del envío #WT-2847 supera el tiempo previsto.', time: 'Hace 35 min', spot: { x: 9, z: 10 }, read: false },
    { id: 'A-102', level: 'Baja', title: 'Mantenimiento programado', detail: 'El tráiler T13 tiene servicio el 22 de mayo.', time: 'Hace 2 h', vehicleId: 'T13', read: true },
    { id: 'A-101', level: 'Baja', title: 'Envío #WT-2845 entregado', detail: 'Entrega confirmada en Monterrey, MX.', time: 'Hace 5 h', vehicleId: 'T14', read: true },
  ];
}

// ---- movements: purchase orders (type 'entrada', shown as OC) and sales (salidas) ----
// Records are kept in this browser's IndexedDB, receipts included, until there is a real database.
// Replace the four functions below with API calls; the "Pedidos" page only uses these.
// Record: { id, type: 'entrada' | 'salida', folio, date: 'YYYY-MM-DD', material, party, quantity, unit, unitPrice,
//           payment: File | null, invoice: File | null, notes,
//           clientId: string | null, origin, dest, address (sales to a saved client: where it leaves from and goes to),
//           supplierId: string | null (the supplier a purchase was made from, or the one a sale's material came from),
//           supplierName, unitCost (sales: that supplier and what it charges per unit, when it was sold) }

// Records are kept in this browser's IndexedDB until there is a real database: movements (with their receipts),
// clients and the catalogue of materials. Each has its own store; replace the functions below with API calls.
const openDb = () => new Promise((resolve, reject) => {
  const req = indexedDB.open('DASH100', 6); // v2 added the clients store, v3 the materials one, v4 the suppliers one, v5 the users one, v6 the branches one
  req.onupgradeneeded = () => { for (const name of ['movements', 'clients', 'materials', 'suppliers', 'users', 'branches']) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' }); };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const inStore = async (mode, run, name = 'movements') => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode), req = run(tx.objectStore(name));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
};

// Writes the starting records of a store the first time it is used in this browser. After that the store is the
// user's: what they edit or delete stays that way.
const seedOnce = async (name, rows) => {
  const flag = 'd100-seeded-' + name;
  try { if (localStorage.getItem(flag)) return; } catch { return; }
  await inStore('readwrite', store => { rows.forEach(row => store.put(row)); return store.count(); }, name);
  try { localStorage.setItem(flag, '1'); } catch {}
};
const byName = (a, b) => a.name.localeCompare(b.name, 'es');

// ---- clients: who the sales (salidas) are made to ----
// Client: { id, name, rfc, contact, phone, email, street, neighborhood, city, state, zip, fixed?: true }
// `city` is one of getRouteCities(): it is what a sale's route is worked out from. `fixed` clients can't be deleted.
const STARTING_CLIENTS = [
  { id: 'cli-0001', name: 'Grupo Comercial del Norte', rfc: 'GCN090312AB4', contact: 'Laura Treviño', phone: '81 2345 6789', email: 'compras@gcnorte.mx',
    street: 'Blvd. Venustiano Carranza 4120', neighborhood: 'Villa Olímpica', city: 'Saltillo', state: 'Coahuila', zip: '25230', fixed: true },
];

/** Every client, by name. */
export async function getClients() {
  await seedOnce('clients', STARTING_CLIENTS);
  return (await inStore('readonly', store => store.getAll(), 'clients')).sort(byName);
}

/** Creates the client, or replaces the one with the same id. */
export async function saveClient(client) {
  await inStore('readwrite', store => store.put(client), 'clients');
}

export async function deleteClient(id) {
  await inStore('readwrite', store => store.delete(id), 'clients');
}

// ---- catalogue: the materials the company trades and what each costs ----
// Material: { id, name, costPerTon, salePerTon (MXN per tonne: what it costs us and what we sell it for), notes }.
// The figures per kilo are those divided by 1000.
const STARTING_CATALOG = [
  ['Cartón', 2800, 3600], ['Madera', 3500, 4700], ['Acero', 14500, 18200], ['Aluminio', 38000, 46500], ['Cobre', 165000, 189000],
  ['Plástico (PET)', 9000, 11800], ['Polietileno', 11000, 14300], ['Vidrio', 1200, 1750], ['Resina', 24000, 30500],
].map(([name, costPerTon, salePerTon], i) => ({ id: `mat-${String(i + 1).padStart(4, '0')}`, name, costPerTon, salePerTon, notes: '' }));

/** Every material in the catalogue, by name. It is also the "Materia prima" list of Pedidos. */
export async function getCatalog() {
  await seedOnce('materials', STARTING_CATALOG);
  const rows = await inStore('readonly', store => store.getAll(), 'materials');
  // Starting materials saved before the catalogue had sale prices get the starting one, until the user sets theirs.
  return rows.map(m => m.salePerTon == null ? { ...m, salePerTon: STARTING_CATALOG.find(x => x.id === m.id)?.salePerTon ?? null } : m).sort(byName);
}

/** Creates the material, or replaces the one with the same id. */
export async function saveMaterial(material) {
  await inStore('readwrite', store => store.put(material), 'materials');
}

export async function deleteMaterial(id) {
  await inStore('readwrite', store => store.delete(id), 'materials');
}

// ---- suppliers: who the material is bought from, and the price each one sets ----
// Supplier: { id, name, rfc, contact, phone, email, city, notes, materials: [{ materialId, name, pricePerTon }],
//             branches: string[] (ids of the branches it delivers to; missing = all of them) }
// A supplier sells one or more materials of the catalogue (materialId), each at its own price per tonne; `name`
// keeps the material's name in case it is later removed from the catalogue.
const offer = (index, pricePerTon) => ({ materialId: STARTING_CATALOG[index].id, name: STARTING_CATALOG[index].name, pricePerTon });
const STARTING_SUPPLIERS = [
  { id: 'prov-0001', name: 'Recicladora del Norte', rfc: 'RNO120514KD7', contact: 'Sergio Garza', phone: '81 8345 1200', email: 'ventas@recinorte.mx', city: 'Monterrey', notes: 'Pago a 15 días.',
    materials: [offer(0, 2650), offer(1, 3400), offer(5, 8700)], branches: ['mty', 'gdl'] }, // cartón, madera, PET
  { id: 'prov-0002', name: 'Metales Monterrey', rfc: 'MMO080221PQ3', contact: 'Daniela Cavazos', phone: '81 8190 4455', email: 'compras@metalesmty.mx', city: 'San Nicolás de los Garza', notes: '',
    materials: [offer(2, 14200), offer(3, 37500), offer(4, 163000)], branches: ['mty'] }, // acero, aluminio, cobre
];

/** Every supplier, by name. */
export async function getSuppliers() {
  await seedOnce('suppliers', STARTING_SUPPLIERS);
  return (await inStore('readonly', store => store.getAll(), 'suppliers')).sort(byName);
}

/** Creates the supplier, or replaces the one with the same id. */
export async function saveSupplier(supplier) {
  await inStore('readwrite', store => store.put(supplier), 'suppliers');
}

export async function deleteSupplier(id) {
  await inStore('readwrite', store => store.delete(id), 'suppliers');
}

// ---- users: the people of the company and the role each one has ----
// User: { id, name, role (one of USER_ROLES), email, phone, branchId (a branch id, or '' for every branch), active, fixed?: true }
// For now it is only a directory: there is no login yet, so a role does not limit what its user can see or do.
export const USER_ROLES = ['Administración', 'Gerente de operaciones', 'Jefe de operaciones', 'Ventas', 'Sistemas', 'Chofer', 'Montacarguista'];
const STARTING_USERS = [
  { id: 'usr-0001', name: 'Alex Chen', role: 'Gerente de operaciones', email: '', phone: '', branchId: '', active: true, fixed: true },
];

/** Every user, by name. */
export async function getUsers() {
  await seedOnce('users', STARTING_USERS);
  return (await inStore('readonly', store => store.getAll(), 'users')).sort(byName);
}

/** Creates the user, or replaces the one with the same id. */
export async function saveUser(user) {
  await inStore('readwrite', store => store.put(user), 'users');
}

export async function deleteUser(id) {
  await inStore('readwrite', store => store.delete(id), 'users');
}

/** Every arrival and sale, newest first. */
export async function getMovements() {
  const rows = await inStore('readonly', store => store.getAll());
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.folio.localeCompare(a.folio));
}

/** Creates the record, or replaces the one with the same id. */
export async function saveMovement(record) {
  await inStore('readwrite', store => store.put(record));
}

export async function deleteMovement(id) {
  await inStore('readwrite', store => store.delete(id));
}

// ---- messages: the e-mails that go with the orders (the "Mensajes" page) ----
// Thread: { id, kind: 'oc' | 'proveedor' | 'cliente', subject, party, folio?, orderId?, approved: { at } | null,
//           messages: [{ dir: 'out' | 'in', who, at (ISO date), text }] }
// What was sent is real: the mail of each purchase order (OC). What arrives is not yet, because there is no
// mailbox connected: every OC sent gets a mock answer from its supplier, and INBOX holds a few loose messages.
// Replace getMessages() with a call to the backend that reads the mailbox (same shape).
const INBOX = [
  { id: 'in-0001', kind: 'cliente', subject: 'Fecha de entrega de nuestro pedido', party: 'Grupo Comercial del Norte', approved: null,
    messages: [{ dir: 'in', who: 'compras@gcnorte.mx', at: '2026-10-06T16:20:00', text: 'Buenas tardes. ¿Nos pueden confirmar qué día llega el acero que pedimos? Necesitamos programar la descarga en nuestro almacén de Saltillo.\n\nGracias,\nLaura Treviño' }] },
  { id: 'in-0002', kind: 'proveedor', subject: 'Actualización de precios de octubre', party: 'Metales Monterrey', approved: null,
    messages: [{ dir: 'in', who: 'compras@metalesmty.mx', at: '2026-10-05T09:05:00', text: 'Estimados clientes: a partir del 15 de octubre el aluminio sube 2% por tonelada. El acero y el cobre mantienen su precio.\n\nSaludos,\nDaniela Cavazos' }] },
];
const REPLY_AFTER_MS = 2 * 3600 * 1000;

/** Every conversation, the one with the latest message first. */
export async function getMessages() {
  const orders = (await getMovements()).filter(r => r.type === 'entrada' && r.mail);
  const threads = orders.map(r => ({
    id: 'oc-' + r.id, kind: 'oc', orderId: r.id, folio: r.folio, party: r.party, subject: r.mail.subject, approved: r.approved || null,
    messages: [
      { dir: 'out', who: r.mail.to, at: r.mail.sentAt, text: r.mail.body || 'Mensaje enviado desde tu programa de correo (no se guardó una copia del texto).' },
      { dir: 'in', who: r.mail.to, at: new Date(new Date(r.mail.sentAt).getTime() + REPLY_AFTER_MS).toISOString(),
        text: `Buen día. Confirmamos disponibilidad de ${r.quantity.toLocaleString('es-MX')} ${r.unit} de ${r.material} al precio acordado. Podemos entregar en 3 días hábiles.\n\nQuedamos atentos a su aprobación para programar el envío.\n\n${r.party}` },
    ],
  }));
  const latest = t => t.messages[t.messages.length - 1].at;
  return [...threads, ...INBOX].sort((a, b) => latest(b).localeCompare(latest(a)));
}

/** Files a purchase order's follow-up as "Solicitud aprobada" (the order then counts as bought), or takes that back. */
export async function setOrderApproved(id, on) {
  const record = (await getMovements()).find(r => r.id === id);
  if (!record) throw new Error('Orden desconocida: ' + id);
  await saveMovement({ ...record, approved: on ? { at: new Date().toISOString() } : null });
}

// ---- purchases: how much material is being bought (the "Compras" section of Reportes) ----
// Worked out from the purchase orders (OC) saved in this browser (see getMovements): the ones dated in the last
// 7 days. An order belongs to the branch it was made in (`branchId`); orders saved before that was recorded have
// none and are counted in every branch.
const PURCHASE_DAYS = 7;
const isoDay = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * What was asked of suppliers in the last 7 days. `scope` is a branch id, or 'general' for every branch.
 * @returns {Promise<{ totals: { tons, amount, orders, approved }, materials: { name, tons, others: string[], amount }[] }>}
 *   tons: what was bought by weight (kg and tonnes); others: quantities in units that are not a weight ("12 piezas");
 *   approved: the orders filed as "Solicitud aprobada" in Mensajes. materials: the one most was spent on first.
 */
export async function getPurchases(scope = 'general') {
  const since = new Date(); since.setDate(since.getDate() - (PURCHASE_DAYS - 1));
  const from = isoDay(since), to = isoDay(new Date());
  const orders = (await getMovements()).filter(r => r.type === 'entrada' && r.date >= from && r.date <= to && (scope === 'general' || !r.branchId || r.branchId === scope));
  const byName = new Map();
  for (const r of orders) {
    if (!byName.has(r.material)) byName.set(r.material, { name: r.material, tons: 0, units: {}, amount: 0 });
    const m = byName.get(r.material);
    if (r.unit === 'toneladas') m.tons += r.quantity; else if (r.unit === 'kg') m.tons += r.quantity / 1000; else m.units[r.unit] = (m.units[r.unit] || 0) + r.quantity;
    m.amount += r.quantity * r.unitPrice;
  }
  const materials = [...byName.values()].map(({ units, ...m }) => ({ ...m, others: Object.entries(units).map(([unit, n]) => `${n.toLocaleString('es-MX')} ${unit}`) })).sort((a, b) => b.amount - a.amount);
  return { totals: { tons: sum(materials.map(m => m.tons)), amount: sum(materials.map(m => m.amount)), orders: orders.length, approved: orders.filter(r => r.approved).length }, materials };
}

// ---- inventory: how much of each product of the catalogue a branch has (the "Almacén" page) ----
// Worked out from the movements saved in this browser: what came in with the purchase orders (OC) of the branch
// minus what left in its sales. Only weights count (kg and tonnes). Movements saved before their branch was
// recorded have none and are counted in every branch.
const inTonnes = r => r.unit === 'toneladas' ? r.quantity : r.unit === 'kg' ? r.quantity / 1000 : 0;

/**
 * Stock of every product of the catalogue in a branch (its id; every branch together if there is none).
 * @returns {Promise<{ name, bought, sold, stock }[]>} in tonnes; the product with most stock first
 */
export async function getInventory(branchId) {
  const [catalog, moves] = await Promise.all([getCatalog(), getMovements()]);
  const mine = moves.filter(r => !branchId || !r.branchId || r.branchId === branchId);
  const total = (name, type) => mine.filter(r => r.type === type && r.material === name).reduce((a, r) => a + inTonnes(r), 0);
  return catalog.map(m => { const bought = total(m.name, 'entrada'), sold = total(m.name, 'salida'); return { name: m.name, bought, sold, stock: bought - sold }; })
    .sort((a, b) => b.stock - a.stock || a.name.localeCompare(b.name, 'es'));
}
