// "Costos" page: material arrivals (entradas) and sales (salidas), each with price, quantity and its receipts.
import { getMaterials, getMovements, saveMovement, deleteMovement } from './data.js';
import { h, badge, card, stats, empty } from './ui.js';

const UNITS = ['kg', 'toneladas', 'piezas', 'tarimas', 'litros'];
const MAX_FILE_MB = 10;
const KIND = {
  entrada: { tab: 'Entradas', add: 'Nueva entrada', edit: 'Editar entrada', party: 'Proveedor', prefix: 'ENT', empty: 'Aún no hay entradas registradas. Usa "Nueva entrada" cuando llegue material.' },
  salida: { tab: 'Salidas', add: 'Nueva salida', edit: 'Editar salida', party: 'Cliente', prefix: 'SAL', empty: 'Aún no hay salidas registradas. Usa "Nueva salida" cuando se venda algo.' },
};

const money = n => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const amount = r => r.quantity * r.unitPrice;
const sum = rows => rows.reduce((a, r) => a + amount(r), 0);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const showDate = iso => new Date(iso + 'T00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
const openFile = file => { const url = URL.createObjectURL(file); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); };

export const costos = {
  title: 'Costos', sub: 'Entradas de materia prima y salidas por venta, con precio, cantidad y comprobantes.', preview: false,
  async render({ body, actions }) {
    let materials, all;
    try { [materials, all] = await Promise.all([getMaterials(), getMovements()]); }
    catch { body.replaceChildren(empty('No se pudo abrir el almacenamiento de este navegador, así que no es posible registrar costos aquí.')); return; }

    let type = 'entrada', editing = null, confirming = null; // editing: the record in the form ({} for a new one)
    const nextFolio = () => {
      const used = all.filter(r => r.type === type).map(r => parseInt(r.folio.split('-')[1], 10) || 0);
      return `${KIND[type].prefix}-${String(Math.max(0, ...used) + 1).padStart(4, '0')}`;
    };
    const reload = async () => { all = await getMovements(); editing = null; confirming = null; draw(); };

    const form = rec => {
      const k = KIND[type], total = h('div', { class: 'form__total' }, money(amount({ quantity: rec.quantity || 0, unitPrice: rec.unitPrice || 0 }))), error = h('div', { class: 'form__error', hidden: true });
      const label = (text, control, cls) => h('label', { class: 'lbl' + (cls ? ' ' + cls : '') }, text, control);
      const input = attrs => h('input', { class: 'input', ...attrs });
      const fileField = (text, name, current) => label(text, [input({ type: 'file', name, accept: '.pdf,.xml,image/*' }), current ? h('span', { class: 'lbl__hint' }, `Actual: ${current.name}. Elige otro archivo para reemplazarlo.`) : null]);
      const f = h('form', { class: 'card section', onsubmit: async e => {
        e.preventDefault();
        const d = new FormData(f), keep = (name, old) => { const file = d.get(name); return file && file.size ? file : old || null; };
        const record = {
          id: rec.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 8), type, folio: rec.folio || nextFolio(),
          date: d.get('date'), material: d.get('material'), party: d.get('party').trim(),
          quantity: Number(d.get('quantity')), unit: d.get('unit'), unitPrice: Number(d.get('unitPrice')),
          payment: keep('payment', rec.payment), invoice: keep('invoice', rec.invoice), notes: d.get('notes').trim(),
        };
        const big = [record.payment, record.invoice].find(file => file && file.size > MAX_FILE_MB * 1048576);
        if (big) { error.textContent = `"${big.name}" pesa más de ${MAX_FILE_MB} MB. Elige un archivo más ligero.`; error.hidden = false; return; }
        try { await saveMovement(record); } catch { error.textContent = 'No se pudo guardar. Revisa el espacio disponible del navegador e inténtalo de nuevo.'; error.hidden = false; return; }
        await reload();
      } },
        h('div', { class: 'section__title' }, `${rec.id ? k.edit : k.add} · ${rec.folio || nextFolio()}`),
        h('div', { class: 'form__grid', oninput: () => { const d = new FormData(f); total.textContent = money((Number(d.get('quantity')) || 0) * (Number(d.get('unitPrice')) || 0)); } },
          label('Fecha', input({ type: 'date', name: 'date', value: rec.date || today(), required: true })),
          label('Materia prima', h('select', { class: 'input', name: 'material', required: true },
            h('option', { value: '' }, 'Selecciona…'), materials.map(m => h('option', { value: m, selected: m === rec.material }, m)))),
          label(k.party, input({ name: 'party', value: rec.party || '', placeholder: `Nombre del ${k.party.toLowerCase()}`, required: true }), 'span2'),
          label('Cantidad', input({ type: 'number', name: 'quantity', value: rec.quantity ?? '', min: 0.001, step: 'any', placeholder: '0', required: true })),
          label('Unidad', h('select', { class: 'input', name: 'unit' }, UNITS.map(u => h('option', { value: u, selected: u === rec.unit }, u)))),
          label('Precio por unidad (MXN)', input({ type: 'number', name: 'unitPrice', value: rec.unitPrice ?? '', min: 0, step: 'any', placeholder: '0.00', required: true })),
          h('div', { class: 'lbl' }, 'Total', total),
          fileField('Comprobante de pago', 'payment', rec.payment),
          fileField('Factura', 'invoice', rec.invoice),
          label('Notas', input({ name: 'notes', value: rec.notes || '', placeholder: 'Opcional' }), 'span2'),
        ),
        error,
        h('div', { class: 'toolbar' }, h('button', { class: 'btn-primary', type: 'submit' }, 'Guardar'), h('button', { class: 'btn-small', type: 'button', onclick: () => { editing = null; draw(); } }, 'Cancelar')),
      );
      return f;
    };

    const fileCell = (file, text) => file ? h('button', { class: 'link-btn', title: file.name, onclick: () => openFile(file) }, text) : badge('Pendiente');
    const table = rows => h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Folio', 'Fecha', 'Materia prima', KIND[type].party, 'Cantidad', 'Precio unit.', 'Total', 'Pago', 'Factura', ''].map(t => h('th', null, t)))),
      h('tbody', null, rows.map(r => h('tr', null,
        h('td', { class: 'table__strong' }, r.folio), h('td', null, showDate(r.date)), h('td', { class: 'table__strong' }, r.material), h('td', null, r.party),
        h('td', null, `${r.quantity.toLocaleString('es-MX')} ${r.unit}`), h('td', null, money(r.unitPrice)), h('td', { class: 'table__strong' }, money(amount(r))),
        h('td', null, fileCell(r.payment, 'Ver pago')), h('td', null, fileCell(r.invoice, 'Ver factura')),
        h('td', { class: 'table__actions' }, confirming === r.id
          ? [h('button', { class: 'link-btn link-btn--danger', onclick: async () => { await deleteMovement(r.id); await reload(); } }, 'Confirmar'), h('button', { class: 'link-btn', onclick: () => { confirming = null; draw(); } }, 'Cancelar')]
          : [h('button', { class: 'link-btn', onclick: () => { editing = r; confirming = null; draw(); body.scrollTop = 0; } }, 'Editar'), h('button', { class: 'link-btn link-btn--danger', onclick: () => { confirming = r.id; draw(); } }, 'Eliminar')]),
      ))));

    const draw = () => {
      const ins = all.filter(r => r.type === 'entrada'), outs = all.filter(r => r.type === 'salida'), rows = type === 'entrada' ? ins : outs, k = KIND[type];
      actions.replaceChildren(editing ? '' : h('button', { class: 'btn-primary', onclick: () => { editing = {}; draw(); } }, k.add));
      body.replaceChildren(
        stats([[money(sum(ins)), `Compras · ${ins.length} ${ins.length === 1 ? 'entrada' : 'entradas'}`], [money(sum(outs)), `Ventas · ${outs.length} ${outs.length === 1 ? 'salida' : 'salidas'}`], [money(sum(outs) - sum(ins)), 'Balance (ventas − compras)'], [all.filter(r => !r.payment || !r.invoice).length, 'Con comprobantes pendientes']]),
        h('div', { class: 'chips' }, Object.entries(KIND).map(([key, v]) => h('button', { class: 'chipbtn' + (key === type ? ' is-on' : ''), onclick: () => { type = key; editing = null; confirming = null; draw(); } }, v.tab))),
        ...(editing ? [form(editing)] : []),
        card(rows.length ? h('div', { class: 'table__wrap' }, table(rows)) : empty(k.empty)),
      );
    };
    draw();
  },
};
