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
