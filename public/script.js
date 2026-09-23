let MENU = null;
let catalog = new Map();
let cart = [];
let deliveryMode = 'retiro';
let currentProduct = null;
let cmQty = 1;
let reopenOrderAfterCustom = false;

const savedCart = localStorage.getItem('menuCart');
if (savedCart) {
  try { cart = JSON.parse(savedCart); } catch (e) { cart = []; }
}

init();

async function init() {
  try {
    const res = await fetch('/api/menu');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    MENU = await res.json();
  } catch (e) {
    const loading = document.getElementById('menuLoading');
    loading.className = 'menu-loading';
    loading.textContent = 'No pudimos cargar el menú. Recargá la página en unos segundos.';
    return;
  }

  buildCatalog();
  renderBrand();
  renderNav();
  renderSections();
  renderCustomizationOptions();
  initSearch();

  if (cart.length > 0) updateBar();

  window.addEventListener('scroll', () => {
    const btn = document.getElementById('btnTop');
    if (window.scrollY > 300) btn.classList.add('show');
    else btn.classList.remove('show');
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('cmOverlay').classList.contains('open')) closeCMBtn();
    else if (document.getElementById('orderOverlay').classList.contains('open')) closeOrderBtn();
  });

  setupModalScrollLock();

  // Precalentar el modal de "Ver pedido": la primera vez que se abre es más
  // lenta que las siguientes, porque ahí es cuando el navegador decodifica
  // por primera vez las fotos de "Completá tu pedido". Las precargamos en
  // segundo plano, con la página ya quieta, para que cuando el cliente
  // abra el carrito de verdad esas fotos ya estén listas.
  const warmUpImages = () => {
    try {
      [...catalog.values()].slice(0, 10).forEach(item => {
        if (item.img) { const im = new Image(); im.src = item.img; }
      });
    } catch {}
  };
  if ('requestIdleCallback' in window) requestIdleCallback(warmUpImages, { timeout: 2000 });
  else setTimeout(warmUpImages, 1200);
}

function buildCatalog() {
  catalog = new Map();
  for (const cat of MENU.categories) {
    for (const item of cat.items) {
      catalog.set(item.id, { ...item, categoryKey: cat.key, customizable: cat.customizable });
    }
  }
}

function renderBrand() {
  const b = MENU.brand;
  const fullName = b.fullName || b.name;
  document.title = `${fullName} — Pedí online`;
  document.getElementById('logoImg').alt = fullName;
  document.getElementById('sidebarInfo').innerHTML = `
    <strong>${escapeHtml(fullName)}</strong>
    ${b.mapsUrl
      ? `<a href="${escapeHtml(b.mapsUrl)}" target="_blank" rel="noopener">${escapeHtml(b.address)}</a>`
      : escapeHtml(b.address)}<br>
    ${b.hours.map(escapeHtml).join('<br>')}
  `;

  document.getElementById('openBadge').classList.toggle('closed', !b.isOpen);
  document.getElementById('openText').textContent = b.isOpen ? 'Abierto' : 'Cerrado';
  document.getElementById('scheduleNote').textContent = b.isOpen ? b.scheduleNote : 'Abrimos a las 18 hs';
  document.getElementById('closedBanner').hidden = b.isOpen;
  document.getElementById('footerName').textContent = fullName;
  document.getElementById('footerTagline').textContent = b.tagline ? `“${b.tagline}”` : '';
  document.getElementById('footerAddress').innerHTML = `${escapeHtml(b.address)}<br>${b.hours.map(escapeHtml).join(' · ')}`;

  const links = [];
  if (b.whatsappNumber) links.push({ label: 'WhatsApp', url: 'https://wa.me/' + b.whatsappNumber });
  (b.instagram || []).forEach(ig => links.push(ig));
  if (b.mapsUrl) links.push({ label: 'Cómo llegar', url: b.mapsUrl });
  document.getElementById('footerLinks').innerHTML = links.map(l =>
    `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`
  ).join('');

  document.getElementById('highlights').innerHTML = (b.highlights || []).map(h => `
    <div class="highlight">
      <div class="highlight-icon" aria-hidden="true">${escapeHtml(h.icon)}</div>
      <div>
        <div class="highlight-title">${escapeHtml(h.title)}</div>
        <div class="highlight-text">${escapeHtml(h.text)}</div>
      </div>
    </div>
  `).join('');

  renderZones();
  toggleCash();
}

