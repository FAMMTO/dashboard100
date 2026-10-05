// "Clientes" page: who the company sells to, with their fiscal data and delivery address. The address' city is
// what lets a sale work out its route by itself (from the selected branch to the client).
import { getClients, saveClient, deleteClient, getMovements, getRouteBetween, getRouteCities, locatePostalCode, nearestRouteCity } from './data.js';
import { h, card, empty, label, input, driveTime } from './ui.js';
import { openRouteMap, clientLocationMap } from './routemap.js';

const money = n => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** A client's delivery address on one line ('' if it has none). */
export const clientAddress = c => [c.street, c.neighborhood, [c.zip, c.city].filter(Boolean).join(' '), c.state].filter(Boolean).join(', ');

/** "87 km · 1 h 06 min" from a branch city to a client; says so when there is nothing to trace. */
export async function routeSummary(fromCity, client) {
  if (!client.city) return { text: 'Sin ciudad de entrega', route: null };
  if (same(client.city, fromCity)) return { text: 'Entrega local (misma ciudad)', route: null };
  const route = await getRouteBetween(fromCity, client.city).catch(() => null);
  return route ? { text: `${Math.round(route.km).toLocaleString('es-MX')} km · ${driveTime(route.hours)}`, route } : { text: 'Sin ruta conocida', route: null };
}

/** What openRouteMap needs to show the way from a branch city to a client (ending at its postal code, if it can be located). */
export const clientRoute = (fromCity, c) => ({ plan: true, title: `Ruta a ${c.name}`, origin: fromCity, dest: c.city, address: clientAddress(c), zip: c.zip });

// The fields that describe a client, shared by this page's form and the "Nuevo cliente" block of a sale.
// `prefix` keeps their names apart from the fields of the form they are placed in.
export const clientFields = (c = {}, cities = [], prefix = '') => [
  label('Nombre o razón social', input({ name: prefix + 'name', value: c.name || '', placeholder: 'Nombre del cliente', required: true }), 'span2'),
  label('RFC', input({ name: prefix + 'rfc', value: c.rfc || '', placeholder: 'XAXX010101000', maxlength: 13, pattern: '[A-Za-zÑñ&]{3,4}[0-9]{6}[A-Za-z0-9]{3}', title: '12 o 13 caracteres: letras, fecha (AAMMDD) y homoclave' })),
  label('Contacto', input({ name: prefix + 'contact', value: c.contact || '', placeholder: 'Persona de contacto' })),
  label('Teléfono', input({ name: prefix + 'phone', type: 'tel', value: c.phone || '', placeholder: '81 0000 0000' })),
  label('Correo', input({ name: prefix + 'email', type: 'email', value: c.email || '', placeholder: 'correo@empresa.mx' })),
  label('Calle y número', input({ name: prefix + 'street', value: c.street || '', placeholder: 'Av. Industrial 100' }), 'span2'),
  label('Colonia', input({ name: prefix + 'neighborhood', value: c.neighborhood || '', placeholder: 'Colonia o parque industrial' })),
  label('Ciudad de entrega', h('select', { class: 'input', name: prefix + 'city', required: true },
    h('option', { value: '' }, 'Selecciona…'), cities.map(city => h('option', { value: city, selected: city === c.city }, city)),
    c.city && !cities.includes(c.city) ? h('option', { value: c.city, selected: true }, c.city) : null)),
  label('Estado', input({ name: prefix + 'state', value: c.state || '', placeholder: 'Nuevo León' })),
  label('Código postal', [input({ name: prefix + 'zip', value: c.zip || '', placeholder: '64000', inputmode: 'numeric', maxlength: 5, pattern: '[0-9]{5}', title: '5 dígitos' }), h('span', { class: 'lbl__hint', dataset: { zipHint: '' } })]),
];

/**
 * Makes the postal code of a client form (built with clientFields inside `box`) locate itself: it says where the
 * code is and fills in the state and the delivery city when they are still empty. Call it once the fields exist.
 */
export function wirePostalCode(box, prefix = '') {
  const field = name => box.querySelector(`[name="${prefix}${name}"]`), zip = field('zip'), hint = box.querySelector('[data-zip-hint]');
  let asked = 0;
  const locate = async () => {
    const code = zip.value.trim(), mine = ++asked;
    if (!/^\d{5}$/.test(code)) { hint.textContent = ''; return; }
    hint.textContent = 'Ubicando…';
    let spot;
    try { spot = await locatePostalCode(code); } catch { if (mine === asked) hint.textContent = 'No se pudo consultar el código postal. Se intentará de nuevo al abrir el mapa.'; return; }
    if (mine !== asked) return; // the code changed while it was being looked up
    if (!spot) { hint.textContent = 'Código postal no encontrado.'; return; }
    hint.textContent = `Ubicado: ${[spot.place, spot.state].filter(Boolean).join(', ') || 'México'}`;
    if (!field('state').value && spot.state) field('state').value = spot.state;
    const city = nearestRouteCity(spot.lat, spot.lng);
    if (!field('city').value && city) { field('city').value = city; field('city').dispatchEvent(new Event('change', { bubbles: true })); }
  };
  zip.addEventListener('input', locate);
  if (zip.value) locate();
}
export const readClient = (d, prefix = '') => {
  const get = key => String(d.get(prefix + key) || '').trim();
  return { name: get('name'), rfc: get('rfc').toUpperCase(), contact: get('contact'), phone: get('phone'), email: get('email'), street: get('street'), neighborhood: get('neighborhood'), city: get('city'), state: get('state'), zip: get('zip') };
};

