# 📡 Referencia Completa de Tópicos MQTT

## 🏗️ Estructura Base
```
{tenant}/{gateway_id}/{seccion}/{sistema}/{variable}
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/reposicion
```

---

## 📊 Tabla Completa - Tópicos y Payloads

### COMANDOS (App Web → Raspberry)

| # | Acción | Tópico | JSON Payload | Arduino Cmd | Descripción |
|---|--------|--------|--------------|------------|-------------|
| 1 | **Reposición** | `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/reposicion` | `{"bombo": 1, "limite_porcentaje": 75}` | `R1075` | Rellena el bombo indicado al porcentaje |
| 2 | **Freno Reposición** | `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/freno_reposicion` | `{}` | `F` | Detiene la reposición en curso |
| 3 | **Detener** | `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/detener` | `{}` | `D` | Detiene la mezcla |
| 4 | **Reanudar** | `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/reanudar` | `{}` | `A` | Reanuda la mezcla |
| 5 | **Vaciar** | `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/vaciar` | `{}` | `V` | Vacía el contenedor |
| 6 | **Desechar** | `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/desechar` | `{}` | `X` | Desecha la mezcla |
| 7 | **Mezcla** | `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/mezcla` | `{"liquido_1": 50, "liquido_2": 30, "hora": 0, "minuto": 15}` | `L1 50`, `L2 30`, `H 0`, `M 15` | Configura parámetros de mezcla |

---

## 📋 Detalles de Payloads JSON

### 1️⃣ Reposición
```json
{
  "bombo": 1,                    // 1 o 2 (bombo a reposicionar)
  "limite_porcentaje": 75        // 0-100 (capacidad deseada)
}
```
**Notas:**
- Bombo 1 = 1000 + límite porcentaje (Arduino recibe: R1075)
- Bombo 2 = 2000 + límite porcentaje (Arduino recibe: R2075)

### 2️⃣ Freno Reposición
```json
{}
```
**Notas:**
- Sin parámetros, solo detiene la reposición en curso

### 3️⃣ Detener
```json
{}
```
**Notas:**
- Detiene toda actividad de mezcla

### 4️⃣ Reanudar
```json
{}
```
**Notas:**
- Reanuda la mezcla pausada

### 5️⃣ Vaciar
```json
{}
```
**Notas:**
- Vacía el contenedor de mezcla

### 6️⃣ Desechar
```json
{}
```
**Notas:**
- Desecha la mezcla actual

### 7️⃣ Mezcla (Preparación)
```json
{
  "liquido_1": 50,              // 0-100 (volumen % líquido 1)
  "liquido_2": 30,              // 0-100 (volumen % líquido 2)
  "hora": 0,                    // 0-23 (horas de mezcla)
  "minuto": 15                  // 0-59 (minutos de mezcla)
}
```
**Notas:**
- Configura los parámetros para preparar la mezcla
- Cada parámetro se envía como comando separado a Arduino
- Arduino recibe: `L1 50`, `L2 30`, `H 0`, `M 15`

---

## 🧪 Ejemplos de Comando con mosquitto_pub

### Reposición (bombo 1 al 75%)
```bash
mosquitto_pub \
  -h 192.168.137.1 \
  -t "Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/reposicion" \
  -m '{"bombo": 1, "limite_porcentaje": 75}'
```

### Freno Reposición
```bash
mosquitto_pub \
  -h 192.168.137.1 \
  -t "Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/freno_reposicion" \
  -m '{}'
```

### Detener Mezcla
```bash
mosquitto_pub \
  -h 192.168.137.1 \
  -t "Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/detener" \
  -m '{}'
```

### Reanudar Mezcla
```bash
mosquitto_pub \
  -h 192.168.137.1 \
  -t "Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/reanudar" \
  -m '{}'
```

### Vaciar Contenedor
```bash
mosquitto_pub \
  -h 192.168.137.1 \
  -t "Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/vaciar" \
  -m '{}'
```

### Desechar Mezcla
```bash
mosquitto_pub \
  -h 192.168.137.1 \
  -t "Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/desechar" \
  -m '{}'
```

### Preparar Mezcla (50% liq1, 30% liq2, 15 minutos)
```bash
mosquitto_pub \
  -h 192.168.137.1 \
  -t "Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/mezcla" \
  -m '{"liquido_1": 50, "liquido_2": 30, "hora": 0, "minuto": 15}'
```

---

## 📡 Telemetría (Raspberry → App Web)

Los tópicos de telemetría son **publicados automáticamente** por el gateway:

```
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/sensores/nivel_bombo1
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/sensores/nivel_bombo2
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/sensores/nivel_mezcla
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/sensores/caudal_1
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/sensores/caudal_2
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/actuadores/bomba1
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/actuadores/bomba2
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/actuadores/bomba_mezcla
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/actuadores/mezclador
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/actuadores/bomba_repo
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/proceso/tiempo_restante
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/alarmas
Rafaela_S.A/d83add60dbb0/status
```

---

## ✅ Configuración en Raspberry Gateway

**Archivo:** `/control/raspberry_gateway/config.yaml`

```yaml
mqtt:
  broker: "192.168.137.1"
  port: 1883
  tenant: "Rafaela_S.A"
  gateway_id: "d83add60dbb0"
  username: "admin"
  password: "admin"
  qos: 1
  keepalive: 60
  
  topics:
    enable_legacy_topics: false      # ✓ Topics legacy DESHABILITADOS
    subscribe_filters:
      - '{tenant}/{gateway_id}/#'    # Suscribe a: Rafaela_S.A/d83add60dbb0/*
```

---

## 🔗 Archivos Relacionados

- 📄 [mqtt_client.py](control/raspberry_gateway/src/mqtt_client.py) - Cliente MQTT
- 📄 [gateway_main.py](control/raspberry_gateway/src/gateway_main.py) - Procesamiento de comandos
- 📄 [config.yaml](control/raspberry_gateway/config.yaml) - Configuración MQTT
- 📄 [README.md](control/raspberry_gateway/README.md) - Documentación gateway
- 📄 [MQTT_TOPICS_MIGRATION.md](control/MQTT_TOPICS_MIGRATION.md) - Migración de topics

---

## ❌ Topics DEPRECATED (No usar)

```
scada/planta1/sensores/*          # Legacy SCADA
scada/planta1/comandos/*          # Legacy SCADA
{tenant}/{gateway_id}/cmd/*       # Removido (/cmd/ innecesario)
```

---

**Última actualización:** 2026-09-05  
**Estado:** ✅ Todos los comandos implementados y probados
