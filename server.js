require('dotenv').config();

const crypto = require('node:crypto');
const fs     = require('node:fs');
const path   = require('node:path');
const express = require('express');
const multer  = require('multer');

const { printTicket } = require('./printerService');
const db = require('./db');

const PORT = process.env.PORT || 8765;

const ADMIN_USER      = process.env.ADMIN_USER  || 'admin';
const ADMIN_PASS      = process.env.ADMIN_PASS  || 'admin';
const SESSION_SECRET  = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const ADMIN_OPEN_LOGIN = process.env.ADMIN_OPEN_LOGIN === 'true';
const FORCE_OPEN       = process.env.FORCE_OPEN === 'true';

// En Vercel el disco es de solo lectura y no se puede correr WhatsApp Web.
const IS_VERCEL  = !!process.env.VERCEL;
const ASSETS_DIR = path.join(__dirname, 'public', 'assets');

const app = express();

// WhatsApp Web deshabilitado (requiere servidor local con puppeteer)

app.use(express.json({ limit: '50kb' }));

// index.html/script.js/admin.js se sirven sin cache para evitar versiones viejas
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// ── helpers ──────────────────────────────────────────────

function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const ALLOWED_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ASSETS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = ALLOWED_IMAGE_EXT.has(ext) ? ext : '.png';
      cb(null, `img-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ALLOWED_IMAGE_EXT.has(ext));
  },
});

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isOpenNow(brand) {
  if (FORCE_OPEN) return true;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: (brand && brand.timezone) || 'America/Argentina/Buenos_Aires',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hh = parts.find(p => p.type === 'hour').value;
  const mm = parts.find(p => p.type === 'minute').value;
  const current = `${hh === '24' ? '00' : hh}:${mm}`;
  const weekday = WEEKDAYS.indexOf(parts.find(p => p.type === 'weekday').value);

  const weekly = brand && brand.weeklyHours;
  const ranges = weekly ? weekly[String(weekday)] : brand && brand.openRanges;
  if (!Array.isArray(ranges)) return !weekly;
  if (ranges.length === 0) return !weekly;

  return ranges.some(([start, end]) => current >= start && current < end);
}

function findDeliveryZone(brand, zoneName) {
  const zones = (brand && brand.deliveryZones) || [];
  return zones.find(z => z.name === zoneName) || null;
}

function buildCatalog(menu) {
  const catalog = new Map();
  for (const cat of menu.categories) {
    for (const item of cat.items) {
      catalog.set(item.id, { ...item, categoryKey: cat.key, customizable: cat.customizable });
    }
  }
  return catalog;
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  });
  return out;
}

function createSessionToken() {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_MAX_AGE_MS });
  const body = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot === -1) return false;
  const body = token.slice(0, dot);
  const sig  = token.slice(dot + 1);
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (!timingSafeEqualStr(sig, expectedSig)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function setSessionCookie(req, res) {
  const token  = createSessionToken();
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie',
    `session=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}; SameSite=Lax${secure ? '; Secure' : ''}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

function requireSession(req, res, next) {
  const cookies = parseCookies(req);
  if (verifySessionToken(cookies.session)) return next();
  return res.status(401).json({ ok: false, error: 'No autenticado.' });
}

// very small fixed-window rate limiter, keyed by IP
const rateBuckets = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      rateBuckets.set(key, { start: now, count: 1 });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ ok: false, error: 'Demasiados pedidos, esperá un momento.' });
    }
    next();
  };
}

const sseClients = new Set();
function broadcastOrderUpdate() {
  for (const res of sseClients) {
    res.write('event: order_update\ndata: update\n\n');
  }
}

// ── public API ───────────────────────────────────────────

app.get('/api/menu', async (req, res) => {
  try {
    const menu = await db.loadMenu();
    menu.brand.isOpen = isOpenNow(menu.brand);
    res.json(menu);
  } catch (err) {
    console.error('GET /api/menu:', err);
    res.status(500).json({ ok: false, error: 'Error al cargar el menú.' });
  }
});

app.get('/api/config', (req, res) => {
  res.json({ googleMapsKey: process.env.GOOGLE_MAPS_KEY || '' });
});

