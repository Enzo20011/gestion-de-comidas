# Mía Hamburguesería & Cervecería — Menú Digital

Menú digital con pedido online por WhatsApp para **Mía Hamburguesería & Cervecería** (Esq. Santa Inés y Marcelino Benítez, Garupá, Misiones — [@hamburgueseria_mia_](https://www.instagram.com/hamburgueseria_mia_/) · [@mia.burgerbeer](https://www.instagram.com/mia.burgerbeer/)). Backend en Node/Express + frontend estático, con **Postgres (Neon)** como base de datos.

La carta, los precios, las fotos, los horarios, los barrios de envío y el alias de transferencia se importaron de su tienda OlaClick (`hamburgueseria-mia.ola.click`) en septiembre de 2026. Las promos y la identidad visual salen de sus Instagram.

- **Online:** https://mia-hamburgueseria.vercel.app — admin en `/admin.html`
- **Local:** http://localhost:8765 — admin en http://localhost:8765/admin.html

Las dos apuntan a la **misma base de datos en Neon**: un pedido hecho en una aparece en la otra. No es una demo con datos separados.

## Funcionalidad

### Sitio del cliente
- Menú por categorías (Combos, Hamburguesas, Papas, Entradas, Sándwiches, Cervezas, Tragos, Vinos, Gaseosas y agua), cargado desde el backend (`GET /api/menu`)
- Identidad de Mía: logo (tapita de cerveza), banner "Fiel a la Mía", paleta café/cobre/crema, tipografías Anton + Kaushan Script + Outfit
- Tarjetas de promos y novedades debajo del banner (viernes en el local, cumpleaños, delivery), editables en `brand.highlights`
- Productos sin foto (bebidas) muestran el logo de Mía
- Productos agotados se marcan como "Agotado" y no se pueden pedir
- Modo Retiro en local / Delivery
- Detalle de producto con ingredientes, "sacar ingredientes", comentario libre y cantidad. La cocción de la carne y los extras con precio existen en el sistema pero están vacíos porque Mía no los ofrece (se activan cargando `customizationOptions.coccion` / `extraGroups`)
- Carrito con persistencia en `localStorage`, cantidad editable por ítem y carrusel "Completá tu pedido" (no sugiere agotados)
- Checkout con nombre, teléfono, **barrio con costo de envío** (se suma al total), dirección, y pago en efectivo (con "¿con cuánto abonás?") o **transferencia** (muestra el alias y pide el comprobante)
- Estado Abierto/Cerrado según el horario real por día, con trasnoche: el sitio lo indica y el servidor rechaza pedidos fuera de horario
- Buscador por nombre, sin distinguir tildes
- Cada pedido se guarda en la base (`POST /api/orders`) y se abre el WhatsApp del local con el mensaje armado (productos, barrio, envío, total y forma de pago)
- Footer con dirección, horarios, WhatsApp, los dos Instagram y "Cómo llegar" (Google Maps)
- PWA básica (manifest + service worker `mia-cache-v2`)
- Responsive, revisado a 360px de ancho

### Panel de administración (`/admin.html`)
Login propio con usuario y clave, y tres pestañas:
- **Dashboard**: ingresos y pedidos de hoy y del mes contra el período anterior (▲/▼ %) y gráfico de ingresos por día (7/14/30 días)
- **Pedidos**: se actualiza solo (cada 15 segundos y por eventos en vivo). Cuando llega un pedido suena un aviso, se resalta la tarjeta y se suma un contador al título de la pestaña; con "Activar avisos" también manda notificación del sistema. Cada pedido muestra modo, pago, barrio con costo de envío, dirección con link a Maps y botón para escribirle al cliente por WhatsApp. Estados: nuevo → en preparación → listo → entregado; "Cancelar" elimina el pedido. A las 3:00 los pedidos de días anteriores que quedaron abiertos pasan a "entregado" — esto corre dentro del proceso de Node, así que solo funciona si lo dejás corriendo en local (ver la sección de [Deploy en Vercel](#deploy-en-vercel) para esa limitación ahí)
- **Menú**: agregar, editar y eliminar categorías y productos, subir fotos (solo en local, ver abajo) y marcar Disponible/Agotado con un click

### Ticket de cocina (solo local)
Por cada pedido, `printerService.js` genera un `.txt` en `data/prints/` con barrio, envío y total. Está preparado para conectar una impresora térmica más adelante. En Vercel escribe a `/tmp` (se pierde al reciclarse la instancia, no es crítico).

WhatsApp automático (avisar al cliente que su pedido está listo) está deshabilitado: el botón "WhatsApp" del panel no aparece y `GET /api/admin/whatsapp/status` siempre devuelve `available: false`. El botón "Confirmar pedido por WhatsApp" del sitio del cliente funciona igual (abre el chat con el número real de Mía).

## Base de datos (Neon / Postgres)

Todo el estado vive en Postgres, vía `db.js` (vercel `pg`). No hay más archivos JSON como fuente de verdad.

- **`menu`**: una sola fila (`id = 1`) con el menú completo en una columna `data JSONB` (marca, horarios, categorías, productos). Se edita desde `/admin.html` → pestaña "Menú", o a mano con una consulta.
- **`orders`**: una fila por pedido, con columnas para lo que se filtra/ordena (`created_at`, `status`, `total`) y `items JSONB` para el detalle.

### Setup (una sola vez)

1. Crear un proyecto en [Neon](https://console.neon.tech) y copiar el connection string (necesita `?sslmode=require`)
2. Pegarlo en `DATABASE_URL` en `.env` (local) y en las variables de entorno del proyecto en Vercel (`vercel env add DATABASE_URL production`, o desde el dashboard)
3. Correr la migración, que crea las tablas y — si `data/menu.json` todavía existe — importa el menú y los pedidos que hubiera:
   ```bash
   npm run migrate
   ```
4. Listo. `npm start` y el deploy en Vercel ya leen y escriben en Neon.

La migración es **idempotente para el menú**: si la fila `id = 1` ya existe, no la pisa (para reimportar desde `data/menu.json`, borrarla a mano primero). Los pedidos los importa por `id`, salteando los que ya estén.

## Cómo correrlo

Requiere Node.js (probado con Node 24) y un `DATABASE_URL` de Neon configurado (ver arriba).

```bash
npm install
npm start
```

Abrir http://localhost:8765. El puerto y las credenciales se configuran en `.env` (ver `.env.example`).

Para desarrollo con reinicio automático al guardar cambios:

```bash
npm run dev
```

## Deploy en Vercel

El proyecto está publicado en https://mia-hamburgueseria.vercel.app (proyecto `mia-hamburgueseria`). `server.js` exporta la app de Express (Vercel la corre como función serverless) y solo evita `app.listen` / el job de limpieza nocturna cuando detecta la variable `VERCEL`.

```bash
vercel deploy --prod --yes
```

`ADMIN_USER`, `ADMIN_PASS`, `SESSION_SECRET` y `DATABASE_URL` ya están guardadas como variables de entorno del proyecto en Vercel (`vercel env ls production` las lista). Si hace falta cambiarlas: `vercel env add <NOMBRE> production` (pisa la anterior tras confirmar) o desde el dashboard.

Lo único que **no** funciona igual en Vercel:
- **Subir fotos nuevas** desde el admin está deshabilitado (el disco de la función es de solo lectura); sí se puede elegir entre las fotos que ya están en `public/assets/`
- **La limpieza nocturna** (pasar a "entregado" los pedidos viejos abiertos) no corre sola porque no hay un proceso siempre encendido — corre en local si lo dejás prendido, o se puede migrar a un cron de Vercel más adelante
- El botón "Confirmar pedido por WhatsApp" abre el chat con el **número real de Mía**: si se muestra el sitio en vivo, no enviar el mensaje o les llega un pedido de verdad

`.vercelignore` deja afuera `.env`, `node_modules` y los archivos sueltos que no usa el sitio.

## Estructura

```
server.js            Servidor Express: sirve el frontend y expone la API (exporta la app para Vercel)
db.js                 Acceso a Postgres/Neon (menu, orders) — pool de conexión con `pg`
migrate.js            Se corre una vez: crea las tablas e importa data/menu.json y data/orders.json si existen
printerService.js     Genera el ticket de cada pedido en data/prints/ (o /tmp en Vercel)
data/menu.json        Copia de referencia del menú (ya no la lee el servidor; solo la usa migrate.js)
public/
  index.html          Estructura del sitio (el menú se inyecta por JS)
  style.css           Estilos (paleta de Mía, responsive)
  script.js           Carrito, modales, envío por barrio y checkout
  admin.html/js/css   Panel de pedidos, estadísticas y editor de menú
  manifest.json       PWA
  sw.js               Service worker (cache de la app)
  assets/mia-*.png    Logo, banner y fotos reales de productos (de OlaClick)
vercel.json           Config de Vercel
.vercelignore         Archivos que no se suben a Vercel
```

## Configuración de la marca (tabla `menu` → `brand`)

| Campo | Qué es |
|---|---|
| `name`, `fullName`, `tagline` | "Mía", "Mía Hamburguesería & Cervecería", "Fiel a la Mía" |
| `address`, `mapsUrl` | Dirección y link de Google Maps |
| `instagram` | Lista de cuentas `{ label, url }` para el footer |
| `whatsappNumber` | Número al que llegan los pedidos (`543765201692`) |
| `hours`, `scheduleNote` | Textos de horario que se muestran |
| `weeklyHours` | Horario real por día (`"0"` = domingo … `"6"` = sábado), lista de pares `["HH:MM","HH:MM"]`. Los rangos que arrancan en `00:00` son la trasnoche del día anterior. Si no está, se usa `openRanges` (igual todos los días) |
| `timezone` | `America/Argentina/Buenos_Aires` |
| `deliveryZones` | Barrios con costo de envío `{ name, fee }`. El cliente elige uno (o "Otra zona", a coordinar) y el servidor recalcula el envío |
| `transferAlias` | Alias que se muestra al pagar por transferencia |
| `highlights` | Tarjetas de promos `{ icon, title, text }` debajo del banner |

Cada categoría puede tener un `promo` (`badge`, `title`, `highlight`, `desc`) y `customizable: true` para habilitar "sacar ingredientes". Cada producto tiene `id`, `name`, `price`, `desc`, `img`, `ingredients` opcional y `stock` opcional (`0` = agotado; sin `stock` = sin límite).

Todo esto se edita desde `/admin.html` sin tocar la base a mano. Horario cargado: todas las noches de 18:00 a 02:00, jueves y viernes a la noche hasta las 03:00.

## Variables de entorno (`.env`)

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Connection string de Neon (con `?sslmode=require`). Sin esto el servidor no arranca |
| `PORT` | Puerto local (8765) |
| `ADMIN_USER` / `ADMIN_PASS` | Acceso al panel. Hoy es `admin` / `admin`, en local y en producción |
| `SESSION_SECRET` | Firma de la cookie de sesión. Si cambia, se cierran todas las sesiones |
| `ADMIN_OPEN_LOGIN` | `true` = el panel acepta cualquier usuario/clave (solo para probar) |
| `FORCE_OPEN` | `true` = el local figura abierto siempre, ignora el horario (solo para probar o mostrar) |
| `GOOGLE_MAPS_KEY` | Opcional, para autocompletar direcciones si se conecta la API de Google Maps |

## API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/menu` | No | Menú completo (marca, categorías, opciones) con `brand.isOpen` calculado |
| POST | `/api/orders` | No | Crea un pedido. Valida productos, stock, horario y barrio, descuenta stock y recalcula el total con el envío |
| POST | `/api/admin/login` | No | Inicia sesión (`{username, password}`), setea la cookie |
| POST | `/api/admin/logout` | No | Cierra la sesión |
| GET | `/api/admin/session` | Sesión | "¿Sigo logueado?" |
| GET | `/api/admin/stats` | Sesión | Ingresos y pedidos de hoy, ayer, este mes, mes pasado y serie diaria de 30 días |
| GET | `/api/admin/whatsapp/status` | Sesión | Siempre `{ available: false }` (WhatsApp automático deshabilitado) |
| GET | `/api/orders` | Sesión | Pedidos, más nuevos primero |
| GET | `/api/orders/stream` | Sesión | Eventos en vivo cuando cambian los pedidos (SSE) |
| PATCH | `/api/orders/:id` | Sesión | Cambia el estado de un pedido |
| DELETE | `/api/orders/:id` | Sesión | Elimina un pedido |
| GET | `/api/admin/assets` | Sesión | Imágenes disponibles en `public/assets/` |
| POST | `/api/admin/upload` | Sesión | Sube una imagen (máx. 5MB). Deshabilitado en Vercel |
| POST / PUT / DELETE | `/api/categories[/:key]` | Sesión | Crear, editar y eliminar categorías |
| POST / PUT / PATCH / DELETE | `/api/items[/:id]` | Sesión | Crear, editar (o mover de categoría, o cambiar stock) y eliminar productos |

`POST /api/orders` tiene un límite de 10 pedidos por minuto por IP y valida que el precio de cada producto esté dentro del rango posible, para que no se pueda manipular desde el navegador.

## Pendientes para confirmar con Mía

- **Don Santiago**: en OlaClick figura con envío de $300; se cargó $3.000 porque parece un error de tipeo
- **Viernes**: OlaClick no tiene el turno de 18 a 24 de los viernes; se agregó asumiendo que fue un olvido
- **Stock**: solo se importaron como agotados los productos que estaban en 0 en OlaClick; el resto queda sin límite
- **Promos con fecha** (ej. "2 Completas + papas + envío gratis por $18.000" de la semana del 16/9) no se cargaron porque ya vencieron

## Archivos sin usar

No los usa ni el servidor ni el sitio, se pueden borrar: `logo.jpg`, `raw.html`, `replace.js`, `fix_script.js`, `fix_server.js`, `public/logo.svg`, `data/orders.json` (quedó de antes de migrar a Neon) y las imágenes viejas de `public/assets/` que no empiezan con `mia-` (`*_profesional.png`, `menu_*.png`, `media__*.png`, `full_menu_page_*.png`).

## Notas de seguridad

- **`admin` / `admin` es solo para mostrar.** Antes de usarlo con pedidos reales, cambiar `ADMIN_PASS` (en `.env` y en Vercel), y sacar `ADMIN_OPEN_LOGIN` y `FORCE_OPEN`
- `.env` está en `.gitignore` y en `.vercelignore`: nunca subir `DATABASE_URL`, credenciales ni `SESSION_SECRET` a un repositorio
- La cookie de sesión es httpOnly y `SameSite=Lax`, y agrega `Secure` sola cuando la conexión es HTTPS
- Cancelar un pedido lo **elimina** de la base (no queda historial). Si en algún momento se quiere conservar los cancelados para análisis, es cuestión de agregar el estado `"cancelado"` y usar un `PATCH` ahí en vez de un `DELETE`
