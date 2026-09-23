const STATUS_OPTIONS = ['nuevo', 'en preparación', 'listo', 'entregado'];

let currentMenu = null;
let allOrders = [];
let editingCategoryKey = null; // null = creating new
let editingItem = null;        // { id, categoryKey } or null = creating new
let pendingImgPath = '';
let statsData = null;
let chartRange = 14;
let dashboardLoaded = false;

let toastTimer = null;
function showToast(message, isError) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── detectar si esta pestaña quedó con una versión vieja del panel ──
// (la pestaña no vuelve a pedir admin.js sola mientras esté abierta, así
// que si lo actualizamos en el servidor esta pestaña no se entera sola)

let baselineScriptVersion = null;

async function captureScriptVersion() {
  try {
    const res = await fetch('admin.js', { method: 'HEAD', cache: 'no-store' });
    baselineScriptVersion = res.headers.get('Last-Modified') || res.headers.get('ETag');
  } catch (e) {}
}

async function checkForPanelUpdate() {
  if (!baselineScriptVersion) return;
  try {
    const res = await fetch('admin.js', { method: 'HEAD', cache: 'no-store' });
    const current = res.headers.get('Last-Modified') || res.headers.get('ETag');
    if (current && current !== baselineScriptVersion) showUpdateBanner();
  } catch (e) {}
}

function showUpdateBanner() {
  if (document.getElementById('updateBanner')) return;
  const bar = document.createElement('div');
  bar.id = 'updateBanner';
  bar.className = 'update-banner';
  const text = document.createElement('span');
  text.textContent = 'Hay una versión más nueva del panel. Recargá para verla.';
  const btn = document.createElement('button');
  btn.className = 'primary';
  btn.textContent = 'Recargar';
  btn.addEventListener('click', () => location.reload());
  bar.appendChild(text);
  bar.appendChild(btn);
  document.body.prepend(bar);
}

captureScriptVersion();

// ── avisos: sonido, notificación del sistema, título de la pestaña ──

const BASE_TITLE = document.title;
let pendingTitleCount = 0;
let audioCtx = null;
let soundEnabled = localStorage.getItem('adminSound') !== 'false';

function updateSoundBtn() {
  const btn = document.getElementById('soundToggleBtn');
  if (!btn) return;
  btn.textContent = soundEnabled ? '🔔 Sonido' : '🔕 Silenciado';
  btn.classList.toggle('sound-off', !soundEnabled);
}

function ensureAudioCtx() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    else if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  } catch (e) {}
}

function beep(freq, startOffset, duration = 0.35) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  const t0 = audioCtx.currentTime + startOffset;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(t0);
  o.stop(t0 + duration + 0.02);
}

function playNewOrderSound() {
  if (!soundEnabled) return;
  ensureAudioCtx();
  try {
    beep(880, 0);
    beep(1318.5, 0.18);
  } catch (e) {}
}

const soundToggleBtn = document.getElementById('soundToggleBtn');
if (soundToggleBtn) {
  updateSoundBtn();
  soundToggleBtn.addEventListener('click', () => {
    ensureAudioCtx();
    soundEnabled = !soundEnabled;
    localStorage.setItem('adminSound', soundEnabled ? 'true' : 'false');
    updateSoundBtn();
    if (soundEnabled) {
      playNewOrderSound();
      showToast('Sonido activado (probando timbre).');
    } else {
      showToast('Sonido silenciado.');
    }
  });
}


function updateTitleBadge() {
  document.title = pendingTitleCount > 0 ? `(${pendingTitleCount}) ${BASE_TITLE}` : BASE_TITLE;
}

function updateNotifBtn() {
  const btn = document.getElementById('notifBtn');
  if (!('Notification' in window)) { btn.hidden = true; return; }
  btn.hidden = false;
  if (Notification.permission === 'granted') {
    btn.textContent = 'Avisos activados';
    btn.classList.add('active');
    btn.disabled = true;
  } else if (Notification.permission === 'denied') {
    btn.textContent = 'Avisos bloqueados';
    btn.classList.remove('active');
    btn.disabled = true;
  } else {
    btn.textContent = 'Activar avisos';
    btn.classList.remove('active');
    btn.disabled = false;
  }
}

document.getElementById('notifBtn').addEventListener('click', async () => {
  ensureAudioCtx();
  if (!('Notification' in window)) return;
  const perm = await Notification.requestPermission();
  updateNotifBtn();
  if (perm === 'granted') showToast('Avisos activados.');
});

