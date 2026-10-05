// Invoice of a sale ("Guardar y Factura" in Pedidos): a self-contained page that can be printed or saved as PDF.
// It is an internal document, not a fiscal one: a CFDI valid before the SAT has to be stamped by a PAC, which
// this app does not do yet. Prices are taken as before tax and IVA is added on top.
const IVA = 0.16;
// Who issues the invoices. Replace with the company's real fiscal data.
const ISSUER = { name: 'DASH100 Logistics, S.A. de C.V.', rfc: 'DLO150101AB1', address: 'Av. Industrial 100, Parque Logístico, Monterrey, N.L.', phone: '81 1000 2000' };

const money = n => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const longDate = iso => new Date(iso + 'T00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * @param {object} sale the movement being saved ({ folio, date, material, party, quantity, unit, unitPrice, notes })
 * @param {object | null} client its saved client, if any ({ name, rfc, address, contact, phone, email })
 * @returns {File} the invoice, ready to be stored as the sale's `invoice`
 */
export function buildInvoice(sale, client) {
  const subtotal = sale.quantity * sale.unitPrice, tax = subtotal * IVA, folio = `F-${sale.folio}`, c = client || { name: sale.party };
  const line = (label, value) => value ? `<div><span>${label}</span>${esc(value)}</div>` : '';
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Factura ${esc(folio)}</title>
<style>
  body { margin: 0; padding: 32px 16px; background: #e6ecf5; color: #0f1b33; font: 14px/1.5 system-ui, 'Segoe UI', sans-serif; }
  .sheet { max-width: 780px; margin: 0 auto; padding: 40px; background: #fff; border-radius: 14px; box-shadow: 0 14px 40px rgba(30, 50, 100, .12); }
  header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 20px; border-bottom: 3px solid #2457e6; }
  h1 { margin: 0; font-size: 26px; letter-spacing: -.3px; } h2 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .6px; color: #6b778c; }
  .brand { font-size: 20px; font-weight: 800; color: #2457e6; } .muted, span { color: #6b778c; } .right { text-align: right; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; } .parties span { display: inline-block; min-width: 74px; }
  table { width: 100%; border-collapse: collapse; } th { padding: 8px 10px; text-align: left; font-size: 12px; background: #f3f6fb; } td { padding: 12px 10px; border-bottom: 1px solid #dfe5ee; }
  th:nth-child(n+2), td:nth-child(n+2) { text-align: right; white-space: nowrap; }
  .totals { width: 280px; margin: 18px 0 0 auto; } .totals div { display: flex; justify-content: space-between; padding: 5px 10px; }
  .totals .total { margin-top: 6px; padding: 10px; border-radius: 8px; background: #2457e6; color: #fff; font-size: 17px; font-weight: 800; } .totals .total span { color: #fff; }
  .note { margin-top: 28px; padding: 12px 14px; border-radius: 8px; background: #fff3d6; color: #8a5a00; font-size: 12px; }
  button { margin: 0 auto 16px; display: block; padding: 10px 18px; border: 0; border-radius: 9px; background: #2457e6; color: #fff; font: 700 13px system-ui, sans-serif; cursor: pointer; }
  @media print { body { padding: 0; background: #fff; } .sheet { box-shadow: none; border-radius: 0; } button { display: none; } }
</style></head><body>
<button onclick="print()">Imprimir o guardar como PDF</button>
<div class="sheet">
  <header>
    <div><div class="brand">DASH100</div><div>${esc(ISSUER.name)}</div><div class="muted">RFC ${esc(ISSUER.rfc)}<br>${esc(ISSUER.address)}<br>Tel. ${esc(ISSUER.phone)}</div></div>
    <div class="right"><h1>Factura</h1><div><span>Folio</span> <strong>${esc(folio)}</strong></div><div><span>Fecha</span> ${esc(longDate(sale.date))}</div><div><span>Salida</span> ${esc(sale.folio)}</div></div>
  </header>
  <div class="parties">
    <div><h2>Cliente</h2><strong>${esc(c.name)}</strong>${line('RFC', c.rfc)}${line('Dirección', c.address)}${line('Contacto', c.contact)}${line('Teléfono', c.phone)}${line('Correo', c.email)}</div>
    <div><h2>Condiciones</h2><div><span>Moneda</span>MXN · Peso mexicano</div><div><span>IVA</span>${IVA * 100}%</div>${line('Notas', sale.notes)}</div>
  </div>
  <table>
    <thead><tr><th>Concepto</th><th>Cantidad</th><th>Precio unitario</th><th>Importe</th></tr></thead>
    <tbody><tr><td>${esc(sale.material)}</td><td>${esc(sale.quantity.toLocaleString('es-MX'))} ${esc(sale.unit)}</td><td>${money(sale.unitPrice)}</td><td>${money(subtotal)}</td></tr></tbody>
  </table>
  <div class="totals"><div><span>Subtotal</span>${money(subtotal)}</div><div><span>IVA ${IVA * 100}%</span>${money(tax)}</div><div class="total"><span>Total</span>${money(subtotal + tax)}</div></div>
  <div class="note">Documento interno sin validez fiscal: no es un CFDI timbrado ante el SAT.</div>
</div></body></html>`;
  return new File([html], `factura-${folio}.html`, { type: 'text/html' });
}
