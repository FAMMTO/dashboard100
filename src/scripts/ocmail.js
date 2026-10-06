// The e-mail a purchase order (OC) is sent to its supplier with: a template the user can edit in Configuración,
// filled in with the order's data. There is no mail server yet, so "sending" opens the user's own mail program
// with the message ready (a mailto: link); to send it from the app itself, replace sendMail() with a call to a
// backend that talks to a mail service.

// What can be written in the template, between braces, and what each one becomes.
// Each is [name, what it stands for, the label shown on its box in the editor].
export const PLACEHOLDERS = [
  ['proveedor', 'Nombre del proveedor', 'Proveedor'], ['contacto', 'Persona de contacto (o el nombre del proveedor)', 'Contacto'], ['material', 'Materia prima', 'Material'],
  ['cantidad', 'Cantidad solicitada', 'Cantidad'], ['unidad', 'Unidad (kg, toneladas…)', 'Unidad'], ['precio', 'Precio por unidad', 'Precio'], ['total', 'Importe total', 'Total'],
  ['folio', 'Folio de la OC', 'Folio'], ['fecha', 'Fecha de la orden', 'Fecha'], ['sucursal', 'Sucursal donde se entrega', 'Sucursal'], ['notas', 'Notas de la orden', 'Notas'],
  ['usuario', 'Quien envía', 'Quien envía'], ['empresa', 'Nombre de la empresa', 'Empresa'],
];
export const PLACEHOLDER_LABELS = Object.fromEntries(PLACEHOLDERS.map(([name, , label]) => [name, label]));

export const DEFAULT_TEMPLATE = {
  company: 'DASH100', sender: 'Alex Chen',
  subject: 'Orden de compra {folio} · {material}',
  body: `Hola {contacto}:

Por medio de este correo solicitamos el siguiente material:

• Material: {material}
• Cantidad: {cantidad} {unidad}
• Precio acordado: {precio}
• Total: {total}

Entrega en: sucursal {sucursal}
Fecha de la orden: {fecha}
Folio: {folio}
Notas: {notas}

Agradecemos confirmar disponibilidad y fecha de entrega respondiendo a este correo.

Saludos,
{usuario}
{empresa}`,
};

const KEY = 'd100-oc-template';
/** The template in use: the one saved in this browser, or the default. */
export function getTemplate() {
  try { return { ...DEFAULT_TEMPLATE, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT_TEMPLATE }; }
}
export function saveTemplate(template) {
  try { localStorage.setItem(KEY, JSON.stringify(template)); } catch {}
}
export function resetTemplate() {
  try { localStorage.removeItem(KEY); } catch {}
}

/**
 * Replaces every {placeholder} of a text with its value. A line whose placeholders all turn out empty is left out
 * (so "Notas: {notas}" disappears when the order has no notes); unknown placeholders are kept as written.
 */
export function fillTemplate(text, values) {
  return text.split('\n').map(line => {
    const used = [...line.matchAll(/\{(\w+)\}/g)].map(m => m[1]).filter(name => name in values);
    if (used.length && used.every(name => values[name] === '' || values[name] == null)) return null;
    return line.replace(/\{(\w+)\}/g, (whole, name) => name in values ? values[name] ?? '' : whole);
  }).filter(line => line !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const isEmail = text => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(text || '').trim());

/** Hands a message to the user's mail program, ready to be sent. */
export function sendMail({ to, subject, body }) {
  const link = document.createElement('a');
  link.href = `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  link.click();
}