function notifyNewOrders(arrived) {
  playNewOrderSound();

  if ('Notification' in window && Notification.permission === 'granted') {
    const title = arrived.length === 1 ? 'Nuevo pedido' : `${arrived.length} pedidos nuevos`;
    const body = arrived.length === 1
      ? `${arrived[0].name} — $${arrived[0].total.toLocaleString('es-AR')}`
      : arrived.map(o => o.name).join(', ');
    try {
      const n = new Notification(title, { body, tag: 'sabor-urbano-orders' });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (e) {}
  }

  if (document.visibilityState !== 'visible') {
    pendingTitleCount += arrived.length;
    updateTitleBadge();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  pendingTitleCount = 0;
  updateTitleBadge();
  if (!document.getElementById('appShell').hidden) loadOrders({ silent: true });
});

// ── auth ─────────────────────────────────────────────────

async function checkAuth() {
  try {
    const res = await fetch('/api/admin/session');
    if (res.ok) {
      showApp();
    } else {
      showLogin();
    }
  } catch (e) {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginScreen').hidden = false;
  document.getElementById('appShell').hidden = true;
}

async function showApp() {
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('appShell').hidden = false;
  updateNotifBtn();
  if (!dashboardLoaded) {
    dashboardLoaded = true;
    await loadOrders();
    loadDashboard();
    setupSSE();
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  ensureAudioCtx(); // desbloquea el audio para los avisos sonoros, con este click como gesto del usuario
  const errorEl = document.getElementById('loginError');
  errorEl.hidden = true;
  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('loginUser').value,
        password: document.getElementById('loginPass').value,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');
    document.getElementById('loginPass').value = '';
    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  dashboardLoaded = false;
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  showLogin();
});

checkAuth();

// ── actualización automática de pedidos ──────────────────
// sigue sondeando aunque la pestaña esté en segundo plano, para que el
// sonido/aviso del sistema/título puedan avisar aunque no la estés mirando

let evtSource = null;

function setupSSE() {
  if (evtSource) return;
  evtSource = new EventSource('/api/orders/stream');
  
  evtSource.addEventListener('order_update', () => {
    if (document.getElementById('appShell').hidden) return;
    loadOrders({ silent: true });
    loadDashboard();
  });
  
  // Checking for panel updates occasionally via another interval
  setInterval(() => {
    if (!document.getElementById('appShell').hidden) checkForPanelUpdate();
  }, 60000);
}

// ── tabs ─────────────────────────────────────────────────

function switchAdminTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.m-bar-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.getElementById('dashboardTab').hidden = tabName !== 'dashboard';
  document.getElementById('ordersTab').hidden = tabName !== 'orders';
  document.getElementById('menuTab').hidden = tabName !== 'menu';
  if (tabName === 'menu' && !currentMenu) loadMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.tab-btn, .m-bar-btn').forEach(btn => {
  btn.addEventListener('click', () => switchAdminTab(btn.dataset.tab));
});


// ── dashboard ────────────────────────────────────────────

document.querySelectorAll('#rangeToggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#rangeToggle button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chartRange = Number(btn.dataset.range);
    if (statsData) renderRevenueChart(statsData.series);
  });
});

