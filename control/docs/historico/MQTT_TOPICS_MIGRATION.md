# Migración de Topics MQTT - Guía de Referencia

## 📋 Resumen Ejecutivo

A partir de 2024, el sistema SCADA utiliza **una única estructura estándar** para todos los tópicos MQTT.
Los formatos legacy han sido **deshabilitados** en la configuración.

---

## 🔄 Migración de Topics

### ❌ Formatos Legacy (DEPRECADOS)

| Formato Antiguo | Tipo | Estado | Alternativa |
|--|--|--|--|
| `scada/planta1/sensores/nivel/bombo1` | Telemetría | ❌ Deshabilitado | `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/sensores/nivel_bombo1` |
| `scada/planta1/comandos/reposicion` | Comando | ❌ Deshabilitado | `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/reposicion` |
| `{tenant}/{gateway_id}/cmd/reposicion` | Comando | ❌ Deshabilitado | `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/reposicion` |
| `{tenant}/{gateway_id}/cmd/DEV-001` | Comando directo | ❌ Deshabilitado | `Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/accion` |

### ✅ Formato Estándar (NUEVO - Obligatorio)

```
{tenant}/{gateway_id}/{seccion}/{sistema}/{variable}
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/reposicion
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/sensores/nivel_bombo1
```

---

## 📡 Estructura de Tópicos

### Telemetría (Publicado por Raspberry Gateway)

```yaml
# Sensores
{tenant}/{gateway_id}/{seccion}/{sistema}/sensores/nivel_bombo1
{tenant}/{gateway_id}/{seccion}/{sistema}/sensores/nivel_bombo2
{tenant}/{gateway_id}/{seccion}/{sistema}/sensores/nivel_mezcla
{tenant}/{gateway_id}/{seccion}/{sistema}/sensores/caudal_1
{tenant}/{gateway_id}/{seccion}/{sistema}/sensores/caudal_2

# Actuadores (estado)
{tenant}/{gateway_id}/{seccion}/{sistema}/actuadores/bomba1
{tenant}/{gateway_id}/{seccion}/{sistema}/actuadores/bomba2
{tenant}/{gateway_id}/{seccion}/{sistema}/actuadores/bomba_mezcla
{tenant}/{gateway_id}/{seccion}/{sistema}/actuadores/bomba_repo
{tenant}/{gateway_id}/{seccion}/{sistema}/actuadores/mezclador

# Otros
{tenant}/{gateway_id}/{seccion}/{sistema}/proceso/tiempo_restante
{tenant}/{gateway_id}/{seccion}/{sistema}/alarmas
{tenant}/{gateway_id}/status  # Estado del gateway (online/offline)

# Ejemplo real:
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/sensores/nivel_bombo1
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/alarmas
Rafaela_S.A/d83add60dbb0/status
```

### Comandos (Suscrito por Raspberry Gateway)

```yaml
# Formato único de comandos:
{tenant}/{gateway_id}/{seccion}/{sistema}/{accion}

# Acciones soportadas:
reposicion      # Reposición de bombos
freno_reposicion # Detener reposición
detener         # Detener mezcla
reanudar        # Reanudar mezcla
vaciar          # Vaciar contenedor
desechar        # Desechar mezcla

# Ejemplos reales:
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/reposicion
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/detener
Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/reanudar
```

---

## 🎯 Configuración por Componente

### Raspberry Gateway (`control/raspberry_gateway/config.yaml`)
```yaml
mqtt:
  tenant: Rafaela_S.A
  gateway_id: d83add60dbb0
  default_sector: A1
  default_system: linea_mezclado_1
  topics:
    enable_legacy_topics: false  # ✅ Deshabilitado
    subscribe_filters:
      - '{tenant}/{gateway_id}/#'  # Suscribe a todos los comandos (sin /cmd/)
```

### Simulador (`control/simulador/config.yaml`)
```yaml
mqtt:
  tenant: Rafaela_S.A
  gateway_id: sim_gateway_test
  default_sector: A1
  default_system: linea_mezclado_1
  topics:
    enable_legacy_topics: false  # ✅ Deshabilitado
    subscribe_filters:
      - '{tenant}/{gateway_id}/#'  # Suscribe a todos los comandos (sin /cmd/)
```

