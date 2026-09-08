# ⚡ Inicio Rápido - Sistema SCADA

## 1. Requisitos
- [Docker Desktop](https://www.docker.com/products/docker-desktop) instalado y en ejecución.

## 2. Puesta en Marcha

```powershell
# 1. Levantar el stack completo
docker compose up -d

# 2. Aplicar migraciones
docker compose exec backend python manage.py migrate

# 3. Acceder al panel SCADA
# Frontend: http://localhost:5173
# Backend: http://localhost:8000/admin
```

## 3. Credenciales y Puertos por Defecto

- **Web Frontend**: `http://localhost:5173`
- **Backend API**: `http://localhost:8000`
- **Broker MQTT**: `localhost:1883` (`admin` / `admin`)
- **WebSockets SCADA**: `ws://localhost:8000/ws/scada/`
- **PostgreSQL**: `localhost:5432` (`postgres` / `postgres`)