async function loadDashboard() {
  try {
    const res = await fetch('/api/admin/stats');
    if (res.status === 401) { showLogin(); return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    statsData = await res.json();
    renderKpis(statsData);
    renderRevenueChart(statsData.series);
  } catch (e) {
    document.getElementById('kpiRow').innerHTML = '<div class="empty">No se pudieron cargar las estadísticas.</div>';
  }
}

function pctDelta(current, previous) {
  if (previous === 0) return current === 0 ? null : Infinity;
  return ((current - previous) / previous) * 100;
}

function deltaHtml(current, previous, periodLabel) {
  const pct = pctDelta(current, previous);
  if (pct === null) return `<div class="kpi-delta">Sin datos de ${periodLabel}</div>`;
  if (pct === Infinity) return `<div class="kpi-delta up">▲ Nuevo vs ${periodLabel}</div>`;
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '—';
  return `<div class="kpi-delta ${dir}">${arrow} ${Math.abs(pct).toFixed(0)}% vs ${periodLabel}</div>`;
}

function renderKpis(stats) {
  const pendingOrders = allOrders.filter(o => o.status === 'nuevo' || o.status === 'en preparación').length;

  document.getElementById('kpiRow').innerHTML = `
    <div class="kpi-tile">
      <div class="kpi-label">Ingresos hoy</div>
      <div class="kpi-value">$${stats.today.revenue.toLocaleString('es-AR')}</div>
      ${deltaHtml(stats.today.revenue, stats.yesterday.revenue, 'ayer')}
    </div>
    <div class="kpi-tile">
      <div class="kpi-label">Pedidos hoy</div>
      <div class="kpi-value">${stats.today.orders}</div>
      ${deltaHtml(stats.today.orders, stats.yesterday.orders, 'ayer')}
    </div>
    <div class="kpi-tile">
      <div class="kpi-label">Ingresos del mes</div>
      <div class="kpi-value">$${stats.thisMonth.revenue.toLocaleString('es-AR')}</div>
      ${deltaHtml(stats.thisMonth.revenue, stats.lastMonth.revenue, 'mes pasado')}
    </div>
    <div class="kpi-tile">
      <div class="kpi-label">Pendientes</div>
      <div class="kpi-value">${pendingOrders}</div>
    </div>
  `;
}

function niceMax(value) {
  if (value <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  let step;
  if (normalized <= 1) step = 1;
  else if (normalized <= 2) step = 2;
  else if (normalized <= 5) step = 5;
  else step = 10;
  return step * magnitude;
}

function renderRevenueChart(fullSeries) {
  const container = document.getElementById('revenueChart');
  const series = fullSeries.slice(-chartRange);
  const total = series.reduce((s, d) => s + d.revenue, 0);

  if (total === 0) {
    container.innerHTML = '<div class="chart-empty">Todavía no hay ingresos registrados en este período.</div>';
    return;
  }

  const width = 900;
  const height = 220;
  const padL = 56, padR = 12, padT = 14, padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxVal = niceMax(Math.max(...series.map(d => d.revenue)) * 1.15);
  const n = series.length;
  const gap = 4;
  const barW = Math.min(24, plotW / n - gap);
  const step = plotW / n;

  const yTicks = [0, 0.5, 1].map(f => maxVal * f);

  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;display:block;font-family:'Outfit',sans-serif;">`;

  // gridlines + y labels
  yTicks.forEach(tick => {
    const y = padT + plotH - (tick / maxVal) * plotH;
    svg += `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#2c2c30" stroke-width="1"/>`;
    svg += `<text x="${padL - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#9a9aa2">$${compactNumber(tick)}</text>`;
  });

  // baseline
  svg += `<line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" stroke="#3a3a3f" stroke-width="1"/>`;

  const labelEvery = n <= 7 ? 1 : n <= 14 ? 2 : 5;

  series.forEach((d, i) => {
    const x = padL + i * step + (step - barW) / 2;
    const barH = maxVal > 0 ? (d.revenue / maxVal) * plotH : 0;
    const y = padT + plotH - barH;
    const r = Math.min(4, barH, barW / 2);

    if (barH > 0) {
      svg += `<path d="M${x},${y + r}
        a${r},${r} 0 0 1 ${r},${-r}
        h${Math.max(0, barW - 2 * r)}
        a${r},${r} 0 0 1 ${r},${r}
        v${Math.max(0, barH - r)}
        h${-barW}
        z" fill="#f59e0b" data-idx="${i}" class="rc-bar" style="cursor:pointer;transition:opacity .1s;"/>`;
    }

    // full-height invisible hit area for reliable hover, even on $0 days
    svg += `<rect x="${padL + i * step}" y="${padT}" width="${step}" height="${plotH}" fill="transparent" data-idx="${i}" class="rc-hit" style="cursor:pointer;"/>`;

    if (i % labelEvery === 0 || i === n - 1) {
      const dateObj = new Date(d.date + 'T12:00:00');
      const label = dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      svg += `<text x="${padL + i * step + step / 2}" y="${height - 8}" text-anchor="middle" font-size="9" fill="#9a9aa2">${label}</text>`;
    }
  });

  svg += `</svg>`;
  container.innerHTML = svg;

  const svgEl = container.querySelector('svg');
  const tooltip = document.getElementById('chartTooltip');

  svgEl.querySelectorAll('.rc-hit').forEach(hit => {
    const idx = Number(hit.dataset.idx);
    const d = series[idx];
    const bar = svgEl.querySelector(`.rc-bar[data-idx="${idx}"]`);

    hit.addEventListener('pointerenter', () => {
      if (bar) bar.style.opacity = '0.8';
      const dateObj = new Date(d.date + 'T12:00:00');
      const dateLabel = dateObj.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });
      tooltip.innerHTML = '';
      const valueEl = document.createElement('div');
      valueEl.className = 'tt-value';
      valueEl.textContent = '$' + d.revenue.toLocaleString('es-AR');
      const labelEl = document.createElement('div');
      labelEl.className = 'tt-label';
      labelEl.textContent = `${dateLabel} · ${d.orders} pedido${d.orders === 1 ? '' : 's'}`;
      tooltip.appendChild(valueEl);
      tooltip.appendChild(labelEl);
      tooltip.classList.add('show');
    });
    hit.addEventListener('click', () => {
      showDayOrders(d.date);
    });
    hit.addEventListener('pointermove', (e) => {
      const rect = container.getBoundingClientRect();
      tooltip.style.left = (e.clientX - rect.left) + 'px';
      tooltip.style.top = (e.clientY - rect.top - 10) + 'px';
    });
    hit.addEventListener('pointerleave', () => {
      if (bar) bar.style.opacity = '1';
      tooltip.classList.remove('show');
    });
  });
}

function compactNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
  return String(Math.round(n));
}

// ── pedidos ──────────────────────────────────────────────

function showDayOrders(dateStr) {
  const modal = document.getElementById('dayOrdersModalOverlay');
  const list = document.getElementById('dayOrdersList');
  const title = document.getElementById('dayOrdersModalTitle');
  
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayOrders = allOrders.filter(o => formatter.format(new Date(o.createdAt)) === dateStr);
  
  const dateObj = new Date(dateStr + 'T12:00:00');
  const dateLabel = dateObj.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  title.textContent = 'Pedidos del ' + dateLabel;
  
  list.innerHTML = '';
  if (dayOrders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No se encontraron pedidos para este día.';
    list.appendChild(empty);
  } else {
    for (const order of dayOrders) list.appendChild(renderOrder(order));
  }
  
  modal.hidden = false;
}

