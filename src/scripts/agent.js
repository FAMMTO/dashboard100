// AI agent behind the "Chat" page. For now it is a local stand-in that answers from the dashboard's own data
// by matching keywords; there is no language model yet. To connect the real agent, replace the body of
// askAgent() with a call to your backend (e.g. `return (await fetch('/api/agent', …)).json()`), keeping the
// same signature: it receives the question and the chat so far, and resolves to the reply text.
import { getReports, orderProfit } from './data.js';
import { pesos } from './ui.js';

// Starting points offered while the chat is empty: [title, description, question sent].
export const SUGGESTIONS = [
  ['Resumen de ventas', 'Ventas, costo y profit de la semana en tu sucursal.', '¿Cómo van las ventas de esta semana?'],
  ['Alertas pendientes', 'Qué necesita atención ahora mismo.', '¿Qué alertas tengo sin leer?'],
  ['Estado de un pedido', 'Dónde va y cuánto deja el pedido #WT-2847.', '¿Cómo va el pedido WT-2847?'],
];

const plain = text => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * @param {string} question
 * @param {{ history: { role: 'user' | 'agent', text: string }[], fleet: object[], alerts: object[], branch: { id, city } | null }} context
 * @returns {Promise<string>} the reply, as plain text (line breaks are kept)
 */
export async function askAgent(question, { fleet, alerts, branch }) {
  await new Promise(resolve => setTimeout(resolve, 650)); // stands in for the model's response time
  const q = plain(question), ships = fleet.filter(f => f.kind === 'truck').map(f => f.shipment), where = branch ? branch.city : 'todas las sucursales';

  const order = q.match(/wt-?\s?(\d{4})/);
  if (order) {
    const s = ships.find(x => x.id === 'WT-' + order[1]);
    if (!s) return `No encuentro el pedido #WT-${order[1]} entre los envíos activos.`;
    return `Pedido #${s.id} · ${s.product} (${s.pallets} tarimas)\nEstado: ${s.status}\nRuta: ${s.origin} → ${s.dest}\nLlegada estimada: ${s.etaLong}\nVenta ${pesos(s.sale)} · Costo ${pesos(s.cost)} · Profit ${pesos(orderProfit(s))}`;
  }
  if (/alerta|pendiente|atencion|urgente|retras/.test(q)) {
    const open = alerts.filter(a => !a.read);
    if (!open.length) return 'No tienes alertas sin leer. Todo en orden.';
    return `Tienes ${open.length} ${open.length === 1 ? 'alerta' : 'alertas'} sin leer:\n` + open.map(a => `• [${a.level}] ${a.title} — ${a.detail}`).join('\n');
  }
  if (/venta|profit|ganancia|costo|margen|ingreso|factur/.test(q)) {
    if (branch && branch.hasData === false) return `La sucursal ${branch.name} es nueva y aún no tiene cifras de ventas.`;
    const t = (await getReports(branch ? branch.id : 'general')).totals;
    return `Últimos 7 días en ${where}:\n• Ventas: ${pesos(t.sales)}\n• Costo: ${pesos(t.cost)}\n• Profit: ${pesos(t.profit)} (margen ${(t.profit / t.sales * 100).toFixed(1)}%)\n• Envíos: ${t.shipments}, ${t.onTime}% a tiempo`;
  }
  if (/montacarga|flota|trailer|camion|vehiculo|unidad/.test(q)) {
    const trucks = fleet.filter(f => f.kind === 'truck'), lifts = fleet.filter(f => f.kind === 'forklift');
    return `Flota en operación:\n• ${trucks.length} tráileres, ${trucks.filter(f => !f.vehicle.parked).length} en ruta\n• ${lifts.length} montacargas, ${lifts.filter(f => !f.vehicle.parked).length} activos`;
  }
  if (/envio|pedido|entrega|transito|almacen/.test(q)) {
    const count = status => ships.filter(s => s.status === status).length;
    return `Hay ${ships.length} envíos activos:\n• En tránsito: ${count('En tránsito')}\n• En almacén: ${count('En almacén')}\n• Entregados: ${count('Entregado')}\nDime un número de pedido (por ejemplo WT-2847) y te doy su detalle.`;
  }
  return 'Por ahora puedo ayudarte con ventas y profit, alertas, envíos, un pedido en concreto (por ejemplo WT-2847) y la flota. ¿Sobre cuál quieres saber?';
}
