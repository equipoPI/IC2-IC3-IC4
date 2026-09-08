# 🛠️ Catálogo de Comandos Útiles del Proyecto

## 🐳 Docker Compose

```powershell
# Levantar el stack completo en segundo plano
docker compose up -d

# Reconstruir imágenes y levantar
docker compose up -d --build

# Ver estado de los contenedores
docker compose ps

# Detener el stack
docker compose down

# Ver logs en vivo del backend
docker compose logs -f backend

# Reiniciar backend tras cambios en models o signals
docker compose restart backend
```

---

## 🐍 Backend Django & Channels

```powershell
# Aplicar migraciones
docker compose exec backend python manage.py migrate

# Crear nuevas migraciones
docker compose exec backend python manage.py makemigrations

# Chequeo de consistencia del sistema Django
docker compose exec backend python manage.py check

# Crear superusuario
docker compose exec backend python manage.py createsuperuser

# Ejecutar el Worker MQTT manualmente
docker compose exec backend python manage.py mqtt_worker

# Abrir shell interactiva de Django
docker compose exec backend python manage.py shell
```

---

## ⚛️ Frontend React & Vite (`scada-ui`)

```powershell
cd scada-ui

# Instalar paquetes
npm install

# Iniciar servidor de desarrollo
npm run dev

# Verificación de tipos TypeScript
npx tsc --noEmit

# Compilar bundle de producción
npm run build
```

---

## 📡 Broker MQTT Mosquitto

```powershell
# Escuchar todo el tráfico MQTT en vivo
docker compose exec mosquitto mosquitto_sub -u admin -P admin -t "#" -v

# Publicar un comando de prueba
docker compose exec mosquitto mosquitto_pub -u admin -P admin -t "rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/reposicion" -m '{"bombo": 1, "limite_porcentaje": 80}'
```