document.getElementById('dayOrdersCloseBtn').addEventListener('click', () => {
  document.getElementById('dayOrdersModalOverlay').hidden = true;
});

// ── whatsapp ─────────────────────────────────────────────

let wspInterval = null;

async function checkWspStatus() {
  const statusEl = document.getElementById('wspStatusText');
  const imgEl = document.getElementById('wspQrImage');
  
  try {
    const res = await fetch('/api/admin/whatsapp/status');
    const data = await res.json();
    if (data.connected) {
      statusEl.textContent = '✅ Conectado y listo para enviar mensajes.';
      statusEl.style.color = 'var(--green)';
      imgEl.style.display = 'none';
      if (wspInterval) { clearInterval(wspInterval); wspInterval = null; }
    } else if (data.qr) {
      statusEl.textContent = '⚠️ Escaneá este código QR con tu WhatsApp. (Se actualiza solo)';
      statusEl.style.color = 'inherit';
      // Solo actualizamos la imagen si cambió, para evitar parpadeos
      if (imgEl.src !== data.qr) {
        imgEl.src = data.qr;
        imgEl.style.display = 'block';
      }
    } else {
      statusEl.textContent = '⏳ Inicializando WhatsApp, por favor espera un momento...';
      statusEl.style.color = 'inherit';
      imgEl.style.display = 'none';
    }
  } catch (err) {
    statusEl.textContent = '❌ Error al conectar con el servidor.';
    statusEl.style.color = 'var(--red)';
    imgEl.style.display = 'none';
  }
}

document.getElementById('wspAdminBtn').addEventListener('click', () => {
  document.getElementById('wspModalOverlay').hidden = false;
  document.getElementById('wspStatusText').textContent = 'Cargando estado...';
  document.getElementById('wspQrImage').style.display = 'none';
  
  checkWspStatus();
  if (wspInterval) clearInterval(wspInterval);
  wspInterval = setInterval(checkWspStatus, 3000); // Poll cada 3 segundos
});

document.getElementById('wspCloseBtn').addEventListener('click', () => {
  document.getElementById('wspModalOverlay').hidden = true;
  if (wspInterval) {
    clearInterval(wspInterval);
    wspInterval = null;
  }
});

document.getElementById('refreshOrdersBtn').addEventListener('click', async () => { await loadOrders(); loadDashboard(); });
document.getElementById('statusFilter').addEventListener('change', renderOrders);

let knownOrderIds = null; // null hasta el primer fetch exitoso
let newOrderIds = new Set();