app.post('/api/orders', rateLimit(10, 60_000), async (req, res) => {
  try {
    const body = req.body || {};
    const menu = await db.loadMenu();

    if (!isOpenNow(menu.brand)) {
      return res.status(409).json({ ok: false, error: 'Estamos cerrados en este momento. Probá más tarde.' });
    }

    const catalog = buildCatalog(menu);
    const maxExtra = menu.customizationOptions.extraGroups
      .flatMap(g => g.options)
      .reduce((sum, e) => sum + e.price, 0);

    const name = String(body.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ ok: false, error: 'Falta el nombre.' });

    const mode = body.mode === 'delivery' ? 'delivery' : 'retiro';

    const address = String(body.address || '').trim().slice(0, 200);
    if (mode === 'delivery' && !address) {
      return res.status(400).json({ ok: false, error: 'Falta la dirección de entrega.' });
    }

    let zone = '';
    let deliveryFee = 0;
    const hasZones = Array.isArray(menu.brand.deliveryZones) && menu.brand.deliveryZones.length > 0;
    if (mode === 'delivery' && hasZones) {
      const zoneName = String(body.zone || '').trim();
      if (zoneName === 'otra') {
        zone = 'Otra zona (envío a coordinar)';
      } else {
        const found = findDeliveryZone(menu.brand, zoneName);
        if (!found) return res.status(400).json({ ok: false, error: 'Elegí tu barrio para el envío.' });
        zone = found.name;
        deliveryFee = found.fee;
      }
    }

    const payment  = body.payment === 'efectivo' ? 'efectivo' : 'transferencia';
    const cashNote = String(body.cashNote || '').trim().slice(0, 100);

    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 30) {
      return res.status(400).json({ ok: false, error: 'El pedido no tiene productos válidos.' });
    }

    const items = [];
    for (const raw of body.items) {
      const catalogItem = catalog.get(String(raw.id));
      if (!catalogItem) {
        return res.status(400).json({ ok: false, error: `Producto desconocido: ${raw.id}` });
      }
      const price    = Number(raw.price);
      const minPrice = catalogItem.price;
      const maxPrice = catalogItem.customizable ? catalogItem.price + maxExtra : catalogItem.price;
      if (!Number.isFinite(price) || price < minPrice || price > maxPrice) {
        return res.status(400).json({ ok: false, error: `Precio inválido para ${catalogItem.name}.` });
      }
      const qty = Number.isInteger(raw.qty) && raw.qty > 0 && raw.qty <= 20 ? raw.qty : 1;

      if (typeof catalogItem.stock === 'number') {
        if (catalogItem.stock < qty) {
          return res.status(400).json({ ok: false, error: `Sin stock suficiente para: ${catalogItem.name}. Quedan ${catalogItem.stock}.` });
        }
      }

      items.push({
        id:     catalogItem.id,
        name:   catalogItem.name,
        price,
        qty,
        custom: String(raw.custom || '').trim().slice(0, 200),
      });
    }

    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const total    = subtotal + deliveryFee;

    const order = {
      id:          crypto.randomUUID(),
      createdAt:   new Date().toISOString(),
      status:      'nuevo',
      name,
      phone:       String(body.phone || '').trim().slice(0, 20),
      mode,
      address:     mode === 'delivery' ? address : '',
      zone,
      deliveryFee,
      payment,
      cashNote:    payment === 'efectivo' ? cashNote : '',
      items,
      total,
    };

    // Descontar stock en el menú si corresponde
    let stockChanged = false;
    for (const item of items) {
      const catItem = catalog.get(item.id);
      if (catItem && typeof catItem.stock === 'number') {
        const category = menu.categories.find(c => c.key === catItem.categoryKey);
        if (category) {
          const menuItem = category.items.find(i => i.id === item.id);
          if (menuItem) {
            menuItem.stock -= item.qty;
            stockChanged = true;
          }
        }
      }
    }

    if (stockChanged) await db.saveMenu(menu);
    await db.insertOrder(order);

    broadcastOrderUpdate();
    printTicket(order);

    res.status(201).json({ ok: true, orderId: order.id, total });
  } catch (err) {
    console.error('POST /api/orders:', err);
    res.status(500).json({ ok: false, error: 'Error interno al procesar el pedido.' });
  }
});

// ── login ────────────────────────────────────────────────

app.post('/api/admin/login', rateLimit(10, 60_000), (req, res) => {
  const body = req.body || {};
  const user = String(body.username || '');
  const pass = String(body.password || '');

  const valid = ADMIN_OPEN_LOGIN
    ? user.length > 0 && pass.length > 0
    : timingSafeEqualStr(user, ADMIN_USER) && timingSafeEqualStr(pass, ADMIN_PASS);

  if (valid) {
    setSessionCookie(req, res);
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos.' });
});

app.post('/api/admin/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/admin/session', requireSession, (req, res) => {
  res.json({ ok: true });
});

// ── admin API (requiere sesión) ─────────────────────────

app.get('/api/orders/stream', requireSession, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  req.on('close', () => {
    sseClients.delete(res);
  });
});