function renderZones() {
  const zones = MENU.brand.deliveryZones || [];
  const wrap = document.getElementById('zoneInputWrap');
  if (zones.length === 0) { wrap.remove(); return; }
  const saved = (() => { try { return localStorage.getItem('customer_zone') || ''; } catch { return ''; } })();
  document.getElementById('zoneInput').innerHTML =
    '<option value="">Elegí tu barrio</option>' +
    zones.map(z => `<option value="${escapeHtml(z.name)}"${z.name === saved ? ' selected' : ''}>${escapeHtml(z.name)} — envío $${z.fee.toLocaleString('es-AR')}</option>`).join('') +
    `<option value="otra"${saved === 'otra' ? ' selected' : ''}>Otra zona (envío a coordinar)</option>`;
}

function getDeliveryFee() {
  if (deliveryMode !== 'delivery') return 0;
  const select = document.getElementById('zoneInput');
  if (!select) return 0;
  const zone = (MENU.brand.deliveryZones || []).find(z => z.name === select.value);
  return zone ? zone.fee : 0;
}

function onZoneChange() {
  updateOrderTotals();
}

function updateOrderTotals() {
  const subtotal = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const fee = getDeliveryFee();
  const feeRow = document.getElementById('omFeeRow');
  const zoneValue = document.getElementById('zoneInput')?.value;
  feeRow.hidden = deliveryMode !== 'delivery' || !zoneValue;
  document.getElementById('omFee').textContent = zoneValue === 'otra' ? 'A coordinar' : '$' + fee.toLocaleString('es-AR');
  document.getElementById('omTotal').textContent = '$' + (subtotal + fee).toLocaleString('es-AR');
}

function renderNav() {
  const cats = MENU.categories;
  const mobileWrap = document.getElementById('catsMobile');
  const sidebarWrap = document.getElementById('sidebarNav');

  mobileWrap.innerHTML = cats.map((c, i) => `
    <button class="cat${i === 0 ? ' active' : ''}" data-cat="${c.key}">${escapeHtml(c.navLabel)}</button>
  `).join('');

  sidebarWrap.innerHTML = cats.map((c, i) => `
    <button class="sidebar-item${i === 0 ? ' active' : ''}" data-cat="${c.key}">${escapeHtml(c.navLabel)}</button>
  `).join('');

  document.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => switchCat(btn.dataset.cat, btn));
  });
}

