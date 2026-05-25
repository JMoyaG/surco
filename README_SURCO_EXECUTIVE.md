# SURCO Executive

App gerencial web con frontend React/Vite y backend Node/Express para consultar SQL Server.

## 1. Instalar dependencias

```bash
npm install
```

## 2. Configurar variables

Copiar `.env.example` a `.env` y ajustar el password de SQL:

```env
DB_PASSWORD=TU_PASSWORD_SQL
DB_SERVER=172.22.1.7
DB_DATABASE=CobsysSurco
```

## 3. Correr backend

```bash
npm run server
```

Probar:

```txt
http://localhost:3001/api/health
http://localhost:3001/api/dashboard/resumen
```

## 4. Correr frontend

En otra terminal:

```bash
npm run dev
```

La app abre en:

```txt
http://localhost:5173
```

## 5. Correr todo junto

```bash
npm run dev:full
```

## Endpoints listos

- `/api/dashboard/resumen`
- `/api/dashboard/proveedores`

El frontend intenta leer el servidor cada 5 minutos. Si el servidor no está disponible, muestra datos demo sin romper la pantalla.
