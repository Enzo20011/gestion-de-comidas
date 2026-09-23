# Sabor Urbano — Menú Digital

Menú digital de una hamburguesería con pedido online por WhatsApp. Backend en Node/Express + frontend estático, pensado como plantilla genérica para un local de comidas.

## Funcionalidad

- Menú por categorías, cargado dinámicamente desde el backend (`GET /api/menu`)
- Modo Retiro en local / Delivery
- Personalización de producto: cocción, sacar ingredientes, extras agrupados con precio (ej. "Extras" y "Salsas y potes"), comentario libre y cantidad
- Carrito con persistencia en `localStorage`, cantidad editable por ítem (+/-) y carrusel "Completá tu pedido" con sugeridos de un click
- Checkout con nombre, dirección (si es delivery) y método de pago
- Estado Abierto/Cerrado real según el horario configurado (`brand.openRanges` en `data/menu.json`): el sitio muestra un banner y lo indica en el header, y el servidor rechaza pedidos fuera de horario aunque alguien intente saltarse la interfaz
- Buscador de productos por nombre, sin distinguir tildes, en todo el menú
- Cada pedido se guarda en el servidor (`POST /api/orders`) y además se envía como mensaje pre-armado a WhatsApp
- Panel de administración (`/admin.html`) con login propio (usuario/clave, sin el cartel feo del navegador) y tres pestañas:
  - **Dashboard**: ingresos y pedidos de hoy y del mes, comparados contra el período anterior (▲/▼ %), y un gráfico de barras de ingresos por día (7/14/30 días) con tooltip al pasar el mouse
  - **Pedidos**: se actualiza solo cada 15 segundos (y al instante si volvés a la pestaña del navegador) — no hace falta apretar "Actualizar" para ver un pedido nuevo. Cuando llega uno, suena un aviso, se resalta la tarjeta, aparece un mensaje, y si la pestaña está de fondo se agrega un contador al título ("(1) Panel de administración") — con el botón "Activar avisos" también manda una notificación del sistema aunque tengas el navegador minimizado. Etiqueta de estado con color para identificar cada pedido de un vistazo, botón directo para cancelar (elimina el pedido) y cambio de estado (nuevo → en preparación → listo → entregado)
  - **Menú**: agregar, editar y eliminar categorías y productos (combos, gaseosas, lo que sea) sin tocar código — incluye subir fotos nuevas

## Cómo correrlo

Requiere Node.js (probado con Node 24).

```bash
npm install
npm start
```

Abrir `http://localhost:8765`. El puerto y las credenciales de admin se configuran en `.env` (ver `.env.example`).

Para desarrollo con reinicio automático al guardar cambios:

```bash
npm run dev
```

## Estructura

```
server.js         Servidor Express: sirve el frontend y expone la API
data/menu.json    Contenido del menú (categorías, productos, extras) — se edita a mano
data/orders.json  Pedidos guardados (se crea/actualiza solo, no editar a mano)
public/           Frontend estático
  index.html      Estructura de la página (el contenido del menú se inyecta por JS)
  style.css       Estilos (tema oscuro, responsive)
  script.js       Carrito, modales y checkout, todo alimentado por /api/menu
  admin.html/js   Panel de pedidos y editor de menú
  logo.svg        Logo genérico (badge circular)
  assets/         Fotos de productos
```