function renderSections() {
  const main = document.getElementById('mainContent');
  main.innerHTML = MENU.categories.map((cat, i) => `
    <section id="sec-${cat.key}" class="${i === 0 ? 'active-sec' : 'hidden-sec'}">
      ${cat.promo ? `
        <div class="promo">
          <div class="promo-badge">${escapeHtml(cat.promo.badge)}</div>
          <div class="promo-title">${escapeHtml(cat.promo.title)} <em>${escapeHtml(cat.promo.highlight)}</em></div>
          <div class="promo-desc">${escapeHtml(cat.promo.desc)}</div>
        </div>
      ` : ''}
      <div class="sec-title"><h2>${escapeHtml(cat.title)}</h2><span>${escapeHtml(cat.subtitle)}</span></div>
      ${cat.items.length === 0 ? `
        <div class="empty-category">Todavía no hay productos en esta categoría.</div>
      ` : `
        <div class="products">
          ${cat.items.map(item => {
            const isAgotado = typeof item.stock === 'number' && item.stock <= 0;
            const inCartCount = cart.filter(ci => ci.productId === item.id).reduce((sum, ci) => sum + ci.qty, 0);
            return `
            <div class="pcard ${isAgotado ? 'card-agotado' : ''} ${inCartCount > 0 ? 'has-in-cart' : ''}" id="pcard-${item.id}">
              <div class="pimg-wrap">
                <img src="${item.img || 'assets/mia-logo.png'}" class="pimg" alt="${escapeHtml(item.name)}" loading="lazy">
                <div class="in-cart-badge" data-item-badge="${item.id}" ${inCartCount > 0 ? '' : 'style="display:none;"'}>${inCartCount}</div>
              </div>
              <div class="pinfo">
                <div class="pname">${escapeHtml(item.name)}</div>
                ${item.ingredients && item.ingredients.length > 0 ? `
                  <div class="p-tags">
                    ${item.ingredients.slice(0, 3).map(ing => `<span class="p-tag">${escapeHtml(ing)}</span>`).join('')}
                    ${item.ingredients.length > 3 ? `<span class="p-tag p-tag-more">+${item.ingredients.length - 3}</span>` : ''}
                  </div>
                ` : ''}
                <div class="pdesc">${escapeHtml(item.desc)}</div>
                <div class="pcard-footer">
                  <div class="pprice">$${item.price.toLocaleString('es-AR')}</div>
                  <span class="pcard-hint">Ver detalles →</span>
                </div>
              </div>
              <div class="pright">
                ${isAgotado 
                  ? '<span class="badge-agotado">Agotado</span>' 
                  : `<button class="add-btn" aria-label="Agregar ${escapeHtml(item.name)}" data-add="${item.id}">+</button>`}
              </div>
            </div>
            `;
          }).join('')}
        </div>
      `}
    </section>
  `).join('');

  document.getElementById('menuLoading')?.remove();

  document.querySelectorAll('[data-add]').forEach(btn => {
    const item = catalog.get(btn.dataset.add);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.customizable) {
        reopenOrderAfterCustom = false;
        openCustom(item.id);
      } else {
        quickAdd(item.id, e);
      }
    });
  });

  document.querySelectorAll('.pcard').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) return;
      const itemId = card.id.replace('pcard-', '');
      const item = catalog.get(itemId);
      if (!item) return;
      
      // Siempre abrimos el modal para ver ingredientes y descripciones completas
      reopenOrderAfterCustom = false;
      openCustom(item.id);
    });
  });
}



function renderCustomizationOptions() {
  const opts = MENU.customizationOptions;

  document.getElementById('cm-coccion').innerHTML = opts.coccion.map((label, i) => `
    <button class="cm-opt${i === 0 ? ' sel' : ''}" onclick="selOpt(this)">${escapeHtml(label)}</button>
  `).join('');

  document.getElementById('cm-removables').innerHTML = opts.removables.map(label => `
    <button class="cm-opt rem" onclick="toggleRem(this)">${escapeHtml(label)}</button>
  `).join('');

  document.getElementById('cm-extra-groups').innerHTML = opts.extraGroups.map(group => `
    <div class="cm-section">
      <div class="cm-label">${escapeHtml(group.label)}</div>
      <div class="cm-options">
        ${group.options.map(ex => `
          <button class="cm-opt" data-price="${ex.price}" onclick="toggleExtra(this)">${escapeHtml(ex.label)} $${ex.price.toLocaleString('es-AR')}</button>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// ── buscador ─────────────────────────────────────────────

function normalizeSearch(str) {
  return String(str)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

let preSearchCat = null;

function initSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClearBtn');

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.hidden = true;
      clearSearch();
      input.focus();
    });
  }

  let searchDebounceTimer = null;
  input.addEventListener('input', (e) => {
    const val = e.target.value;
    if (clearBtn) clearBtn.hidden = !val.trim();

    // El filtro recorre todo el catálogo: con debounce evitamos hacerlo en
    // cada letra tipeada (sentía lag al escribir rápido), solo cuando hay
    // una pausa breve.
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => runSearch(val), 120);
  });

  function runSearch(val) {
    const q = normalizeSearch(val);
    if (!q) {
      clearSearch();
      return;
    }

    if (preSearchCat === null) {
      const activeBtn = document.querySelector('[data-cat].active');
      preSearchCat = activeBtn ? activeBtn.dataset.cat : MENU.categories[0].key;
    }
    document.querySelectorAll('[data-cat]').forEach(b => b.classList.remove('active'));

    let totalMatches = 0;
    document.querySelectorAll('[id^="sec-"]').forEach(sec => {
      const cards = sec.querySelectorAll('.pcard');
      let sectionMatches = 0;
      cards.forEach(card => {
        const name = normalizeSearch(card.querySelector('.pname').textContent);
        const match = name.includes(q);
        card.style.display = match ? '' : 'none';
        if (match) sectionMatches++;
      });
      sec.classList.toggle('hidden-sec', sectionMatches === 0);
      sec.classList.toggle('active-sec', sectionMatches > 0);
      totalMatches += sectionMatches;
    });

    let noResults = document.getElementById('searchNoResults');
    if (totalMatches === 0) {
      if (!noResults) {
        noResults = document.createElement('div');
        noResults.id = 'searchNoResults';
        noResults.className = 'empty-category';
        document.getElementById('mainContent').appendChild(noResults);
      }
      noResults.textContent = `No encontramos productos para "${val.trim()}".`;
    } else if (noResults) {
      noResults.remove();
    }
  }
}

