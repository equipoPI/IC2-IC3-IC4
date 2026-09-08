# 🐍 Backend Django REST Framework + Channels (SCADA)

Servidor central de control SCADA, persistencia en PostgreSQL, WebSockets en tiempo real y comunicación IoT vía MQTT.

---

## 🏗️ Arquitectura del Backend

- **Django 5.1+**: Core del servidor web.
- **Django REST Framework**: Endpoints de API REST optimizados (<100ms con `select_related`).
- **Daphne & Django Channels (ASGI)**: Servidor WebSocket en `/ws/scada/` para difusión en tiempo real a clientes web sin sobrecarga de polling.
- **Paho MQTT & `mqtt_worker.py`**: Daemon de ingesta en segundo plano para procesar telemetría y disparar actualizaciones reactivas.
- **PostgreSQL 15**: Base de datos relacional con claves foráneas, restricciones de unicidad y auditoría.

---

## 🗄️ Modelos Principales (`polls/models.py`)

1. **`Fabrica` / `Seccion` / `Sistema`**: Jerarquía de plantas industriales con asignación de tipos de proceso (`FLUIDOS`, `SOLIDOS`, `EMPAQUE`, `TEMPERATURA`, `GENERAL`).
2. **`DispositivoSCADA` / `LecturaSensor`**: Catálogo de 12 sensores/actuadores industriales con registro de series temporales.
3. **`MapeoAccionMQTT`**: Comandos dinámicos parametrizados con soporte para `BOTON`, `SLIDER`, `NUMERICO`, `PARAMETRIZADO` y `RECETA`.
4. **`OrdenProduccion` / `PlantillaProduccion` / `Receta`**: Planificación de producción, dosificación con horas y minutos, y seguimiento en tiempo real.
5. **`Empleado` / `HistorialEstadoEmpleado`**: Gestión de personal, cálculo automático de antigüedad y vinculación con `User.is_active`.
6. **`ConfiguracionMQTT` / `RegistroAuditoria`**: Parametrización del broker y trazabilidad de operaciones de usuarios.

---

## 📡 WebSockets y Consumers (`polls/consumers.py` & `polls/routing.py`)

- **Ruta WS**: `ws://localhost:8000/ws/scada/`
- **Grupo Channels**: `scada_telemetry`
- **Eventos Emitidos**:
  - `telemetry_update`: Nueva lectura de sensor procesada por el worker.
  - `model_change`: Cambios de estado en dispositivos o almacenamiento.

---

## 🚀 Comandos de Gestión

```powershell
# Aplicar migraciones en PostgreSQL
python manage.py migrate

# Crear nuevas migraciones
python manage.py makemigrations

# Iniciar el Worker MQTT de ingesta
python manage.py mqtt_worker

# Validar integridad del sistema Django
python manage.py check
```
