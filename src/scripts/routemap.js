// "Ver ruta" modal: the whole route of a shipment on a real map, with the truck where its progress puts it.
// Leaflet draws it (small, no WebGL, so it does not compete with the 3D scene); it is only downloaded the first
// time a route is opened. The route itself comes from getShipmentRoute() in data.js.
import { getShipmentRoute, getRouteBetween, locatePostalCode } from './data.js';
import { h } from './ui.js';

const BLUE = '#2457e6', REST = '#8a9bb8';
const TRUCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M2 6h12v10H2z"></path><path d="M14 9h4l3 3.5V16h-7z"></path><circle cx="6" cy="17.5" r="2" fill="#2457e6" stroke="#fff" stroke-width="1.4"></circle><circle cx="17" cy="17.5" r="2" fill="#2457e6" stroke="#fff" stroke-width="1.4"></circle></svg>';

let leaflet = null, map = null, layer = null, opened = 0;
// A failed download is not kept, so opening a route again retries it.
const loadLeaflet = () => leaflet || (leaflet = Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([m]) => m.default, e => { leaflet = null; throw e; }));

const hours = h => { const whole = Math.floor(h), min = Math.round((h - whole) * 60); return `${whole} h ${String(min).padStart(2, '0')} min`; };
const fact = (label, value) => h('div', { class: 'fact' }, h('div', { class: 'fact__label' }, label), h('div', { class: 'fact__value' }, value));

// Splits the line where the truck is: [travelled part, part still ahead, truck position].
function splitAt(points, progress) {
  const dist = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.cos(a[0] * Math.PI / 180));
  const lengths = points.slice(1).map((p, i) => dist(points[i], p)), goal = lengths.reduce((a, v) => a + v, 0) * progress;
  let run = 0;
  for (let i = 0; i < lengths.length; i++) {
    if (run + lengths[i] >= goal) {
      const k = lengths[i] ? (goal - run) / lengths[i] : 0, at = [points[i][0] + (points[i + 1][0] - points[i][0]) * k, points[i][1] + (points[i + 1][1] - points[i][1]) * k];
      return [[...points.slice(0, i + 1), at], [at, ...points.slice(i + 1)], at];
    }
    run += lengths[i];
  }
  return [points, [], points[points.length - 1]];
}

// A Leaflet map in `box` with the base tiles, and the layer the routes and pins are drawn on.
function makeMap(L, box) {
  const view = L.map(box, { zoomControl: false, attributionControl: true });
  L.control.zoom({ position: 'topright' }).addTo(view);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(view);
  return [view, L.layerGroup().addTo(view)];
}
const pinIcon = (L, cls, html) => L.divIcon({ className: '', html: `<div class="pin ${cls}">${html || ''}</div>`, iconSize: [0, 0] });

/**
 * A small map inside a page (not the modal) that shows where a client is: the zone of its postal code or, without
 * one, its delivery city. Returns show({ city, zip }), to call whenever those change; `say(text)` receives what the
 * map is showing, to print next to it.
 */
export function clientLocationMap(box, say) {
  let view = null, pins = null, asked = 0;
  return async function show({ city, zip }) {
    const mine = ++asked;
    if (!city && !/^\d{5}$/.test(zip || '')) { box.hidden = true; return say('Escribe el código postal o elige la ciudad para ver al cliente en el mapa.'); }
    say('Ubicando en el mapa…');
    let L, spot, centre;
    try {
      [L, spot, centre] = await Promise.all([loadLeaflet(), locatePostalCode(zip).catch(() => null), city ? getRouteBetween(city, city).then(r => r.points[0], () => null) : null]);
    } catch (e) { console.error('Mapa del cliente:', e); if (mine === asked) { box.hidden = true; say('No se pudo cargar el mapa. Inténtalo de nuevo.'); } return; }
    if (mine !== asked || !box.isConnected) return; // the fields changed again, or the form was closed
    const at = spot ? [spot.lat, spot.lng] : centre;
    if (!at) { box.hidden = true; return say(`No se encontró el código postal ${zip}.`); }
    box.hidden = false;
    if (!view) [view, pins] = makeMap(L, box);
    view.invalidateSize();
    pins.clearLayers();
    L.marker(at, { icon: pinIcon(L, spot ? 'pin--to' : 'pin--from'), keyboard: false }).bindTooltip(spot ? `Cliente · CP ${zip}` : city, { permanent: true, direction: 'top', offset: [0, -12], className: 'pin__label' }).addTo(pins);
    view.setView(at, spot ? 13 : 11);
    say(spot ? `Zona del código postal ${zip}${spot.place ? ` (${spot.place})` : ''}. Marca la zona, no la calle exacta.` : zip ? `No se pudo ubicar el código postal ${zip}; se muestra ${city}.` : `Se muestra ${city}. Escribe el código postal para ubicar la zona del cliente.`);
  };
}

