# 🏭 Sistema SCADA - IC2-IC3-IC4

## 📋 Descripción

Sistema integral de monitorización y control SCADA (*Supervisory Control And Data Acquisition*) para gestión industrial, diseñado con arquitectura reactiva en tiempo real vía **WebSockets** y **MQTT**:
- ⚡ **Control de Procesos en Tiempo Real**: Paneles dinámicos parametrizados, sliders y dosificación de recetas en horas y minutos.
- 🔄 **WebSockets Bidireccionales (<20ms)**: Servidor ASGI Daphne + Django Channels con difusión instantánea a la interfaz web sin polling.
- 📊 **Monitorización de Sensores y Actuadores**: Diagrama P&ID industrial con 12 componentes en vivo y auto-descubrimiento.
- 🎛️ **Personalizador de Comandos**: Creación y edición de comandos, secciones y tópicos MQTT desde la UI sin modificar código.
- 🏭 **Clasificación de Sistemas**: Soporte multirrubro (`FLUIDOS`, `SOLIDOS`, `EMPAQUE`, `TEMPERATURA`, `GENERAL`).
- 📅 **Planificación de Producción**: Diagrama de Gantt, calendario mensual y ejecución automática de recetas.
- 📦 **Gestión de Almacenamiento & Bombos**: Control de reposición con selectores numéricos directos (`1, 2, 3, 4`).
- 🔐 **Seguridad & Credenciales**: Control de acceso por rangos (1-8), claves de registro y administración de usuarios Mosquitto `passwd`.
- 🌐 **Gateway IoT & Túnel Seguro**: Broker Mosquitto con autenticación y exposición remota vía Ngrok Tunnel.

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DOCKER COMPOSE STACK                             │
│                                                                             │
│  ┌──────────────┐     ┌────────────────────────┐     ┌───────────────────┐  │
│  │  PostgreSQL  │     │     Django Backend     │     │     React SCADA   │  │
│  │   Database   │←───→│    (Daphne / Channels) │←───→│    (Vite / TS)    │  │
│  │    :5432     │     │         :8000          │ WS  │       :5173       │  │
│  └──────────────┘     └───────────▲────────────┘     └───────────────────┘  │
│                                   │                                         │
│                       ┌───────────▼────────────┐     ┌───────────────────┐  │
│                       │   Mosquitto Broker     │     │   Ngrok Tunnel    │  │
│                       │   (MQTT Auth :1883)    │     │  (HTTPS Seguro)   │  │
│                       └───────────▲────────────┘     └───────────────────┘  │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │ MQTT (1883)
                          ┌─────────▼──────────┐
                          │  Raspberry Pi / GW │  
                          │  Gateway Telemetry │
                          └─────────▲──────────┘
                                    │ Serial USB
                          ┌─────────▼──────────┐
                          │  Hardware / PLC    │  
                          │  Arduino / Sensores│
                          └────────────────────┘
```

---

## 🚀 Inicio Rápido con Docker

```powershell
# 1. Levantar todos los servicios
docker compose up -d

# 2. Aplicar migraciones de base de datos
docker compose exec backend python manage.py migrate

# 3. Acceder al sistema
# Frontend SCADA: http://localhost:5173
# Backend API & Admin: http://localhost:8000/admin
```

---

## 📁 Estructura del Repositorio

```
IC2-IC3/
├── 📄 docker-compose.yml          # Orquestación (PostgreSQL, Backend, Frontend, Mosquitto, Ngrok)
├── 📄 requirements.txt             # Dependencias de Python consolidadas
├── 📘 INSTALACION.md               # Guía completa de instalación y configuración
│
├── 🐍 mysite/                      # Backend Django REST Framework + Channels
│   ├── Dockerfile
│   ├── requirements.txt            # Daphne, Channels, DRF, Paho-MQTT, psycopg2
│   ├── manage.py
│   ├── mysite/                     # Configuración Django (settings.py, asgi.py, wsgi.py)
│   └── polls/                      # Modelos, Vistas, Consumers WS y Worker MQTT
│       ├── models.py               # Modelos SCADA, MapeoAccionMQTT, Empleado, etc.
│       ├── consumers.py            # Consumer WebSocket para /ws/scada/
│       ├── routing.py              # Enrutador WebSocket de Django Channels
│       ├── views.py                # Endpoints API REST optimizados (<100ms)
│       └── management/commands/
│           └── mqtt_worker.py      # Daemon de ingesta MQTT y difusión WebSocket
│
├── ⚛️ scada-ui/                    # Frontend React 18 + Vite + TypeScript + Tailwind
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── pages/
│       │   ├── VisualizacionSCADA.tsx    # Diagrama P&ID, tipo de sistema y controles dinámicos
│       │   ├── GuiaSistema.tsx           # Documentación interactiva del sistema
│       │   ├── PlanificacionProduccion.tsx# Gantt, calendario y recetas
│       │   ├── MonitorizacionSCADA.tsx   # Gráficos de telemetría y alarmas en vivo
│       │   ├── AdministracionAlmacenamiento.tsx # Tanques y reposición
│       │   ├── CredencialesPermisos.tsx  # Claves, passwd y matriz de roles 1-8
│       │   └── ...
│       ├── components/scada/
│       │   ├── DynamicScadaPanels.tsx    # Motor de controles y sliders parametrizados
│       │   ├── GestorComandosModal.tsx   # Personalizador de comandos y secciones
│       │   └── ScadaFlowDiagram.tsx      # Diagrama de flujo SVG animado
│       └── hooks/
│           └── useScadaWebSocket.ts      # Hook de conexión WebSocket en tiempo real
│
├── 📡 mosquitto/                   # Broker MQTT Eclipse Mosquitto
│   ├── config/mosquitto.conf
│   └── README.md
│
├── 📚 docs/                        # Especificaciones y guías complementarias
│   ├── mqtt_spec.md                # Especificación del contrato y tópicos MQTT
│   ├── commands.md                 # Comandos útiles de administración
│   └── quickstart.md               # Resumen de inicio rápido
│
└── 🤖 control/                     # Código de Gateways y hardware IoT
```

---

## 🛠️ Stack Tecnológico

### Backend & Comunicaciones
- **Django 5.1+ & Django REST Framework**: API REST optimizada con consultas atómicas.
- **Django Channels & Daphne (ASGI)**: WebSockets en tiempo real (`/ws/scada/`).
- **PostgreSQL 15**: Base de datos relacional con integridad referencial.
- **Eclipse Mosquitto**: Broker MQTT con autenticación mediante archivo `passwd`.
- **Paho MQTT**: Ingesta automatizada y auto-descubrimiento en segundo plano (`mqtt_worker.py`).

### Frontend
- **React 18 & TypeScript**: Interfaz reactiva y tipado estricto.
- **Vite**: Empaquetado y recarga ultrarrápida.
- **shadcn/ui & Tailwind CSS**: Componentes modernos y paleta visual oscura SCADA.
- **Recharts**: Visualización de series temporales y tendencias.
- **Lucide React**: Iconografía industrial estandarizada.

---

## 🧪 Comandos Útiles

```powershell
# Verificación de tipos TypeScript en Frontend
cd scada-ui && npx tsc --noEmit

# Chequeo de consistencia de Django Backend
docker compose exec backend python manage.py check

# Monitorear todo el tráfico MQTT en consola
docker compose exec mosquitto mosquitto_sub -u admin -P admin -t "#" -v

# Ejecutar el Worker MQTT manualmente
docker compose exec backend python manage.py mqtt_worker
```