function clearSearch() {
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.hidden = true;
  document.querySelectorAll('.pcard').forEach(c => { c.style.display = ''; });
  document.getElementById('searchNoResults')?.remove();
  const targetCat = preSearchCat || MENU.categories[0].key;
  const btn = document.querySelector(`[data-cat="${targetCat}"]`);
  if (btn) switchCat(targetCat, btn);
  preSearchCat = null;
}


function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── modo de entrega / navegación ─────────────────────────

function setMode(m) {
  deliveryMode = m;
  ['m', 'h', 's'].forEach(suffix => {
    document.getElementById('btn-retiro-' + suffix)?.classList.toggle('active', m === 'retiro');
    document.getElementById('btn-delivery-' + suffix)?.classList.toggle('active', m === 'delivery');
  });
  const delWrap = document.getElementById('delInputWrap');
  if (delWrap) delWrap.classList.toggle('show', m === 'delivery');
  document.getElementById('zoneInputWrap')?.classList.toggle('show', m === 'delivery');
  if (MENU) updateOrderTotals();
}

function switchCat(cat, btn) {
  document.querySelectorAll('[data-cat]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[data-cat="' + cat + '"]').forEach(b => b.classList.add('active'));

  document.querySelectorAll('[id^="sec-"]').forEach(s => {
    s.classList.remove('active-sec');
    s.classList.add('hidden-sec');
  });
  document.getElementById('sec-' + cat).classList.remove('hidden-sec');
  document.getElementById('sec-' + cat).classList.add('active-sec');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── carrito ──────────────────────────────────────────────

// Con un modal abierto, scrollear adentro (el detalle de un producto, el
// pedido) no tiene que mover la página de fondo detrás — antes no había
// nada que lo evitara. Se observan los tres overlays y, mientras cualquiera
// esté abierto, se bloquea el scroll del body.
function setupModalScrollLock() {
  const overlays = ['cmOverlay', 'orderOverlay', 'confirmOverlay']
    .map(id => document.getElementById(id))
    .filter(Boolean);

  const update = () => {
    const anyOpen = overlays.some(el => el.classList.contains('open'));
    document.body.classList.toggle('modal-open', anyOpen);
  };

  overlays.forEach(el => {
    new MutationObserver(update).observe(el, { attributes: true, attributeFilter: ['class'] });
  });
  update();
}

function contentsLabel(item) {
  return item && item.ingredients && item.ingredients.length ? 'Trae: ' + item.ingredients.join(', ') : '';
}

function quickAdd(id, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const item = catalog.get(id);
  const custom = contentsLabel(item);
  const existing = cart.find(i => i.productId === id && i.custom === custom);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: id + '_' + Date.now(), productId: id, name: item.name, price: item.price, qty: 1, custom });
  }
  updateBar();
  flashBtn(e && e.target);
  if (!document.getElementById('orderOverlay').classList.contains('open')) return;
  openOrder();
}

function flashBtn(btn) {
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = '✓';
  btn.classList.add('ok');
  setTimeout(() => { btn.textContent = orig; btn.classList.remove('ok'); }, 700);
}

