# Raspberry Pi Gateway - Sistema SCADA

Sistema intermediario entre Arduino y la aplicación web mediante MQTT, reemplazando la comunicación Bluetooth original.

## 🏗️ Arquitectura del Sistema

```
┌─────────────────┐          Serial          ┌──────────────────────┐          MQTT           ┌─────────────────┐
│                 │  ────────────────────>   │                      │  ────────────────────>  │                 │
│     Arduino     │                           │   Raspberry Pi 4     │                          │   App Web       │
│   (Hardware)    │  <────────────────────   │     (Gateway)        │  <────────────────────  │   (Frontend)    │
└─────────────────┘                           └──────────────────────┘                          └─────────────────┘
                                               │                      │
                                               │  Base de Datos Local │
                                               │    (Última semana)   │
                                               └──────────────────────┘
```

## 📦 Componentes

### 1. **arduino_serial.py**
- Comunicación serial bidireccional con Arduino
- Parseo de datos del protocolo original (Sistema_SCADA)
- Reconexión automática en caso de fallo
- Buffer de comandos

### 2. **mqtt_client.py**
- Cliente MQTT (publicación/suscripción)
- Tópicos organizados por función
- Manejo de QoS y retain messages
- Reconexión automática

### 3. **data_storage.py**
- Base de datos SQLite local
- Almacenamiento de última semana
- Limpieza automática de datos antiguos
- Respaldo y consultas históricas

### 4. **system_diagnostics.py**
- Monitoreo de recursos (CPU, RAM, temperatura)
- Estado de conexiones (Serial, MQTT, Red)
- Logs del sistema
- Alertas automáticas

### 5. **gateway_main.py**
- Orquestador principal
- Gestión de hilos para componentes
- Manejo de errores y recuperación
- API REST local para configuración

## 📋 Requisitos

### Hardware
- Raspberry Pi 4 (2GB RAM mínimo)
- Arduino conectado vía USB
- Conexión a red (Ethernet o WiFi)

### Software
```bash
Python 3.9+
pyserial>=3.5
paho-mqtt>=1.6.1
fastapi>=0.104.0
uvicorn>=0.24.0
psutil>=5.9.0
sqlalchemy>=2.0.0
```

## 🚀 Instalación

### 1. Configurar Raspberry Pi
```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependencias del sistema
sudo apt install -y python3-pip python3-venv git

# Crear entorno virtual
python3 -m venv venv
source venv/bin/activate

# Instalar dependencias Python
pip install -r requirements.txt
```

### 2. Configurar permisos serial
```bash
sudo usermod -a -G dialout $USER
sudo chmod 666 /dev/ttyACM0  # o /dev/ttyUSB0
```

### 3. Configurar como servicio (autoarranque)
```bash
sudo cp raspberry_gateway.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable raspberry_gateway
sudo systemctl start raspberry_gateway
sudo systemctl status raspberry_gateway
```

---

## 🚀 Instalación Completa en Raspberry Pi (Producción)

### Preparación Remota

**Desde tu máquina local:**
```bash
# Copiar código a la RPi
scp -r /home/lautaro/Proyects/IC2-IC3/control/raspberry_gateway/* \
    pi@<IP_RASPBERRYPI>:/home/pi/scada_gateway/

# O usar git si tienes repositorio configurado
ssh pi@<IP_RASPBERRYPI>
cd /opt/scada_gateway
git clone <tu-repo> .
```

### Instalación en la RPi

**Conectar a la RPi:**
```bash
ssh pi@<IP_RASPBERRYPI>

# Crear directorio de instalación
sudo mkdir -p /opt/scada_gateway
cd /opt/scada_gateway

# Crear entorno virtual
python3 -m venv venv
source venv/bin/activate

# Instalar dependencias
pip install --upgrade pip
pip install -r requirements.txt

# Configurar permisos serial (Arduino)
sudo usermod -a -G dialout $USER
sudo chmod 666 /dev/ttyACM0  # o /dev/ttyUSB0 según tu Arduino
```

