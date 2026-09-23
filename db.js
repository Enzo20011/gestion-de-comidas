'use strict';
require('dotenv').config();

const { Pool } = require('pg');

let _pool;

function getPool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });
  }
  return _pool;
}

// ── Menú ─────────────────────────────────────────────────────
// El menú completo se guarda como un único registro JSONB (id = 1).

async function loadMenu() {
  const { rows } = await getPool().query('SELECT data FROM menu WHERE id = 1');
  if (rows.length === 0) throw new Error('El menú no existe en la base de datos. Corré migrate.js primero.');
  return rows[0].data;
}

async function saveMenu(menu) {
  await getPool().query(
    'UPDATE menu SET data = $1 WHERE id = 1',
    [JSON.stringify(menu)],
  );
}

// ── Pedidos ───────────────────────────────────────────────────

function rowToOrder(row) {
  return {
    id: row.id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    status: row.status,
    name: row.name,
    phone: row.phone,
    mode: row.mode,
    address: row.address,
    zone: row.zone,
    deliveryFee: row.delivery_fee,
    payment: row.payment,
    cashNote: row.cash_note,
    items: row.items,   // JSONB → ya llega como objeto JS
    total: row.total,
  };
}

async function loadOrders() {
  const { rows } = await getPool().query(
    'SELECT * FROM orders ORDER BY created_at DESC',
  );
  return rows.map(rowToOrder);
}

async function getOrderById(id) {
  const { rows } = await getPool().query(
    'SELECT * FROM orders WHERE id = $1',
    [id],
  );
  return rows.length > 0 ? rowToOrder(rows[0]) : null;
}

async function insertOrder(order) {
  await getPool().query(
    `INSERT INTO orders
       (id, created_at, status, name, phone, mode, address, zone,
        delivery_fee, payment, cash_note, items, total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      order.id,
      order.createdAt,
      order.status,
      order.name,
      order.phone,
      order.mode,
      order.address,
      order.zone,
      order.deliveryFee,
      order.payment,
      order.cashNote,
      JSON.stringify(order.items),
      order.total,
    ],
  );
}

async function updateOrderStatus(id, status) {
  await getPool().query(
    'UPDATE orders SET status = $1 WHERE id = $2',
    [status, id],
  );
}

async function deleteOrder(id) {
  const { rowCount } = await getPool().query(
    'DELETE FROM orders WHERE id = $1',
    [id],
  );
  return rowCount > 0;
}

// ── Limpieza nocturna ─────────────────────────────────────────

async function closeOldOrders(beforeDateKey, timezone) {
  // Marca como "entregado" todos los pedidos abiertos de días anteriores al dateKey dado.
  // Devuelve true si hubo cambios.
  const { rowCount } = await getPool().query(
    `UPDATE orders
        SET status = 'entregado'
      WHERE status IN ('nuevo','en preparación','listo')
        AND to_char(created_at AT TIME ZONE $1, 'YYYY-MM-DD') < $2`,
    [timezone, beforeDateKey],
  );
  return rowCount > 0;
}

module.exports = {
  getPool,
  loadMenu,
  saveMenu,
  loadOrders,
  getOrderById,
  insertOrder,
  updateOrderStatus,
  deleteOrder,
  closeOldOrders,
};
