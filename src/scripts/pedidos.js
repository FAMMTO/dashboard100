// "Pedidos" page: material arrivals (entradas) and sales (salidas), each with price, quantity and its receipts.
// Materials come from the Catálogo page, clients from Clientes and suppliers (with their prices) from Proveedores.
import { getCatalog, getMovements, saveMovement, deleteMovement, getClients, saveClient, getSuppliers, getRouteCities } from './data.js';
import { h, badge, card, stats, empty, label, input, amountInput, groupAmount, parseAmount, unitMoney } from './ui.js';
import { buildInvoice } from './invoice.js';
import { clientFields, readClient, clientAddress, clientRoute, routeSummary, wirePostalCode, newId } from './clientes.js';
import { openRouteMap } from './routemap.js';
import { offerName } from './proveedores.js';

const UNITS = ['kg', 'toneladas', 'piezas', 'tarimas', 'litros'];
const MAX_FILE_MB = 10;
const KIND = {
  entrada: { tab: 'Entradas', add: 'Nueva entrada', edit: 'Editar entrada', party: 'Proveedor', prefix: 'ENT', empty: 'Aún no hay entradas registradas. Usa "Nueva entrada" cuando llegue material.' },
  salida: { tab: 'Salidas', add: 'Nueva salida', edit: 'Editar salida', party: 'Cliente', prefix: 'SAL', empty: 'Aún no hay salidas registradas. Usa "Nueva salida" cuando se venda algo.' },
};
// Values of the client and supplier dropdowns that are not a saved record.
const NEW_CLIENT = '__new', KEEP_NAME = '__keep', OTHER_SUPPLIER = '__other';

const money = n => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const amount = r => r.quantity * r.unitPrice;
const sum = rows => rows.reduce((a, r) => a + amount(r), 0);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const showDate = iso => new Date(iso + 'T00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
const openFile = file => { const url = URL.createObjectURL(file); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); };
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
// A catalogue price of a material ('costPerTon' or 'salePerTon') in a unit; null if it has none or the unit is not a weight.
const catalogPrice = (material, key, unit) => !material || !(material[key] > 0) ? null : unit === 'toneladas' ? material[key] : unit === 'kg' ? material[key] / 1000 : null;