app.get('/api/orders', requireSession, async (req, res) => {
  try {
    const orders = await db.loadOrders();
    res.json(orders);
  } catch (err) {
    console.error('GET /api/orders:', err);
    res.status(500).json({ ok: false, error: 'Error al cargar los pedidos.' });
  }
});

app.patch('/api/orders/:id', requireSession, async (req, res) => {
  try {
    const order = await db.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });

    const newStatus = req.body && req.body.status;
    if (!['nuevo', 'en preparación', 'listo', 'entregado'].includes(newStatus)) {
      return res.status(400).json({ ok: false, error: 'Estado inválido.' });
    }
    const oldStatus = order.status;
    await db.updateOrderStatus(order.id, newStatus);
    order.status = newStatus;
    broadcastOrderUpdate();
    res.json({ ok: true, order });
  } catch (err) {
    console.error('PATCH /api/orders/:id:', err);
    res.status(500).json({ ok: false, error: 'Error al actualizar el pedido.' });
  }
});

app.delete('/api/orders/:id', requireSession, async (req, res) => {
  try {
    const deleted = await db.deleteOrder(req.params.id);
    if (!deleted) return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
    broadcastOrderUpdate();
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/orders/:id:', err);
    res.status(500).json({ ok: false, error: 'Error al eliminar el pedido.' });
  }
});

function localDateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

app.get('/api/admin/stats', requireSession, async (req, res) => {
  try {
    const menu     = await db.loadMenu();
    const timezone = (menu.brand && menu.brand.timezone) || 'America/Argentina/Buenos_Aires';
    const orders   = (await db.loadOrders()).filter(o => o.status !== 'cancelado');

    const now           = new Date();
    const todayKey      = localDateKey(now, timezone);
    const yesterdayKey  = localDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), timezone);
    const thisMonthKey  = todayKey.slice(0, 7);
    const lastMonthDate = new Date(now);
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonthKey  = localDateKey(lastMonthDate, timezone).slice(0, 7);

    const byDay  = new Map();
    const totals = {
      today:     { revenue: 0, orders: 0 },
      yesterday: { revenue: 0, orders: 0 },
      thisMonth: { revenue: 0, orders: 0 },
      lastMonth: { revenue: 0, orders: 0 },
    };

    for (const order of orders) {
      const dateKey  = localDateKey(new Date(order.createdAt), timezone);
      const monthKey = dateKey.slice(0, 7);

      const day = byDay.get(dateKey) || { revenue: 0, orders: 0 };
      day.revenue += order.total;
      day.orders  += 1;
      byDay.set(dateKey, day);

      if (dateKey === todayKey)      { totals.today.revenue     += order.total; totals.today.orders++; }
      if (dateKey === yesterdayKey)  { totals.yesterday.revenue += order.total; totals.yesterday.orders++; }
      if (monthKey === thisMonthKey) { totals.thisMonth.revenue += order.total; totals.thisMonth.orders++; }
      if (monthKey === lastMonthKey) { totals.lastMonth.revenue += order.total; totals.lastMonth.orders++; }
    }

    const series = [];
    for (let i = 29; i >= 0; i--) {
      const key = localDateKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000), timezone);
      const day = byDay.get(key);
      series.push({ date: key, revenue: day ? day.revenue : 0, orders: day ? day.orders : 0 });
    }

    res.json({ ...totals, series });
  } catch (err) {
    console.error('GET /api/admin/stats:', err);
    res.status(500).json({ ok: false, error: 'Error al cargar estadísticas.' });
  }
});

// ── admin: gestión del menú (categorías, productos, imágenes) ──

app.get('/api/admin/whatsapp/status', requireSession, (req, res) => {
  // WhatsApp Web deshabilitado
  res.json({ available: false, connected: false, qr: '' });
});

app.get('/api/admin/assets', requireSession, (req, res) => {
  const files = fs.readdirSync(ASSETS_DIR).filter(f => ALLOWED_IMAGE_EXT.has(path.extname(f).toLowerCase()));
  res.json(files.map(f => 'assets/' + f));
});

