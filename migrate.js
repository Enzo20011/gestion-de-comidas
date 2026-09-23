'use strict';
/**
 * migrate.js — Correr UNA sola vez para:
 *   1. Crear las tablas en Neon si no existen.
 *   2. Importar el menú desde data/menu.json.
 *   3. Importar los pedidos desde data/orders.json (si existen).
 *
 * Uso: node migrate.js
 */
require('dotenv').config();

const fs   = require('node:fs');
const path = require('node:path');
const { getPool } = require('./db');

const MENU_PATH   = path.join(__dirname, 'data', 'menu.json');
const ORDERS_PATH = path.join(__dirname, 'data', 'orders.json');

async function main() {
  const pool = getPool();

  console.log('📦 Conectando a Neon...');

  // ── 1. Crear tablas ───────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS menu (
      id   SERIAL PRIMARY KEY,
      data JSONB  NOT NULL
    );
  `);
  console.log('✅ Tabla menu OK');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id           TEXT        PRIMARY KEY,
      created_at   TIMESTAMPTZ NOT NULL,
      status       TEXT        NOT NULL DEFAULT 'nuevo',
      name         TEXT,
      phone        TEXT,
      mode         TEXT,
      address      TEXT,
      zone         TEXT,
      delivery_fee INTEGER     DEFAULT 0,
      payment      TEXT,
      cash_note    TEXT,
      items        JSONB       NOT NULL,
      total        INTEGER     NOT NULL
    );
  `);
  console.log('✅ Tabla orders OK');

  // ── 2. Importar menú ─────────────────────────────────────────
  const menuData = JSON.parse(fs.readFileSync(MENU_PATH, 'utf8'));
  const { rows: existing } = await pool.query('SELECT id FROM menu WHERE id = 1');
  if (existing.length === 0) {
    await pool.query('INSERT INTO menu (id, data) VALUES (1, $1)', [JSON.stringify(menuData)]);
    console.log('✅ Menú importado desde menu.json');
  } else {
    console.log('ℹ️  El menú ya existe en Neon. No se sobreescribió. (Borrá la fila id=1 si querés reimportar)');
  }

  // ── 3. Importar pedidos (si hay) ──────────────────────────────
  let orders = [];
  if (fs.existsSync(ORDERS_PATH)) {
    try { orders = JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8')); } catch { orders = []; }
  }

  if (orders.length === 0) {
    console.log('ℹ️  No hay pedidos locales para importar.');
  } else {
    let imported = 0;
    let skipped  = 0;
    for (const o of orders) {
      const { rows: exists } = await pool.query('SELECT id FROM orders WHERE id = $1', [o.id]);
      if (exists.length > 0) { skipped++; continue; }
      await pool.query(
        `INSERT INTO orders
           (id, created_at, status, name, phone, mode, address, zone,
            delivery_fee, payment, cash_note, items, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          o.id, o.createdAt, o.status,
          o.name, o.phone, o.mode, o.address || '', o.zone || '',
          o.deliveryFee || 0, o.payment, o.cashNote || '',
          JSON.stringify(o.items), o.total,
        ],
      );
      imported++;
    }
    console.log(`✅ Pedidos: ${imported} importados, ${skipped} ya existían.`);
  }

  console.log('\n🎉 Migración completada. Ya podés usar Neon como backend.');
  await pool.end();
}

main().catch(err => {
  console.error('❌ Error en migración:', err);
  process.exit(1);
});