## API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/menu` | No | Devuelve el menú completo (marca, categorías, opciones de personalización) |
| POST | `/api/orders` | No | Crea un pedido. Valida datos y recalcula el total en el servidor |
| POST | `/api/admin/login` | No | Inicia sesión (`{username, password}`), setea la cookie de sesión |
| POST | `/api/admin/logout` | No | Cierra la sesión |
| GET | `/api/admin/session` | Sesión | Chequeo simple de "¿sigo logueado?" |
| GET | `/api/admin/stats` | Sesión | Ingresos/pedidos de hoy, ayer, este mes, mes pasado, y serie diaria (30 días) para el gráfico |
| GET | `/api/orders` | Sesión | Lista todos los pedidos, más nuevos primero |
| PATCH | `/api/orders/:id` | Sesión | Actualiza el estado de un pedido |
| DELETE | `/api/orders/:id` | Sesión | Elimina un pedido (lo usa el botón "Cancelar pedido") |
| GET | `/api/admin/assets` | Sesión | Lista las imágenes disponibles en `public/assets/` |
| POST | `/api/admin/upload` | Sesión | Sube una imagen (máx. 5MB, png/jpg/webp/gif) y la guarda en `public/assets/` |
| POST | `/api/categories` | Sesión | Crea una categoría |
| PUT | `/api/categories/:key` | Sesión | Edita una categoría |
| DELETE | `/api/categories/:key` | Sesión | Elimina una categoría y sus productos |
| POST | `/api/items` | Sesión | Crea un producto dentro de una categoría |
| PUT | `/api/items/:id` | Sesión | Edita un producto (o lo mueve de categoría) |
| DELETE | `/api/items/:id` | Sesión | Elimina un producto |

`/admin.html` es pública (muestra la pantalla de login); lo que está protegido es la API. El login usa una cookie de sesión firmada (HMAC con `SESSION_SECRET`, httpOnly, dura 7 días) en vez del cartel de autenticación del navegador. Las credenciales siguen siendo `ADMIN_USER` / `ADMIN_PASS` en `.env`.

`POST /api/orders` tiene un límite de 10 pedidos por minuto por IP para evitar spam, y valida que cada producto exista en `data/menu.json` y que el precio esté dentro de un rango razonable (precio base + extras posibles), para que no se pueda manipular el precio desde el navegador.

## Personalizar para tu negocio

- **Menú, precios, categorías, productos, fotos**: desde `/admin.html` → pestaña "Menú" (no hace falta tocar código ni reiniciar nada). También se puede editar `data/menu.json` a mano si se prefiere.
- **Nombre, dirección, horarios, número de WhatsApp**: objeto `"brand"` al principio de `data/menu.json`
- **Horario real de atención**: `brand.openRanges` (pares `["HH:MM","HH:MM"]`, se aplican todos los días) y `brand.timezone`
- **Usuario/clave del panel admin**: `.env` (`ADMIN_USER`, `ADMIN_PASS`) — el `.env` actual ya tiene una clave generada al azar, cambiarla es recomendable antes de usarlo en producción
- **Clave de firma de sesión**: `.env` (`SESSION_SECRET`) — ya tiene un valor generado al azar; si se pierde o se cambia, se cierran todas las sesiones activas
- **Logo**: reemplazar `public/logo.svg`

## Archivos sin usar

`logo.jpg`, `raw.html` y `replace.js` quedan en la raíz como referencia del scrape original pero no los usa el servidor ni el frontend — se pueden borrar sin afectar el sitio.

## Notas de seguridad

- **`ADMIN_OPEN_LOGIN=true` y `FORCE_OPEN=true` en `.env` están activos ahora mismo**: el login de `/admin.html` acepta cualquier usuario/contraseña (no vacíos), y el local figura "Abierto" siempre sin importar el horario configurado — así se puede probar el flujo de pedidos completo en cualquier momento. Son para probar sin trabas. Antes de usar el sitio con pedidos reales, borrar esas líneas de `.env` (o ponerlas en `false`) para que vuelva a pedir el usuario/clave reales y a respetar el horario real.
- `.env` está en `.gitignore`: nunca subir las credenciales ni `SESSION_SECRET` a un repositorio.
- La cookie de sesión es httpOnly y `SameSite=Lax`. Para producción real (dominio público) conviene servir todo detrás de HTTPS: el servidor ya agrega el flag `Secure` a la cookie automáticamente cuando detecta la conexión segura.
- El servidor guarda los pedidos en `data/orders.json` (archivo plano). Sirve para un local chico; si el volumen de pedidos crece conviene migrar a una base de datos.
- Cancelar un pedido lo **elimina** de `data/orders.json` (no queda historial). Si en algún momento querés conservar los cancelados para análisis, es cuestión de cambiar el botón para que haga un `PATCH` de estado en vez de un `DELETE`.
