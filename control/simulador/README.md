# Simulador SCADA MQTT Interactivo & GUI

Simulador interactivo para pruebas locales y remotas del sistema SCADA. Simula sensores físicos (bombas de ingredientes, mezclador, caudales de tuberías) y responde a comandos de control desde la aplicación web.

**Casos de uso:**
- ✅ Pruebas de integración MQTT sin hardware Arduino
- ✅ Desarrollo local de la web sin Raspberry Pi
- ✅ Testing de múltiples "gateways" simultáneamente
- ✅ Demostración/presentaciones del sistema

---

## 📦 Estructura del Proyecto

```
simulador/
├── README.md                    # Este archivo
├── config.yaml                  # Configuración MQTT y sensores
├── .env.example                 # Variables de entorno (copiar a .env)
├── .gitignore                   # Git ignore rules
├── requirements.txt             # Dependencias Python
│
├── gui_simulador.py             # 🖥️  Interfaz gráfica (GUI) Tkinter
├── mock_mqtt_gateway.py         # 🔌 Simulador daemon (consola/background)
├── mqtt_client.py               # 📡 Cliente MQTT compartido
│
├── logs/                        # 📋 Logs de ejecución (generado)
├── data/                        # 💾 Datos locales (si aplica)
└── docs/                        # 📚 Documentación adicional (si aplica)
```

---

## 🚀 Instalación Rápida

### 1. Preparar Entorno

```bash
# Clonar el directorio o navegar a él
cd control/simulador/

# Crear entorno virtual (recomendado)
python3 -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt
```

### 2. Configurar Conexión MQTT

**Opción A: Usando `config.yaml` (recomendado)**

Edita `config.yaml` con tus datos del broker MQTT:

```yaml
mqtt:
  broker: 192.168.1.100         # IP del broker Mosquitto
  port: 1883
  tenant: Rafaela_S.A           # DEBE coincidir con el gateway real
  gateway_id: sim_gateway_01    # ID único para este simulador
  username: admin
  password: admin
  default_sector: A1
  default_system: linea_mezclado_1
```

**Opción B: Usando variables de entorno (`.env`)**

```bash
# Copiar template
cp .env.example .env

# Editar .env con tus valores
nano .env  # O tu editor favorito
```

---

## 🎮 Opciones de Ejecución

### Modo 1: GUI Interactiva (Recomendado para Desarrollo)

Abre interfaz gráfica con controles interactivos:

```bash
python gui_simulador.py
```

**Características GUI:**
- 🎚️ **Sliders en tiempo real**: Controlar Temperatura, Presión, Niveles de Bombos (%)
- 💡 **Luces LED virtuales**: Indicadores visuales de actuadores (Verde/Gris)
- 🔄 **Modo Aleatorio o Manual**: Toggle entre telemetría sintética o sliders
- 🆔 **Gateway ID Editable**: Cambiar MAC/ID sin reiniciar
- 📊 **Estadísticas en vivo**: Mensajes enviados/recibidos, uptime
- ⚙️ **Panel de Configuración**: Broker, Puerto, Tenant, Sector, Sistema

### Modo 2: Daemon CLI (Background/Production-like)

Ejecuta en segundo plano sin interfaz gráfica:

```bash
python mock_mqtt_gateway.py
```

O con nohup para que persista tras cerrar terminal:

```bash
nohup python mock_mqtt_gateway.py > logs/simulador.log 2>&1 &
```

---

## ⚙️ Configuración Detallada

### `config.yaml` - Secciones Principales

```yaml
mqtt:
  broker: localhost             # Broker MQTT (IP o hostname)
  port: 1883
  username: admin
  password: admin
  tenant: Rafaela_S.A          # Nombre de la organización
  gateway_id: sim_gateway_01   # ID único del simulador
  client_id: scada_simulador   # ID cliente MQTT (único en el broker)
  keepalive: 60                # Seconds
  qos: 1                       # Quality of Service (0, 1, o 2)
  
  topics:
    enable_legacy_topics: false  # Usar topics legacy SCADA
    base: scada/planta1          # Base para topics legacy
    
    publish:                     # Topics donde publica telemetría
      sensor_data: sensores/telemetria
      diagnostics: sistema/diagnosticos
    
    subscribe:                   # Topics donde escucha comandos
      pump_1: dispositivos/bomba_1/cmd
      pump_2: dispositivos/bomba_2/cmd
      mixer: dispositivos/mezclador/cmd
    
    subscribe_filters:           # Filtros adicionales (wildcards MQTT)
      - '{tenant}/{gateway_id}/#'
```

### `.env.example` - Variables de Entorno

Copiar a `.env` y personalizar:

