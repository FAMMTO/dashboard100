// "Proveedores" page: who the company buys material from. Each supplier sells one or more materials of the
// catalogue and sets its own price for each; a purchase order (OC) in Pedidos starts from that price.
import { getSuppliers, saveSupplier, deleteSupplier, getCatalog, getMovements } from './data.js';
import { h, card, stats, empty, label, input, amountInput, parseAmount, unitMoney } from './ui.js';
import { newId } from './clientes.js';

const KG_PER_TON = 1000;
const money = n => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const REMOVE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>';

/** Name of a material a supplier sells: the catalogue's current one, or the one it had if it is no longer there. */
/** Whether a supplier delivers to a branch (by id). One saved before branches could be chosen delivers to all of them. */
export const deliversTo = (supplier, branchId) => !branchId || !Array.isArray(supplier.branches) || supplier.branches.includes(branchId);

export const offerName = (offer, catalog) => (catalog.find(m => m.id === offer.materialId) || offer).name;

export const proveedores = {
  title: 'Proveedores', sub: 'A quién se le compra material. Cada proveedor vende uno o más materiales y pone su propio precio.', preview: false,
  async render({ body, actions, branches, branch }) {
    let suppliers, catalog, moves;
    try { [suppliers, catalog, moves] = await Promise.all([getSuppliers(), getCatalog(), getMovements()]); }
    catch { body.replaceChildren(empty('No se pudo abrir el almacenamiento de este navegador, así que no es posible guardar proveedores aquí.')); return; }
    let editing = null, confirming = null; // editing: the supplier in the form ({} for a new one)
    const reload = async () => { [suppliers, moves] = await Promise.all([getSuppliers(), getMovements()]); editing = null; confirming = null; draw(); };
    const purchasesOf = s => moves.filter(r => r.type === 'entrada' && (r.supplierId === s.id || (!r.supplierId && same(r.party, s.name))));

    const form = s => {
      const error = h('div', { class: 'form__error', hidden: true }), offers = h('div', { class: 'offers' });
      const fail = text => { error.textContent = text; error.hidden = false; };
      // One line per material the supplier sells: which one, its price per tonne and, worked out, per kilo.
      const offerRow = (offer = {}) => {
        const perKg = h('span', { class: 'offer__kg' }), price = amountInput({ class: 'input', name: 'price', value: offer.pricePerTon ?? '', placeholder: 'Precio por tonelada', 'aria-label': 'Precio por tonelada', required: true }, 2);
        const calc = () => { const v = parseAmount(price.value); perKg.textContent = v > 0 ? `${unitMoney(v / KG_PER_TON)} por kilo` : 'Precio por kilo'; };
        const row = h('div', { class: 'offer' },
          h('select', { class: 'input', name: 'material', 'aria-label': 'Material', required: true },
            h('option', { value: '' }, 'Material…'), catalog.map(m => h('option', { value: m.id, selected: m.id === offer.materialId }, m.name)),
            offer.materialId && !catalog.some(m => m.id === offer.materialId) ? h('option', { value: offer.materialId, selected: true }, `${offer.name} (fuera de catálogo)`) : null),
          price, perKg,
          h('button', { class: 'offer__remove', type: 'button', title: 'Quitar material', 'aria-label': 'Quitar material', html: REMOVE_ICON, onclick: () => { row.remove(); } }));
        price.addEventListener('input', calc); calc();
        return row;
      };
      (s.materials && s.materials.length ? s.materials : [{}]).forEach(o => offers.append(offerRow(o)));
      const f = h('form', { class: 'card section', oninput: () => { error.hidden = true; }, onsubmit: async e => {
        e.preventDefault();
        const d = new FormData(f), name = d.get('name').trim();
        const materials = [...offers.children].map(row => { const id = row.querySelector('[name=material]').value, old = (s.materials || []).find(o => o.materialId === id);
          return { materialId: id, name: (catalog.find(m => m.id === id) || old || {}).name || '', pricePerTon: parseAmount(row.querySelector('[name=price]').value) }; });
        if (!materials.length) return fail('Agrega al menos un material que venda este proveedor.');
        if (materials.some(o => !(o.pricePerTon > 0))) return fail('Cada material necesita un precio por tonelada mayor a 0.');
        if (new Set(materials.map(o => o.materialId)).size < materials.length) return fail('Hay un material repetido: deja una sola línea por material.');
        if (suppliers.some(x => x.id !== s.id && same(x.name, name))) return fail(`Ya existe un proveedor llamado "${name}".`);
        const delivers = d.getAll('branch');
        if (!delivers.length) return fail('Marca al menos una sucursal a la que entrega este proveedor.');
        const get = key => d.get(key).trim();
        try { await saveSupplier({ ...s, id: s.id || newId(), name, rfc: get('rfc').toUpperCase(), contact: get('contact'), phone: get('phone'), email: get('email'), city: get('city'), notes: get('notes'), materials, branches: delivers }); }
        catch { return fail('No se pudo guardar. Revisa el espacio disponible del navegador e inténtalo de nuevo.'); }
        await reload();
      } },
        h('div', { class: 'section__title' }, s.id ? `Editar proveedor · ${s.name}` : 'Nuevo proveedor'),
        h('div', { class: 'form__grid' },
          label('Nombre o razón social', input({ name: 'name', value: s.name || '', placeholder: 'Nombre del proveedor', required: true }), 'span2'),
          label('RFC', input({ name: 'rfc', value: s.rfc || '', placeholder: 'XAXX010101000', maxlength: 13, pattern: '[A-Za-zÑñ&]{3,4}[0-9]{6}[A-Za-z0-9]{3}', title: '12 o 13 caracteres: letras, fecha (AAMMDD) y homoclave' })),
          label('Ciudad', input({ name: 'city', value: s.city || '', placeholder: 'Monterrey' })),
          label('Contacto', input({ name: 'contact', value: s.contact || '', placeholder: 'Persona de contacto' })),
          label('Teléfono', input({ name: 'phone', type: 'tel', value: s.phone || '', placeholder: '81 0000 0000' })),
          label('Correo', input({ name: 'email', type: 'email', value: s.email || '', placeholder: 'ventas@proveedor.mx' })),
          label('Notas', input({ name: 'notes', value: s.notes || '', placeholder: 'Condiciones de pago, horarios… (opcional)' })),
          h('fieldset', { class: 'checkgroup span4' }, h('legend', null, 'Sucursales a las que entrega'),
            h('div', { class: 'checks' }, branches.map(b => h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'branch', value: b.id, checked: deliversTo(s, b.id) }), h('span', null, b.city)))),
            h('div', { class: 'lbl__hint' }, 'En Pedidos solo aparece en las sucursales marcadas.')),
          h('div', { class: 'lbl span4' }, 'Materiales que vende y su precio',
            catalog.length ? [offers, h('div', null, h('button', { class: 'btn-small', type: 'button', onclick: () => { const row = offerRow(); offers.append(row); row.querySelector('select').focus(); } }, '＋ Agregar material'))]
              : h('div', { class: 'lbl__hint' }, 'El catálogo está vacío: agrega primero los materiales en Catálogo.'))),
        error,
        h('div', { class: 'toolbar' }, h('button', { class: 'btn-primary', type: 'submit' }, 'Guardar'), h('button', { class: 'btn-small', type: 'button', onclick: () => { editing = null; draw(); } }, 'Cancelar')));
      return f;
    };

    const table = () => h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Proveedor', 'Contacto', 'Materiales y precio por tonelada', 'Entrega en', 'OC', 'Total comprado', ''].map(t => h('th', null, t)))),
      h('tbody', null, suppliers.map(s => { const bought = purchasesOf(s); return h('tr', null,
        h('td', null, h('div', { class: 'table__strong' }, s.name), h('div', { class: 'item__sub' }, [s.rfc ? `RFC ${s.rfc}` : 'Sin RFC', s.city].filter(Boolean).join(' · '))),
        h('td', null, h('div', null, s.contact || '—'), h('div', { class: 'item__sub' }, [s.phone, s.email].filter(Boolean).join(' · ') || 'Sin datos de contacto')),
        h('td', { class: 'table__text' }, h('div', { class: 'tags' }, s.materials.map(o => h('span', { class: 'tag', title: `${unitMoney(o.pricePerTon / KG_PER_TON)} por kilo` }, h('strong', null, offerName(o, catalog)), ' ' + unitMoney(o.pricePerTon))))),
        h('td', null, h('div', { class: 'tags' }, branches.every(b => deliversTo(s, b.id)) ? h('span', { class: 'tag' }, 'Todas las sucursales')
          : branches.filter(b => deliversTo(s, b.id)).map(b => h('span', { class: 'tag' + (branch && b.id === branch.id ? ' tag--here' : '') }, b.city)))),
        h('td', null, String(bought.length)), h('td', { class: 'table__strong' }, money(bought.reduce((a, r) => a + r.quantity * r.unitPrice, 0))),
        h('td', { class: 'table__actions' }, confirming === s.id
          ? [h('button', { class: 'link-btn link-btn--danger', onclick: async () => { await deleteSupplier(s.id); await reload(); } }, 'Confirmar'), h('button', { class: 'link-btn', onclick: () => { confirming = null; draw(); } }, 'Cancelar')]
          : [h('button', { class: 'link-btn', onclick: () => { editing = s; confirming = null; draw(); body.scrollTop = 0; } }, 'Editar'),
            h('button', { class: 'link-btn link-btn--danger', title: bought.length ? 'Sus órdenes de compra se conservan con el nombre del proveedor' : null, onclick: () => { confirming = s.id; draw(); } }, 'Eliminar')])); })));

    const draw = () => {
      const offered = new Set(suppliers.flatMap(s => s.materials.map(o => o.materialId))), buys = moves.filter(r => r.type === 'entrada');
      actions.replaceChildren(editing ? '' : h('button', { class: 'btn-primary', onclick: () => { editing = {}; draw(); } }, 'Nuevo proveedor'));
      body.replaceChildren(
        stats([[branch ? `${suppliers.filter(x => deliversTo(x, branch.id)).length} de ${suppliers.length}` : suppliers.length, branch ? `Proveedores que entregan en ${branch.city}` : 'Proveedores'], [`${[...offered].filter(id => catalog.some(m => m.id === id)).length} de ${catalog.length}`, 'Materiales del catálogo con proveedor'],
          [buys.length, 'Órdenes de compra (OC)'], [money(buys.reduce((a, r) => a + r.quantity * r.unitPrice, 0)), 'Total comprado']]),
        ...(editing ? [form(editing)] : []),
        card(suppliers.length ? h('div', { class: 'table__wrap' }, table()) : empty('Aún no hay proveedores. Usa "Nuevo proveedor" para registrar el primero.')));
    };
    draw();
  },
};
