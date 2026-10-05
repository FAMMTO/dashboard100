// Small DOM helpers shared by the pages.
export const h = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.flat().filter(k => k != null && k !== false));
  return e;
};

export const badge = status => h('span', { class: 'badge', dataset: { status } }, status);
export const card = (...kids) => h('div', { class: 'card section' }, ...kids);
export const section = (title, ...kids) => h('div', { class: 'card section' }, h('div', { class: 'section__title' }, title), ...kids);
export const stats = pairs => h('div', { class: 'stats' }, pairs.map(([value, label]) => h('div', { class: 'stat' }, h('div', { class: 'stat__value' }, String(value)), h('div', { class: 'stat__label' }, label))));
export const empty = text => h('div', { class: 'module__note' }, text);
// Whole pesos, for order figures (sale, cost, profit).
export const pesos = n => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

// ---- amounts typed by the user: shown with thousands separators (90,000.50) while they are written ----
/** The number in a text written with separators ("90,000.5" → 90000.5); NaN if it is empty or not a number. */
export const parseAmount = text => { const clean = String(text ?? '').replace(/,/g, '').trim(); return clean === '' ? NaN : Number(clean); };
/** Groups the digits of what was typed, keeping at most `decimals` decimals and dropping anything that is not a number. */
export function groupAmount(text, decimals = 2) {
  const clean = String(text ?? '').replace(/[^\d.]/g, ''), dot = clean.indexOf('.');
  const whole = (dot < 0 ? clean : clean.slice(0, dot)).replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (dot < 0 || !decimals) return whole;
  return (whole || '0') + '.' + clean.slice(dot + 1).replace(/\./g, '').slice(0, decimals);
}
/** A text field for an amount. It regroups the digits on every keystroke and keeps the caret where the user was typing. */
export function amountInput(attrs, decimals = 2) {
  const field = h('input', { type: 'text', inputmode: decimals ? 'decimal' : 'numeric', autocomplete: 'off', ...attrs, value: attrs.value == null || attrs.value === '' ? '' : groupAmount(attrs.value, decimals) });
  field.addEventListener('input', () => {
    const typed = field.value.slice(0, field.selectionStart).replace(/[^\d.]/g, '').length; // digits and dot before the caret
    field.value = groupAmount(field.value, decimals);
    let at = 0;
    for (let seen = 0; at < field.value.length && seen < typed; at++) if (field.value[at] !== ',') seen++;
    field.setSelectionRange(at, at);
  });
  return field;
}

// ---- form controls and figures shared by the pages that keep records (Costos, Clientes, Catálogo) ----
export const label = (text, control, cls) => h('label', { class: 'lbl' + (cls ? ' ' + cls : '') }, text, control);
export const input = attrs => h('input', { class: 'input', ...attrs });
/** A price per unit: pesos with cents, and up to 4 decimals when it needs them (a kilo of cardboard costs $2.85, or $1.2345). */
export const unitMoney = n => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 4 });
/** Driving time: 9.8 → "9 h 48 min". */
export const driveTime = hours => { const total = Math.round(hours * 60); return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')} min`; };
