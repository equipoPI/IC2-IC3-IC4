# Protocolo MQTT - Sistema SCADA

> ⚠️ **NOTA DE ARQUITECTURA:**  
> Este documento describe la estructura **legada/histórica** (`scada/planta1/...`).  
> En el sistema de producción activo, la estructura es **dinámica y multinquilino**:  
> $$\mathbf{\{tenant\} / \{gateway\_id\} / \{sector\} / \{sistema\} / \dots}$$  
> *(Ejemplo por defecto: `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/...`)*.  
> Para consultar la especificación completa y vigente, referirse a [`MQTT_TOPICS_SOPORTADOS.md`](../../MQTT_TOPICS_SOPORTADOS.md).

Documentación detallada del protocolo de comunicación MQTT entre la Raspberry Pi Gateway y la aplicación web.

## 📡 Estructura de Topics Legados

Todos los topics legados siguen la estructura base: `scada/{planta_id}/...`

### Base Topic
```
scada/planta1/
```

## 📤 Topics de Publicación (Raspberry → App Web)

### 1. Estado General
**Topic:** `scada/planta1/estado/general`

**Payload:**
```json
{
  "timestamp": 1234567890.123,
  "conectado": true,
  "error": 0
}
```

### 2. Sensores de Nivel

#### Bombo 1
**Topic:** `scada/planta1/sensores/nivel/bombo1`

**Payload:**
```json
{
  "nivel": 45.5,
  "porcentaje": 45,
  "timestamp": 1234567890.123
}
```

#### Bombo 2
**Topic:** `scada/planta1/sensores/nivel/bombo2`

**Payload:** (mismo formato que Bombo 1)

#### Bombo Mezcla
**Topic:** `scada/planta1/sensores/nivel/mezcla`

**Payload:** (mismo formato que Bombo 1)

### 3. Sensores de Caudal

#### Caudal Líquido 1
**Topic:** `scada/planta1/sensores/caudal/1`

**Payload:**
```json
{
  "caudal": 5.5,
  "timestamp": 1234567890.123
}
```

#### Caudal Líquido 2
**Topic:** `scada/planta1/sensores/caudal/2`

**Payload:** (mismo formato que Caudal 1)

### 4. Estados de Actuadores

#### Bomba 1
**Topic:** `scada/planta1/actuadores/bomba1`

**Payload:**
```json
{
  "estado": true,
  "timestamp": 1234567890.123
}
```

#### Bomba 2
**Topic:** `scada/planta1/actuadores/bomba2`

#### Bomba Mezcla
**Topic:** `scada/planta1/actuadores/bomba_mezcla`

#### Motor Mezclador
**Topic:** `scada/planta1/actuadores/mezclador`

#### Bomba Reposición
**Topic:** `scada/planta1/actuadores/bomba_reposicion`

Todos con el mismo formato: `{"estado": boolean, "timestamp": float}`

### 5. Proceso

#### Tiempo Restante
**Topic:** `scada/planta1/proceso/tiempo_restante`

**Payload:**
```json
{
  "horas": 2,
  "minutos": 30,
  "timestamp": 1234567890.123
}
```

### 6. Alarmas
**Topic:** `scada/planta1/alarmas`

**Payload:**
```json
{
  "id": 123,
  "codigo": 1,
  "descripcion": "Error en sensor de nivel Bombo 1",
  "timestamp": 1234567890.123,
  "activa": true
}
```

**Códigos de Error:**
- `1`: Error en sensor de nivel Bombo 1
- `2`: Error en sensor de nivel Bombo 2
- `3`: Error en sensor de nivel Mezcla
- `4`: Error en caudalímetro 1
- `5`: Error en caudalímetro 2
- `10`: Nivel crítico bajo - Bombo 1
- `11`: Nivel crítico bajo - Bombo 2
- `20`: Sobrecalentamiento motor mezclador
- `99`: Error general del sistema

### 7. Diagnóstico del Sistema
**Topic:** `scada/planta1/diagnostico`

