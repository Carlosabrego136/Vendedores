# Vendedores — ENVIOS AYORA (proyecto separado)

Sección de "Vendedores" separada del panel de administración principal, para
que la auxiliar de la clienta pueda usarla sin necesitar acceso al resto del
sistema.

- **Público, sin login** — como la página de rastreo.
- **Mismas funciones** que `/admin/vendedores` del proyecto principal:
  agregar vendedor, buscar, mostrar/ocultar los desactivados, ver/imprimir QR,
  editar, desactivar/reactivar, eliminar.
- **Comparte la misma base de datos** (Aiven Postgres) que el sistema
  principal — no es una copia. Un vendedor agregado o editado aquí aparece
  también en el panel principal, y viceversa.

## Configuración

1. Copia `.env.example` a `.env.local` y pon ahí la **misma** cadena de
   conexión (`DATABASE_URL`) que usa el proyecto principal.
2. `npm install`
3. `npm run dev` para probar en local, o `npm run build && npm start` para
   producción.

No corre ninguna migración aquí — las tablas (`vendedores`, `categorias`) ya
existen porque las crea el proyecto principal. Este proyecto solo lee y
escribe en ellas.

## Despliegue en Vercel

Al crear el proyecto en Vercel, agrega la variable de entorno
`DATABASE_URL` con el mismo valor que el proyecto principal (Settings →
Environment Variables).
