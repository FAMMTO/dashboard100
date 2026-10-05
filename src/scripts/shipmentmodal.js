// "Ver detalles" modal: everything about a shipment in one place — the order, its tracking, what it sells for
// and costs, its invoices and payment receipts and, once delivered, the receiver's signature and the evidence.
// The content comes from getShipmentDetails() in data.js.
import { getShipmentDetails, orderProfit } from './data.js';
import { h, badge, pesos } from './ui.js';
import { openRouteMap } from './routemap.js';

const STEPS = ['Recolectado', 'En tránsito', 'En almacén', 'En reparto', 'Entregado'];
const FILE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"></path><path d="M14 3v5h5M9 13h6M9 17h4"></path></svg>';
const PHOTO_ICON = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"></rect><circle cx="9" cy="10.5" r="1.8"></circle><path d="M21 16l-5-5-8 8"></path></svg>';
const LOCK_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 018 0v3"></path></svg>';

let opened = 0;
const block = (title, ...kids) => h('section', { class: 'detail' }, h('div', { class: 'section__title' }, title), ...kids);
const fact = (label, value) => h('div', { class: 'fact' }, h('div', { class: 'fact__label' }, label), h('div', { class: 'fact__value' }, value));
const facts = pairs => h('div', { class: 'facts facts--detail' }, pairs.map(([label, value]) => fact(label, value)));
const table = (head, rows, foot) => h('div', { class: 'table__wrap' }, h('table', { class: 'table table--compact' },
  h('thead', null, h('tr', null, head.map(t => h('th', null, t)))), h('tbody', null, rows.map(cells => h('tr', null, cells.map(c => h('td', null, c))))),
  foot ? h('tfoot', null, h('tr', null, foot.map(c => h('td', null, c)))) : null));
const file = name => h('span', { class: 'filetag', title: 'Archivo de ejemplo: aún no hay un documento real adjunto', html: FILE_ICON }, name);
const waiting = text => h('div', { class: 'detail__waiting' }, h('span', { html: LOCK_ICON }), text);

function render(s, d) {
  const profit = orderProfit(s);
  return [
    block('Datos del envío', facts([
      ['Cliente', d.client.name], ['Contacto', `${d.client.contact} · ${d.client.phone}`], ['RFC', d.client.rfc], ['Orden de compra', d.purchaseOrder],
      ['Producto', `${s.product} (${s.code})`], ['Carga', `${s.pallets} tarimas · ${d.weightKg.toLocaleString('es-MX')} kg`], ['Unidad', `Tráiler ${s.vehicleId} · ${d.plates}`], ['Operador', d.driver],
      ['Origen', s.origin], ['Destino', s.dest], ['Dirección de entrega', d.address], ['Llegada estimada', s.etaLong],
    ])),
    block('Seguimiento', h('ol', { class: 'steplist' }, STEPS.map((name, i) => h('li', { class: 'steplist__item' + (i <= s.track ? ' is-done' : '') + (i === s.track ? ' is-current' : '') },
      h('span', { class: 'steplist__dot' }), h('div', null, h('div', { class: 'item__title' }, name), h('div', { class: 'item__sub' }, s.dates[i] === '—' ? 'Pendiente' : s.dates[i])))))),
    block('Desglose del pedido', h('div', { class: 'grid2 grid2--tight' },
      table(['Venta', 'Importe'], d.saleLines.map(([name, amount]) => [name, pesos(amount)]), ['Venta del pedido', pesos(s.sale)]),
      table(['Costo', 'Importe'], d.costLines.map(([name, amount]) => [name, pesos(amount)]), ['Costo del pedido', pesos(s.cost)])),
      h('div', { class: 'detail__profit ' + (profit < 0 ? 'is-loss' : 'is-gain') }, h('span', null, 'Profit (venta − costo)'), h('strong', { class: 'money__value' }, pesos(profit)), h('span', { class: 'item__sub' }, `Margen ${(profit / s.sale * 100).toFixed(1)}%`))),
    block('Facturas', table(['Folio', 'Fecha', 'Concepto', 'Importe', 'Estado', 'Archivo'],
      d.invoices.map(f => [f.folio, f.date, f.concept, pesos(f.amount), badge(f.status), file(f.file)]))),
    block('Comprobantes de pago', table(['Referencia', 'Fecha', 'Método', 'Importe', 'Estado', 'Archivo'],
      d.payments.map(p => [p.reference, p.date, p.method, pesos(p.amount), badge(p.status), p.file ? file(p.file) : '—']))),
    block('Firma de recibido', d.delivery
      ? h('div', { class: 'signature' },
        h('div', { class: 'signature__pad', html: `<svg viewBox="0 0 320 110" role="img" aria-label="Firma de ${d.delivery.receivedBy}"><path d="${d.delivery.signature}" fill="none" stroke="#0f1b33" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>` }),
        facts([['Recibió', d.delivery.receivedBy], ['Puesto', d.delivery.role], ['Fecha y hora', d.delivery.date], ['Identificación', d.delivery.idCheck]]))
      : waiting('La firma se registra cuando el envío se entrega.')),
    block('Evidencia del cliente', d.delivery
      ? [h('div', { class: 'evidence' }, d.delivery.evidence.map(e => h('figure', { class: 'evidence__item' }, h('div', { class: 'evidence__photo', html: PHOTO_ICON }), h('figcaption', null, h('div', { class: 'item__title' }, e.caption), h('div', { class: 'item__sub' }, e.time))))),
        h('div', { class: 'detail__note' }, h('strong', null, 'Comentario del cliente: '), d.delivery.comment)]
      : waiting('La evidencia de entrega (fotos y comentarios del cliente) aparece cuando el envío se entrega.')),
  ];
}

/** Opens the modal for a shipment ({ id, origin, dest, status, … }). */
export async function openShipmentModal(shipment) {
  const modal = document.getElementById('ship-modal'), body = document.getElementById('ship-body'), status = document.getElementById('ship-status'), mine = ++opened;
  document.getElementById('ship-title').textContent = `Envío #${shipment.id}`;
  document.getElementById('ship-sub').textContent = `${shipment.origin} → ${shipment.dest} · ${shipment.product}`;
  status.textContent = shipment.status; status.dataset.status = shipment.status;
  body.replaceChildren(h('div', { class: 'module__note' }, 'Cargando…'));
  document.getElementById('ship-route').onclick = () => { modal.close(); openRouteMap(shipment); };
  modal.showModal();
  let details;
  try { details = await getShipmentDetails(shipment); }
  catch (e) { console.error('Detalles del envío:', e); if (mine === opened) body.replaceChildren(h('div', { class: 'module__note' }, 'No se pudieron cargar los detalles. Cierra esta ventana e inténtalo de nuevo.')); return; }
  if (mine !== opened) return; // another shipment was opened meanwhile
  body.replaceChildren(...render(shipment, details));
  body.scrollTop = 0;
}

export function initShipmentModal() {
  const modal = document.getElementById('ship-modal');
  document.getElementById('ship-close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); }); // click on the backdrop
}
