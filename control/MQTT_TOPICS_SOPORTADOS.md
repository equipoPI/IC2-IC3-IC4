# 📡 Topics MQTT Soportados - Gateway Raspberry Pi

## 🏗️ Construcción Dinámica de Topics

Todos los topics MQTT del sistema se construyen a partir de una jerarquía de 4 niveles:

$$\mathbf{\{tenant\} / \{gateway\_id\} / \{sector\} / \{sistema\} / \dots}$$

Donde:
* **`{tenant}`:** Identificador de la organización o empresa (configurable, por defecto `rafaela_sa`).
* **`{gateway_id}`:** Dirección MAC física de la Raspberry Pi (obtenida automáticamente del hardware, fija e inmodificable, ej: `d83add60dbb0`).
* **`{sector}`:** Sección o planta física (configurable, por defecto `a1`).
* **`{sistema}`:** Línea o equipo específico (configurable, por defecto `linea_mezclado_1`).

> ⚠️ **IMPORTANTE:**  
> - **Sensible a mayúsculas:** MQTT es sensible a mayúsculas y minúsculas (*case-sensitive*). El Gateway sanitiza automáticamente todos los identificadores a **minúsculas** y guiones bajos.
> - **Actualización en caliente:** Si se modifica `tenant`, `sector` o `sistema` en la configuración (vía GUI o comando), el Gateway actualiza automáticamente sus suscripciones y publicaciones al nuevo prefijo en tiempo real sin reiniciar.

---

## ⚙️ Configuración Activa por Defecto

```yaml
Broker: 100.69.41.46:1883
Tenant: rafaela_sa
Gateway ID (MAC fija): d83add60dbb0
Sector: a1
Sistema: linea_mezclado_1
Prefijo base resultante: rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/
```

---

## 🔴 COMANDOS (Entrada hacia el Gateway)

Estructura: `{tenant}/{gateway_id}/{sector}/{sistema}/{accion}`

### 1. **REPOSICIÓN**
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/reposicion`
* **Payload:**
  ```json
  {
    "bombo": 1,
    "limite_porcentaje": 75
  }
  ```
* **Arduino:** Envía orden `R1075` (R + bombo + límite de corte).

---

### 2. **FRENO REPOSICIÓN (Emergencia)**
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/freno_reposicion`
* **Payload:** `{}`
* **Arduino:** Envía orden de frenado inmediato `F` (corta bomba de reposición y electroválvulas).

---

### 3. **DETENER MEZCLA / PAUSAR**
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/detener`
* **Payload:** `{}`
* **Arduino:** Envía orden `D` (detiene motor de mezcla y bombas dosificadoras).

---

### 4. **REANUDAR MEZCLA**
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/reanudar`
* **Payload:** `{}`
* **Arduino:** Envía orden `A` (continúa el ciclo de mezclado).

---

### 5. **VACIAR CONTENEDOR**
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/vaciar`
* **Payload:** `{}`
* **Arduino:** Envía orden `V` (enciende bomba de vaciado hasta alcanzar el nivel de corte seguro del 10%).

---

### 6. **DESECHAR MEZCLA**
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/desechar`
* **Payload:** `{}`
* **Arduino:** Envía orden `X` (descarta el contenido del depósito de mezcla hasta el nivel de corte seguro del 10%).

---

### 7. **MEZCLA (Receta y Temporización)**
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/mezcla`
* **Payload:**
  ```json
  {
    "liquido_1": 5.0,
    "liquido_2": 3.0,
    "hora": 0,
    "minuto": 15
  }
  ```
* **Arduino (4 órdenes secuenciales espaciadas por 50ms):**
  * `L15` (Líquido 1: 5.0 L)
  * `L23` (Líquido 2: 3.0 L)
  * `H0` (Horas de mezclado: 0)
  * `M15` (Minutos de mezclado: 15)

---

### 8. **CONTROL GENERAL**
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/control`
* **Payload:**
  ```json
  {
    "accion": "REPOSICION|FRENO_REPOSICION|DETENER|REANUDAR|VACIAR|DESECHAR"
  }
  ```

---