export const pedidos = {
  title: 'Pedidos', sub: 'Entradas de materia prima y salidas por venta, con precio, cantidad y comprobantes.', preview: false,
  async render({ body, actions, branch }) {
    let catalog, all, clients, cities, suppliers;
    try { [catalog, all, clients, cities, suppliers] = await Promise.all([getCatalog(), getMovements(), getClients(), getRouteCities(), getSuppliers()]); }
    catch { body.replaceChildren(empty('No se pudo abrir el almacenamiento de este navegador, así que no es posible registrar pedidos aquí.')); return; }
    const from = branch ? branch.city : 'Monterrey'; // sales leave from the selected branch

    let type = 'entrada', editing = null, confirming = null; // editing: the record in the form ({} for a new one)
    const nextFolio = () => {
      const used = all.filter(r => r.type === type).map(r => parseInt(r.folio.split('-')[1], 10) || 0);
      return `${KIND[type].prefix}-${String(Math.max(0, ...used) + 1).padStart(4, '0')}`;
    };
    const reload = async () => { [all, clients] = await Promise.all([getMovements(), getClients()]); editing = null; confirming = null; draw(); };

    // Client of a sale: one of the saved ones, or "Nuevo cliente", which opens the fields to register it on the spot.
    // Under it, where the order goes and the route it takes, worked out from the client's address.
    const clientPicker = rec => {
      const known = clients.find(c => c.id === rec.clientId) || clients.find(c => rec.party && same(c.name, rec.party));
      const extra = h('div', { class: 'form__grid form__sub span4', hidden: true }, h('div', { class: 'lbl__hint span4' }, 'Se guardará en Clientes para usarlo en las próximas salidas.'), clientFields({}, cities, 'new-'));
      const delivery = h('div', { class: 'delivery span4', hidden: true });
      const toggle = on => { extra.hidden = !on; extra.querySelectorAll('input, select').forEach(i => { i.disabled = !on; }); }; // disabled fields are neither required nor sent
      let asked = 0;
      const showDelivery = async id => {
        const c = clients.find(x => x.id === id), mine = ++asked;
        delivery.hidden = !c;
        if (!c) return;
        const { text } = await routeSummary(from, c);
        if (mine !== asked) return; // another client was picked meanwhile
        delivery.replaceChildren(h('div', null, h('span', { class: 'delivery__label' }, 'Entrega'), clientAddress(c) || 'Este cliente no tiene dirección registrada.'),
          h('div', null, h('span', { class: 'delivery__label' }, 'Ruta'), c.city ? `${from} → ${c.city} · ${text}` : text,
            c.city ? h('button', { class: 'link-btn delivery__map', type: 'button', onclick: () => openRouteMap(clientRoute(from, c)) }, 'Ver en el mapa') : null));
      };
      const select = h('select', { class: 'input', name: 'client', required: true, onchange: e => { const v = e.target.value; toggle(v === NEW_CLIENT); showDelivery(v); if (v === NEW_CLIENT) extra.querySelector('input').focus(); } },
        h('option', { value: '' }, 'Selecciona un cliente…'),
        clients.map(c => h('option', { value: c.id, selected: c === known }, c.name)),
        rec.party && !known ? h('option', { value: KEEP_NAME, selected: true }, `${rec.party} (sin registrar)`) : null,
        h('option', { value: NEW_CLIENT }, '＋ Nuevo cliente…'));
      toggle(false); wirePostalCode(extra, 'new-');
      if (known) showDelivery(known.id);
      return [label('Cliente', select, 'span2'), extra, delivery];
    };

    // Supplier of a purchase: one of the saved ones (its materials and prices then drive the form), or a name typed
    // for one that is not registered. `onPick` is told every time the choice changes.
    const supplierPicker = (rec, onPick) => {
      const known = suppliers.find(s => s.id === rec.supplierId) || suppliers.find(s => rec.party && same(s.name, rec.party));
      const typed = input({ name: 'party', placeholder: 'Nombre del proveedor', required: true, disabled: true });
      const other = label('Nombre del proveedor', [typed, h('span', { class: 'lbl__hint' }, 'Regístralo en Proveedores para guardar los materiales que vende y sus precios.')], 'span2');
      const select = h('select', { class: 'input', name: 'supplier', required: true, onchange: () => { const on = select.value === OTHER_SUPPLIER; other.hidden = !on; typed.disabled = !on; if (on) typed.focus(); onPick(current()); } },
        h('option', { value: '' }, suppliers.length ? 'Selecciona un proveedor…' : 'Aún no hay proveedores'),
        suppliers.map(s => h('option', { value: s.id, selected: s === known }, s.name)),
        rec.party && !known ? h('option', { value: KEEP_NAME, selected: true }, `${rec.party} (sin registrar)`) : null,
        h('option', { value: OTHER_SUPPLIER }, '＋ Otro proveedor (sin registrar)…'));
      const current = () => suppliers.find(s => s.id === select.value) || null;
      other.hidden = true;
      return { fields: [label('Proveedor', select, 'span2'), other], current };
    };

    const form = rec => {
      const k = KIND[type], total = h('div', { class: 'form__total' }, money(amount({ quantity: rec.quantity || 0, unitPrice: rec.unitPrice || 0 }))), error = h('div', { class: 'form__error', hidden: true });
      const fail = text => { error.textContent = text; error.hidden = false; };
      const fileField = (text, name, current) => label(text, [input({ type: 'file', name, accept: '.pdf,.xml,image/*' }), current ? h('span', { class: 'lbl__hint' }, `Actual: ${current.name}. Elige otro archivo para reemplazarlo.`) : null]);
      const supplier = type === 'entrada' ? supplierPicker(rec, s => { listMaterials(s); suggest(true); }) : null;
      const party = supplier ? supplier.fields : clientPicker(rec);
      // The materials to choose from: the whole catalogue or, once a supplier is picked, only what it sells.
      const materialSelect = h('select', { class: 'input', name: 'material', required: true });
      const listMaterials = from => {
        const chosen = materialSelect.value || rec.material || '', names = from ? from.materials.map(o => offerName(o, catalog)) : catalog.map(m => m.name);
        materialSelect.replaceChildren(h('option', { value: '' }, names.length ? 'Selecciona…' : from ? 'Este proveedor no tiene materiales' : 'El catálogo está vacío'),
          ...names.map(name => h('option', { value: name, selected: name === chosen }, name)),
          ...(rec.material && chosen === rec.material && !names.includes(chosen) ? [h('option', { value: chosen, selected: true }, `${chosen} (${from ? 'no lo vende este proveedor' : 'fuera de catálogo'})`)] : []));
      };
      const price = amountInput({ class: 'input', name: 'unitPrice', value: rec.unitPrice ?? '', placeholder: '0.00', required: true }, 4), priceHint = h('span', { class: 'lbl__hint' });
      // A sale also says who the material comes from and what that supplier charges for it, to see what the sale leaves.
      const source = type === 'salida' ? h('select', { class: 'input', name: 'source' }) : null, sourceCost = h('div', { class: 'form__total' }), gain = h('div', { class: 'form__total' });
      // Suppliers that sell the chosen material, cheapest first: [supplier, its offer].
      const sellers = () => suppliers.map(s => [s, s.materials.find(o => offerName(o, catalog) === f.elements.material.value)]).filter(pair => pair[1]).sort((a, b) => a[1].pricePerTon - b[1].pricePerTon);
      const pickedSource = () => sellers().find(pair => pair[0].id === source.value) || null;
      // Refills the supplier list for the chosen material, keeping the chosen supplier if it sells it; otherwise the cheapest one.
      const listSources = keep => {
        const list = sellers(), wanted = keep ?? source.value, chosen = list.some(pair => pair[0].id === wanted) ? wanted : list.length ? list[0][0].id : '';
        source.replaceChildren(h('option', { value: '' }, list.length ? 'Sin proveedor' : f.elements.material.value ? 'Ningún proveedor vende este material' : 'Elige primero la materia prima'),
          ...list.map(([s, o]) => h('option', { value: s.id, selected: s.id === chosen }, `${s.name} · ${unitMoney(o.pricePerTon)} por tonelada`)));
      };
      // What the chosen supplier charges per unit of the sale (null if there is none, or the unit is not a weight).
      const unitCostNow = () => { const hit = source && pickedSource(); return hit ? catalogPrice(hit[1], 'pricePerTon', f.elements.unit.value) : null; };
      const updateTotal = () => {
        const quantity = parseAmount(f.elements.quantity.value) || 0, sold = quantity * (parseAmount(price.value) || 0);
        total.textContent = money(sold);
        if (!source) return;
        const cost = unitCostNow(), profit = cost == null ? null : sold - quantity * cost;
        sourceCost.textContent = cost == null ? '—' : `${unitMoney(cost)} por ${f.elements.unit.value === 'kg' ? 'kg' : 'tonelada'}`;
        gain.textContent = profit == null ? '—' : money(profit) + (sold > 0 ? ` · ${(profit / sold * 100).toFixed(1)}%` : '');
        gain.className = 'form__total' + (profit == null ? '' : profit < 0 ? ' is-loss' : ' is-gain');
      };
      // The price on record for the chosen supplier, material and unit: the supplier's price for a purchase (the
      // catalogue's cost if the supplier is not registered) and the catalogue's sale price for a sale.
      // `changed`: the user just picked another supplier, material or unit, so the price follows that choice (and is
      // emptied if there is none on record). Otherwise (the form just opened) a price already there is left alone.
      const suggest = changed => {
        const material = catalog.find(m => m.name === f.elements.material.value), unit = f.elements.unit.value, per = unit === 'kg' ? 'kg' : 'tonelada';
        const cost = catalogPrice(material, 'costPerTon', unit), sale = catalogPrice(material, 'salePerTon', unit);
        const from = supplier && supplier.current(), own = catalogPrice(from && from.materials.find(o => offerName(o, catalog) === f.elements.material.value), 'pricePerTon', unit);
        const start = type === 'salida' ? sale : own ?? cost, show = (text, value) => value == null ? null : `${text} ${unitMoney(value)}`;
        priceHint.textContent = (type === 'salida' ? [show(`Venta en catálogo:`, sale), show('costo', cost)] : own != null ? [show(`Precio de ${from.name}:`, own), show('catálogo', cost)] : [show('Costo en catálogo:', cost)])
          .filter(Boolean).join(' · ') + (start == null ? '' : ` (por ${per})`);
        if (!changed && price.value !== '') return;
        if (start == null && price.value !== price.dataset.auto) return; // nothing on record: keep what the user typed
        price.value = price.dataset.auto = start == null ? '' : groupAmount(String(Math.round(start * 1e4) / 1e4), 4);
        updateTotal();
      };
      const f = h('form', { class: 'card section', onsubmit: async e => {
        e.preventDefault();
        const d = new FormData(f), keep = (name, old) => { const file = d.get(name); return file && file.size ? file : old || null; };
        // Who it was sold to (or bought from): a saved client, a client registered right here, or a typed name.
        let partyName, client = null, created = null;
        const seller = supplier && supplier.current();
        if (type !== 'salida') partyName = seller ? seller.name : d.get('supplier') === KEEP_NAME ? rec.party : d.get('party').trim();
        else if (d.get('client') === KEEP_NAME) partyName = rec.party;
        else if (d.get('client') === NEW_CLIENT) {
          client = created = { id: newId(), ...readClient(d, 'new-') };
          if (clients.some(c => same(c.name, created.name))) return fail(`Ya existe un cliente llamado "${created.name}". Selecciónalo de la lista.`);
          partyName = created.name;
        } else { client = clients.find(x => x.id === d.get('client')); partyName = client.name; }
        // Amounts are typed with thousands separators, so the browser can't validate them: check them here.
        const quantity = parseAmount(d.get('quantity')), unitPrice = parseAmount(d.get('unitPrice'));
        if (!(quantity > 0)) return fail('Escribe una cantidad mayor a 0.');
        if (!(unitPrice >= 0)) return fail('Escribe un precio por unidad válido.');
        const record = {
          id: rec.id || newId(), type, folio: rec.folio || nextFolio(),
          date: d.get('date'), material: d.get('material'), party: partyName, clientId: client ? client.id : null, supplierId: seller ? seller.id : null,
          quantity, unit: d.get('unit'), unitPrice,
          payment: keep('payment', rec.payment), invoice: keep('invoice', rec.invoice), notes: d.get('notes').trim(),
        };
        // A sale to a registered client leaves from this branch to the client's address: that is its route.
        if (type === 'salida') { const hit = pickedSource(); Object.assign(record, { supplierId: hit ? hit[0].id : null, supplierName: hit ? hit[0].name : '', unitCost: unitCostNow() }); }
        if (type === 'salida') Object.assign(record, client ? { origin: from, dest: client.city || '', address: clientAddress(client) } : { origin: rec.origin || '', dest: rec.dest || '', address: rec.address || '' });
        // "Guardar y Factura": the invoice is generated from the sale and stored as its Factura (replacing a chosen file).
        const invoicing = e.submitter && e.submitter.value === 'invoice';
        if (invoicing) record.invoice = buildInvoice(record, client ? { ...client, address: clientAddress(client) } : null);
        const big = [record.payment, record.invoice].find(file => file && file.size > MAX_FILE_MB * 1048576);
        if (big) return fail(`"${big.name}" pesa más de ${MAX_FILE_MB} MB. Elige un archivo más ligero.`);
        try { if (created) await saveClient(created); await saveMovement(record); } catch { return fail('No se pudo guardar. Revisa el espacio disponible del navegador e inténtalo de nuevo.'); }
        if (invoicing) openFile(record.invoice);
        await reload();
      } },
        h('div', { class: 'section__title' }, `${rec.id ? k.edit : k.add} · ${rec.folio || nextFolio()}`),
        h('div', { class: 'form__grid', oninput: updateTotal, onchange: e => { const name = e.target.name; if (name === 'material' && source) listSources(); if (name === 'material' || name === 'unit') suggest(true); updateTotal(); } },
          label('Fecha', input({ type: 'date', name: 'date', value: rec.date || today(), required: true })),
          label('Materia prima', materialSelect),
          party,
          ...(source ? [label('Proveedor del material', [source, h('span', { class: 'lbl__hint' }, 'Quién lo surte. Se propone el más barato que lo vende.')], 'span2'),
            h('div', { class: 'lbl' }, 'Costo del proveedor', sourceCost), h('div', { class: 'lbl' }, 'Profit de la salida', gain)] : []),
          label('Cantidad', amountInput({ class: 'input', name: 'quantity', value: rec.quantity ?? '', placeholder: '0', required: true }, 3)),
          label('Unidad', h('select', { class: 'input', name: 'unit' }, UNITS.map(u => h('option', { value: u, selected: u === rec.unit }, u)))),
          label('Precio por unidad (MXN)', [price, priceHint]),
          h('div', { class: 'lbl' }, 'Total', total),
          fileField('Comprobante de pago', 'payment', rec.payment),
          fileField('Factura', 'invoice', rec.invoice),
          label('Notas', input({ name: 'notes', value: rec.notes || '', placeholder: 'Opcional' }), 'span2'),
        ),
        error,
        h('div', { class: 'toolbar' }, h('button', { class: 'btn-primary', type: 'submit' }, 'Guardar'),
          type === 'salida' ? h('button', { class: 'btn-success', type: 'submit', value: 'invoice', title: 'Guarda la salida, genera su factura y la abre' }, 'Guardar y Factura') : null,
          h('button', { class: 'btn-small', type: 'button', onclick: () => { editing = null; draw(); } }, 'Cancelar')),
      );
      listMaterials(supplier && supplier.current());
      if (source) listSources(rec.supplierId || undefined);
      suggest(false); updateTotal();
      return f;
    };

    const fileCell = (file, text) => file ? h('button', { class: 'link-btn', title: file.name, onclick: () => openFile(file) }, text) : badge('Pendiente');
    const partyCell = r => type === 'salida' && r.dest ? [h('div', null, r.party), h('div', { class: 'item__sub', title: r.address || null }, `${r.origin} → ${r.dest}`)] : r.party;
    // A sale also shows the supplier the material came from with its cost, and what the sale left.
    const materialCell = r => [h('div', { class: 'table__strong' }, r.material), type === 'salida' && r.supplierName ? h('div', { class: 'item__sub' }, `${r.supplierName}${r.unitCost != null ? ` · costo ${unitMoney(r.unitCost)}` : ''}`) : null];
    const totalCell = r => { const profit = type === 'salida' && r.unitCost != null ? amount(r) - r.quantity * r.unitCost : null;
      return [h('div', { class: 'table__strong' }, money(amount(r))), profit == null ? null : h('div', { class: 'item__sub ' + (profit < 0 ? 'is-loss' : 'is-gain') }, h('span', { class: 'money__value' }, `Profit ${money(profit)}`))]; };
    const table = rows => h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Folio', 'Fecha', 'Materia prima', KIND[type].party, 'Cantidad', 'Precio unit.', 'Total', 'Pago', 'Factura', ''].map(t => h('th', null, t)))),
      h('tbody', null, rows.map(r => h('tr', null,
        h('td', { class: 'table__strong' }, r.folio), h('td', null, showDate(r.date)), h('td', null, materialCell(r)), h('td', null, partyCell(r)),
        h('td', null, `${r.quantity.toLocaleString('es-MX')} ${r.unit}`), h('td', null, unitMoney(r.unitPrice)), h('td', null, totalCell(r)),
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