async function loadOrders(opts) {
  const silent = !!(opts && opts.silent);
  const list = document.getElementById('ordersList');
  if (!silent) list.textContent = 'Cargando…';
  try {
    const res = await fetch('/api/orders');
    if (res.status === 401) { showLogin(); return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const fresh = await res.json();

    if (knownOrderIds !== null) {
      const arrived = fresh.filter(o => !knownOrderIds.has(o.id));
      if (arrived.length > 0) {
        newOrderIds = new Set(arrived.map(o => o.id));
        showToast(arrived.length === 1
          ? `Nuevo pedido de ${arrived[0].name}.`
          : `${arrived.length} pedidos nuevos.`);
        notifyNewOrders(arrived);
        setTimeout(() => { newOrderIds = new Set(); }, 6000);
      }
    }
    knownOrderIds = new Set(fresh.map(o => o.id));

    allOrders = fresh;
    renderOrders();
  } catch (e) {
    if (!silent) list.textContent = 'No se pudieron cargar los pedidos.';
  }
}

function updateOrdersBadge() {
  const pendingCount = allOrders.filter(o => o.status === 'nuevo').length;
  const b1 = document.getElementById('ordersBadge');
  const b2 = document.getElementById('mOrdersBadge');
  if (b1) {
    b1.textContent = pendingCount;
    b1.hidden = pendingCount === 0;
  }
  if (b2) {
    b2.textContent = pendingCount;
    b2.hidden = pendingCount === 0;
  }
}

function renderOrders() {
  const list = document.getElementById('ordersList');
  const filter = document.getElementById('statusFilter').value;
  const orders = filter ? allOrders.filter(o => o.status === filter) : allOrders;

  updateOrdersBadge();

  document.getElementById('countLabel').textContent = `${orders.length} pedido${orders.length === 1 ? '' : 's'}`;
  list.innerHTML = '';

  if (orders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = filter ? 'No hay pedidos con ese estado.' : 'Todavía no hay pedidos.';
    list.appendChild(empty);
    return;
  }

  for (const order of orders) list.appendChild(renderOrder(order));
}

function renderOrder(order) {
  const card = document.createElement('div');
  card.className = 'order' + (newOrderIds.has(order.id) ? ' order-new' : '');

  const head = document.createElement('div');
  head.className = 'order-head';

  const left = document.createElement('div');
  const nameRow = document.createElement('div');
  nameRow.className = 'order-name-row';
  const name = document.createElement('div');
  name.className = 'order-name';
  name.textContent = order.name;
  const pill = document.createElement('span');
  pill.className = 'status-pill status-' + order.status.replace(/\s+/g, '-');
  pill.textContent = order.status;
  nameRow.appendChild(name);
  nameRow.appendChild(pill);
  const when = document.createElement('div');
  when.className = 'order-when';
  when.textContent = formatDate(order.createdAt) + '  ·  #' + order.id.slice(0, 8);
  left.appendChild(nameRow);
  left.appendChild(when);

  const total = document.createElement('div');
  total.className = 'order-total';
  total.textContent = '$' + order.total.toLocaleString('es-AR');

  head.appendChild(left);
  head.appendChild(total);
  card.appendChild(head);

  const tags = document.createElement('div');
  tags.className = 'order-tags';
  tags.appendChild(makeTag(order.mode === 'delivery' ? 'Delivery' : 'Retiro', order.mode === 'delivery'));
  tags.appendChild(makeTag(order.payment === 'efectivo' ? 'Efectivo' : 'Transferencia'));
  if (order.address) {
    const addrTag = makeTag(order.address);
    if (order.mode === 'delivery') {
      const mapsLink = document.createElement('a');
      mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`;
      mapsLink.target = '_blank';
      mapsLink.textContent = '📍 Maps';
      mapsLink.style.marginLeft = '8px';
      mapsLink.style.textDecoration = 'none';
      mapsLink.style.color = '#007bff';
      mapsLink.style.fontWeight = 'bold';
      addrTag.appendChild(mapsLink);
    }
    tags.appendChild(addrTag);
  }
  if (order.cashNote) tags.appendChild(makeTag(order.cashNote));

  // Botón directo para WhatsApp con el cliente
  if (order.phone) {
    const cleanPhone = String(order.phone).replace(/\D/g, '');
    if (cleanPhone) {
      const fullPhone = cleanPhone.length === 10 ? '549' + cleanPhone : cleanPhone;
      const wspTag = document.createElement('a');
      wspTag.className = 'tag order-wsp-tag';
      wspTag.href = `https://wa.me/${fullPhone}?text=${encodeURIComponent(`Hola ${order.name}! Te escribimos de Sabor Urbano sobre tu pedido #${order.id.slice(0, 8)}.`)}`;
      wspTag.target = '_blank';
      wspTag.innerHTML = `💬 WhatsApp`;
      tags.appendChild(wspTag);
    }
  }

  card.appendChild(tags);

  const items = document.createElement('div');
  items.className = 'items';
  for (const item of order.items) {
    const qty = item.qty || 1;
    const row = document.createElement('div');
    row.textContent = `${qty}x ${item.name} — $${(item.price * qty).toLocaleString('es-AR')}`;
    if (item.custom) {
      const custom = document.createElement('span');
      custom.className = 'custom';
      custom.textContent = '  (' + item.custom + ')';
      row.appendChild(custom);
    }
    items.appendChild(row);
  }
  card.appendChild(items);

  const footer = document.createElement('div');
  footer.className = 'order-footer';

  const footerLeft = document.createElement('div');
  footerLeft.className = 'order-footer-left';

  const select = document.createElement('select');
  select.className = 'status-select status-' + order.status.replace(/\s+/g, '-');
  for (const opt of STATUS_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    if (opt === order.status) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener('change', () => updateOrderStatus(order.id, select.value, select));

  // Botón de avance rápido de estado
  if (order.status !== 'entregado') {
    const advanceBtn = document.createElement('button');
    advanceBtn.className = 'advance-status-btn';
    let nextStatus = '';
    let btnText = '';
    if (order.status === 'nuevo') {
      nextStatus = 'en preparación';
      btnText = '👨‍🍳 A Cocina';
    } else if (order.status === 'en preparación') {
      nextStatus = 'listo';
      btnText = order.mode === 'delivery' ? '🛵 Listo / Enviar' : '🏪 Listo / Retiro';
    } else if (order.status === 'listo') {
      nextStatus = 'entregado';
      btnText = '✓ Entregar';
    }
    if (nextStatus) {
      advanceBtn.textContent = btnText;
      advanceBtn.addEventListener('click', () => updateOrderStatus(order.id, nextStatus, select));
      footerLeft.appendChild(advanceBtn);
    }
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'danger cancel-order-btn';
  cancelBtn.textContent = 'Cancelar pedido';
  cancelBtn.addEventListener('click', () => deleteOrder(order.id, card, cancelBtn, select));

  footerLeft.appendChild(select);
  footerLeft.appendChild(cancelBtn);
  footer.appendChild(footerLeft);
  card.appendChild(footer);

  return card;
}

function makeTag(text, highlight) {
  const span = document.createElement('span');
  span.className = 'tag' + (highlight ? ' delivery' : '');
  span.textContent = text;
  return span;
}

async function updateOrderStatus(id, status, selectEl) {
  selectEl.disabled = true;
  try {
    const res = await fetch('/api/orders/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const order = allOrders.find(o => o.id === id);
    if (order) order.status = status;
    renderOrders();
    showToast('Estado actualizado.');
  } catch (e) {
    showToast('No se pudo actualizar el estado.', true);
  } finally {
    selectEl.disabled = false;
  }
}

async function deleteOrder(id, cardEl, cancelBtn, selectEl) {
  if (!confirm('¿Cancelar y eliminar este pedido? Esta acción no se puede deshacer.')) return;
  cancelBtn.disabled = true;
  selectEl.disabled = true;
  try {
    const res = await fetch('/api/orders/' + encodeURIComponent(id), { method: 'DELETE' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    allOrders = allOrders.filter(o => o.id !== id);
    renderOrders();
    loadDashboard();
    showToast('Pedido cancelado y eliminado.');
  } catch (e) {
    showToast('No se pudo cancelar el pedido.', true);
    cancelBtn.disabled = false;
    selectEl.disabled = false;
  }
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ── menú ─────────────────────────────────────────────────

document.getElementById('refreshMenuBtn').addEventListener('click', loadMenu);
document.getElementById('newCategoryBtn').addEventListener('click', () => openCategoryModal(null));

async function loadMenu() {
  const list = document.getElementById('categoriesList');
  list.textContent = 'Cargando…';
  try {
    const res = await fetch('/api/menu');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    currentMenu = await res.json();
    renderCategories();
  } catch (e) {
    list.textContent = 'No se pudo cargar el menú.';
  }
}

let menuSearchQuery = '';
const searchMenuInput = document.getElementById('adminMenuSearch');
if (searchMenuInput) {
  searchMenuInput.addEventListener('input', (e) => {
    menuSearchQuery = e.target.value.toLowerCase().trim();
    renderCategories();
  });
}

function renderCategories() {
  const list = document.getElementById('categoriesList');
  list.innerHTML = '';

  if (!currentMenu || currentMenu.categories.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Todavía no hay categorías.';
    list.appendChild(empty);
    return;
  }

  let totalShown = 0;
  for (const cat of currentMenu.categories) {
    let items = cat.items;
    if (menuSearchQuery) {
      items = items.filter(it => 
        it.name.toLowerCase().includes(menuSearchQuery) || 
        (it.desc && it.desc.toLowerCase().includes(menuSearchQuery))
      );
      if (items.length === 0 && !cat.navLabel.toLowerCase().includes(menuSearchQuery)) {
        continue;
      }
    }
    totalShown++;
    list.appendChild(renderCategoryCard({ ...cat, items }));
  }

  if (menuSearchQuery && totalShown === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = `No se encontraron productos que coincidan con "${menuSearchQuery}".`;
    list.appendChild(empty);
  }
}


function renderCategoryCard(cat) {
  const card = document.createElement('div');
  card.className = 'cat-card';

  const head = document.createElement('div');
  head.className = 'cat-head';

  const left = document.createElement('div');
  left.className = 'cat-head-left';
  const titleWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'cat-title';
  title.textContent = cat.navLabel;
  const subtitle = document.createElement('div');
  subtitle.className = 'cat-subtitle';
  subtitle.textContent = cat.subtitle || '';
  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);
  left.appendChild(titleWrap);

  const actions = document.createElement('div');
  actions.className = 'cat-actions';
  const editBtn = document.createElement('button');
  editBtn.textContent = 'Editar';
  editBtn.addEventListener('click', () => openCategoryModal(cat));
  actions.appendChild(editBtn);

  head.appendChild(left);
  head.appendChild(actions);
  card.appendChild(head);

  if (cat.items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-inline';
    empty.textContent = 'Todavía no hay productos en esta categoría.';
    card.appendChild(empty);
  } else {
    for (const item of cat.items) card.appendChild(renderItemRow(item, cat.key));
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'add-item-btn';
  addBtn.textContent = '+ Agregar producto';
  addBtn.addEventListener('click', () => openItemModal(cat.key, null));
  card.appendChild(addBtn);

  return card;
}

function renderItemRow(item, categoryKey) {
  const row = document.createElement('div');
  row.className = 'menu-item-row';

  const isAgotado = typeof item.stock === 'number' && item.stock <= 0;
  if (isAgotado) row.classList.add('row-agotado');

  const img = document.createElement('img');
  img.src = item.img || 'assets/combo_profesional.png';
  img.alt = '';
  row.appendChild(img);

  const info = document.createElement('div');
  info.className = 'menu-item-info';
  const name = document.createElement('div');
  name.className = 'menu-item-name';
  name.textContent = item.name;
  
  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'menu-item-tags';
  if (item.ingredients && item.ingredients.length > 0) {
    tagsWrap.innerHTML = item.ingredients.map(ing => `<span class="admin-ing-tag">${escapeHtml(ing)}</span>`).join('');
  }
  
  const desc = document.createElement('div');
  desc.className = 'menu-item-desc';
  desc.textContent = item.desc;
  
  info.appendChild(name);
  if (item.ingredients && item.ingredients.length > 0) info.appendChild(tagsWrap);
  info.appendChild(desc);
  row.appendChild(info);

  const price = document.createElement('div');
  price.className = 'menu-item-price';
  price.textContent = '$' + item.price.toLocaleString('es-AR');
  row.appendChild(price);

  const actions = document.createElement('div');
  actions.className = 'menu-item-actions';

  // Botón rápido de stock (1 click)
  const stockBtn = document.createElement('button');
  stockBtn.className = 'stock-toggle-btn ' + (isAgotado ? 'btn-agotado' : 'btn-disponible');
  stockBtn.textContent = isAgotado ? '🔴 Agotado' : '🟢 Disponible';
  stockBtn.title = isAgotado ? 'Click para marcar como Disponible' : 'Click para marcar como Agotado';
  stockBtn.addEventListener('click', async () => {
    stockBtn.disabled = true;
    try {
      const newStock = isAgotado ? null : 0;
      const res = await fetch('/api/items/' + encodeURIComponent(item.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: newStock })
      });
      if (!res.ok) throw new Error();
      item.stock = newStock;
      showToast(isAgotado ? `"${item.name}" ahora está Disponible.` : `"${item.name}" marcado como Agotado.`);
      renderCategories();
    } catch {
      showToast('Error al cambiar disponibilidad.', true);
      stockBtn.disabled = false;
    }
  });
  actions.appendChild(stockBtn);

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Editar';
  editBtn.addEventListener('click', () => openItemModal(categoryKey, item));
  actions.appendChild(editBtn);
  row.appendChild(actions);

  return row;
}

// ── modal: categoría ─────────────────────────────────────

function openCategoryModal(cat) {
  editingCategoryKey = cat ? cat.key : null;
  document.getElementById('categoryModalTitle').textContent = cat ? 'Editar categoría' : 'Nueva categoría';
  document.getElementById('catNavLabel').value = cat ? cat.navLabel : '';
  document.getElementById('catSubtitle').value = cat ? (cat.subtitle || '') : '';
  document.getElementById('catCustomizable').checked = cat ? !!cat.customizable : false;
  document.getElementById('categoryDeleteBtn').hidden = !cat;
  document.getElementById('categoryModalError').textContent = '';
  document.getElementById('categoryModalOverlay').hidden = false;
}

function closeCategoryModal() {
  document.getElementById('categoryModalOverlay').hidden = true;
}

document.getElementById('categoryCancelBtn').addEventListener('click', closeCategoryModal);
document.getElementById('categoryModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'categoryModalOverlay') closeCategoryModal();
});

document.getElementById('categorySaveBtn').addEventListener('click', async () => {
  const body = {
    navLabel: document.getElementById('catNavLabel').value.trim(),
    subtitle: document.getElementById('catSubtitle').value.trim(),
    customizable: document.getElementById('catCustomizable').checked,
  };
  body.title = body.navLabel;

  const errorEl = document.getElementById('categoryModalError');
  errorEl.textContent = '';
  try {
    const url = editingCategoryKey ? '/api/categories/' + encodeURIComponent(editingCategoryKey) : '/api/categories';
    const res = await fetch(url, {
      method: editingCategoryKey ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo guardar.');
    closeCategoryModal();
    loadMenu();
    showToast(editingCategoryKey ? 'Categoría actualizada.' : 'Categoría creada.');
  } catch (e) {
    errorEl.textContent = e.message;
  }
});

document.getElementById('categoryDeleteBtn').addEventListener('click', async () => {
  if (!editingCategoryKey) return;
  if (!confirm('¿Eliminar esta categoría y todos sus productos?')) return;
  try {
    const res = await fetch('/api/categories/' + encodeURIComponent(editingCategoryKey), { method: 'DELETE' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    closeCategoryModal();
    loadMenu();
    showToast('Categoría eliminada.');
  } catch (e) {
    document.getElementById('categoryModalError').textContent = 'No se pudo eliminar.';
  }
});

// ── modal: producto ──────────────────────────────────────

async function openItemModal(categoryKey, item) {
  editingItem = item ? { id: item.id, categoryKey } : null;
  pendingImgPath = item ? item.img : '';

  document.getElementById('itemModalTitle').textContent = item ? 'Editar producto' : 'Nuevo producto';
  document.getElementById('itemName').value = item ? item.name : '';
  document.getElementById('itemPrice').value = item ? item.price : '';
  document.getElementById('itemStock').value = item && typeof item.stock === 'number' ? item.stock : '';
  document.getElementById('itemIngredients').value = item && item.ingredients ? item.ingredients.join(', ') : '';
  document.getElementById('itemDesc').value = item ? item.desc : '';
  document.getElementById('itemDeleteBtn').hidden = !item;
  document.getElementById('itemModalError').textContent = '';
  document.getElementById('itemImgUpload').value = '';

  await populateImageSelect(pendingImgPath);
  if (!pendingImgPath) {
    const sel = document.getElementById('itemImgSelect');
    if (sel && sel.value) pendingImgPath = sel.value;
  }
  updateImgPreview();

  const catSelect = document.getElementById('itemCatInput');
  catSelect.innerHTML = '';
  if (currentMenu && currentMenu.categories) {
    currentMenu.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.key;
      opt.textContent = cat.title || cat.navLabel;
      if (cat.key === categoryKey) opt.selected = true;
      catSelect.appendChild(opt);
    });
  }
  
  const descInput = document.getElementById('itemDesc');
  const descCount = document.getElementById('descCharCount');
  descCount.textContent = `${descInput.value.length}/500`;
  descInput.oninput = () => {
    descCount.textContent = `${descInput.value.length}/500`;
  };

  document.getElementById('itemModalOverlay').dataset.categoryKey = categoryKey;
  document.getElementById('itemModalOverlay').hidden = false;
}

function closeItemModal() {
  document.getElementById('itemModalOverlay').hidden = true;
}

function truncateFilename(name, max = 28) {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > -1 ? name.slice(dot) : '';
  const base = dot > -1 ? name.slice(0, dot) : name;
  const keep = Math.max(4, max - ext.length - 1);
  return base.slice(0, keep) + '…' + ext;
}

async function populateImageSelect(selected) {
  const select = document.getElementById('itemImgSelect');
  select.innerHTML = '';
  try {
    const res = await fetch('/api/admin/assets');
    const assets = await res.json();
    if (selected && !assets.includes(selected)) assets.unshift(selected);
    for (const path of assets) {
      const opt = document.createElement('option');
      opt.value = path;
      opt.textContent = truncateFilename(path.replace(/^assets\//, ''));
      if (path === selected) opt.selected = true;
      select.appendChild(opt);
    }
  } catch (e) {
    // sin conexión
  }
}

document.getElementById('itemImgSelect').addEventListener('change', (e) => {
  pendingImgPath = e.target.value;
  updateImgPreview();
});

document.getElementById('itemImgUpload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const errorEl = document.getElementById('itemModalError');
  errorEl.textContent = 'Subiendo imagen…';
  try {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo subir la imagen.');
    pendingImgPath = data.path;
    await populateImageSelect(pendingImgPath);
    updateImgPreview();
    errorEl.textContent = '';
  } catch (e) {
    errorEl.textContent = e.message;
  }
});

function updateImgPreview() {
  document.getElementById('itemImgPreview').src = pendingImgPath || 'assets/combo_profesional.png';
}

document.getElementById('itemCancelBtn').addEventListener('click', closeItemModal);
document.getElementById('itemModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'itemModalOverlay') closeItemModal();
});

document.getElementById('itemSaveBtn').addEventListener('click', async () => {
  const name = document.getElementById('itemName').value.trim();
  const price = Number(document.getElementById('itemPrice').value);
  const stockVal = document.getElementById('itemStock').value;
  const desc = document.getElementById('itemDesc').value.trim();
  const categoryKey = document.getElementById('itemCatInput')
    ? document.getElementById('itemCatInput').value
    : document.getElementById('itemModalOverlay').dataset.categoryKey;

  const errorEl = document.getElementById('itemModalError');
  errorEl.textContent = '';

  if (!name) { errorEl.textContent = 'El nombre es obligatorio.'; return; }
  if (!price || price <= 0) { errorEl.textContent = 'Ingresá un precio válido.'; return; }
  if (!categoryKey) { errorEl.textContent = 'Seleccioná una categoría.'; return; }

  const fallbackImg = document.getElementById('itemImgSelect')?.value || 'assets/combo_profesional.png';
  const rawIngredients = document.getElementById('itemIngredients').value;
  const ingredientsArray = rawIngredients.split(',').map(s => s.trim()).filter(Boolean);
  
  const body = {
    name,
    price,
    stock: stockVal === '' ? null : Number(stockVal),
    desc,
    ingredients: ingredientsArray,
    img: pendingImgPath || fallbackImg,
    categoryKey,
  };

  try {
    const url = editingItem ? '/api/items/' + encodeURIComponent(editingItem.id) : '/api/items';
    const res = await fetch(url, {
      method: editingItem ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo guardar.');
    closeItemModal();
    loadMenu();
    showToast(editingItem ? 'Producto actualizado.' : 'Producto creado.');
  } catch (e) {
    errorEl.textContent = e.message;
  }
});

document.getElementById('itemDeleteBtn').addEventListener('click', async () => {
  if (!editingItem) return;
  if (!confirm('¿Eliminar este producto?')) return;
  try {
    const res = await fetch('/api/items/' + encodeURIComponent(editingItem.id), { method: 'DELETE' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    closeItemModal();
    loadMenu();
    showToast('Producto eliminado.');
  } catch (e) {
    document.getElementById('itemModalError').textContent = 'No se pudo eliminar.';
  }
});