### 9. **CONFIGURACIÓN REMOTA**
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/configuracion`
* **Payload:**
  ```json
  {
    "default_sector": "b2",
    "default_system": "linea_mezclado_2"
  }
  ```
* El gateway persiste los cambios en disco y actualiza sus topics en caliente.

---

## 🟢 RESPUESTAS A COMANDOS (Salida)

Estructura: `{tenant}/{gateway_id}/resp/{accion}`

### Ejemplo de Respuesta
* **Topic:** `rafaela_sa/d83add60dbb0/resp/mezcla`
* **Payload:**
  ```json
  {
    "command_id": "cmd_1788745680219",
    "status": "executed",
    "code": 0,
    "result": {
      "liquido_1": 5.0,
      "liquido_2": 3.0,
      "hora": 0,
      "minuto": 15
    },
    "timestamp": "2026-09-09T11:30:00Z",
    "error": null
  }
  ```

**Códigos de Estado (`code`):**
* `0`: Éxito (`executed`)
* `1`: Parámetro inválido
* `2`: Comando no soportado (`unsupported`)
* `3`: Error de comunicación con Arduino (`failed`)

---

## 📊 TELEMETRÍA DE SENSORES (Salida periódica cada 1s)

Estructura: `{tenant}/{gateway_id}/{sector}/{sistema}/sensores/{tipo}`

### Bombo 1 (Ingrediente 1)
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/sensores/bombo1`
* **Payload:** `{"nivel": 15.2, "porcentaje": 56.9, "timestamp": 1725890000.0}`

### Bombo 2 (Ingrediente 2)
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/sensores/bombo2`
* **Payload:** `{"nivel": 18.0, "porcentaje": 46.1, "timestamp": 1725890000.0}`

### Mezcla
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/sensores/mezcla`
* **Payload:** `{"nivel": 8.5, "porcentaje": 82.6, "timestamp": 1725890000.0}`

### Caudalímetros
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/sensores/caudal`
* **Payload:** `{"caudal_1": 5.0, "caudal_2": 3.0, "timestamp": 1725890000.0}`

---

## 🎯 ESTADO DE ACTUADORES (Salida periódica cada 1s)

Estructura: `{tenant}/{gateway_id}/{sector}/{sistema}/actuadores/{tipo}`

### Bombas
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/actuadores/bombas`
* **Payload:**
  ```json
  {
    "bomba1": 0,
    "bomba2": 0,
    "bomba_mezcla": 0,
    "bomba_reposicion": 1,
    "timestamp": 1725890000.0
  }
  ```

### Motor Mezclador (Ciclo 3s activo / 5s reposo)
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/actuadores/mezclador`
* **Payload:**
  ```json
  {
    "estado": 1,
    "timestamp": 1725890000.0
  }
  ```

### Electroválvulas de Reposición
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/actuadores/electrovalvulas`
* **Payload:**
  ```json
  {
    "electrovalvula1": 1,
    "electrovalvula2": 0,
    "timestamp": 1725890000.0
  }
  ```

---

## ⏱️ ESTADO DEL PROCESO Y TIEMPOS (Salida periódica cada 1s)

Estructura: `{tenant}/{gateway_id}/{sector}/{sistema}/proceso/{tipo}`

### Proceso de Mezclado
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/proceso/mezclado`
* **Payload:**
  ```json
  {
    "estado": 1,
    "error": 0,
    "timestamp": 1725890000.0
  }
  ```
  * `estado`: `0` = Inactivo/Detenido, `1` = En Proceso, `2` = Mezcla Finalizada.

### Tiempo Restante en Tiempo Real
* **Topic:** `rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/proceso/tiempo_restante`
* **Payload:**
  ```json
  {
    "horas": 0,
    "minutos": 12,
    "timestamp": 1725890000.0
  }
  ```

---

## 🔧 COMANDOS DE PRUEBA DESDE TERMINAL

### 1. Escuchar toda la telemetría del Gateway
```bash
mosquitto_sub -h 100.69.41.46 -u admin -P admin -t "rafaela_sa/d83add60dbb0/#" -v
```

### 2. Escuchar solo actuadores
```bash
mosquitto_sub -h 100.69.41.46 -u admin -P admin -t "rafaela_sa/d83add60dbb0/+/+/actuadores/#" -v
```

### 3. Enviar receta de mezcla (5L Líquido 1, 3L Líquido 2, 10 min de mezclado)
```bash
mosquitto_pub -h 100.69.41.46 -u admin -P admin \
  -t "rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/mezcla" \
  -m '{"liquido_1": 5.0, "liquido_2": 3.0, "hora": 0, "minuto": 10}'
```

### 4. Freno de emergencia de reposición
```bash
mosquitto_pub -h 100.69.41.46 -u admin -P admin \
  -t "rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/freno_reposicion" \
  -m '{}'
```