---

## 💻 Ejemplos de Uso

### Enviar comando de reposición
```bash
mosquitto_pub \
  -h 192.168.137.1 \
  -t "Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/reposicion" \
  -m '{"bombo": 1, "limite_porcentaje": 75}'
```

### Enviar comando de detener mezcla
```bash
mosquitto_pub \
  -h 192.168.137.1 \
  -t "Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/detener" \
  -m '{}'
```

### Suscribirse a telemetría
```bash
mosquitto_sub \
  -h 192.168.137.1 \
  -t "Rafaela_S.A/d83add60dbb0/A1/linea_mezclado_1/#" \
  -v
```

### Verificar estado del gateway
```bash
mosquitto_sub \
  -h 192.168.137.1 \
  -t "Rafaela_S.A/d83add60dbb0/status" \
  -v
```

---

## 📝 Acciones Soportadas en Comandos

| Acción | Envía a Arduino | Descripción |
|--|--|--|
| `reposicion` | `R{bombo}{limite}` | Reposiciona bombo 1 o 2 hasta límite % |
| `freno_reposicion` | `F` | Detiene reposición |
| `detener` | `D` | Detiene mezcla |
| `reanudar` | `A` | Reanuda mezcla |
| `vaciar` | `V` | Vacía contenedor mezcla |
| `desechar` | `X` | Desecha mezcla |
| `continuar` | `A` | Alias de reanudar |
| `frenar` | `F` | Alias de freno_reposicion |

### Payload de ejemplo para reposición
```json
{
  "bombo": 1,
  "limite_porcentaje": 75
}
```

---

## 🔍 Validación de Migración

### Checklist para verificar que la migración está correcta:

- [ ] Archivo `config.yaml` tiene `enable_legacy_topics: false`
- [ ] Se usa `{tenant}/{gateway_id}/cmd/#` en `subscribe_filters`
- [ ] Los comandos se envían con estructura: `{tenant}/{gateway_id}/cmd/{seccion}/{sistema}/{accion}`
- [ ] La aplicación web publica telemetría en: `{tenant}/{gateway_id}/{seccion}/{sistema}/*`
- [ ] No hay referencias a `scada/planta1/` en código nuevo
- [ ] Broker MQTT contiene topics con estructura `Rafaela_S.A/d83add60dbb0/`
- [ ] El simulador usa el mismo `tenant` que el gateway real

### Comandos para verificar estado:
```bash
# Ver todos los topics publicados en los últimos segundos
mosquitto_sub -h 192.168.137.1 -t "#" -v | head -50

# Ver solo topics estándar
mosquitto_sub -h 192.168.137.1 -t "Rafaela_S.A/#" -v

# Ver solo topics legacy (no deberían aparecer)
mosquitto_sub -h 192.168.137.1 -t "scada/#" -v
```

---

## ⚠️ Posibles Problemas en Migración

| Problema | Causa | Solución |
|--|--|--|
| Comandos no procesados | Estructura de topic incorrecta | Verificar: `{tenant}/{gateway_id}/cmd/{seccion}/{sistema}/{accion}` |
| Gateway no recibe telemetría | Legacy topics habilitados | Revisar `enable_legacy_topics: false` en config.yaml |
| Desconexión frecuente | Client ID duplicado | Verificar `client_id` único por instancia |
| Filtro `/cmd/#` no funciona | Topic prefix incorrecto | Confirmar: `{tenant}/{gateway_id}` coinciden en config |

---

## 📚 Referencias

- **Documentación Gateway**: [`control/raspberry_gateway/README.md`](./raspberry_gateway/README.md#mqtt-topics)
- **Configuración Estándar**: [`control/raspberry_gateway/config.yaml`](./raspberry_gateway/config.yaml)
- **Protocolo Arduino**: [`control/arduino_code/README_ARDUINO.md`](./arduino_code/README_ARDUINO.md)

---

**Última actualización**: 2024-09-05  
**Estado**: Topics legacy deshabilitados, estructura estándar obligatoria