export const clientes = {
  title: 'Clientes', sub: 'Datos fiscales y dirección de entrega de cada cliente. La ciudad define la ruta de sus pedidos.', preview: false,
  async render({ body, actions, branch }) {
    let clients, sales, cities;
    try { [clients, sales, cities] = await Promise.all([getClients(), getMovements(), getRouteCities()]); }
    catch { body.replaceChildren(empty('No se pudo abrir el almacenamiento de este navegador, así que no es posible guardar clientes aquí.')); return; }
    const from = branch ? branch.city : 'Monterrey';
    let editing = null, confirming = null, routes = new Map(); // editing: the client in the form ({} for a new one); routes: client id → routeSummary

    const reload = async () => { [clients, sales] = await Promise.all([getClients(), getMovements()]); editing = null; confirming = null; await draw(); };
    const salesOf = c => sales.filter(r => r.type === 'salida' && (r.clientId === c.id || (!r.clientId && same(r.party, c.name))));

    const form = c => {
      const error = h('div', { class: 'form__error', hidden: true }), preview = h('div', { class: 'lbl__hint span4' });
      const fail = text => { error.textContent = text; error.hidden = false; };
      // Map with the client's spot, kept in step with the postal code and the city as they are typed.
      const mapBox = h('div', { class: 'clientmap__map', hidden: true }), mapNote = h('div', { class: 'lbl__hint' }), locate = clientLocationMap(mapBox, text => { mapNote.textContent = text; });
      let mapTimer = 0;
      const showMap = () => { clearTimeout(mapTimer); mapTimer = setTimeout(() => locate({ city: f.elements.city.value, zip: f.elements.zip.value.trim() }), 250); };
      const showRoute = async () => { const city = f.elements.city.value; preview.textContent = city ? `Ruta desde ${from}: ${(await routeSummary(from, { city })).text}` : 'Elige la ciudad de entrega para calcular la ruta de sus pedidos.'; };
      const f = h('form', { class: 'card section', onsubmit: async e => {
        e.preventDefault();
        const client = { ...c, id: c.id || newId(), ...readClient(new FormData(f)) };
        if (clients.some(x => x.id !== client.id && same(x.name, client.name))) return fail(`Ya existe un cliente llamado "${client.name}".`);
        try { await saveClient(client); } catch { return fail('No se pudo guardar. Revisa el espacio disponible del navegador e inténtalo de nuevo.'); }
        await reload();
      } },
        h('div', { class: 'section__title' }, c.id ? `Editar cliente · ${c.name}` : 'Nuevo cliente'),
        h('div', { class: 'form__grid', onchange: e => { if (e.target.name === 'city') { showRoute(); showMap(); } }, oninput: e => { if (e.target.name === 'zip') showMap(); } }, clientFields(c, cities), preview,
          h('div', { class: 'clientmap span4' }, h('div', { class: 'section__title' }, 'Ubicación del cliente'), mapBox, mapNote)),
        error,
        h('div', { class: 'toolbar' }, h('button', { class: 'btn-primary', type: 'submit' }, 'Guardar'), h('button', { class: 'btn-small', type: 'button', onclick: () => { editing = null; draw(); } }, 'Cancelar')));
      showRoute(); wirePostalCode(f); showMap();
      return f;
    };

    const table = () => h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Cliente', 'Contacto', 'Dirección de entrega', `Ruta desde ${from}`, 'Salidas', 'Total vendido', ''].map(t => h('th', null, t)))),
      h('tbody', null, clients.map(c => {
        const mine = salesOf(c), route = routes.get(c.id) || { text: '…', route: null }, address = clientAddress(c);
        return h('tr', null,
          h('td', null, h('div', { class: 'table__strong' }, c.name), h('div', { class: 'item__sub' }, c.rfc ? `RFC ${c.rfc}` : 'Sin RFC')),
          h('td', null, h('div', null, c.contact || '—'), h('div', { class: 'item__sub' }, [c.phone, c.email].filter(Boolean).join(' · ') || 'Sin datos de contacto')),
          h('td', { class: 'table__text' }, address || '—'),
          h('td', null, c.city ? h('button', { class: 'link-btn', title: 'Ver al cliente y su ruta en el mapa', onclick: () => openRouteMap(clientRoute(from, c)) }, `${route.text} · Ver mapa`) : h('span', { class: 'lbl__hint' }, route.text)),
          h('td', null, String(mine.length)), h('td', { class: 'table__strong' }, money(mine.reduce((a, r) => a + r.quantity * r.unitPrice, 0))),
          h('td', { class: 'table__actions' }, confirming === c.id
            ? [h('button', { class: 'link-btn link-btn--danger', onclick: async () => { await deleteClient(c.id); await reload(); } }, 'Confirmar'), h('button', { class: 'link-btn', onclick: () => { confirming = null; draw(); } }, 'Cancelar')]
            : [h('button', { class: 'link-btn', onclick: () => { editing = c; confirming = null; draw(); body.scrollTop = 0; } }, 'Editar'),
              c.fixed ? null : h('button', { class: 'link-btn link-btn--danger', title: mine.length ? 'Sus salidas se conservan con el nombre del cliente' : null, onclick: () => { confirming = c.id; draw(); } }, 'Eliminar')]));
      })));

    const draw = async () => {
      actions.replaceChildren(editing ? '' : h('button', { class: 'btn-primary', onclick: () => { editing = {}; draw(); } }, 'Nuevo cliente'));
      const paint = () => body.replaceChildren(...(editing ? [form(editing)] : []), card(clients.length ? h('div', { class: 'table__wrap' }, table()) : empty('Aún no hay clientes. Usa "Nuevo cliente" para registrar el primero.')));
      paint();
      if (editing) return; // the form has its own route preview
      routes = new Map(await Promise.all(clients.map(async c => [c.id, await routeSummary(from, c)])));
      if (!editing) paint();
    };
    await draw();
  },
};
