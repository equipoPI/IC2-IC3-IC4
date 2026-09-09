#!/bin/bash
# Comandos rápidos para gestión del Gateway Raspberry Pi

# Servicios
alias gw-start="sudo systemctl start raspberry_gateway"
alias gw-stop="sudo systemctl stop raspberry_gateway"
alias gw-restart="sudo systemctl restart raspberry_gateway"
alias gw-status="sudo systemctl status raspberry_gateway"
alias gw-enable="sudo systemctl enable raspberry_gateway"
alias gw-disable="sudo systemctl disable raspberry_gateway"

# Logs
alias gw-logs="sudo journalctl -u raspberry_gateway -f"
alias gw-logs-100="sudo journalctl -u raspberry_gateway -n 100"
alias gw-logs-error="sudo journalctl -u raspberry_gateway -p err"

# Testing
alias gw-test="cd /opt/scada_gateway && source venv/bin/activate && python test_system.py"
alias gw-check="cd /opt/scada_gateway && ./check_status.sh"

# Base de datos
alias gw-db="sqlite3 /opt/scada_gateway/data/scada_local.db"
alias gw-db-size="du -h /opt/scada_gateway/data/scada_local.db"
alias gw-db-backup="cp /opt/scada_gateway/data/scada_local.db ~/backup_\$(date +%Y%m%d_%H%M%S).db"

# Configuración
alias gw-config="sudo nano /opt/scada_gateway/config.yaml"
alias gw-reload="gw-restart"

# MQTT Testing (Detecta automáticamente el tenant de config.yaml)
alias mqtt-sub-all='CFG="/opt/scada_gateway/config.yaml"; [ ! -f "$CFG" ] && CFG="./config.yaml"; TENANT=$(grep -E "^\s*tenant:" "$CFG" 2>/dev/null | head -n1 | awk "{print \$2}"); mosquitto_sub -h localhost -t "${TENANT:-rafaela_sa}/#" -v'
alias mqtt-sub-sensores='CFG="/opt/scada_gateway/config.yaml"; [ ! -f "$CFG" ] && CFG="./config.yaml"; TENANT=$(grep -E "^\s*tenant:" "$CFG" 2>/dev/null | head -n1 | awk "{print \$2}"); mosquitto_sub -h localhost -t "${TENANT:-rafaela_sa}/+/+/+/sensores/#" -v'
alias mqtt-pub-test="mosquitto_pub -h localhost -t 'test' -m 'hello'"

# Sistema
alias gw-temp="vcgencmd measure_temp"
alias gw-cpu="top -bn1 | grep 'Cpu(s)' | awk '{print \$2 + \$4}'"
alias gw-mem="free -h"

# Serial
alias gw-serial-check="ls -la /dev/tty{ACM,USB}*"
alias gw-serial-perms="sudo chmod 666 /dev/ttyACM0"

echo "Comandos del Gateway Raspberry Pi cargados ✅"
echo ""
echo "Comandos disponibles:"
echo "  Servicio:  gw-start, gw-stop, gw-restart, gw-status"
echo "  Logs:      gw-logs, gw-logs-100, gw-logs-error"
echo "  Test:      gw-test, gw-check"
echo "  DB:        gw-db, gw-db-size, gw-db-backup"
echo "  Config:    gw-config"
echo "  MQTT:      mqtt-sub-all, mqtt-sub-sensores, mqtt-pub-test"
echo "  Sistema:   gw-temp, gw-cpu, gw-mem"
echo "  Serial:    gw-serial-check, gw-serial-perms"
echo ""
