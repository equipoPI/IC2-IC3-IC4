#!/bin/bash

# Script de instalación para Simulador SCADA MQTT
# Prepara el entorno local para ejecutar el simulador

set -e  # Salir en caso de error

echo "=================================================="
echo "   Instalación Simulador SCADA MQTT"
echo "=================================================="
echo ""

# Obtener directorio del script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Detectar Python
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Python no encontrado. Instala Python 3.8 o superior"
    exit 1
fi

echo "✅ Python encontrado: $($PYTHON_CMD --version)"
echo ""

# Crear entorno virtual
echo "🐍 Creando entorno virtual Python..."
$PYTHON_CMD -m venv venv

# Activar entorno virtual
echo "⚙️  Activando entorno virtual..."
source venv/bin/activate

# Actualizar pip
echo "📦 Actualizando pip..."
pip install --upgrade pip

# Instalar dependencias
echo "📦 Instalando dependencias..."
pip install -r requirements.txt

# Crear directorios necesarios
echo "📁 Creando directorios..."
mkdir -p logs
mkdir -p data

# Copiar archivos de configuración si no existen
if [ ! -f .env ]; then
    echo "📋 Creando .env desde .env.example..."
    cp .env.example .env
    echo "   ⚠️  Edita .env con tus valores de broker MQTT"
fi

if [ ! -f config.yaml ]; then
    echo "❌ ERROR: config.yaml no encontrado"
    exit 1
fi

echo ""
echo "✅ ¡Instalación completada!"
echo ""
echo "🚀 Para iniciar el simulador:"
echo ""
echo "   Modo GUI (Interfaz Gráfica):"
echo "   $ source venv/bin/activate"
echo "   $ python gui_simulador.py"
echo ""
echo "   Modo Daemon (Consola):"
echo "   $ source venv/bin/activate"
echo "   $ python mock_mqtt_gateway.py"
echo ""
echo "📖 Consulta README.md para más detalles"
echo ""