app.post('/api/admin/upload', requireSession, (req, res) => {
  if (IS_VERCEL) {
    return res.status(400).json({ ok: false, error: 'En la demo online no se pueden subir fotos. Elegí una de las existentes.' });
  }
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, error: 'No se pudo subir la imagen (formato o tamaño inválido, máx. 5MB).' });
    if (!req.file) return res.status(400).json({ ok: false, error: 'Falta el archivo de imagen.' });
    res.json({ ok: true, path: 'assets/' + req.file.filename });
  });
});

function readItemFields(body, { partial = false } = {}) {
  const fields = {};
  const errors = [];

  if (!partial || body.name !== undefined) {
    fields.name = String(body.name || '').trim().slice(0, 60);
    if (!fields.name) errors.push('Falta el nombre del producto.');
  }
  if (!partial || body.price !== undefined) {
    fields.price = Number(body.price);
    if (!Number.isFinite(fields.price) || fields.price < 0 || fields.price > 10_000_000) {
      errors.push('Precio inválido.');
    }
  }
  if (!partial || body.desc !== undefined) {
    fields.desc = String(body.desc || '').trim().slice(0, 500);
  }
  if (!partial || body.ingredients !== undefined) {
    if (Array.isArray(body.ingredients)) {
      fields.ingredients = body.ingredients.map(s => String(s).trim().slice(0, 60)).filter(Boolean).slice(0, 20);
    } else if (typeof body.ingredients === 'string') {
      fields.ingredients = body.ingredients.split(',').map(s => s.trim().slice(0, 60)).filter(Boolean).slice(0, 20);
    }
  }
  if (!partial || body.stock !== undefined) {
    if (body.stock === null || body.stock === undefined || body.stock === '' || Number.isNaN(Number(body.stock))) {
      fields.stock = null;
    } else {
      fields.stock = Number(body.stock);
      if (!Number.isInteger(fields.stock) || fields.stock < 0 || fields.stock > 100_000) {
        errors.push('Stock inválido.');
      }
    }
  }
  if (!partial || body.img !== undefined) {
    fields.img = String(body.img || '').trim().slice(0, 200);
    if (!fields.img) fields.img = 'assets/mia-logo.png';
  }

  return { fields, errors };
}

app.post('/api/items', requireSession, async (req, res) => {
  try {
    const menu = await db.loadMenu();
    const category = menu.categories.find(c => c.key === req.body.categoryKey);
    if (!category) return res.status(400).json({ ok: false, error: 'Categoría inválida.' });

    const { fields, errors } = readItemFields(req.body);
    if (errors.length) return res.status(400).json({ ok: false, error: errors.join(' ') });

    let id = slugify(fields.name) || 'producto';
    const allIds = new Set(menu.categories.flatMap(c => c.items.map(i => i.id)));
    let suffix = 2;
    let finalId = id;
    while (allIds.has(finalId)) { finalId = `${id}-${suffix++}`; }

    const item = { id: finalId, ...fields };
    category.items.push(item);
    await db.saveMenu(menu);
    res.status(201).json({ ok: true, item, categoryKey: category.key });
  } catch (err) {
    console.error('POST /api/items:', err);
    res.status(500).json({ ok: false, error: 'Error al crear el producto.' });
  }
});

async function handleUpdateItem(req, res) {
  try {
    const menu = await db.loadMenu();
    let currentCategory = null;
    let item = null;
    for (const cat of menu.categories) {
      const found = cat.items.find(i => i.id === req.params.id);
      if (found) { currentCategory = cat; item = found; break; }
    }
    if (!item) return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });

    const { fields, errors } = readItemFields(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ ok: false, error: errors.join(' ') });
    Object.assign(item, fields);

    if (req.body.categoryKey && req.body.categoryKey !== currentCategory.key) {
      const targetCategory = menu.categories.find(c => c.key === req.body.categoryKey);
      if (!targetCategory) return res.status(400).json({ ok: false, error: 'Categoría destino inválida.' });
      currentCategory.items = currentCategory.items.filter(i => i.id !== item.id);
      targetCategory.items.push(item);
    }

    await db.saveMenu(menu);
    res.json({ ok: true, item });
  } catch (err) {
    console.error('PUT/PATCH /api/items/:id:', err);
    res.status(500).json({ ok: false, error: 'Error al actualizar el producto.' });
  }
}

app.put('/api/items/:id',   requireSession, handleUpdateItem);
app.patch('/api/items/:id', requireSession, handleUpdateItem);

