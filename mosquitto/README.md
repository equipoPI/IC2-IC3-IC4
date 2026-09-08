# 📡 Mosquitto MQTT Broker - Sistema SCADA

Broker MQTT centralizado para la comunicación en tiempo real entre los Gateways IoT (Raspberry Pi / Arduino) y el sistema SCADA.

## 🚀 Inicio Rápido

### Levantar el broker
```powershell
docker compose up -d mosquitto
```

### Ver logs en tiempo real
```powershell
docker compose logs -f mosquitto
```

### Verificar estado del contenedor
```powershell
docker compose ps mosquitto
```

---

## 🔒 Autenticación y Gestión de Credenciales

### Opción 1: Desde la Interfaz Web SCADA (Recomendada)
Accede a **`/credenciales`** en el panel web para:
- Crear y modificar usuarios y contraseñas del broker.
- Aplicar recarga en caliente del archivo `passwd` sin detener el broker.

### Opción 2: Por Consola Docker
```powershell
# Crear o actualizar contraseña del usuario admin
docker compose exec mosquitto mosquitto_passwd -b /mosquitto/config/passwd admin admin

# Recargar configuración en el broker
docker compose restart mosquitto
```

---

## 🧪 Pruebas de Publicación y Suscripción

```powershell
# Escuchar todo el tráfico MQTT
docker compose exec mosquitto mosquitto_sub -u admin -P admin -t "#" -v

# Publicar comando de prueba
docker compose exec mosquitto mosquitto_pub -u admin -P admin -t "rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/reposicion" -m '{"bombo": 1, "limite_porcentaje": 75}'
```
