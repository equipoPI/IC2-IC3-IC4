# 📡 Especificación del Estándar de Comunicaciones MQTT

## 1. Jerarquía Estándar de Tópicos

La plataforma SCADA utiliza una estructura jerárquica unificada de 6 niveles para telemetría y 5 niveles para comandos de control:

### A. Tópico de Ingesta de Telemetría:
```
{tenant}/{gateway_id}/{seccion}/{sistema}/{categoria}/{dispositivo}
```

- **`tenant`**: Identificador de la empresa / planta (ej. `rafaela_sa`).
- **`gateway_id`**: Identificador MAC o serie del concentrador IoT (ej. `d83add60dbb0`).
- **`seccion`**: Código de la nave o sección (ej. `a1`).
- **`sistema`**: Línea de producción o proceso (ej. `linea_mezclado_1`).
- **`categoria`**: Rubro del componente (`bombas`, `mezcladores`, `valvulas`, `tanques`, `sensores`).
- **`dispositivo`**: Nombre del actuador o sensor (ej. `bomba_1`, `caudalimetro_1`, `bombo_mezcla`).

**Ejemplo completo de telemetría:**
```
rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/sensores/caudalimetro_1
```

---

### B. Tópico de Publicación de Comandos de Control:
```
{tenant}/{gateway_id}/{seccion}/{sistema}/{accion}
```

- **`accion`**: Nombre de la operación a ejecutar (ej. `reposicion`, `receta_liquidos`, `freno_reposicion`, `vaciar`, `detener`, `reanudar`, `desechar`).

**Ejemplo completo de comando:**
```
rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/reposicion
```

---

## 2. Esquemas de Payload JSON Estándar

### A. Control de Reposición de Bombos:
```json
{
  "bombo": 1,
  "limite_porcentaje": 75,
  "_bombo_max": 2
}
```

### B. Dosificación de Receta Multi-Ingrediente:
```json
{
  "ingrediente_a_lts": 50,
  "ingrediente_b_lts": 30,
  "tiempo_horas": 0,
  "tiempo_minutos": 15
}
```

### C. Comandos Directos de Pulso / Estado:
```json
{
  "comando": "START",
  "estado": true
}
```

---

## 3. Tipos de Sistemas Industriales Compatibles

| Tipo | Descripción | Componentes Típicos |
|---|---|---|
| **`FLUIDOS`** | Líquidos y mezclas | Bombas, caudalímetros, tanques, válvulas proporcionales |
| **`SOLIDOS`** | Polvos y granulados | Silos, tolvas, balanzas, cintas transportadoras |
| **`EMPAQUE`** | Embalaje y final de línea | Envasadoras, selladoras térmicas, etiquetadoras |
| **`TEMPERATURA`** | Procesos térmicos | Hornos, autoclaves, calderas, sensores RTD/PT100 |
| **`GENERAL`** | Servicios auxiliares | Compresores, generadores, bancos de condensadores |
