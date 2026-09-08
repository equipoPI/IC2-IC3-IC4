# 📡 Topics MQTT Soportados - Gateway Raspberry Pi

## Configuración del Gateway

```yaml
Broker: 100.69.41.46:1883
Tenant: Rafaela_S.A
Gateway ID: d83add60dbb0
Sector (default): A1
Sistema (default): linea_mezclado_1
```

---

## 🔴 COMANDOS (Entrada)

Estructura: `Rafaela_S.A/d83add60dbb0/{sector}/{sistema}/{accion}`

### 1. **REPOSICIÓN**
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/reposicion`
- **Payload:**
  ```json
  {
    "bombo": 1,
    "limite_porcentaje": 75
  }
  ```
- **Arduino:** `R1075` (R + bombo + limite)

---

### 2. **FRENO REPOSICIÓN**
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/freno_reposicion`
- **Payload:** `{}`
- **Arduino:** `F`

---

### 3. **DETENER**
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/detener`
- **Payload:** `{}`
- **Arduino:** `D`

---

### 4. **REANUDAR**
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/reanudar`
- **Payload:** `{}`
- **Arduino:** `A`

---

### 5. **VACIAR**
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/vaciar`
- **Payload:** `{}`
- **Arduino:** `V`

---

### 6. **DESECHAR**
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/desechar`
- **Payload:** `{}`
- **Arduino:** `X`

---

### 7. **MEZCLA (Preparación)**
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/mezcla`
- **Payload:**
  ```json
  {
    "liquido_1": 50,
    "liquido_2": 30,
    "hora": 0,
    "minuto": 15
  }
  ```
- **Arduino (4 comandos):**
  ```
  L150   (L1 + cantidad)
  L230   (L2 + cantidad)
  H0     (H + horas)
  M15    (M + minutos)
  ```

---

### 8. **CONTROL (General)**
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/control`
- **Payload:**
  ```json
  {
    "accion": "REPOSICION|FRENO_REPOSICION|PARAR|CONTINUAR"
  }
  ```

---

### 9. **CONFIGURACIÓN**
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/configuracion`
- **Payload:** `{"parametro": "valor"}`

---

### 10. **CONSULTAS**
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/consultas`
- **Payload:**
  ```json
  {
    "tipo": "historico",
    "limite": 100
  }
  ```

---

## 🟢 RESPUESTAS (Salida)

Estructura: `Rafaela_S.A/d83add60dbb0/resp/{accion}`

### Ejemplo de Respuesta
- **Topic:** `Rafaela_S.A/d83add60dbb0/resp/mezcla`
- **Payload:**
  ```json
  {
    "command_id": "cmd_1788745680219",
    "status": "executed",
    "code": 0,
    "result": {
      "liquido_1": 50,
      "liquido_2": 30,
      "hora": 0,
      "minuto": 15
    },
    "timestamp": "2026-09-06T23:06:22Z",
    "error": null
  }
  ```

**Códigos de Status:**
- `executed` - Comando ejecutado exitosamente
- `failed` - Error al ejecutar
- `pending` - Esperando ejecución

**Códigos de Error:**
- `0` - Éxito
- `1` - Parámetro inválido
- `2` - Comando no soportado
- `3` - Error de comunicación con Arduino
- `4` - Timeout
- `5` - Estado inválido

---

## 📊 DATOS/SENSORES (Salida)

Estructura: `Rafaela_S.A/d83add60dbb0/{sector}/{sistema}/sensores/{tipo}`

### Bombo 1
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/sensores/bombo1`
- **Payload:**
  ```json
  {
    "nivel": 45.5,
    "porcentaje": 45,
    "timestamp": 1234567890.123
  }
  ```

### Bombo 2
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/sensores/bombo2`
- **Payload:** `{"nivel": 30.0, "porcentaje": 30, "timestamp": ...}`

### Mezcla
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/sensores/mezcla`
- **Payload:** `{"nivel": 150.0, "porcentaje": 75, "timestamp": ...}`

### Caudalímetros
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/sensores/caudal`
- **Payload:**
  ```json
  {
    "caudal_1": 1.5,
    "caudal_2": 1.2,
    "timestamp": 1234567890.123
  }
  ```

---

## 🎯 ACTUADORES (Salida)

Estructura: `Rafaela_S.A/d83add60dbb0/{sector}/{sistema}/actuadores/{tipo}`

### Bombas
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/actuadores/bombas`
- **Payload:**
  ```json
  {
    "bomba1": 1,
    "bomba2": 0,
    "bomba_mezcla": 1,
    "bomba_reposicion": 0,
    "timestamp": 1234567890.123
  }
  ```

### Mezclador
- **Topic:** `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/actuadores/mezclador`
- **Payload:**
  ```json
  {
    "estado": 1,
    "velocidad": 75,
    "timestamp": 1234567890.123
  }
  ```

---

## 🔧 EJEMPLOS DE USO

### Enviar comando de mezcla (mosquitto_pub)
```bash
mosquitto_pub -h 100.69.41.46 -u admin -P admin \
  -t "Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/mezcla" \
  -m '{"liquido_1": 50, "liquido_2": 30, "hora": 0, "minuto": 15}'
```

### Suscribirse a todas las respuestas (mosquitto_sub)
```bash
mosquitto_sub -h 100.69.41.46 -u admin -P admin \
  -t "Rafaela_S.A/d83add60dbb0/resp/#"
```

### Suscribirse a todos los sensores
```bash
mosquitto_sub -h 100.69.41.46 -u admin -P admin \
  -t "Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/sensores/#"
```

---

## ⚠️ NOTAS IMPORTANTES

1. **Case-Sensitive:** MQTT es case-sensitive. Los topics deben incluir mayúsculas y caracteres especiales exactamente como se muestran.

2. **QoS:** Todos los comandos usan QoS 1 (entrega garantizada al menos una vez).

3. **Parámetros Válidos:**
   - `bombo`: 1 o 2
   - `limite_porcentaje`: 0-100
   - `liquido_1`, `liquido_2`: 0-1000 (litros)
   - `hora`, `minuto`: 0-23 (horas), 0-59 (minutos)

4. **Filtrado:** El gateway SOLO procesa mensajes en topics válidos. Otros mensajes se ignoran.

5. **Retención:** Las respuestas NO se retienen (retain=false).