### Configurar como Servicio Systemd

**Instalar el service file:**
```bash
# Copiar service file a systemd
sudo cp raspberry_gateway.service /etc/systemd/system/
sudo chmod 644 /etc/systemd/system/raspberry_gateway.service

# Actualizar systemd
sudo systemctl daemon-reload

# Habilitar autoarranque
sudo systemctl enable raspberry_gateway

# Iniciar el servicio
sudo systemctl start raspberry_gateway

# Verificar que está corriendo
sudo systemctl status raspberry_gateway
```

### Comandos Útiles (Producción)

```bash
# Ver estado del gateway
sudo systemctl status raspberry_gateway

# Ver logs en tiempo real
sudo journalctl -u raspberry_gateway -f

# Ver últimas 100 líneas de logs
sudo journalctl -u raspberry_gateway -n 100

# Ver logs desde hace 1 hora
sudo journalctl -u raspberry_gateway --since "1 hour ago"

# Detener el gateway (cierre seguro, timeout 10s)
sudo systemctl stop raspberry_gateway

# Reiniciar el gateway
sudo systemctl restart raspberry_gateway

# Ver si está habilitado para autostart
sudo systemctl is-enabled raspberry_gateway

# Deshabilitar autostart (si es necesario)
sudo systemctl disable raspberry_gateway
```

### Troubleshooting - Problemas Comunes

#### El servicio no inicia
```bash
# Ver el error exacto
sudo journalctl -u raspberry_gateway -n 50

# Verificar permisos del archivo service
ls -la /etc/systemd/system/raspberry_gateway.service
# Debe ser 644 (rw-r--r--)

# Si cambias permisos, actualiza systemd
sudo systemctl daemon-reload
```

#### El gateway se queda "stuck" y no responde a stop
```bash
# Ver procesos activos
ps aux | grep gateway

# Systemd debe detener correctamente en ≤10 segundos
# Si se queda, ver logs
sudo journalctl -u raspberry_gateway -n 50 | grep -i kill

# Última opción: kill forzado
sudo pkill -9 -f gateway_main
```

#### Puertos/conexiones MQTT no se liberan
```bash
# Ver puertos abiertos
netstat -tlnp | grep 1883

# Ver procesos usando el puerto
lsof -i :1883

# Reiniciar el servicio
sudo systemctl restart raspberry_gateway
```

---

## 🔄 Actualizaciones en Producción

Cuando necesites actualizar el código en la RPi:

```bash
# 1. Detener el servicio
sudo systemctl stop raspberry_gateway

# 2. Copiar nuevo código
scp -r /home/lautaro/Proyects/IC2-IC3/control/raspberry_gateway/* \
    pi@<IP>:/opt/scada_gateway/

# 3. Si cambió requirements.txt, actualizar dependencias
ssh pi@<IP>
cd /opt/scada_gateway
source venv/bin/activate
pip install -r requirements.txt

# 4. Reiniciar
sudo systemctl restart raspberry_gateway

# 5. Verificar
sudo systemctl status raspberry_gateway
```

---

## 🛑 Cierre Seguro con Systemd

### Configuración del Service File

El archivo `raspberry_gateway.service` incluye estas configuraciones críticas:

```ini
Environment="PYTHONPATH=/opt/scada_gateway"
Environment="DISPLAY="           # Desactiva GUI en systemd (evita Tkinter stuck)
KillMode=mixed                   # Permite cierre seguro
KillSignal=SIGTERM              # Señal de terminación
TimeoutStopSec=10               # Timeout de 10 segundos antes de SIGKILL
```

**¿Por qué es importante esto?**