app.delete('/api/items/:id', requireSession, async (req, res) => {
  try {
    const menu = await db.loadMenu();
    let removed = false;
    for (const cat of menu.categories) {
      const before = cat.items.length;
      cat.items = cat.items.filter(i => i.id !== req.params.id);
      if (cat.items.length !== before) removed = true;
    }
    if (!removed) return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
    await db.saveMenu(menu);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/items/:id:', err);
    res.status(500).json({ ok: false, error: 'Error al eliminar el producto.' });
  }
});

function readCategoryFields(body, { partial = false } = {}) {
  const fields = {};
  const errors = [];

  if (!partial || body.navLabel !== undefined) {
    fields.navLabel = String(body.navLabel || '').trim().slice(0, 40);
    if (!fields.navLabel) errors.push('Falta el nombre de la categoría.');
  }
  if (!partial || body.title !== undefined) {
    fields.title = String(body.title || fields.navLabel || '').trim().slice(0, 60);
  }
  if (!partial || body.subtitle !== undefined) {
    fields.subtitle = String(body.subtitle || '').trim().slice(0, 80);
  }
  if (!partial || body.customizable !== undefined) {
    fields.customizable = Boolean(body.customizable);
  }

  return { fields, errors };
}

app.post('/api/categories', requireSession, async (req, res) => {
  try {
    const menu = await db.loadMenu();
    const { fields, errors } = readCategoryFields(req.body);
    if (errors.length) return res.status(400).json({ ok: false, error: errors.join(' ') });

    let key = slugify(fields.navLabel) || 'categoria';
    let finalKey = key;
    let suffix = 2;
    while (menu.categories.some(c => c.key === finalKey)) { finalKey = `${key}-${suffix++}`; }

    const category = { key: finalKey, ...fields, items: [] };
    menu.categories.push(category);
    await db.saveMenu(menu);
    res.status(201).json({ ok: true, category });
  } catch (err) {
    console.error('POST /api/categories:', err);
    res.status(500).json({ ok: false, error: 'Error al crear la categoría.' });
  }
});

app.put('/api/categories/:key', requireSession, async (req, res) => {
  try {
    const menu = await db.loadMenu();
    const category = menu.categories.find(c => c.key === req.params.key);
    if (!category) return res.status(404).json({ ok: false, error: 'Categoría no encontrada.' });

    const { fields, errors } = readCategoryFields(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ ok: false, error: errors.join(' ') });
    Object.assign(category, fields);

    await db.saveMenu(menu);
    res.json({ ok: true, category });
  } catch (err) {
    console.error('PUT /api/categories/:key:', err);
    res.status(500).json({ ok: false, error: 'Error al actualizar la categoría.' });
  }
});

app.delete('/api/categories/:key', requireSession, async (req, res) => {
  try {
    const menu = await db.loadMenu();
    const idx = menu.categories.findIndex(c => c.key === req.params.key);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Categoría no encontrada.' });

    menu.categories.splice(idx, 1);
    await db.saveMenu(menu);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/categories/:key:', err);
    res.status(500).json({ ok: false, error: 'Error al eliminar la categoría.' });
  }
});

// ── AUTOMATIZACIONES ─────────────────────────────────────

// A las 3:00 los pedidos de días anteriores que quedaron abiertos pasan a "entregado"
if (!IS_VERCEL) setInterval(async () => {
  const now = new Date();
  if (now.getHours() === 3 && now.getMinutes() === 0) {
    const timezone = 'America/Argentina/Buenos_Aires';
    const todayKey = localDateKey(now, timezone);
    try {
      const changed = await db.closeOldOrders(todayKey, timezone);
      if (changed) {
        broadcastOrderUpdate();
        console.log('Limpieza nocturna ejecutada.');
      }
    } catch (err) {
      console.error('Error en limpieza nocturna:', err);
    }
  }
}, 60000);


module.exports = app;

if (!IS_VERCEL) app.listen(PORT, () => {
  console.log(`Mía corriendo en http://localhost:${PORT}`);
  if (ADMIN_PASS === 'admin') {
    console.log('Aviso: estás usando la contraseña de admin por defecto. Configurá ADMIN_USER/ADMIN_PASS en .env');
  }
  if (ADMIN_OPEN_LOGIN) {
    console.log('Aviso: ADMIN_OPEN_LOGIN=true, el login de /admin.html acepta cualquier usuario/contraseña. Sacá esta variable de .env antes de usar el sitio en serio.');
  }
  if (FORCE_OPEN) {
    console.log('Aviso: FORCE_OPEN=true, el local figura Abierto siempre (ignora los horarios). Sacá esta variable de .env antes de usar el sitio en serio.');
  }
});