/**
 * Opens the modal for a shipment ({ id, origin, dest, track, etaLong, … }), or for a route that is only planned
 * ({ plan: true, title, origin, dest, address, zip }: e.g. the way to a client): the whole line, without a truck,
 * ending at the client's own spot when its postal code can be located.
 */
export async function openRouteMap(shipment) {
  const modal = document.getElementById('route-modal'), box = document.getElementById('route-map'), facts = document.getElementById('route-facts'), note = document.getElementById('route-note');
  const mine = ++opened;
  document.getElementById('route-title').textContent = shipment.title || `Ruta del envío #${shipment.id}`;
  document.getElementById('route-sub').textContent = `${shipment.origin} → ${shipment.dest}`;
  facts.replaceChildren(); note.textContent = 'Calculando la ruta…';
  if (layer) layer.clearLayers();
  modal.showModal();

  let L, route, spot;
  // The client's spot is a nice-to-have: if its postal code can't be looked up, the route still ends at the city.
  try { [L, route, spot] = await Promise.all([loadLeaflet(), getShipmentRoute(shipment), shipment.plan ? locatePostalCode(shipment.zip).catch(() => null) : null]); }
  catch (e) { console.error('Mapa de ruta:', e); if (mine === opened) note.textContent = 'No se pudo cargar el mapa. Cierra esta ventana e inténtalo de nuevo.'; return; }
  if (mine !== opened || !modal.open) return; // closed, or another route was opened meanwhile

  if (!map) [map, layer] = makeMap(L, box);
  map.invalidateSize(); // the modal was hidden when the map was created or last used
  const progress = shipment.plan ? 1 : route.progress, [done, ahead, truck] = splitAt(route.points, progress), first = route.points[0], last = route.points[route.points.length - 1];
  const pin = (cls, html) => pinIcon(L, cls, html);
  layer.clearLayers();
  L.polyline(route.points, { color: '#fff', weight: 8, opacity: 0.9 }).addTo(layer);
  if (ahead.length) L.polyline(ahead, { color: REST, weight: 4, dashArray: '2 9', lineCap: 'round' }).addTo(layer);
  L.polyline(done, { color: BLUE, weight: 5, lineCap: 'round' }).addTo(layer);
  // Each label goes on the side away from the other end, so it does not cover the line.
  const label = (at, other, text, cls) => { const up = at[0] >= other[0]; L.marker(at, { icon: pin(cls), keyboard: false }).bindTooltip(text, { permanent: true, direction: up ? 'top' : 'bottom', offset: [0, up ? -12 : 12], className: 'pin__label' }).addTo(layer); };
  const end = spot ? [spot.lat, spot.lng] : last;
  if (spot) L.polyline([last, end], { color: BLUE, weight: 4, dashArray: '2 9', lineCap: 'round' }).addTo(layer); // last stretch, from the city to the client
  label(first, end, `Origen · ${shipment.origin}`, 'pin--from');
  label(end, first, spot ? `Cliente · CP ${shipment.zip}` : `Destino · ${shipment.dest}`, 'pin--to');
  if (progress > 0 && progress < 1) L.marker(truck, { icon: pin('pin--truck', TRUCK), zIndexOffset: 500, title: `Envío #${shipment.id}` }).addTo(layer);
  map.fitBounds(L.latLngBounds([...route.points, end]), { padding: [48, 48], maxZoom: 13 });

  const kind = route.exact ? 'Ruta de prueba por carretera.' : 'Trazo aproximado entre ciudades (no hay ruta de prueba para este trayecto).';
  const local = route.km < 1, distance = fact('Distancia', local ? 'Entrega local' : `${Math.round(route.km).toLocaleString('es-MX')} km`), time = fact('Tiempo de manejo', local ? 'Dentro de la ciudad' : hours(route.hours));
  if (shipment.plan) {
    facts.replaceChildren(distance, time, h('div', { class: 'fact span2' }, h('div', { class: 'fact__label' }, 'Dirección de entrega'), h('div', { class: 'fact__value' }, shipment.address || shipment.dest)));
    note.textContent = (local ? '' : kind + ' ') + (spot ? `El cliente se ubica por su código postal ${shipment.zip}${spot.place ? ` (${spot.place})` : ''}: marca la zona, no la calle exacta.`
      : shipment.zip ? `No se pudo ubicar el código postal ${shipment.zip}; la ruta llega a la ciudad del cliente.` : 'La ruta llega a la ciudad del cliente. Registra su código postal para ubicarlo en el mapa.');
    return;
  }
  facts.replaceChildren(distance, time,
    fact('Recorrido', `${Math.round(progress * 100)}% · faltan ${Math.round(route.km * (1 - progress)).toLocaleString('es-MX')} km`), fact('Llegada estimada', shipment.etaLong));
  note.textContent = kind + ' La posición del camión se estima según la etapa del envío.';
}

export function initRouteMap() {
  const modal = document.getElementById('route-modal');
  document.getElementById('route-close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); }); // click on the backdrop
}