- **GUI en Raspberry**: Cuando se ejecuta vía systemd, Tkinter no tiene DISPLAY configurado, por lo que la GUI se desactiva automáticamente y el proceso corre en background limpiamente
- **Cierre seguro**: El sistema espera máximo 10 segundos para que el proceso termine. Si no responde en ese tiempo, usa SIGKILL
- **SIGTERM handling**: El código en `gateway_main.py` captura SIGTERM para cerrar correctamente conexiones y liberar recursos

### Comportamiento Esperado

**Ejecución manual (desde terminal con monitor):**
```bash
PYTHONPATH=/opt/scada_gateway python /opt/scada_gateway/src/gateway_main.py
```
- ✅ GUI se muestra si hay monitor/DISPLAY
- ✅ Ctrl+C detiene correctamente
- ✅ Botón "Salir" cierra limpiamente

**Ejecución con Systemd (autostart):**
```bash
sudo systemctl start raspberry_gateway
```
- ✅ GUI se desactiva automáticamente (DISPLAY="")
- ✅ Gateway corre en background
- ✅ `systemctl stop` detiene en ≤10 segundos
- ✅ Se reinicia automáticamente en crashes (Restart=always)

## 📁 Base de datos local (data/scada_local.db)

El gateway utiliza una base de datos SQLite local optimizada para **proteger la tarjeta microSD** de la Raspberry Pi:

- **Almacenamiento liviano:** Guarda la configuración persistente del sistema (`configuracion_sistema`), eventos y alarmas críticas.
- **Sin desgaste de memoria flash:** Las mediciones periódicas se transmiten en tiempo real por MQTT sin escribir continuamente en la tarjeta microSD (`save_measurements: false`).
- Ruta por defecto (configurable en `config.yaml`): `./data/scada_local.db`.
- Gestionada por `control/raspberry_gateway/src/data_storage.py`.

Recomendaciones:

- No versionar el fichero de base de datos. Está ignorado por `.gitignore` con la regla `data/*.db`.
- En Raspberry Pi se recomienda ubicar la base de datos en `control/raspberry_gateway/data/` o en `/var/lib/scada_gateway/data/` y actualizar `config.yaml` con la ruta absoluta.

---

## ⚙️ Configuración

Editar `config.yaml`:

```yaml
serial:
  port: "/dev/ttyACM0"
  baudrate: 115200
  timeout: 1.0
  reconnect_delay: 5

mqtt:
  broker: "100.69.41.46"
  port: 1883
  username: "admin"
  password: "secure_password"
  tenant: "rafaela_sa"
  gateway_id: "d83add60dbb0"  # MAC física de la Raspberry Pi (automática)
  default_sector: "a1"
  default_system: "linea_mezclado_1"

database:
  path: "./data/scada_local.db"
  save_measurements: false  # Protege la tarjeta microSD de escrituras continuas
  backup_enabled: false

diagnostics:
  enabled: true
  check_interval: 60
  temp_threshold: 70
  cpu_threshold: 80
  memory_threshold: 90

logging:
  level: "INFO"
  file: "./logs/gateway.log"
  max_size_mb: 100
  backup_count: 5
```

## 🔌 Protocolo de Comunicación

### Serial (Arduino → Raspberry)
Formato: Mismo que Sistema_SCADA original
```
average1,constrainedPorcentaje1,average2,constrainedPorcentaje2,average3,constrainedPorcentaje3,cantidad1,cantidad2,EBomba1,EBomba2,EBombaM,EMezclador,EBombaR,error,horaRest,minRest,EProceso
```

### Serial (Raspberry → Arduino)
Comandos compatibles con Sistema_SCADA:
- `R{valor}`: Reposición (ej: `R1050` = Bombo 1, 50%)
- `F`: Frenar reposición
- `D`: Detener mezcla
- `V`: Vaciar
- `A`: Continuar
- `H{hora}`: Establecer hora
- `M{minuto}`: Establecer minuto
- `L1{valor}`: Líquido 1
- `L2{valor}`: Líquido 2