**Payload:**
```json
{
  "timestamp": 1234567890.123,
  "fecha_hora": "2026-04-22T15:30:00",
  "cpu": {
    "percent": 25.5,
    "temperature": 45.2,
    "frequency_mhz": 1500.0,
    "count": 4
  },
  "memory": {
    "percent": 60.2,
    "total_mb": 3840.0,
    "available_mb": 1530.0,
    "used_mb": 2310.0
  },
  "disk": {
    "percent": 45.0,
    "total_gb": 32.0,
    "free_gb": 17.6,
    "used_gb": 14.4
  },
  "network": {
    "bytes_sent_mb": 150.5,
    "bytes_recv_mb": 320.2,
    "packets_sent": 120000,
    "packets_recv": 250000,
    "ip_addresses": {
      "eth0": "192.168.1.100",
      "wlan0": "192.168.1.101"
    }
  },
  "uptime": {
    "seconds": 86400.0,
    "formatted": "1d 0h 0m 0s",
    "days": 1,
    "hours": 0,
    "minutes": 0
  },
  "connections": {
    "serial": true,
    "mqtt": true
  }
}
```

### 8. Estado del Gateway
**Topic:** `scada/planta1/estado/gateway`

**Payload:**
```json
{
  "online": true,
  "timestamp": 1234567890.123,
  "client_id": "raspberry_scada_gateway"
}
```

**Retained:** `true` (para que nuevos clientes sepan el estado)

## 📥 Topics de Suscripción (App Web → Raspberry)

### 1. Comandos de Reposición
**Topic:** `scada/planta1/comandos/reposicion`

**Payload:**
```json
{
  "bombo": 1,
  "valor": 50
}
```

**Descripción:** Repone el bombo especificado hasta el porcentaje indicado
- `bombo`: 1 o 2
- `valor`: 0-100 (porcentaje)

### 2. Comandos de Mezcla
**Topic:** `scada/planta1/comandos/mezcla`

**Payload:**
```json
{
  "liquido_1": 100.5,
  "liquido_2": 50.2,
  "hora": 2,
  "minuto": 30
}
```

**Descripción:** Configura parámetros del proceso de mezcla
- `liquido_1`: Cantidad de líquido 1 (litros)
- `liquido_2`: Cantidad de líquido 2 (litros)
- `hora`: Horas de duración de mezcla
- `minuto`: Minutos de duración de mezcla

### 3. Comandos de Control
**Topic:** `scada/planta1/comandos/control`

**Payload:**
```json
{
  "accion": "CONTINUAR"
}
```

**Acciones disponibles:**
- `CONTINUAR`: Reanuda el proceso
- `PARAR`: Pausa el proceso
- `DETENER`: Detiene completamente
- `VACIAR`: Vacía el bombo de mezcla

### 4. Configuración
**Topic:** `scada/planta1/configuracion`

**Payload:**
```json
{
  "parametro": "intervalo_envio",
  "valor": 1000
}
```

**Descripción:** Actualiza configuración del sistema en tiempo real

### 5. Consultas de Histórico
**Topic:** `scada/planta1/consultas/historico`

**Payload:**
```json
{
  "horas": 24,
  "limit": 1000,
  "response_topic": "scada/planta1/consultas/respuesta"
}
```

**Respuesta en:** `scada/planta1/consultas/respuesta`

**Formato de respuesta:**
```json
{
  "query": {
    "horas": 24,
    "limit": 1000
  },
  "count": 150,
  "data": [
    {
      "timestamp": 1234567890.123,
      "nivel_bombo1": 45.5,
      "porcentaje_bombo1": 45,
      ...
    }
  ]
}
```

## 🔧 Quality of Service (QoS)

### Niveles utilizados:

- **QoS 0** (At most once): Datos de sensores que se actualizan frecuentemente
- **QoS 1** (At least once): Comandos y estados críticos (por defecto)
- **QoS 2** (Exactly once): No utilizado actualmente

