const fs = require('node:fs');
const path = require('node:path');

const PRINTS_DIR = process.env.VERCEL
  ? path.join('/tmp', 'mia-prints')
  : path.join(__dirname, 'data', 'prints');
if (!fs.existsSync(PRINTS_DIR)) {
  fs.mkdirSync(PRINTS_DIR, { recursive: true });
}

function printTicket(order) {
  // Cuando tengas la impresora física, conectaremos node-thermal-printer aquí.
  // Por ahora, generamos un archivo de texto con el ticket simulando la impresión.
  
  const date = new Date(order.createdAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  let ticket = `=================================\n`;
  ticket += `   MÍA HAMBURGUESERÍA & CERVECERÍA\n`;
  ticket += `=================================\n`;
  ticket += `Pedido #${order.id.slice(0, 8)}\n`;
  ticket += `Fecha: ${date}\n`;
  ticket += `Cliente: ${order.name}\n`;
  if (order.phone) ticket += `Teléfono: ${order.phone}\n`;
  
  if (order.mode === 'delivery') {
    ticket += `Tipo: DELIVERY\n`;
    if (order.zone) ticket += `Barrio: ${order.zone}\n`;
    ticket += `Dirección: ${order.address}\n`;
  } else {
    ticket += `Tipo: RETIRO EN LOCAL\n`;
  }
  
  ticket += `Pago: ${order.payment === 'efectivo' ? 'Efectivo' : 'Transferencia'}\n`;
  if (order.cashNote) ticket += `Aclara pago con: ${order.cashNote}\n`;
  ticket += `---------------------------------\n`;
  
  for (const item of order.items) {
    ticket += `${item.qty}x ${item.name} - $${item.price * item.qty}\n`;
    if (item.custom) {
      ticket += `   * ${item.custom}\n`;
    }
  }
  ticket += `---------------------------------\n`;
  if (order.deliveryFee) ticket += `Envío: $${order.deliveryFee}\n`;
  ticket += `TOTAL: $${order.total}\n`;
  ticket += `=================================\n`;

  const fileName = `ticket_${order.id.slice(0, 8)}.txt`;
  fs.writeFileSync(path.join(PRINTS_DIR, fileName), ticket, 'utf8');
  console.log(`[Impresora] Ticket generado para el pedido ${order.id.slice(0, 8)} (${fileName})`);
}

module.exports = { printTicket };
