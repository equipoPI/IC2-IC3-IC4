# 🚀 Guía de Instalación y Puesta en Marcha - Proyecto SCADA

## 📋 Índice
1. [Opción A: Docker Compose (Recomendada)](#opcion-a-docker-compose-recomendada)
2. [Opción B: Entorno Local (Sin Docker)](#opcion-b-entorno-local-sin-docker)
3. [Verificación del Sistema](#verificacion-del-sistema)
4. [Estructura de Puertos y Servicios](#estructura-de-puertos-y-servicios)

---

## 🐳 Opción A: Docker Compose (Recomendada)

### Requisitos Previos
- [Docker Desktop](https://www.docker.com/products/docker-desktop) instalado y en ejecución.

### Puesta en Marcha en 3 Pasos:

```powershell
# 1. Levantar el stack completo (PostgreSQL, Backend Daphne, Frontend Vite, Mosquitto, Ngrok)
docker compose up -d

# 2. Aplicar migraciones de base de datos
docker compose exec backend python manage.py migrate

# 3. (Opcional) Crear superusuario administrador
docker compose exec backend python manage.py createsuperuser
```

### URLs de Acceso:
- **Panel Web SCADA**: [http://localhost:5173](http://localhost:5173)
- **API REST & Django Admin**: [http://localhost:8000/admin](http://localhost:8000/admin)
- **WebSockets SCADA**: `ws://localhost:8000/ws/scada/`
- **Broker MQTT Mosquitto**: `localhost:1883`

### Comandos de Operación:
```powershell
# Ver logs en vivo
docker compose logs -f backend
docker compose logs -f frontend

# Reiniciar servicios tras cambios de dependencias
docker compose restart backend

# Detener el stack
docker compose down
```

---

## 🐍 Opción B: Entorno Local (Sin Docker)

Si deseas ejecutar el backend o frontend en tu máquina local para depuración:

### 1. Backend Django + Channels
```powershell
cd mysite

# Crear entorno virtual
python -m venv .venv
.\.venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno (.env) y migrar
python manage.py migrate

# Iniciar servidor ASGI con Daphne
python manage.py runserver
```

### 2. Frontend React + Vite
```powershell
cd scada-ui

# Instalar paquetes
npm install

# Iniciar servidor de desarrollo
npm run dev
```

---

## 🔍 Verificación del Sistema

1. **Chequeo de Tipos TypeScript**:
   ```powershell
   cd scada-ui && npx tsc --noEmit
   ```
2. **Chequeo de Consistencia Django**:
   ```powershell
   docker compose exec backend python manage.py check
   ```
3. **Monitoreo de Telemetría MQTT**:
   ```powershell
   docker compose exec mosquitto mosquitto_sub -u admin -P admin -t "#" -v
   ```

---

## 🌐 Estructura de Puertos y Servicios

| Servicio | Puerto | Protocolo | Descripción |
|---|---|---|---|
| **scada_frontend** | `5173` | HTTP / WS | Interfaz Web React (Vite) |
| **scada_backend** | `8000` | HTTP / WS | Django REST Framework + Daphne (Channels) |
| **scada_db** | `5432` | TCP | PostgreSQL 15 |
| **scada_mosquitto**| `1883` | MQTT | Broker MQTT Eclipse Mosquitto con autenticación |