### Configuración recomendada:

```yaml
# En config.yaml
mqtt:
  qos: 1  # Por defecto para todos los mensajes
```

## 🔒 Seguridad

### Autenticación

```yaml
mqtt:
  username: "admin"
  password: "admin"
```

### TLS/SSL (Producción)

```yaml
mqtt:
  tls:
    enabled: true
    ca_certs: "/path/to/ca.crt"
    certfile: "/path/to/client.crt"
    keyfile: "/path/to/client.key"
```

## 📊 Frecuencias de Publicación

| Topic | Frecuencia | Configurable |
|-------|------------|--------------|
| Sensores de nivel | 1 segundo | ✅ |
| Sensores de caudal | 1 segundo | ✅ |
| Estados de actuadores | 1 segundo | ✅ |
| Diagnóstico | 5 minutos | ✅ |
| Estado general | 1 segundo | ✅ |
| Alarmas | Inmediato | ❌ |

## 🧪 Testing con Mosquitto

### Suscribirse a todos los topics
```bash
mosquitto_sub -h localhost -t "scada/#" -v
```

### Suscribirse a sensores únicamente
```bash
mosquitto_sub -h localhost -t "scada/planta1/sensores/#" -v
```

### Publicar comando de prueba
```bash
mosquitto_pub -h localhost \
  -t "scada/planta1/comandos/control" \
  -m '{"accion":"CONTINUAR"}'
```

### Con autenticación
```bash
mosquitto_sub -h localhost \
  -u admin -P admin \
  -t "scada/planta1/#" -v
```

## 🔄 Ejemplos de Integración

### JavaScript (React)
```javascript
import mqtt from 'mqtt';

const client = mqtt.connect('mqtt://localhost:1883', {
  username: 'admin',
  password: 'password'
});

client.on('connect', () => {
  // Suscribirse a sensores
  client.subscribe('scada/planta1/sensores/#');
});

client.on('message', (topic, message) => {
  const data = JSON.parse(message.toString());
  console.log(`${topic}:`, data);
});

// Enviar comando
const enviarComando = (accion) => {
  client.publish('scada/planta1/comandos/control', 
    JSON.stringify({ accion })
  );
};
```

### Python (Django)
```python
import paho.mqtt.client as mqtt
import json

def on_connect(client, userdata, flags, rc):
    client.subscribe("scada/planta1/#")

def on_message(client, userdata, msg):
    data = json.loads(msg.payload)
    # Procesar y guardar en base de datos
    print(f"{msg.topic}: {data}")

client = mqtt.Client()
client.username_pw_set("scada_user", "password")
client.on_connect = on_connect
client.on_message = on_message
client.connect("localhost", 1883)
client.loop_start()
```

## 📝 Notas Importantes

1. **Retain Flag**: Solo el topic `estado/gateway` usa retain para que nuevos clientes conozcan el estado
2. **Will Message**: El gateway publica automáticamente su desconexión en `estado/gateway`
3. **Timestamps**: Todos en formato Unix timestamp (epoch time) para facilitar comparaciones
4. **Encoding**: UTF-8 para todos los mensajes
5. **JSON**: Siempre pretty-print deshabilitado para reducir tamaño

## 🔍 Monitoreo y Debugging

### Ver todos los mensajes en tiempo real
```bash
mosquitto_sub -h localhost -t "#" -v
```

### Contar mensajes por segundo
```bash
mosquitto_sub -h localhost -t "scada/#" | pv -l > /dev/null
```

### Guardar mensajes en archivo
```bash
mosquitto_sub -h localhost -t "scada/#" -v > mqtt_log_$(date +%Y%m%d_%H%M%S).txt
```

## 📚 Referencias

- [MQTT v3.1.1 Specification](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html)
- [Eclipse Paho MQTT](https://www.eclipse.org/paho/)
- [HiveMQ MQTT Essentials](https://www.hivemq.com/mqtt-essentials/)