function openCustom(id) {
  const item = catalog.get(id);
  if (!item) return;
  currentProduct = item;
  
  document.getElementById('cm-pname').textContent = item.name;
  document.getElementById('cm-pprice').textContent = '$' + item.price.toLocaleString('es-AR');
  
  const pdesc = document.getElementById('cm-pdesc');
  if (pdesc) { pdesc.textContent = item.desc || ''; pdesc.hidden = !item.desc; }
  const hasIngredients = item.ingredients && item.ingredients.length > 0;
  document.getElementById('cm-ingredients-box').hidden = !item.desc && !hasIngredients;
  
  const pimg = document.getElementById('cm-pimg');
  if (pimg) pimg.src = item.img || 'assets/mia-logo.png';

  const tagsWrap = document.getElementById('cm-ingredients-tags');
  if (tagsWrap) {
    if (item.ingredients && item.ingredients.length > 0) {
      tagsWrap.innerHTML = item.ingredients.map(ing => `
        <span class="cm-ing-pill">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          ${escapeHtml(ing)}
        </span>
      `).join('');
      tagsWrap.style.display = 'flex';
    } else {
      tagsWrap.innerHTML = '';
      tagsWrap.style.display = 'none';
    }
  }

  const isCustom = item.customizable;
  const cocWrap = document.getElementById('cm-coccion-section');
  const remWrap = document.getElementById('cm-removables-section');
  const extWrap = document.getElementById('cm-extra-groups');
  
  if (cocWrap) cocWrap.style.display = (isCustom && MENU.customizationOptions.coccion.length > 0 && item.categoryKey === 'hamburguesas') ? '' : 'none';
  if (remWrap) remWrap.style.display = isCustom ? '' : 'none';
  if (extWrap) extWrap.style.display = isCustom ? '' : 'none';

  document.querySelectorAll('.cm-opt').forEach(o => o.classList.remove('sel'));
  const cocOpt = document.querySelector('#cm-coccion .cm-opt');
  if (cocOpt) cocOpt.classList.add('sel');
  
  const commentNode = document.getElementById('cm-comment');
  if (commentNode) commentNode.value = '';

  cmQty = 1;
  const qtyNode = document.getElementById('cmQtyValue');
  if (qtyNode) qtyNode.textContent = cmQty;

  document.getElementById('cmOverlay').classList.add('open');
}


function changeCmQty(delta) {
  cmQty = Math.min(20, Math.max(1, cmQty + delta));
  document.getElementById('cmQtyValue').textContent = cmQty;
}

function closeCM(e) {
  if (e.target === document.getElementById('cmOverlay')) closeCMBtn();
}

function closeCMBtn() {
  document.getElementById('cmOverlay').classList.remove('open');
  if (reopenOrderAfterCustom) { reopenOrderAfterCustom = false; openOrder(); }
}

function selOpt(btn) {
  btn.closest('.cm-options').querySelectorAll('.cm-opt').forEach(o => o.classList.remove('sel'));
  btn.classList.add('sel');
}

function toggleRem(btn) { btn.classList.toggle('sel'); }
function toggleExtra(btn) { btn.classList.toggle('sel'); }

function confirmCustom() {
  if (!currentProduct) return;

  const coc = document.querySelector('#cm-coccion .cm-opt.sel');
  const cocText = coc ? coc.textContent : '';

  const rems = [...document.querySelectorAll('.cm-opt.rem.sel')].map(o => o.textContent);

  let extraPrice = 0;
  const extras = [...document.querySelectorAll('[data-price].sel')].map(o => {
    extraPrice += parseInt(o.dataset.price);
    return o.textContent;
  });

  const comment = document.getElementById('cm-comment').value.trim();

  const customParts = [];
  const contents = contentsLabel(currentProduct);
  if (contents) customParts.push(contents);
  if (cocText && cocText !== MENU.customizationOptions.coccion[0]) customParts.push(cocText);
  if (rems.length) customParts.push(rems.join(', '));
  if (extras.length) customParts.push(extras.join(', '));
  if (comment) customParts.push(comment);

  cart.push({
    id: currentProduct.id + '_' + Date.now(),
    productId: currentProduct.id,
    name: currentProduct.name,
    price: currentProduct.price + extraPrice,
    qty: cmQty,
    custom: customParts.join(' · '),
  });

  updateBar();
  document.getElementById('cmOverlay').classList.remove('open');
  if (reopenOrderAfterCustom) { reopenOrderAfterCustom = false; openOrder(); }
}

let lastBadgedIds = new Set();

