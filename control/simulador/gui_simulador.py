"""
Simulador Interactivo Visual GUI (Tkinter) para Pruebas SCADA Multi-Dispositivo & Multi-Red.

Características:
1. Permite modificar libremente la Dirección MAC / Gateway ID (en lugar de ser fija).
2. Pestañas organizadas: Conexión & Tópicos, Control de Telemetría (Random vs Sliders), Monitor de Comandos.
3. Luces LED virtuales (Canvas) que se encienden/apagan al recibir órdenes desde la web (/scada o /control).
4. Publicación en tiempo real hacia Mosquitto MQTT.
"""

from __future__ import annotations

import json
import math
import random
import sys
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
import yaml

# Agregar directorio actual al sys.path
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

try:
    import paho.mqtt.client as mqtt
except ImportError:
    messagebox.showerror("Error de Dependencias", "Se requiere 'paho-mqtt'. Instálalo con: pip install paho-mqtt")
    sys.exit(1)


class SimuladorGUI:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("SCADA - Simulador Interactivo Multi-Dispositivo & Red")
        self.root.geometry("820x640")
        self.root.minsize(780, 580)
        
        # Configurar estilos ttk
        self.style = ttk.Style()
        self.style.theme_use('clam')
        
        # Estado de conexión y cliente MQTT
        self.client: Optional[mqtt.Client] = None
        self.is_connected = False
        self.running = True
        
        # Variables simuladas físicas
        self.modo_telemetria = tk.StringVar(value="manual") # "manual" o "random"
        self.intervalo_envio = tk.DoubleVar(value=2.0)
        
        # Sliders y Valores
        self.val_temp = tk.DoubleVar(value=24.5)
        self.val_presion = tk.DoubleVar(value=2.4)
        self.val_bombo1 = tk.DoubleVar(value=80.0)
        self.val_bombo2 = tk.DoubleVar(value=60.0)
        self.val_mezcla = tk.DoubleVar(value=15.0)
        self.val_caudal_a = tk.DoubleVar(value=12.5)
        self.val_caudal_b = tk.DoubleVar(value=8.3)
        
        # Estado de actuadores (Luces LED)
        self.actuadores_estado = {
            "pump-1": False,
            "pump-2": False,
            "bomba_mezcla": False,
            "mixer-1": False,
            "bomba_reposicion": False,
            "electrovalvula-1": False,
            "electrovalvula-2": False,
        }
        self.led_canvas_map: Dict[str, tk.Canvas] = {}
        self.led_circle_map: Dict[str, int] = {}
        
        # Configuración por defecto
        self.config_path = CURRENT_DIR / "config.yaml"
        self.load_config_defaults()
        
        # Construir Interfaz
        self.build_ui()
        
        # Protocolo de cierre
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        
        # Hilo de simulación y publicación continua
        self.sim_thread = threading.Thread(target=self.loop_telemetria, daemon=True)
        self.sim_thread.start()

    def load_config_defaults(self):
        self.host_var = tk.StringVar(value="100.69.41.46")
        self.port_var = tk.IntVar(value=1883)
        self.user_var = tk.StringVar(value="admin")
        self.pass_var = tk.StringVar(value="admin")
        self.tenant_var = tk.StringVar(value="rafaela_sa")
        self.gateway_mac_var = tk.StringVar(value="d83add60dbb0") # Editable libremente
        self.sector_var = tk.StringVar(value="A1")
        self.sistema_var = tk.StringVar(value="linea_mezclado_1")

        if self.config_path.exists():
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    cfg = yaml.safe_load(f)
                    m = cfg.get("mqtt", {})
                    self.host_var.set(m.get("broker", "100.69.41.46"))
                    self.port_var.set(m.get("port", 1883))
                    self.user_var.set(m.get("username", "admin"))
                    self.pass_var.set(m.get("password", "admin"))
                    self.tenant_var.set(m.get("tenant", "rafaela_sa"))
                    self.gateway_mac_var.set(m.get("gateway_id", "d83add60dbb0"))
                    self.sector_var.set(m.get("default_sector", "A1"))
                    self.sistema_var.set(m.get("default_system", "linea_mezclado_1"))
            except Exception:
                pass

    def build_ui(self):
        # Header principal
        header_frame = ttk.Frame(self.root, padding=10)
        header_frame.pack(fill="x")
        
        lbl_title = ttk.Label(header_frame, text="🧪 Simulador SCADA IoT - Testeo Multisitio", font=("Segoe UI", 14, "bold"))
        lbl_title.pack(side="left")
        
        self.lbl_status_badge = tk.Label(
            header_frame, text="🔴 DESCONECTADO", bg="#dc2626", fg="white", font=("Segoe UI", 9, "bold"), padx=8, pady=3
        )
        self.lbl_status_badge.pack(side="right")
        
        # Notebook (Pestañas)
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill="both", expand=True, padx=10, pady=5)
        
        # Pestaña 1: Conexión & Configuración
        self.tab_conexion = ttk.Frame(self.notebook, padding=15)
        self.notebook.add(self.tab_conexion, text="🔌 Conexión & Tópicos")
        self.build_tab_conexion()
        
        # Pestaña 2: Control de Telemetría (Random / Sliders)
        self.tab_telemetria = ttk.Frame(self.notebook, padding=15)
        self.notebook.add(self.tab_telemetria, text="📊 Telemetría & Sliders")
        self.build_tab_telemetria()
        
        # Pestaña 3: Monitor de Comandos & Luces LED
        self.tab_actuadores = ttk.Frame(self.notebook, padding=15)
        self.notebook.add(self.tab_actuadores, text="💡 Actuadores & Luces LED")
        self.build_tab_actuadores()

    def build_tab_conexion(self):
        # Frame principal con panel lateral (izquierda) y monitor (derecha)
        main_frame = ttk.Frame(self.tab_conexion)
        main_frame.pack(fill="both", expand=True)
        
        # ===== PANEL LATERAL IZQUIERDO =====
        left_panel = ttk.LabelFrame(main_frame, text="Panel Lateral", padding=10, width=300)
        left_panel.pack(side="left", fill="both", expand=False, padx=(0, 5))
        left_panel.pack_propagate(False)
        
        # --- SECCIÓN SUPERIOR: Configuración ---
        config_frame = ttk.LabelFrame(left_panel, text="Configuración MQTT", padding=10)
        config_frame.pack(fill="x", pady=(0, 10))
        
        # Broker Host
        ttk.Label(config_frame, text="Broker MQTT:", font=("Segoe UI", 9)).grid(row=0, column=0, sticky="w", pady=3)
        ttk.Entry(config_frame, textvariable=self.host_var, width=20, font=("Segoe UI", 9)).grid(row=0, column=1, sticky="w", padx=3)
        
        # Puerto
        ttk.Label(config_frame, text="Puerto:", font=("Segoe UI", 9)).grid(row=1, column=0, sticky="w", pady=3)
        ttk.Entry(config_frame, textvariable=self.port_var, width=20, font=("Segoe UI", 9)).grid(row=1, column=1, sticky="w", padx=3)
        
        # Usuario
        ttk.Label(config_frame, text="Usuario:", font=("Segoe UI", 9)).grid(row=2, column=0, sticky="w", pady=3)
        ttk.Entry(config_frame, textvariable=self.user_var, width=20, font=("Segoe UI", 9)).grid(row=2, column=1, sticky="w", padx=3)
        
        # Contraseña
        ttk.Label(config_frame, text="Contraseña:", font=("Segoe UI", 9)).grid(row=3, column=0, sticky="w", pady=3)
        ttk.Entry(config_frame, textvariable=self.pass_var, show="*", width=20, font=("Segoe UI", 9)).grid(row=3, column=1, sticky="w", padx=3)
        
        # Tenant
        ttk.Label(config_frame, text="Tenant:", font=("Segoe UI", 9)).grid(row=4, column=0, sticky="w", pady=3)
        ttk.Entry(config_frame, textvariable=self.tenant_var, width=20, font=("Segoe UI", 9)).grid(row=4, column=1, sticky="w", padx=3)
        
        # Gateway ID
        ttk.Label(config_frame, text="Gateway ID:", font=("Segoe UI", 9, "bold")).grid(row=5, column=0, sticky="w", pady=3)
        ttk.Entry(config_frame, textvariable=self.gateway_mac_var, width=20, font=("Consolas", 9, "bold")).grid(row=5, column=1, sticky="w", padx=3)
        
        # Sector
        ttk.Label(config_frame, text="Sector:", font=("Segoe UI", 9)).grid(row=6, column=0, sticky="w", pady=3)
        ttk.Entry(config_frame, textvariable=self.sector_var, width=20, font=("Segoe UI", 9)).grid(row=6, column=1, sticky="w", padx=3)
        
        # Sistema
        ttk.Label(config_frame, text="Sistema:", font=("Segoe UI", 9, "bold")).grid(row=7, column=0, sticky="w", pady=3)
        ttk.Entry(config_frame, textvariable=self.sistema_var, width=20, font=("Segoe UI", 9)).grid(row=7, column=1, sticky="w", padx=3)
        
        # Botones de Control
        btn_frame1 = ttk.Frame(config_frame)
        btn_frame1.grid(row=8, column=0, columnspan=2, sticky="ew", pady=(10, 0))
        
        self.btn_connect = tk.Button(
            btn_frame1, text="▶ Conectar", bg="#16a34a", fg="white", font=("Segoe UI", 9, "bold"),
            command=self.toggle_connection, width=11
        )
        self.btn_connect.pack(side="left", padx=2)
        
        btn_refresh = tk.Button(
            btn_frame1, text="🔄 Actualizar", bg="#3b82f6", fg="white", font=("Segoe UI", 9, "bold"),
            command=self._refresh_tab_conexion, width=11
        )
        btn_refresh.pack(side="left", padx=2)
        
        # Botones de alternancia Datos/Tópicos
        ttk.Label(config_frame, text="Mostrar:", font=("Segoe UI", 9, "bold")).grid(row=9, column=0, sticky="w", pady=(10, 3))
        
        btn_frame2 = ttk.Frame(config_frame)
        btn_frame2.grid(row=10, column=0, columnspan=2, sticky="ew")
        
        self.btn_show_datos = tk.Button(
            btn_frame2, text="📊 Datos", bg="#9333ea", fg="white", font=("Segoe UI", 9, "bold"),
            command=self._show_datos_conexion, width=12
        )
        self.btn_show_datos.pack(side="left", padx=2)
        
        self.btn_show_topics_conexion = tk.Button(
            btn_frame2, text="📋 Tópicos", bg="#2563eb", fg="white", font=("Segoe UI", 9, "bold"),
            command=self._show_topics_conexion, width=12
        )
        self.btn_show_topics_conexion.pack(side="left", padx=2)
        
        # --- SECCIÓN INFERIOR: Área de visualización (SIEMPRE DESPLEGADA) ---
        display_frame = ttk.LabelFrame(left_panel, text="Información", padding=10)
        display_frame.pack(fill="both", expand=True, pady=(10, 0))
        
        # ScrolledText para mostrar contenido
        self.display_text = scrolledtext.ScrolledText(
            display_frame, height=20, width=35, font=("Consolas", 8),
            bg="#1e293b", fg="#e2e8f0", wrap="word", relief="solid", borderwidth=1
        )
        self.display_text.pack(fill="both", expand=True)
        self.display_text.config(state="disabled")
        
        # ===== PANEL DERECHO: Monitor General =====
        right_panel = ttk.LabelFrame(main_frame, text="Monitor Principal", padding=10)
        right_panel.pack(side="right", fill="both", expand=True, padx=(5, 0))
        
        ttk.Label(right_panel, text="Información del Sistema", font=("Segoe UI", 11, "bold")).pack(anchor="w", pady=5)
        
        self.info_conexion = scrolledtext.ScrolledText(
            right_panel, height=25, width=45, font=("Consolas", 8),
            bg="#1e293b", fg="#e2e8f0", wrap="word", relief="solid", borderwidth=1
        )
        self.info_conexion.pack(fill="both", expand=True)
        self.info_conexion.config(state="disabled")
        
        # Mostrar datos inicialmente
        self._show_datos_conexion()

    def _show_datos_conexion(self):
        """Muestra datos y estado en el panel"""
        self.btn_show_datos.config(bg="#a855f7", relief="sunken")
        self.btn_show_topics_conexion.config(bg="#2563eb", relief="raised")
        self._refresh_tab_conexion()
    
    def _show_topics_conexion(self):
        """Muestra tópicos MQTT en el panel"""
        self.btn_show_topics_conexion.config(bg="#0ea5e9", relief="sunken")
        self.btn_show_datos.config(bg="#9333ea", relief="raised")
        self._refresh_tab_conexion(show_topics=True)
    
    def _refresh_tab_conexion(self, show_topics=False):
        """Actualiza el contenido del panel de visualización"""
        self.display_text.config(state="normal")
        self.display_text.delete(1.0, "end")
        self.info_conexion.config(state="normal")
        self.info_conexion.delete(1.0, "end")
        
        if show_topics:
            self._display_topics_conexion()
        else:
            self._display_datos_conexion()
        
        self.display_text.config(state="disabled")
        self.info_conexion.config(state="disabled")
    
    def _display_datos_conexion(self):
        """Muestra datos y valores actuales"""
        tenant = self.tenant_var.get() or "rafaela_sa"
        gw = self.gateway_mac_var.get() or "d83add60dbb0"
        sector = self.sector_var.get() or "A1"
        sistema = self.sistema_var.get() or "linea_mezclado_1"
        
        content = "📊 DATOS ACTUALES\n"
        content += "=" * 30 + "\n\n"
        content += f"Temperatura: {self.val_temp.get():.1f} °C\n"
        content += f"Presión: {self.val_presion.get():.2f} Bar\n"
        content += f"Bombo 1: {self.val_bombo1.get():.1f} %\n"
        content += f"Bombo 2: {self.val_bombo2.get():.1f} %\n"
        content += f"Mezcla: {self.val_mezcla.get():.1f} %\n"
        content += f"Caudal A: {self.val_caudal_a.get():.1f} L/m\n"
        content += f"Caudal B: {self.val_caudal_b.get():.1f} L/m\n\n"
        
        content += "🌐 Conexión MQTT:\n"
        content += f"Host: {self.host_var.get()}\n"
        content += f"Puerto: {self.port_var.get()}\n"
        content += f"Usuario: {self.user_var.get()}\n"
        content += f"Tenant: {tenant}\n"
        content += f"Gateway: {gw}\n"
        content += f"Sector: {sector}\n"
        content += f"Sistema: {sistema}\n"
        content += f"Estado: {'🟢 ONLINE' if self.is_connected else '🔴 OFFLINE'}\n"
        
        self.display_text.insert("end", content)
        
        # Info panel
        info = "🖥️ ESTADO DE ACTUADORES\n"
        info += "=" * 30 + "\n\n"
        for dev_id, estado in self.actuadores_estado.items():
            status = "✓ ACTIVO" if estado else "✗ Inactivo"
            info += f"{dev_id}: {status}\n"
        
        self.info_conexion.insert("end", info)
    
    def _display_topics_conexion(self):
        """Muestra estructura de tópicos MQTT"""
        tenant = self.tenant_var.get() or "rafaela_sa"
        gw = self.gateway_mac_var.get() or "d83add60dbb0"
        sector = self.sector_var.get() or "A1"
        sistema = self.sistema_var.get() or "linea_mezclado_1"
        
        content = "📋 TÓPICOS MQTT\n"
        content += "=" * 30 + "\n\n"
        content += f"Gateway: {gw}\n"
        content += f"Tenant: {tenant}\n"
        content += f"Sector: {sector}\n"
        content += f"Sistema: {sistema}\n\n"
        
        content += "📤 PUBLICACIÓN\n"
        content += "(Telemetría):\n\n"
        content += f"• {tenant}/{gw}/{sector}/\n"
        content += f"  {sistema}/sensores/\n"
        content += f"  nivel_bombo1\n\n"
        content += f"• {tenant}/{gw}/{sector}/\n"
        content += f"  {sistema}/sensores/\n"
        content += f"  nivel_bombo2\n\n"
        content += f"• {tenant}/{gw}/{sector}/\n"
        content += f"  {sistema}/sensores/\n"
        content += f"  nivel_mezcla\n"
        
        self.display_text.insert("end", content)
        
        # Info panel con recepción
        info = "📥 RECEPCIÓN\n"
        info += "(Comandos):\n\n"
        info += f"• {tenant}/{gw}/{sector}/\n"
        info += f"  {sistema}/reposicion\n\n"
        info += f"• {tenant}/{gw}/{sector}/\n"
        info += f"  {sistema}/\n"
        info += f"  freno_reposicion\n\n"
        info += f"• {tenant}/{gw}/{sector}/\n"
        info += f"  {sistema}/detener\n\n"
        info += f"• {tenant}/{gw}/{sector}/\n"
        info += f"  {sistema}/reanudar\n\n"
        info += f"• {tenant}/{gw}/{sector}/\n"
        info += f"  {sistema}/vaciar\n\n"
        info += f"• {tenant}/{gw}/{sector}/\n"
        info += f"  {sistema}/desechar\n\n"
        info += f"• {tenant}/{gw}/{sector}/\n"
        info += f"  {sistema}/mezcla\n"
        
        self.info_conexion.insert("end", info)

    def mostrar_topicos_dialog(self):
        tenant = self.tenant_var.get() or "rafaela_sa"
        gw = self.gateway_mac_var.get() or "d83add60dbb0"
        sector = self.sector_var.get() or "A1"
        sistema = self.sistema_var.get() or "linea_mezclado_1"
        
        text_info = f"""==================================================
TÓPICOS MQTT SOPORTADOS - SIMULADOR SCADA
==================================================
Gateway ID / MAC Activo: {gw}
Tenant / Empresa: {tenant}
Sector: {sector}
Sistema: {sistema}

--------------------------------------------------
1. TELEMETRÍA DE SENSORES Y ESTADO (Publicación)
--------------------------------------------------
• Nivel Bombo 1:        {tenant}/{gw}/{sector}/{sistema}/sensores/nivel_bombo1
• Nivel Bombo 2:        {tenant}/{gw}/{sector}/{sistema}/sensores/nivel_bombo2
• Nivel Mezcla:         {tenant}/{gw}/{sector}/{sistema}/sensores/nivel_mezcla
• Caudales 1 y 2:       {tenant}/{gw}/{sector}/{sistema}/sensores/caudal_1
• Estado de Actuadores: {tenant}/{gw}/{sector}/{sistema}/actuadores/<nombre>
• Estado General:       {tenant}/{gw}/estado/general

--------------------------------------------------
2. ACCIONES Y REPOSICIÓN DESDE WEB SCADA (Suscripción)
--------------------------------------------------
✓ Formato 1 (Jerárquico 5 Niveles Directo):
  {tenant}/{gw}/{sector}/{sistema}/reposicion
  {tenant}/{gw}/{sector}/{sistema}/detener_mezcla

✓ Formato 2 (Jerárquico 5 Niveles General):
  {tenant}/{gw}/{sector}/{sistema}/accion
  Payload JSON: {{"accion": "reposicion", "bombo": 1, "limite_porcentaje": 80}}

✓ Formato 3 (Comando General de Gateway):
  {tenant}/{gw}/cmd/reposicion
• Caudales 1 y 2:       {tenant}/{gw}/a1/linea_mezclado_1/sensores/caudal_1
• Estado de Actuadores: {tenant}/{gw}/a1/linea_mezclado_1/actuadores/<nombre>
• Estado General:       {tenant}/{gw}/estado/general

--------------------------------------------------
2. ACCIONES Y REPOSICIÓN DESDE WEB SCADA (Suscripción)
--------------------------------------------------
✓ Formato 1 (Jerárquico 5 Niveles Directo):
  {tenant}/{gw}/a1/linea_mezclado_1/reposicion
  {tenant}/{gw}/a1/linea_mezclado_1/detener_mezcla

✓ Formato 2 (Jerárquico 5 Niveles General):
  {tenant}/{gw}/a1/linea_mezclado_1/accion
  Payload JSON: {{"accion": "reposicion", "bombo": 1, "limite_porcentaje": 80}}

✓ Formato 3 (Comando General de Gateway):
  {tenant}/{gw}/cmd/reposicion
  {tenant}/{gw}/cmd/detener_mezcla

✓ Formato 4 (Comando Específico a Dispositivo):
  {tenant}/{gw}/cmd/DEV-001

✓ Formato 5 (Tópico Legacy Fallback):
  scada/planta1/comandos/reposicion
=================================================="""

        win = tk.Toplevel(self.root)
        win.title("Tópicos MQTT Soportados")
        win.geometry("650x540")
        
        lbl = ttk.Label(win, text="📡 Esquema Estructurado de Tópicos MQTT Soportados", font=("Segoe UI", 11, "bold"))
        lbl.pack(pady=10)
        
        txt = scrolledtext.ScrolledText(win, font=("Consolas", 9), wrap="word")
        txt.pack(fill="both", expand=True, padx=10, pady=5)
        txt.insert("1.0", text_info)
        txt.config(state="disabled")
        
        btn_close = ttk.Button(win, text="Cerrar", command=win.destroy)
        btn_close.pack(pady=10)

    def build_tab_telemetria(self):
        # Selector de Modo
        mode_frame = ttk.LabelFrame(self.tab_telemetria, text="Modo de Generación de Telemetría", padding=10)
        mode_frame.pack(fill="x", pady=5)
        
        ttk.Radiobutton(mode_frame, text="🎛️ Control Manual por Sliders en Vivo", variable=self.modo_telemetria, value="manual").pack(side="left", padx=15)
        ttk.Radiobutton(mode_frame, text="🎲 Modo Sintético Aleatorio (Random)", variable=self.modo_telemetria, value="random").pack(side="left", padx=15)
        
        # Sliders Frame
        sliders_frame = ttk.LabelFrame(self.tab_telemetria, text="Ajuste Manual de Variables y Sensores", padding=15)
        sliders_frame.pack(fill="both", expand=True, pady=5)
        
        # 1. Temperatura
        ttk.Label(sliders_frame, text="Temperatura (°C):").grid(row=0, column=0, sticky="w", pady=5)
        s_temp = ttk.Scale(sliders_frame, from_=0.0, to=100.0, variable=self.val_temp, orient="horizontal", length=220)
        s_temp.grid(row=0, column=1, padx=10)
        ttk.Label(sliders_frame, textvariable=tk.StringVar(value=""), width=8).grid(row=0, column=2)
        lbl_v_temp = ttk.Label(sliders_frame, text="", font=("Consolas", 10, "bold"))
        lbl_v_temp.grid(row=0, column=2, sticky="w")
        self.val_temp.trace_add("write", lambda *args: lbl_v_temp.config(text=f"{self.val_temp.get():.1f} °C"))
        lbl_v_temp.config(text=f"{self.val_temp.get():.1f} °C")

        # 2. Presión
        ttk.Label(sliders_frame, text="Presión (Bar):").grid(row=1, column=0, sticky="w", pady=5)
        s_pres = ttk.Scale(sliders_frame, from_=0.0, to=100.0, variable=self.val_presion, orient="horizontal", length=220)
        s_pres.grid(row=1, column=1, padx=10)
        lbl_v_pres = ttk.Label(sliders_frame, text="", font=("Consolas", 10, "bold"))
        lbl_v_pres.grid(row=1, column=2, sticky="w")
        self.val_presion.trace_add("write", lambda *args: lbl_v_pres.config(text=f"{self.val_presion.get():.2f} Bar"))
        lbl_v_pres.config(text=f"{self.val_presion.get():.2f} Bar")

        # 3. Nivel Bombo 1
        ttk.Label(sliders_frame, text="Nivel Bombo 1 (%):").grid(row=2, column=0, sticky="w", pady=5)
        s_b1 = ttk.Scale(sliders_frame, from_=0.0, to=100.0, variable=self.val_bombo1, orient="horizontal", length=220)
        s_b1.grid(row=2, column=1, padx=10)
        lbl_v_b1 = ttk.Label(sliders_frame, text="", font=("Consolas", 10, "bold"))
        lbl_v_b1.grid(row=2, column=2, sticky="w")
        self.val_bombo1.trace_add("write", lambda *args: lbl_v_b1.config(text=f"{self.val_bombo1.get():.1f} %"))
        lbl_v_b1.config(text=f"{self.val_bombo1.get():.1f} %")

        # 4. Nivel Bombo 2
        ttk.Label(sliders_frame, text="Nivel Bombo 2 (%):").grid(row=3, column=0, sticky="w", pady=5)
        s_b2 = ttk.Scale(sliders_frame, from_=0.0, to=100.0, variable=self.val_bombo2, orient="horizontal", length=220)
        s_b2.grid(row=3, column=1, padx=10)
        lbl_v_b2 = ttk.Label(sliders_frame, text="", font=("Consolas", 10, "bold"))
        lbl_v_b2.grid(row=3, column=2, sticky="w")
        self.val_bombo2.trace_add("write", lambda *args: lbl_v_b2.config(text=f"{self.val_bombo2.get():.1f} %"))
        lbl_v_b2.config(text=f"{self.val_bombo2.get():.1f} %")

        # 5. Nivel Tanque Mezcla
        ttk.Label(sliders_frame, text="Nivel Mezcla (%):").grid(row=4, column=0, sticky="w", pady=5)
        s_mz = ttk.Scale(sliders_frame, from_=0.0, to=100.0, variable=self.val_mezcla, orient="horizontal", length=220)
        s_mz.grid(row=4, column=1, padx=10)
        lbl_v_mz = ttk.Label(sliders_frame, text="", font=("Consolas", 10, "bold"))
        lbl_v_mz.grid(row=4, column=2, sticky="w")
        self.val_mezcla.trace_add("write", lambda *args: lbl_v_mz.config(text=f"{self.val_mezcla.get():.1f} %"))
        lbl_v_mz.config(text=f"{self.val_mezcla.get():.1f} %")

        # Botón de disparo manual
        btn_pub = tk.Button(
            self.tab_telemetria, text="⚡ Publicar Lecturas Ahora", bg="#2563eb", fg="white", font=("Segoe UI", 9, "bold"),
            command=self.publicar_manual_ahora, padx=12, pady=4
        )
        btn_pub.pack(anchor="e", pady=5)

    def build_tab_actuadores(self):
        # Panel de Luces LED
        led_frame = ttk.LabelFrame(self.tab_actuadores, text="Luces Indicadoras LED (Respuesta a Comandos del Frontend Web)", padding=15)
        led_frame.pack(fill="x", pady=5)
        
        actuadores_info = [
            ("pump-1", "Bomba P1 (Bombo 1)"),
            ("pump-2", "Bomba P2 (Bombo 2)"),
            ("bomba_mezcla", "Bomba de Mezcla"),
            ("mixer-1", "Mezclador M1"),
            ("bomba_reposicion", "Bomba Reposición"),
            ("electrovalvula-1", "Válvula Rep. A"),
            ("electrovalvula-2", "Válvula Rep. B"),
        ]
        
        grid_leds = ttk.Frame(led_frame)
        grid_leds.pack(fill="x")
        
        col = 0
        row = 0
        for dev_id, nombre in actuadores_info:
            item_f = ttk.Frame(grid_leds, padding=6)
            item_f.grid(row=row, column=col, sticky="w", padx=8, pady=4)
            
            canvas = tk.Canvas(item_f, width=24, height=24, bg=self.root.cget("bg"), highlightthickness=0)
            canvas.pack(side="left", padx=4)
            circle = canvas.create_oval(3, 3, 21, 21, fill="#6b7280", outline="#374151") # Gris por defecto (inactivo)
            
            lbl = ttk.Label(item_f, text=nombre, font=("Segoe UI", 9, "bold"))
            lbl.pack(side="left", padx=4)
            
            self.led_canvas_map[dev_id] = canvas
            self.led_circle_map[dev_id] = circle
            
            col += 1
            if col > 2:
                col = 0
                row += 1

        # Consola de Registros de Comandos Recibidos
        log_frame = ttk.LabelFrame(self.tab_actuadores, text="Consola de Comandos Recibidos desde el Frontend SCADA", padding=10)
        log_frame.pack(fill="both", expand=True, pady=10)
        
        self.txt_log = scrolledtext.ScrolledText(log_frame, height=10, font=("Consolas", 9), bg="#1e1e1e", fg="#4ade80")
        self.txt_log.pack(fill="both", expand=True)
        self.log_msg("Esperando conexión con el Broker MQTT...")

    def log_msg(self, msg: str):
        if hasattr(self, 'txt_log'):
            ts = time.strftime("[%H:%M:%S]")
            self.txt_log.insert(tk.END, f"{ts} {msg}\n")
            self.txt_log.see(tk.END)

    def update_led(self, dev_id: str, active: bool):
        if dev_id in self.led_canvas_map and dev_id in self.led_circle_map:
            canvas = self.led_canvas_map[dev_id]
            circle = self.led_circle_map[dev_id]
            color = "#16a34a" if active else "#6b7280" # Verde verde vivo vs Gris
            canvas.itemconfig(circle, fill=color)

    def toggle_connection(self):
        if not self.is_connected:
            self.connect_mqtt()
        else:
            self.disconnect_mqtt()

    def connect_mqtt(self):
        try:
            host = self.host_var.get().strip()
            port = int(self.port_var.get())
            user = self.user_var.get().strip()
            passwd = self.pass_var.get().strip()
            mac = self.gateway_mac_var.get().strip() or "d83add60dbb0"
            
            self.client = mqtt.Client(client_id=f"sim_gui_{mac}_{random.randint(100,999)}")
            if user:
                self.client.username_pw_set(user, passwd)
                
            self.client.on_connect = self.on_mqtt_connect
            self.client.on_message = self.on_mqtt_message
            self.client.on_disconnect = self.on_mqtt_disconnect
            
            self.client.connect(host, port, keepalive=60)
            self.client.loop_start()
            
            self.lbl_status_badge.config(text="🟡 CONECTANDO...", bg="#d97706")
            self.log_msg(f"Conectando a {host}:{port} con Gateway ID: {mac}...")
        except Exception as e:
            messagebox.showerror("Error de Conexión", f"No se pudo conectar al Broker MQTT:\n{e}")
            self.lbl_status_badge.config(text="🔴 ERROR CONEXIÓN", bg="#dc2626")

    def disconnect_mqtt(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
        self.is_connected = False
        self.lbl_status_badge.config(text="🔴 DESCONECTADO", bg="#dc2626")
        self.btn_connect.config(text="▶ Conectar al Broker MQTT", bg="#16a34a")
        self.log_msg("Desconectado del Broker MQTT.")

    def on_mqtt_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.is_connected = True
            tenant = self.tenant_var.get().strip() or "rafaela_sa"
            mac = self.gateway_mac_var.get().strip() or "d83add60dbb0"
            
            # Suscribirse a tópicos de acción
            topic_sub = f"{tenant}/{mac}/#/#/accion"
            topic_sub_cmd = f"cmd/#"
            client.subscribe("#") # Suscripción global para monitorear todas las órdenes del front
            
            self.root.after(0, lambda: self.lbl_status_badge.config(text="🟢 CONECTADO ONLINE", bg="#16a34a"))
            self.root.after(0, lambda: self.btn_connect.config(text="⏹ Desconectar Broker", bg="#dc2626"))
            self.root.after(0, lambda: self.log_msg(f"Conectado exitosamente. Suscrito a acciones de {tenant}/{mac}."))
        else:
            self.root.after(0, lambda: self.lbl_status_badge.config(text="🔴 RECHAZADO", bg="#dc2626"))

    def on_mqtt_disconnect(self, client, userdata, rc):
        self.is_connected = False
        self.root.after(0, lambda: self.lbl_status_badge.config(text="🔴 DESCONECTADO", bg="#dc2626"))
        self.root.after(0, lambda: self.btn_connect.config(text="▶ Conectar al Broker MQTT", bg="#16a34a"))

    def on_mqtt_message(self, client, userdata, msg):
        topic = msg.topic
        payload_str = msg.payload.decode('utf-8', errors='ignore')
        
        # Ignorar telemetría propia publicada
        if "/sensores/" in topic or "/nivel/" in topic or "/caudal/" in topic:
            return
            
        self.root.after(0, lambda: self.log_msg(f"📩 [{topic}] -> {payload_str}"))
        
        # Interpretar comandos de actuadores
        up_payload = payload_str.upper()
        if "PUMP-1" in topic or "bomba1" in topic:
            act = "INICIAR" in up_payload or "1" in up_payload or "ON" in up_payload or "ABRIR" in up_payload
            self.actuadores_estado["pump-1"] = act
            self.root.after(0, lambda: self.update_led("pump-1", act))
            
        if "PUMP-2" in topic or "bomba2" in topic:
            act = "INICIAR" in up_payload or "1" in up_payload or "ON" in up_payload or "ABRIR" in up_payload
            self.actuadores_estado["pump-2"] = act
            self.root.after(0, lambda: self.update_led("pump-2", act))
            
        if "BOMBA_MEZCLA" in topic or "bomba_mezcla" in topic:
            act = "INICIAR" in up_payload or "1" in up_payload or "ON" in up_payload or "ABRIR" in up_payload
            self.actuadores_estado["bomba_mezcla"] = act
            self.root.after(0, lambda: self.update_led("bomba_mezcla", act))
            
        if "MIXER-1" in topic or "mezclador" in topic:
            act = "INICIAR" in up_payload or "1" in up_payload or "ON" in up_payload or "ABRIR" in up_payload
            self.actuadores_estado["mixer-1"] = act
            self.root.after(0, lambda: self.update_led("mixer-1", act))

        if "ELECTROVALVULA-1" in topic or "valvula_a" in topic:
            act = "1" in up_payload or "ON" in up_payload or "ABRIR" in up_payload or "INICIAR" in up_payload
            self.actuadores_estado["electrovalvula-1"] = act
            self.root.after(0, lambda: self.update_led("electrovalvula-1", act))

        if "ELECTROVALVULA-2" in topic or "valvula_b" in topic:
            act = "1" in up_payload or "ON" in up_payload or "ABRIR" in up_payload or "INICIAR" in up_payload
            self.actuadores_estado["electrovalvula-2"] = act
            self.root.after(0, lambda: self.update_led("electrovalvula-2", act))

        if "BOMBA_REPOSICION" in topic or "bomba_reposicion" in topic or "REPOSICION" in up_payload or "reposicion" in topic:
            act = "INICIAR" in up_payload or "1" in up_payload or "ON" in up_payload or "ABRIR" in up_payload or "REPOSICION" in up_payload
            self.actuadores_estado["bomba_reposicion"] = act
            self.root.after(0, lambda: self.update_led("bomba_reposicion", act))

    def publicar_manual_ahora(self):
        if not self.is_connected or not self.client:
            messagebox.showwarning("Sin Conexión", "Debes conectar el cliente MQTT primero.")
            return
        self.emitir_telemetria_actual()

    def emitir_telemetria_actual(self):
        if not self.is_connected or not self.client:
            return
            
        tenant = self.tenant_var.get().strip() or "rafaela_sa"
        mac = self.gateway_mac_var.get().strip() or "d83add60dbb0"
        sector = self.sector_var.get().strip() or "A1"
        sistema = self.sistema_var.get().strip() or "linea_mezclado_1"
        modo = self.modo_telemetria.get()
        
        if modo == "random":
            temp = round(20.0 + random.uniform(0.0, 15.0), 1)
            pres = round(2.0 + random.uniform(-0.5, 0.5), 2)
            b1 = round(max(0.0, min(100.0, self.val_bombo1.get() + random.uniform(-1.0, 1.0))), 1)
            b2 = round(max(0.0, min(100.0, self.val_bombo2.get() + random.uniform(-1.0, 1.0))), 1)
            mz = round(max(0.0, min(100.0, self.val_mezcla.get() + random.uniform(-0.5, 0.5))), 1)
            c_a = round(12.0 + random.uniform(-0.5, 0.5), 1) if self.actuadores_estado["pump-1"] else 0.0
            c_b = round(8.0 + random.uniform(-0.5, 0.5), 1) if self.actuadores_estado["pump-2"] else 0.0
            
            self.val_temp.set(temp)
            self.val_presion.set(pres)
            self.val_bombo1.set(b1)
            self.val_bombo2.set(b2)
            self.val_mezcla.set(mz)
            self.val_caudal_a.set(c_a)
            self.val_caudal_b.set(c_b)
        else:
            temp = self.val_temp.get()
            pres = self.val_presion.get()
            b1 = self.val_bombo1.get()
            b2 = self.val_bombo2.get()
            mz = self.val_mezcla.get()
            c_a = self.val_caudal_a.get()
            c_b = self.val_caudal_b.get()

        # Publicar tópicos estándar
        base = f"{tenant}/{mac}/{sector}/{sistema}"
        
        # 1. Niveles de Bombos y Tanque Mezcla
        self.client.publish(f"{base}/nivel/sensor_nivel_bombo1", json.dumps({"value": b1, "estado": "ONLINE", "unidad": "%"}))
        self.client.publish(f"{base}/nivel/sensor_nivel_bombo2", json.dumps({"value": b2, "estado": "ONLINE", "unidad": "%"}))
        self.client.publish(f"{base}/nivel/sensor_nivel_mezcla", json.dumps({"value": mz, "estado": "ONLINE", "unidad": "%"}))
        
        # 2. Caudales
        self.client.publish(f"{base}/caudal/sensor-3", json.dumps({"value": c_a, "estado": "ONLINE", "unidad": "L/min"}))
        self.client.publish(f"{base}/caudal/sensor_caudal_02", json.dumps({"value": c_b, "estado": "ONLINE", "unidad": "L/min"}))
        
        # 3. Temperatura & Presión Generales
        self.client.publish(f"{base}/sensores/temperatura", json.dumps({"value": temp, "estado": "ONLINE", "unidad": "°C"}))
        self.client.publish(f"{base}/sensores/presion", json.dumps({"value": pres, "estado": "ONLINE", "unidad": "Bar"}))

        # 4. Sensores con el formato estándar unificado
        self.client.publish(f"{base}/sensores/nivel_bombo1", json.dumps({"valor": b1, "unidad": "%"}))
        self.client.publish(f"{base}/sensores/nivel_bombo2", json.dumps({"valor": b2, "unidad": "%"}))
        self.client.publish(f"{base}/sensores/nivel_mezcla", json.dumps({"valor": mz, "unidad": "%"}))
        self.client.publish(f"{base}/sensores/caudal_1", json.dumps({"valor": c_a, "unidad": "L/min"}))
        self.client.publish(f"{base}/sensores/caudal_2", json.dumps({"valor": c_b, "unidad": "L/min"}))

        # 5. Diagnóstico de Planta
        self.client.publish(
            f"{tenant}/{mac}/estado/general",
            json.dumps({"estado": "OPERATIVO", "porcentaje_produccion": round(b1 * 0.5 + b2 * 0.5, 1), "temperatura_promedio": temp})
        )

    def loop_telemetria(self):
        while self.running:
            if self.is_connected:
                try:
                    self.emitir_telemetria_actual()
                except Exception as e:
                    pass
            time.sleep(self.intervalo_envio.get())

    def on_close(self):
        self.running = False
        self.disconnect_mqtt()
        self.root.destroy()


if __name__ == "__main__":
    app = SimuladorGUI()
    app.root.mainloop()