```bash
MQTT_BROKER=192.168.1.100
MQTT_PORT=1883
MQTT_USERNAME=admin
MQTT_PASSWORD=admin
MQTT_TENANT=Rafaela_S.A
MQTT_GATEWAY_ID=sim_gateway_01
SIM_INTERVAL=2.0              # Segundos entre publicaciones
SIM_RUN_MODE=gui              # 'gui' o 'daemon'
LOG_LEVEL=INFO
DEBUG_MODE=false
```

---

## 🧪 Testing & Validación

### Verificar Conexión MQTT

Usar `mosquitto_sub` para ver mensajes en vivo:

```bash
# En otra terminal
mosquitto_sub -h 192.168.1.100 -u admin -P admin -t "Rafaela_S.A/sim_gateway_01/#"
```

### Enviar Comandos de Prueba

```bash
# Activar bomba 1
mosquitto_pub -h 192.168.1.100 -u admin -P admin \
  -t "Rafaela_S.A/sim_gateway_01/A1/linea_mezclado_1/dispositivos/bomba_1/cmd" \
  -m '{"action": "on", "intensity": 80}'
```

### Ejecutar GUI y CLI Simultáneamente

Para simular múltiples gateways:

```bash
# Terminal 1: GUI con id=sim_gateway_01
python gui_simulador.py

# Terminal 2: Daemon con id=sim_gateway_02 (cambiar config.yaml o .env)
python mock_mqtt_gateway.py
```

---

## 🔍 Comparación: Simulador vs Gateway Real

| Característica | Simulador | Gateway Real |
|---|---|---|
| **Conexión Arduino** | ❌ Simulada | ✅ Serial COM |
| **Telemetría** | 🔄 Sintética/Manual | 📊 Desde Arduino |
| **Base de Datos** | ❌ No | ✅ SQLite |
| **REST API** | ❌ No | ✅ FastAPI |
| **Interfaz Gráfica** | ✅ Tkinter (GUI) | ⚙️ Minimal (config) |
| **Propósito** | 🧪 Testing/Desarrollo | 🏭 Producción |

---

## 📋 Requisitos

- Python 3.8+
- `paho-mqtt>=1.6.1` - Cliente MQTT
- `pyyaml>=6.0` - Parsing de YAML
- `loguru>=0.7.0` - Logging avanzado
- `tkinter` (incluido en Python en la mayoría de sistemas)

### Instalar en Linux (si falta tkinter)

```bash
sudo apt-get install python3-tk
```

---

## 🐛 Troubleshooting

### "Connection refused" o "Cannot connect to broker"

```bash
# Verificar que Mosquitto está corriendo
mosquitto_sub -h 192.168.1.100 -u admin -P admin -t '#' | head

# Ver logs del broker
sudo journalctl -u mosquitto -f
```

### GUI no abre o se congela

```bash
# Correr con debug
DEBUG_MODE=true python gui_simulador.py

# O revisar logs
tail -f logs/simulador.log
```

### Topics no reciben comandos

Verificar:
1. `MQTT_TENANT` y `MQTT_GATEWAY_ID` coinciden entre simulador y comandos
2. Usuario MQTT tiene permisos (ACL)
3. Broker ACL permite el topic subscribe

---

## 📞 Integración con Aplicación Web

### URLs esperadas

La web (`/scada`, `/control`, `/planificacion`) publica comandos en:

```
{MQTT_TENANT}/{MQTT_GATEWAY_ID}/{MQTT_DEFAULT_SECTOR}/{MQTT_DEFAULT_SYSTEM}/dispositivos/{device_name}/cmd
```

Ejemplo:
```
Rafaela_S.A/sim_gateway_01/A1/linea_mezclado_1/dispositivos/bomba_1/cmd
```

### Formato de Comandos Esperado

```json
{
  "action": "on",           // "on" o "off"
  "intensity": 75,          // 0-100 (para bombas con velocidad variable)
  "duration": 300,          // Segundos (opcional)
  "timestamp": 1694000000   // Unix timestamp (opcional)
}
```

---

## 📚 Documentación Relacionada

- [MQTT Topics Reference](../../MQTT_TOPICS_REFERENCE.md)
- [Gateway Real - README](../raspberry_gateway/README.md)
- [Arduino Serial Protocol](../arduino_code/README_ARDUINO.md)

---

## 🤝 Desarrollo y Contribuciones

Si agregas nuevas características al simulador:

1. Sincroniza con cambios en `mqtt_client.py` del gateway real
2. Actualiza `config.yaml` con nuevos parámetros
3. Documenta en este README
4. Prueba en modo GUI y daemon

---

**Última actualización:** 2025-09-08  
**Versión:** 1.0  
**Estado:** ✅ Activo - Pruebas e Integración