function updateCardBadges() {
  // El catálogo tiene ~90 productos: en vez de recorrerlos todos en cada
  // click del carrito, solo tocamos los que tienen cantidad ahora o la
  // tenían antes (son unos pocos, no todo el catálogo).
  const counts = {};
  cart.forEach(i => { counts[i.productId] = (counts[i.productId] || 0) + i.qty; });

  const idsToUpdate = new Set([...lastBadgedIds, ...Object.keys(counts)]);
  idsToUpdate.forEach(id => {
    const count = counts[id] || 0;
    const el = document.querySelector(`[data-item-badge="${id}"]`);
    if (el) {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    }
    const card = document.getElementById('pcard-' + id);
    if (card) card.classList.toggle('has-in-cart', count > 0);
  });

  lastBadgedIds = new Set(Object.keys(counts));
}

function updateBar() {
  const total = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const count = cart.reduce((a, i) => a + i.qty, 0);
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartTotal').textContent = '$' + total.toLocaleString('es-AR');
  const bar = document.getElementById('cartBar');
  bar.classList.toggle('gone', cart.length === 0);

  const headerCount = document.getElementById('headerCartCount');
  headerCount.textContent = count;
  headerCount.hidden = count === 0;

  if (cart.length > 0) {
    bar.classList.remove('bounce');
    void bar.offsetWidth;
    bar.classList.add('bounce');
    try { navigator.vibrate?.(15); } catch {}

    const headerBtn = document.getElementById('headerCartBtn');
    headerBtn.classList.remove('bounce');
    void headerBtn.offsetWidth;
    headerBtn.classList.add('bounce');
  }

  updateCardBadges();
  localStorage.setItem('menuCart', JSON.stringify(cart));
}

function removeItem(cartId) {
  const idx = cart.findIndex(i => i.id === cartId);
  if (idx !== -1) cart.splice(idx, 1);
  updateBar();
  openOrder();
}

function changeQty(cartId, delta) {
  const item = cart.find(i => i.id === cartId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(i => i.id !== cartId);
  }
  updateBar();
  openOrder();
}

function askConfirm(message, okLabel) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirmOverlay');
    document.getElementById('confirmTitle').textContent = message;
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    okBtn.textContent = okLabel || 'Confirmar';

    function cleanup(result) {
      overlay.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.classList.add('open');
  });
}

async function clearCart() {
  if (cart.length === 0) return;
  const ok = await askConfirm('¿Vaciar todo el pedido?', 'Sí, vaciar');
  if (!ok) return;
  cart = [];
  updateBar();
  closeOrderBtn();
}

function openOrder() {
  const list = document.getElementById('omItems');
  if (cart.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--muted);padding:24px;font-size:13px">Todavía no agregaste nada</div>';
  } else {
    list.innerHTML = cart.map(item => `
      <div class="om-item">
        <div class="om-item-main">
          <div class="om-item-info">
            <div class="om-item-name">${escapeHtml(item.name)}</div>
            ${item.custom ? `<div class="om-item-custom">${escapeHtml(item.custom)}</div>` : ''}
          </div>
          <button class="om-item-remove" onclick="removeItem('${item.id}')" title="Quitar" aria-label="Quitar">✕</button>
        </div>
        <div class="om-item-bottom">
          <div class="om-item-qty">
            <button onclick="changeQty('${item.id}', -1)" aria-label="Restar cantidad">−</button>
            <span>${item.qty}</span>
            <button onclick="changeQty('${item.id}', 1)" aria-label="Sumar cantidad">+</button>
          </div>
          <span class="om-item-price">$${(item.price * item.qty).toLocaleString('es-AR')}</span>
        </div>
      </div>
    `).join('');
  }

  document.getElementById('delInputWrap').classList.toggle('show', deliveryMode === 'delivery');
  document.getElementById('zoneInputWrap')?.classList.toggle('show', deliveryMode === 'delivery');
  updateOrderTotals();
  showOrderError('');
  document.getElementById('omClosedNotice').hidden = MENU.brand.isOpen;

  // Autocompletar datos del cliente desde pedidos anteriores
  try {
    const savedName = localStorage.getItem('customer_name') || '';
    const savedPhone = localStorage.getItem('customer_phone') || '';
    const savedAddress = localStorage.getItem('customer_address') || '';

    const nameInput = document.getElementById('nameInput');
    if (nameInput && !nameInput.value && savedName) nameInput.value = savedName;

    const phoneInput = document.getElementById('phoneInput');
    if (phoneInput && !phoneInput.value && savedPhone) phoneInput.value = savedPhone;

    const delInput = document.getElementById('delInput');
    if (delInput && !delInput.value && savedAddress) delInput.value = savedAddress;
  } catch {}

  document.getElementById('wspBtn').disabled = !MENU.brand.isOpen;
  document.getElementById('orderOverlay').classList.add('open');

  // Los sugeridos recorren todo el catálogo para armar la lista: se difieren
  // un par de frames para que no compitan con la animación de apertura del
  // modal (evita el lag/stutter al entrar, sobre todo en celulares).
  requestAnimationFrame(() => requestAnimationFrame(renderUpsell));
}

