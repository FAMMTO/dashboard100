// "Mensajes" page: the e-mails that go with the orders. Each conversation is the message sent to a supplier with a
// purchase order (OC) and what came back, or a message from a client. A reply to an OC can be filed as
// "Solicitud aprobada": from then on the order counts as bought.
// There is no mail server yet, so what "arrives" is example data (see getMessages() in data.js).
import { getMessages, setOrderApproved } from './data.js';
import { h, badge, card, empty, stats } from './ui.js';

const when = iso => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const last = t => t.messages[t.messages.length - 1];
// Where a conversation stands. It doubles as the badge style (see `.badge[data-status=…]` in global.css).
const stateOf = t => t.approved ? 'Solicitud aprobada' : t.kind !== 'oc' ? 'General' : last(t).dir === 'in' ? 'Por revisar' : 'Sin respuesta';
const FILTERS = [['todos', 'Todos', () => true], ['revisar', 'Por revisar', t => stateOf(t) === 'Por revisar'], ['aprobadas', 'Aprobadas', t => !!t.approved], ['general', 'Generales', t => t.kind !== 'oc']];

export const mensajes = {
  title: 'Mensajes', sub: 'Correos enviados a proveedores y clientes, y las respuestas que llegan como seguimiento de cada orden.', preview: false,
  async render({ body, actions }) {
    let threads, filter = 'todos', open = null, error = '';
    try { threads = await getMessages(); }
    catch { body.replaceChildren(empty('No se pudo abrir el almacenamiento de este navegador, así que no es posible mostrar los mensajes.')); return; }

    const approve = async (t, on) => {
      error = '';
      try { await setOrderApproved(t.orderId, on); threads = await getMessages(); } catch { error = 'No se pudo guardar el cambio. Inténtalo de nuevo.'; }
      draw();
    };

    const bubble = m => h('div', { class: 'mail mail--' + m.dir },
      h('div', { class: 'mail__head' }, h('strong', null, m.dir === 'out' ? `Tú → ${m.who}` : m.who), h('span', null, when(m.at))),
      h('div', { class: 'mail__text' }, m.text));

    const thread = t => {
      const shown = open === t.id, state = stateOf(t);
      return h('div', { class: 'card thread' + (shown ? ' is-open' : '') },
        h('button', { class: 'thread__head', type: 'button', 'aria-expanded': String(shown), onclick: () => { open = shown ? null : t.id; error = ''; draw(); } },
          h('div', { class: 'thread__text' },
            h('div', { class: 'item__title' }, t.subject),
            h('div', { class: 'item__sub' }, [t.folio ? `Seguimiento de ${t.folio}` : t.kind === 'cliente' ? 'Cliente' : 'Proveedor', t.party, `${t.messages.length} ${t.messages.length === 1 ? 'mensaje' : 'mensajes'}`, when(last(t).at)].join(' · '))),
          badge(state)),
        shown ? h('div', { class: 'thread__body' },
          t.messages.map(bubble),
          t.kind !== 'oc' ? null : t.approved
            ? h('div', { class: 'thread__foot' }, h('span', { class: 'is-gain' }, h('span', { class: 'money__value' }, `Solicitud aprobada el ${when(t.approved.at)}: la ${t.folio} cuenta como orden comprada.`)),
              h('button', { class: 'btn-small', onclick: () => approve(t, false) }, 'Quitar aprobación'))
            : h('div', { class: 'thread__foot' }, h('span', { class: 'item__sub' }, last(t).dir === 'in' ? 'Si el proveedor confirmó, cataloga este seguimiento para dar la orden por comprada.' : 'Aún no hay respuesta del proveedor.'),
              h('button', { class: 'btn-success', onclick: () => approve(t, true) }, 'Catalogar como Solicitud aprobada')),
          error ? h('div', { class: 'form__error' }, error) : null) : null);
    };

    const draw = () => {
      const pick = FILTERS.find(f => f[0] === filter)[2], rows = threads.filter(pick), ocs = threads.filter(t => t.kind === 'oc');
      actions.replaceChildren(h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar mensajes' },
        FILTERS.map(([id, name]) => h('button', { class: 'chipbtn' + (id === filter ? ' is-on' : ''), onclick: () => { filter = id; draw(); } }, name))));
      body.replaceChildren(
        stats([[threads.length, 'Conversaciones'], [ocs.filter(t => stateOf(t) === 'Por revisar').length, 'Por revisar'], [ocs.filter(t => t.approved).length, 'Solicitudes aprobadas'], [threads.filter(t => t.kind !== 'oc').length, 'Generales']]),
        ...(rows.length ? rows.map(thread) : [card(empty(threads.length ? 'No hay mensajes en este filtro.' : 'Aún no hay mensajes. Aparecen aquí al dar "Enviar" en una orden de compra.'))]),
        h('div', { class: 'module__note' }, 'Los mensajes recibidos son de ejemplo: aún no hay un buzón de correo conectado.'),
      );
    };
    draw();
  },
};