### MQTT Topics

#### Estructura Estándar Dinámica
```
{tenant}/{gateway_id}/{sector}/{sistema}/{variable}
rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/sensores/bombo1
```
* `{tenant}`: Empresa o inquilino (configurable, ej: `rafaela_sa`).
* `{gateway_id}`: Dirección MAC física del hardware Raspberry Pi (obtenida automáticamente, fija, ej: `d83add60dbb0`).
* `{sector}`: Sección o planta (configurable, ej: `a1`).
* `{sistema}`: Línea de mezclado (configurable, ej: `linea_mezclado_1`).

#### Publicación - Telemetría (Raspberry → App Web / Broker)
```
rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/sensores/bombo1          # Nivel bombo 1
rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/sensores/bombo2          # Nivel bombo 2
rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/sensores/mezcla          # Nivel mezcla
rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/sensores/caudal          # Caudales líquidos 1 y 2
rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/actuadores/bombas        # Estado bombas (1, 2, mezcla, repo)
rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/actuadores/mezclador     # Estado motor mezclador (3s ON / 5s OFF)
rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/actuadores/electrovalvulas # Estado electroválvulas
rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/proceso/mezclado         # Estado del proceso (0/1/2) y error
rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/proceso/tiempo_restante  # Tiempo restante (horas, minutos)
rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/alarmas                  # Alarmas y errores
rafaela_sa/d83add60dbb0/status                                       # Estado online/offline del gateway
```

#### Suscripción - Comandos (App Web → Raspberry)
**Formato de comandos:**
```
rafaela_sa/d83add60dbb0/{sector}/{sistema}/{accion}

Acciones disponibles:
- reposicion         # Reposición de bombos (bombo, limite_porcentaje)
- freno_reposicion   # Detener reposición de emergencia
- detener            # Detener mezcla / pausar
- reanudar           # Reanudar mezcla
- vaciar             # Vaciar contenedor (corte al 10%)
- desechar           # Desechar mezcla (corte al 10%)
- mezcla             # Preparar receta de mezcla (liquido_1, liquido_2, hora, minuto)
- configuracion      # Actualizar parámetros en caliente
```

#### Ejemplos de Comandos con JSON
```bash
# 1. Reposición (bombo 1 al 75%)
mosquitto_pub -h 100.69.41.46 -u admin -P admin \
  -t "rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/reposicion" \
  -m '{"bombo": 1, "limite_porcentaje": 75}'

# 2. Freno Reposición
mosquitto_pub -h 100.69.41.46 -u admin -P admin \
  -t "rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/freno_reposicion" \
  -m '{}'

# 3. Detener Mezcla
mosquitto_pub -h 100.69.41.46 -u admin -P admin \
  -t "rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/detener" \
  -m '{}'

# 4. Reanudar Mezcla
mosquitto_pub -h 100.69.41.46 -u admin -P admin \
  -t "rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/reanudar" \
  -m '{}'

# 5. Vaciar Contenedor
mosquitto_pub -h 100.69.41.46 -u admin -P admin \
  -t "rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/vaciar" \
  -m '{}'

# 6. Desechar Mezcla
mosquitto_pub -h 100.69.41.46 -u admin -P admin \
  -t "rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/desechar" \
  -m '{}'

# 7. Preparar Mezcla (5L liq1, 3L liq2, 15 minutos)
mosquitto_pub -h 100.69.41.46 -u admin -P admin \
  -t "rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/mezcla" \
  -m '{"liquido_1": 5.0, "liquido_2": 3.0, "hora": 0, "minuto": 15}'
```

#### Estructura de Payloads JSON