function renderUpsell() {
  const wrap = document.getElementById('omUpsell');
  if (cart.length === 0) { wrap.innerHTML = ''; return; }

  const cartProductIds = new Set(cart.map(i => i.productId));
  const suggestions = [...catalog.values()]
    .filter(item => !cartProductIds.has(item.id) && !(typeof item.stock === 'number' && item.stock <= 0))
    .sort((a, b) => (a.customizable === b.customizable) ? 0 : (a.customizable ? 1 : -1))
    .slice(0, 8);

  if (suggestions.length === 0) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = `
    <div class="om-upsell-label">Completá tu pedido</div>
    <div class="upsell-scroll">
      ${suggestions.map(item => `
        <div class="upsell-card">
          <img src="${item.img || 'assets/mia-logo.png'}" class="upsell-img" alt="${escapeHtml(item.name)}" loading="lazy">
          <div class="upsell-name">${escapeHtml(item.name)}</div>
          <div class="upsell-price">$${item.price.toLocaleString('es-AR')}</div>
          <button class="upsell-add" data-upsell-add="${item.id}">Agregar</button>
        </div>
      `).join('')}
    </div>
  `;

  wrap.querySelectorAll('[data-upsell-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = catalog.get(btn.dataset.upsellAdd);
      if (item.customizable) {
        document.getElementById('orderOverlay').classList.remove('open');
        reopenOrderAfterCustom = true;
        openCustom(item.id);
      } else {
        quickAdd(item.id, null);
      }
    });
  });
}

function closeOrder(e) {
  if (e.target === document.getElementById('orderOverlay')) closeOrderBtn();
}

function closeOrderBtn() {
  document.getElementById('orderOverlay').classList.remove('open');
}

function toggleCash() {
  const payMode = document.getElementById('payInput').value;
  document.getElementById('cashInputWrap').style.display = payMode === 'efectivo' ? 'block' : 'none';
  const info = document.getElementById('transferInfo');
  const alias = MENU && MENU.brand.transferAlias;
  info.hidden = payMode !== 'transferencia' || !alias;
  if (alias) info.innerHTML = `Alias: <strong>${escapeHtml(alias)}</strong> · Mandá el comprobante por WhatsApp.`;
}

function showOrderError(msg) {
  const el = document.getElementById('omError');
  el.textContent = msg;
  el.hidden = !msg;
}

// ── aviso de pedido enviado ──────────────────────────────

let orderToastTimer = null;

function showOrderToast(orderId) {
  const toast = document.getElementById('orderToast');
  document.getElementById('orderToastText').textContent =
    `Te vamos a confirmar por WhatsApp en breve · Pedido #${orderId.slice(0, 8)}`;
  toast.hidden = false;
  void toast.offsetWidth;
  toast.classList.add('show');
  try { navigator.vibrate?.(20); } catch {}

  clearTimeout(orderToastTimer);
  orderToastTimer = setTimeout(hideOrderToast, 6000);
}

function hideOrderToast() {
  clearTimeout(orderToastTimer);
  const toast = document.getElementById('orderToast');
  toast.classList.remove('show');
  setTimeout(() => { toast.hidden = true; }, 400);
}

// ── checkout ─────────────────────────────────────────────

