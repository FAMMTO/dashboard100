// "Catálogo" page: every material the company trades (cartón, madera, metal…) with what a tonne costs us and what
// we sell it for. The figures per kilo and the profit are worked out from those two. Pedidos takes its list of
// materials, and its suggested prices, from here.
import { getCatalog, saveMaterial, deleteMaterial, getMovements, getSuppliers } from './data.js';
import { h, card, stats, empty, label, input, amountInput, parseAmount, unitMoney } from './ui.js';
import { newId } from './clientes.js';

const KG_PER_TON = 1000;
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const perKg = perTon => perTon > 0 ? unitMoney(perTon / KG_PER_TON) : '—';
const average = list => Math.round(list.reduce((a, v) => a + v, 0) / list.length * 100) / 100;
// What is earned on a tonne and which share of its sale price that is; null while it has no sale price.
const margin = m => m.salePerTon > 0 ? { profit: m.salePerTon - m.costPerTon, pct: (m.salePerTon - m.costPerTon) / m.salePerTon * 100 } : null;
const marginText = g => g ? `${unitMoney(g.profit)} · ${g.pct.toFixed(1)}%` : '—';

export const catalogo = {
  title: 'Catálogo', sub: 'Materiales que maneja la empresa: cuánto cuesta la tonelada y en cuánto se vende. Lo demás se calcula.', preview: false,
  async render({ body, actions }) {
    let items, moves, suppliers;
    try { [items, moves, suppliers] = await Promise.all([getCatalog(), getMovements(), getSuppliers()]); }
    catch { body.replaceChildren(empty('No se pudo abrir el almacenamiento de este navegador, así que no es posible guardar el catálogo aquí.')); return; }
    let editing = null, confirming = null; // editing: the material in the form ({} for a new one)
    const reload = async () => { [items, moves] = await Promise.all([getCatalog(), getMovements()]); editing = null; confirming = null; draw(); };

    const form = m => {
      const error = h('div', { class: 'form__error', hidden: true }), costKg = h('div', { class: 'form__total' }), saleKg = h('div', { class: 'form__total' }), gain = h('div', { class: 'form__total' });
      const fail = text => { error.textContent = text; error.hidden = false; };
      // Everything that is worked out from the two prices, redone on every keystroke.
      const calc = () => {
        const costPerTon = parseAmount(f.elements.costPerTon.value) || 0, salePerTon = parseAmount(f.elements.salePerTon.value) || 0, g = margin({ costPerTon, salePerTon });
        costKg.textContent = perKg(costPerTon); saleKg.textContent = perKg(salePerTon);
        gain.textContent = marginText(g); gain.className = 'form__total' + (g ? g.profit < 0 ? ' is-loss' : ' is-gain' : '');
      };
      const f = h('form', { class: 'card section', onsubmit: async e => {
        e.preventDefault();
        const d = new FormData(f), name = d.get('name').trim(), costPerTon = parseAmount(d.get('costPerTon')), salePerTon = parseAmount(d.get('salePerTon'));
        if (!(costPerTon > 0)) return fail('Escribe un costo por tonelada mayor a 0.');
        if (!(salePerTon > 0)) return fail('Escribe un precio de venta por tonelada mayor a 0.');
        if (items.some(x => x.id !== m.id && same(x.name, name))) return fail(`Ya existe "${name}" en el catálogo.`);
        try { await saveMaterial({ id: m.id || newId(), name, costPerTon, salePerTon, notes: d.get('notes').trim() }); } catch { return fail('No se pudo guardar. Revisa el espacio disponible del navegador e inténtalo de nuevo.'); }
        await reload();
      } },
        h('div', { class: 'section__title' }, m.id ? `Editar material · ${m.name}` : 'Nuevo material'),
        h('div', { class: 'form__grid', oninput: calc },
          label('Material', input({ name: 'name', value: m.name || '', placeholder: 'Cartón, madera, acero…', required: true }), 'span2'),
          label('Notas', input({ name: 'notes', value: m.notes || '', placeholder: 'Calidad, presentación… (opcional)' }), 'span2'),
          label('Costo por tonelada (MXN)', [amountInput({ class: 'input', name: 'costPerTon', value: m.costPerTon ?? '', placeholder: '0.00', required: true }, 2), h('span', { class: 'lbl__hint' }, 'Lo que nos cuesta.')]),
          h('div', { class: 'lbl' }, 'Costo por kilo (calculado)', costKg),
          label('Venta por tonelada (MXN)', [amountInput({ class: 'input', name: 'salePerTon', value: m.salePerTon ?? '', placeholder: '0.00', required: true }, 2), h('span', { class: 'lbl__hint' }, 'En cuánto lo vendemos.')]),
          h('div', { class: 'lbl' }, 'Venta por kilo (calculada)', saleKg),
          h('div', { class: 'lbl span2' }, 'Ganancia por tonelada · margen', gain),
          h('div', { class: 'lbl__hint span2' }, `1 tonelada = ${KG_PER_TON.toLocaleString('es-MX')} kg: el precio por kilo es el de la tonelada entre ${KG_PER_TON.toLocaleString('es-MX')}. La ganancia es la venta menos el costo.`)),
        error,
        h('div', { class: 'toolbar' }, h('button', { class: 'btn-primary', type: 'submit' }, 'Guardar'), h('button', { class: 'btn-small', type: 'button', onclick: () => { editing = null; draw(); } }, 'Cancelar')));
      calc();
      return f;
    };

    // Who sells a material and the lowest price among them (the page Proveedores is where that is set).
    const offersOf = m => {
      const prices = suppliers.flatMap(s => s.materials.filter(o => o.materialId === m.id).map(o => [s.name, o.pricePerTon]));
      if (!prices.length) return h('span', { class: 'lbl__hint' }, 'Sin proveedor');
      return [h('div', null, `${prices.length} · desde ${unitMoney(Math.min(...prices.map(p => p[1])))}`), h('div', { class: 'item__sub' }, prices.map(p => p[0]).join(', '))];
    };

    const table = () => h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Material', 'Costo por tonelada', 'Costo por kilo', 'Venta por tonelada', 'Venta por kilo', 'Ganancia por tonelada', 'Proveedores', 'Movimientos', ''].map(t => h('th', null, t)))),
      h('tbody', null, items.map(m => { const used = moves.filter(r => same(r.material, m.name)).length, g = margin(m); return h('tr', null,
        h('td', null, h('div', { class: 'table__strong' }, m.name), m.notes ? h('div', { class: 'item__sub' }, m.notes) : null),
        h('td', null, unitMoney(m.costPerTon)), h('td', null, perKg(m.costPerTon)),
        h('td', { class: 'table__strong' }, m.salePerTon > 0 ? unitMoney(m.salePerTon) : h('span', { class: 'lbl__hint', title: 'Edita el material para ponerle precio de venta' }, 'Sin precio')), h('td', { class: 'table__strong' }, perKg(m.salePerTon)),
        h('td', { class: g ? g.profit < 0 ? 'is-loss' : 'is-gain' : '' }, h('span', { class: 'money__value' }, marginText(g))),
        h('td', null, offersOf(m)),
        h('td', null, String(used)),
        h('td', { class: 'table__actions' }, confirming === m.id
          ? [h('button', { class: 'link-btn link-btn--danger', onclick: async () => { await deleteMaterial(m.id); await reload(); } }, 'Confirmar'), h('button', { class: 'link-btn', onclick: () => { confirming = null; draw(); } }, 'Cancelar')]
          : [h('button', { class: 'link-btn', onclick: () => { editing = m; confirming = null; draw(); body.scrollTop = 0; } }, 'Editar'),
            h('button', { class: 'link-btn link-btn--danger', title: used ? 'Sus entradas y salidas se conservan con el nombre del material' : null, onclick: () => { confirming = m.id; draw(); } }, 'Eliminar')])); })));

    const draw = () => {
      const priced = items.filter(m => m.salePerTon > 0), margins = priced.map(m => margin(m).pct);
      actions.replaceChildren(editing ? '' : h('button', { class: 'btn-primary', onclick: () => { editing = {}; draw(); } }, 'Nuevo material'));
      body.replaceChildren(
        stats([[items.length, 'Materiales en catálogo'], [items.length ? unitMoney(average(items.map(m => m.costPerTon))) : '—', 'Costo promedio por tonelada'],
          [priced.length ? unitMoney(average(priced.map(m => m.salePerTon))) : '—', 'Venta promedio por tonelada'], [priced.length ? average(margins).toFixed(1) + '%' : '—', 'Margen promedio']]),
        ...(editing ? [form(editing)] : []),
        card(items.length ? h('div', { class: 'table__wrap' }, table()) : empty('El catálogo está vacío. Usa "Nuevo material" para agregar el primero.')));
    };
    draw();
  },
};