| Acción | Payload | Notas |
|--------|---------|-------|
| `reposicion` | `{"bombo": 1, "limite_porcentaje": 75}` | bombo: 1-2, límite: 0-100 |
| `freno_reposicion` | `{}` | Sin parámetros |
| `detener` | `{}` | Sin parámetros |
| `reanudar` | `{}` | Sin parámetros |
| `vaciar` | `{}` | Sin parámetros |
| `desechar` | `{}` | Sin parámetros |
| `mezcla` | `{"liquido_1": 50, "liquido_2": 30, "hora": 0, "minuto": 15}` | liquido_1/2: 0-100, hora: 0-23, minuto: 0-59 |

#### 🚫 Topics Legacy (DEPRECADOS - No usar)
```yaml
# DESCONTINUADOS A PARTIR DE 2024:
scada/planta1/*                         # (Base legacy deshabilitada)
{tenant}/{gateway_id}/cmd/{accion}      # (Usar estructura con sector/sistema)
{tenant}/{gateway_id}/cmd/{numero_serie} # (Usar sector/sistema en su lugar)
```

## 📊 Base de Datos Local

### Tablas principales:
- `mediciones`: Todos los datos de sensores
- `eventos`: Cambios de estado, comandos ejecutados
- `alarmas`: Registro de alarmas y errores
- `diagnostico`: Estado del sistema Raspberry
- `comandos`: Log de comandos enviados al Arduino

### Ejemplo de consulta histórica:
```python
# Obtener datos de las últimas 24 horas
db.get_measurements(
    start_time=datetime.now() - timedelta(hours=24),
    end_time=datetime.now(),
    sensors=['nivel_bombo1', 'caudal_1']
)
```

## 🧪 Testing

```bash
# Test de conexión serial
python tests/test_serial.py

# Test de conexión MQTT
python tests/test_mqtt.py

# Test de base de datos
python tests/test_database.py

# Test integración completa
python tests/test_integration.py
```

## 🐛 Troubleshooting

### Arduino no detectado
```bash
# Listar puertos disponibles
ls /dev/tty*

# Ver dispositivos USB
lsusb

# Ver logs del sistema
sudo journalctl -u raspberry_gateway -f
```

### Problemas de conexión MQTT
```bash
# Test manual de MQTT con nueva estructura
mosquitto_sub -h 192.168.137.1 -t "Rafaela_S.A/d83add60dbb0/#" -v

# Enviar comando de prueba (reposición)
mosquitto_pub -h 192.168.137.1 -t "Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/reposicion" \
  -m '{"bombo": 1, "limite_porcentaje": 75}'

# Verificar conexión del gateway
mosquitto_sub -h 192.168.137.1 -t "Rafaela_S.A/d83add60dbb0/status" -v
```

### Alto uso de CPU/Memoria
```bash
# Ver recursos
htop

# Ver temperatura
vcgencmd measure_temp

# Reiniciar servicio
sudo systemctl restart raspberry_gateway
```

## 📝 Logs

Ubicación de logs:
- Gateway principal: `./logs/gateway.log`
- Serial: `./logs/serial.log`
- MQTT: `./logs/mqtt.log`
- Base de datos: `./logs/database.log`
- Diagnóstico: `./logs/diagnostics.log`

## 🔒 Seguridad

- [ ] Cambiar credenciales MQTT por defecto
- [ ] Configurar certificados TLS para MQTT
- [ ] Firewall configurado (solo puertos necesarios)
- [ ] Usuario dedicado sin privilegios root
- [ ] Backups automáticos de base de datos
- [ ] Actualizaciones automáticas de seguridad

## 📚 Documentación Adicional

- [Migración desde Bluetooth](docs/MIGRACION_BLUETOOTH.md)
- [Protocolo MQTT detallado](docs/PROTOCOLO_MQTT.md)
- [API REST local](docs/API_LOCAL.md)
- [Guía de mantenimiento](docs/MANTENIMIENTO.md)

## 🤝 Contribución

Ver [CONTRIBUTING.md](CONTRIBUTING.md) para guías de desarrollo.

## 📄 Licencia

Este proyecto es parte del trabajo académico IC2-IC3.