async function sendWsp() {
  if (cart.length === 0) return;
  if (!MENU.brand.isOpen) {
    showOrderError('Estamos cerrados en este momento. Probá más tarde.');
    return;
  }

  const name = document.getElementById('nameInput').value.trim();
  if (!name) {
    showOrderError('Ingresá tu nombre para continuar.');
    return;
  }
  
  const phone = document.getElementById('phoneInput').value.trim();

  const zoneSelect = document.getElementById('zoneInput');
  const zone = deliveryMode === 'delivery' && zoneSelect ? zoneSelect.value : '';
  if (deliveryMode === 'delivery' && zoneSelect && !zone) {
    showOrderError('Elegí tu barrio para calcular el envío.');
    return;
  }

  const address = document.getElementById('delInput').value.trim();
  if (deliveryMode === 'delivery' && !address) {
    showOrderError('Ingresá la dirección de entrega.');
    return;
  }

  const payment = document.getElementById('payInput').value;
  const cashNote = document.getElementById('cashInput').value.trim();

  const wspBtn = document.getElementById('wspBtn');
  const wspLabel = document.getElementById('wspBtnLabel');
  const wspSpinner = document.getElementById('wspSpinner');
  const wspIcon = document.getElementById('wspIcon');
  wspBtn.disabled = true;
  const origLabel = wspLabel.textContent;
  wspLabel.textContent = 'Enviando...';
  wspSpinner.hidden = false;
  wspIcon.hidden = true;
  showOrderError('');

  let orderId = null;
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, phone, mode: deliveryMode, zone, address, payment, cashNote,
        items: cart.map(i => ({ id: i.productId, price: i.price, qty: i.qty, custom: i.custom })),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo registrar el pedido.');
    orderId = data.orderId;
  } catch (e) {
    showOrderError(e.message || 'No se pudo registrar el pedido. Probá de nuevo.');
    wspBtn.disabled = false;
    wspLabel.textContent = origLabel;
    wspSpinner.hidden = true;
    wspIcon.hidden = false;
    return;
  }

  const fee = getDeliveryFee();
  const zoneLabel = zone === 'otra' ? 'Otra zona (envío a coordinar)' : zone;
  const modeLabel = deliveryMode === 'delivery' ? '*DELIVERY*' : '*RETIRO EN LOCAL*';
  const addressLine = deliveryMode === 'delivery'
    ? `${zoneLabel ? `\nBarrio: ${zoneLabel}` : ''}\nDirección: ${address}`
    : '';
  const payLabel = payment === 'efectivo'
    ? `Pago en efectivo (${cashNote || 'Monto a confirmar'})`
    : `Transferencia${MENU.brand.transferAlias ? ` (alias ${MENU.brand.transferAlias}) — envío el comprobante` : ''}`;

  let msg = `Hola ${MENU.brand.name}, soy ${name}, quiero hacer un pedido.\n\n${modeLabel}${addressLine}\n${payLabel}\n\n`;
  cart.forEach(item => {
    msg += `- ${item.qty}x ${item.name}`;
    if (item.custom) msg += ` (${item.custom})`;
    msg += ` — $${(item.price * item.qty).toLocaleString('es-AR')}\n`;
  });
  const subtotal = cart.reduce((a, i) => a + i.price * i.qty, 0);
  if (deliveryMode === 'delivery' && zone) {
    msg += zone === 'otra' ? `Envío: a coordinar\n` : `Envío: $${fee.toLocaleString('es-AR')}\n`;
  }
  msg += `\n*TOTAL: $${(subtotal + fee).toLocaleString('es-AR')}*\n\nPedido #${orderId.slice(0, 8)}\n¿Me confirman disponibilidad?`;

  // Guardar datos del cliente para próximas compras
  try {
    localStorage.setItem('customer_name', name);
    if (phone) localStorage.setItem('customer_phone', phone);
    if (address) localStorage.setItem('customer_address', address);
    if (zone) localStorage.setItem('customer_zone', zone);
  } catch {}

  window.open('https://wa.me/' + MENU.brand.whatsappNumber + '?text=' + encodeURIComponent(msg), '_blank');

  wspBtn.disabled = false;
  wspLabel.textContent = origLabel;
  wspSpinner.hidden = true;
  wspIcon.hidden = false;
  cart = [];
  updateBar();
  document.getElementById('orderOverlay').classList.remove('open');
  showOrderToast(orderId);
}



