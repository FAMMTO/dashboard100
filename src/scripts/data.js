// Data layer. Everything the UI shows about shipments and vehicles comes through the two
// async functions exported here. They return mock data for now; to connect the database,
// replace their bodies with real calls (e.g. `return (await fetch('/api/shipments')).json()`)
// that return objects of the same shape. Nothing else in the app needs to change.
//
// Status values double as badge styles (see `.badge[data-status=…]` in global.css):
// shipments use 'En tránsito' | 'En almacén' | 'Entregado'; forklifts use 'Activo' | 'Inactivo'.

// vehicleId links a shipment to the vehicle that carries it in the 3D scene (see scene.js ids: T01…, F01…).
const SHIPMENTS = [
  { id:'WT-2847', vehicleId:'T11', product:'Refrigerados', status:'En tránsito', eta:'21 may, 10:00', etaLong:'21 may 2025 • 10:00', code:'FL-07', pallets:12, origin:'Monterrey, MX', dest:'Guadalajara, MX', stage:2, track:3, dates:['19 may, 08:14','19 may, 16:32','20 may, 09:17','20 may, 12:43','—'] },
  { id:'WT-2846', vehicleId:'T12', product:'Electrónicos', status:'En almacén', eta:'20 may, 18:20', etaLong:'20 may 2025 • 18:20', code:'EL-12', pallets:8, origin:'Monterrey, MX', dest:'Ciudad de México, MX', stage:2, track:2, dates:['18 may, 10:05','19 may, 07:40','20 may, 11:02','—','—'] },
  { id:'WT-2845', vehicleId:'T14', product:'Ropa', status:'Entregado', eta:'19 may, 14:15', etaLong:'19 may 2025 • 14:15', code:'CL-03', pallets:5, origin:'Saltillo, MX', dest:'Monterrey, MX', stage:4, track:4, dates:['17 may, 09:30','17 may, 15:10','18 may, 08:45','19 may, 09:20','19 may, 14:15'] },
  { id:'WT-2844', vehicleId:'T01', product:'Electrodomésticos', status:'En tránsito', eta:'21 may, 11:30', etaLong:'21 may 2025 • 11:30', code:'HA-21', pallets:10, origin:'Querétaro, MX', dest:'Monterrey, MX', stage:1, track:1, dates:['20 may, 07:55','20 may, 13:20','—','—','—'] },
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
  return {
    id: `WT-${2700 + n}`, vehicleId: id, product, status, code: `${prefix}-${pad2(n)}`, pallets: 4 + n % 11,
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

// ---- public API ----

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
      const seed = [...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);
      routes.set(key, { origin: s.origin, dest: s.dest, km: 180 + seed % 700, shipments: [] });
    }
    routes.get(key).shipments.push(s);
  }
  return [...routes.values()].sort((a, b) => b.shipments.length - a.shipments.length);
}

/** Warehouse state. x/z are positions in the 3D scene, used to fly the camera there. */
export async function getWarehouse() {
  return {
    docks: [
      { name: 'Andén 1', status: 'Libre', detail: 'Tarimas listas', x: 9, z: 2 },
      { name: 'Andén 2', status: 'Cargando', detail: 'Envío #WT-2847', x: 9, z: 10 },
      { name: 'Andén 3', status: 'Libre', detail: 'Tarimas listas', x: 9, z: 18 },
      { name: 'Andén 4', status: 'Ocupado', detail: 'Envío #WT-2846', x: -40, z: -38 },
      { name: 'Andén 5', status: 'Libre', detail: 'Sin asignar', x: -33, z: -38 },
      { name: 'Andén 6', status: 'Ocupado', detail: 'Envío #WT-2713', x: -26, z: -38 },
      { name: 'Andén 7', status: 'Libre', detail: 'Sin asignar', x: -19, z: -38 },
    ],
    zones: [
      { name: 'Almacén de tarimas', used: 68, capacity: 90, x: -17, z: -4, zoom: 2 },
      { name: 'Zona de maniobras', used: 6, capacity: 20, x: 2, z: 18, zoom: 2 },
      { name: 'Patio de contenedores', used: 142, capacity: 180, x: 68, z: 15, zoom: 1.2 },
      { name: 'Estacionamiento de tráileres', used: 10, capacity: 14, x: -53, z: 20, zoom: 1.2 },
    ],
    inventory: [
      { name: 'Refrigerados', pallets: 124 }, { name: 'Electrónicos', pallets: 96 }, { name: 'Electrodomésticos', pallets: 88 },
      { name: 'Ropa', pallets: 61 }, { name: 'Autopartes', pallets: 54 }, { name: 'Otros', pallets: 73 },
    ],
  };
}

/** Figures for the last 7 days. */
export async function getReports() {
  return {
    totals: { shipments: 810, onTime: 92.3, processingHours: 6.2, incidents: 14 },
    days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    shipments: [98, 112, 121, 105, 134, 128, 112],
    onTime: [89.5, 91.2, 93.0, 90.8, 94.1, 93.6, 92.3],
    status: [{ name: 'En tránsito', value: 46 }, { name: 'En almacén', value: 22 }, { name: 'Entregado', value: 32 }],
    destinations: [
      { name: 'Guadalajara', value: 186 }, { name: 'Ciudad de México', value: 164 }, { name: 'Monterrey', value: 142 },
      { name: 'Querétaro', value: 121 }, { name: 'Saltillo', value: 104 }, { name: 'Puebla', value: 93 },
    ],
  };
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

// ---- costs: material arrivals (entradas) and sales (salidas) ----
// Records are kept in this browser's IndexedDB, receipts included, until there is a real database.
// Replace the four functions below with API calls; the "Costos" page only uses these.
// Record: { id, type: 'entrada' | 'salida', folio, date: 'YYYY-MM-DD', material, party, quantity, unit, unitPrice,
//           payment: File | null, invoice: File | null, notes }

// Options of the "Materia prima" dropdown. Edit this list to match what you actually buy and sell.
const MATERIALS = ['Acero', 'Aluminio', 'Cobre', 'Plástico (PET)', 'Polietileno', 'Cartón', 'Madera', 'Vidrio', 'Resina', 'Otro'];

const openDb = () => new Promise((resolve, reject) => {
  const req = indexedDB.open('wavetrack', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('movements', { keyPath: 'id' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const inStore = async (mode, run) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('movements', mode), req = run(tx.objectStore('movements'));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
};

export async function getMaterials() {
  return MATERIALS;
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
