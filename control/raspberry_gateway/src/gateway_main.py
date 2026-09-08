"""
Gateway principal - Orquestador del sistema Raspberry Pi
Integra Arduino Serial, MQTT, almacenamiento local y diagnósticos
"""

import sys
import signal
import time
import threading
from pathlib import Path
from typing import Dict, Any, Optional
from loguru import logger
import yaml

# Importar módulos del sistema
from control.raspberry_gateway.src.arduino_serial import ArduinoSerial
from control.raspberry_gateway.src.mqtt_client import MQTTClient
from control.raspberry_gateway.src.data_storage import DataStorage
from control.raspberry_gateway.src.system_diagnostics import SystemDiagnostics
from control.raspberry_gateway.src.gui import start_gui


class SCADAGateway:
    """
    Clase principal que orquesta todos los componentes del gateway
    """
    
    def __init__(self, config_path: str = "config.yaml"):
        """
        Inicializa el gateway SCADA
        
        Args:
            config_path: Ruta al archivo de configuración
        """
        logger.info("=" * 60)
        logger.info("Inicializando SCADA Gateway")
        logger.info("=" * 60)
        
        # Cargar configuración
        resolved_config_path = self._resolve_config_path(config_path)
        self.config_path = str(resolved_config_path)
        with open(resolved_config_path, 'r') as f:
            self.config = yaml.safe_load(f)

        # Configurar logging
        self._configure_logging()

        # Inicializar componentes
        self.arduino: Optional[ArduinoSerial] = None
        self.mqtt: Optional[MQTTClient] = None
        self.storage: Optional[DataStorage] = None
        self.diagnostics: Optional[SystemDiagnostics] = None

        # Estado
        self.running = False
        self._last_mqtt_retry = 0
        self._mqtt_retry_interval = 30
        # Control de procesamiento (pause/resume)
        self.processing_paused = False
        # Estadísticas
        self.stats = {
            'start_time': time.time(),
            'messages_processed': 0,
            'commands_sent': 0,
            'errors': 0,
            'messages_dropped': 0,
        }

        # Lock para sincronización de thread-safety en datos compartidos
        self._data_lock = threading.Lock()

        # Inicializar componentes
        self._init_components()

        logger.success("Gateway inicializado correctamente")

        # GUI thread placeholder
        self._gui_thread = None

    def _resolve_config_path(self, config_path: str) -> Path:
        """
        Resuelve la ruta del archivo de configuración de forma robusta.
        """
        config_candidate = Path(config_path)
        if config_candidate.is_file():
            return config_candidate

        # Soporta ejecución como módulo desde la raíz del repositorio.
        gateway_root_config = Path(__file__).resolve().parent.parent / config_path
        if gateway_root_config.is_file():
            return gateway_root_config

        raise FileNotFoundError(f"No se encontró archivo de configuración: {config_path}")
    
    def _configure_logging(self):
        """
        Configura el sistema de logging
        """
        log_config = self.config.get('logging', {})
        
        # Remover handler por defecto
        logger.remove()
        
        # Agregar handler para consola
        logger.add(
            sys.stderr,
            format=log_config.get('format', "{time} | {level} | {message}"),
            level=log_config.get('level', 'INFO')
        )
        
        # Agregar handler para archivo principal
        main_log = log_config.get('main', {})
        if main_log:
            logger.add(
                main_log.get('file', 'logs/gateway.log'),
                rotation=main_log.get('rotation', '100 MB'),
                retention=main_log.get('retention', '30 days'),
                compression=main_log.get('compression', 'zip'),
                level=main_log.get('level', 'INFO')
            )
    
    def _init_components(self):
        """
        Inicializa todos los componentes del sistema
        """
        try:
            # Almacenamiento
            logger.info("Inicializando sistema de almacenamiento...")
            self.storage = DataStorage(config_path=self.config_path)
            self.storage.save_event('system', 'Gateway iniciado')
            
            # Arduino Serial
            logger.info("Inicializando comunicación con Arduino...")
            self.arduino = ArduinoSerial(config_path=self.config_path, data_lock=self._data_lock)
            self.arduino.set_data_callback(self._on_arduino_data)
            self.arduino.set_error_callback(self._on_arduino_error)
            
            # Cliente MQTT
            logger.info("Inicializando cliente MQTT...")
            self.mqtt = MQTTClient(config_path=self.config_path, data_lock=self._data_lock)
            self.mqtt.register_command_callback('reposicion', self._on_command_reposicion)
            self.mqtt.register_command_callback('mezcla', self._on_command_mezcla)
            self.mqtt.register_command_callback('control', self._on_command_control)
            self.mqtt.register_command_callback('configuracion', self._on_command_config)
            self.mqtt.register_command_callback('consultas', self._on_query_historico)
            
            # Diagnósticos
            logger.info("Inicializando sistema de diagnóstico...")
            self.diagnostics = SystemDiagnostics(config_path=self.config_path)
            self.diagnostics.set_alert_callback(self._on_diagnostic_alert)
            self.diagnostics.set_publish_callback(self._on_diagnostic_publish)
            
        except Exception as e:
            logger.critical(f"Error inicializando componentes: {e}")
            raise
    
    def start(self) -> bool:
        """
        Inicia el gateway y todos sus componentes.
        Si MQTT o Arduino no están disponibles, el gateway sigue corriendo en modo degradado.
        
        Returns:
            True si el gateway quedó preparado para operar, incluso si algunas dependencias no están disponibles.
        """
        try:
            logger.info("Iniciando gateway...")
            
            # Iniciar comunicación serial
            if self.arduino and not self.arduino.start():
                logger.warning("No se pudo iniciar comunicación con Arduino; el gateway seguirá en modo degradado")
            elif self.arduino:
                logger.info("Comunicación serial con Arduino iniciada")
            
            # Conectar MQTT
            if self.mqtt and not self.mqtt.connect():
                # Si el cliente MQTT reportó código RC de auth, mostrar mensaje específico
                rc = getattr(self.mqtt, 'last_conn_rc', None)
                if rc == 4:
                    logger.error("Fallo de autenticación MQTT: usuario/contraseña incorrectos. Verifica credenciales en control/raspberry_gateway/config.yaml")
                else:
                    logger.warning("No se pudo conectar a MQTT; el gateway seguirá funcionando en modo degradado y reintentará periódicamente")
            elif self.mqtt:
                logger.info("Cliente MQTT conectado")
            
            # Iniciar limpieza automática de datos
            if self.storage:
                self.storage.start_auto_cleanup()
            
            # Iniciar diagnósticos
            if self.diagnostics:
                self.diagnostics.start()
            
            # Actualizar estado de conexiones en diagnósticos
            if self.diagnostics:
                self.diagnostics.set_serial_status(self.arduino.connected if self.arduino else False)
                self.diagnostics.set_mqtt_status(self.mqtt.connected if self.mqtt else False)
            
            self.running = True
            
            # Guardar evento de inicio
            if self.storage:
                self.storage.save_event('system', 'Gateway iniciado y operativo')
            
            logger.success("Gateway iniciado correctamente")

            self._start_gui_if_possible()

            return True
        
        except Exception as e:
            logger.critical(f"Error iniciando gateway: {e}")
            return False

    def _start_gui_if_possible(self):
        """
        Inicia la UI Tkinter como thread NON-DAEMON.
        Tkinter necesita un thread completo para procesar eventos correctamente.
        """
        try:
            import os
            import threading

            if not self.config.get('gui', {}).get('enabled', True):
                logger.info("GUI deshabilitada por configuración")
                return False

            if os.environ.get('DISPLAY') is None and os.name != 'nt':
                logger.warning("No hay DISPLAY configurado; se omite la GUI Tkinter")
                return False

            # IMPORTANTE: daemon=False para que Tkinter procese eventos correctamente
            self._gui_thread = threading.Thread(target=start_gui, args=(self,), daemon=False, name="TkinterGUI")
            self._gui_thread.start()
            logger.info("GUI iniciada (Tkinter - thread no-daemon)")
            return True
        except Exception as e:
            logger.warning(f"No se pudo iniciar GUI: {e}")
            return False

    def _try_reconnect_mqtt(self) -> bool:
        """Reintenta conectar MQTT si está caído y no se está intentando con demasiada frecuencia."""
        if not self.mqtt or self.mqtt.connected:
            return self.mqtt.connected if self.mqtt else False

        now = time.time()
        if now - self._last_mqtt_retry < self._mqtt_retry_interval:
            return False

        self._last_mqtt_retry = now
        logger.info("Reintentando conexión MQTT...")
        connected = self.mqtt.connect()
        if self.diagnostics:
            self.diagnostics.set_mqtt_status(self.mqtt.connected)
        return connected
    
    def stop(self):
        """
        Detiene el gateway y todos sus componentes
        """
        logger.info("Deteniendo gateway...")
        
        self.running = False
        
        # Guardar evento de parada
        if self.storage:
            self.storage.save_event('system', 'Gateway detenido')
        
        # Detener componentes
        if self.diagnostics:
            self.diagnostics.stop()
        
        if self.storage:
            self.storage.stop_auto_cleanup()
        
        if self.mqtt:
            self.mqtt.disconnect()
        
        if self.arduino:
            self.arduino.stop()
        
        logger.info("Gateway detenido")
    
    def _on_arduino_data(self, data: Dict[str, Any]):
        """
        Callback cuando se reciben datos del Arduino
        
        Args:
            data: Datos parseados del Arduino
        """
        try:
            # Si está en pausa, no procesamos ni publicamos nada del flujo Python/MQTT
            if getattr(self, 'processing_paused', False):
                logger.info("Gateway en pausa: se descarta dato recibido del Arduino (solo hardware sigue activo)")
                self.stats['messages_dropped'] = self.stats.get('messages_dropped', 0) + 1
                return

            # Guardar en base de datos
            self.storage.save_measurement(data)

            # Publicar en MQTT
            self.mqtt.publish_sensor_data(data)

            # Actualizar estadísticas
            self.stats['messages_processed'] += 1
            
            # Verificar errores
            error_code = data.get('error', 0)
            if error_code != 0:
                self._handle_arduino_error(error_code)
            
        except Exception as e:
            logger.error(f"Error procesando datos de Arduino: {e}")
            self.stats['errors'] += 1
    
    def _on_arduino_error(self, error_info: Dict[str, Any]):
        """
        Callback para errores de comunicación con Arduino
        
        Args:
            error_info: Información del error
        """
        logger.error(f"Error en Arduino: {error_info}")
        self.storage.save_event('error', f"Error serial: {error_info.get('error')}", error_info)
        self.diagnostics.set_serial_status(False)
    
    def _handle_arduino_error(self, error_code: int):
        """
        Maneja códigos de error del Arduino
        
        Args:
            error_code: Código de error reportado por Arduino
        """
        error_descriptions = {
            1: "Error en sensor de nivel Bombo 1",
            2: "Error en sensor de nivel Bombo 2",
            3: "Error en sensor de nivel Mezcla",
            4: "Error en caudalímetro 1",
            5: "Error en caudalímetro 2",
            10: "Nivel crítico bajo - Bombo 1",
            11: "Nivel crítico bajo - Bombo 2",
            20: "Sobrecalentamiento motor mezclador",
            99: "Error general del sistema"
        }
        
        descripcion = error_descriptions.get(error_code, f"Error desconocido: {error_code}")
        
        # Guardar alarma
        alarm_id = self.storage.save_alarm(error_code, descripcion)
        logger.warning(f"Alarma #{alarm_id}: {descripcion}")
        
        # Publicar alarma en MQTT
        self.mqtt.publish('alarmas', {
            'id': alarm_id,
            'codigo': error_code,
            'descripcion': descripcion,
            'timestamp': time.time(),
            'activa': True
        })
    
    def _on_command_reposicion(self, data: Dict[str, Any], topic: str):
        """
        Procesa comandos de reposición desde MQTT
        
        Args:
            data: Datos del comando
            topic: Topic MQTT de origen
        """
        try:
            if getattr(self, 'processing_paused', False):
                logger.info("Gateway en pausa: ignorando comando de reposición recibido por MQTT")
                return

            accion_req = str(data.get('accion', '')).upper()
            is_freno = data.get('freno', False) is True or accion_req in ['FRENO', 'FRENO_REPOSICION', 'PARAR', 'DETENER', 'EMERGENCIA']

            if is_freno:
                logger.warning("🚨 FRENO DE EMERGENCIA RECIBIDO: Enviando orden de detención F al Arduino")
                if self.arduino.send_command('frenar'):
                    logger.success("Freno de emergencia (Comando F) enviado al Arduino correctamente")
                    self.storage.save_command("F", data, 'mqtt')
                    self.storage.save_event('comando', 'FRENO DE EMERGENCIA REPOSICIÓN', data, 'mqtt')
                    self.stats['commands_sent'] += 1
                    self._publish_command_response(
                        data,
                        topic,
                        status="executed",
                        code=0,
                        result={"accion": "frenar", "freno": True},
                    )
                else:
                    logger.error("Error enviando comando F de freno de emergencia")
                    self._publish_command_response(
                        data,
                        topic,
                        status="failed",
                        code=3,
                        result={},
                        error="No se pudo enviar comando F de freno al Arduino",
                    )
                return

            bombo = int(data.get('bombo', 1))

            # Aceptar el formato viejo (valor directo) y el nuevo (limite_porcentaje/limite)
            valor_bruto = data.get('valor', data.get('limite_porcentaje', data.get('limite', 50)))
            limite = int(valor_bruto)

            # El Arduino espera una combinación de 4 dígitos:
            # 1000 + limite para bombo 1, 2000 + limite para bombo 2.
            convinacion = (1000 + limite) if bombo == 1 else (2000 + limite)
            
            # Enviar comando al Arduino
            if self.arduino.send_command('reposicion', valor=convinacion):
                logger.info(f"Comando reposición enviado: Bombo {bombo}, límite {limite}% (combo {convinacion})")
                
                # Guardar en base de datos
                self.storage.save_command(f"R{convinacion}", data, 'mqtt')
                self.storage.save_event('comando', f'Reposición bombo {bombo} al {limite}%', data, 'mqtt')
                
                self.stats['commands_sent'] += 1
                self._publish_command_response(
                    data,
                    topic,
                    status="executed",
                    code=0,
                    result={"bombo": bombo, "limite": limite, "convinacion": convinacion},
                )
            else:
                logger.error("Error enviando comando de reposición")
                self._publish_command_response(
                    data,
                    topic,
                    status="failed",
                    code=3,
                    result={},
                    error="No se pudo enviar comando al Arduino",
                )
        
        except Exception as e:
            logger.error(f"Error procesando comando de reposición: {e}")
            self._publish_command_response(
                data,
                topic,
                status="failed",
                code=3,
                result={},
                error=str(e),
            )
    
    def _on_command_mezcla(self, data: Dict[str, Any], topic: str):
        """
        Procesa comandos de mezcla desde MQTT
        
        Args:
            data: Datos del comando
            topic: Topic MQTT de origen
        """
        try:
            if getattr(self, 'processing_paused', False):
                logger.info("Gateway en pausa: ignorando comando de mezcla recibido por MQTT")
                return
            
            logger.info("=" * 60)
            logger.info("⚙️  PROCESANDO COMANDO MEZCLA")
            logger.info("=" * 60)
            
            # Comandos de mezcla
            liquido_1 = data.get('liquido_1')
            liquido_2 = data.get('liquido_2')
            hora = data.get('hora')
            minuto = data.get('minuto')
            logger.debug(f"Parámetros recibidos: L1={liquido_1}, L2={liquido_2}, H={hora}, M={minuto}")
            
            # Enviar configuración de líquidos
            if liquido_1 is not None:
                self.arduino.send_command('liquido_1', valor=int(liquido_1))
                logger.info(f"Cantidad líquido 1 configurada: {liquido_1}")
            
            if liquido_2 is not None:
                self.arduino.send_command('liquido_2', valor=int(liquido_2))
                logger.info(f"Cantidad líquido 2 configurada: {liquido_2}")
            
            # Enviar tiempo de mezcla
            if hora is not None:
                self.arduino.send_command('hora', valor=int(hora))
                logger.info(f"Horas de mezcla configuradas: {hora}")
            
            if minuto is not None:
                self.arduino.send_command('minuto', valor=int(minuto))
                logger.info(f"Minutos de mezcla configurados: {minuto}")
            
            # Guardar evento
            self.storage.save_event('comando', 'Configuración de mezcla', data, 'mqtt')
            self.stats['commands_sent'] += 1
            self._publish_command_response(
                data,
                topic,
                status="executed",
                code=0,
                result={
                    "liquido_1": liquido_1,
                    "liquido_2": liquido_2,
                    "hora": hora,
                    "minuto": minuto,
                },
            )
        
        except Exception as e:
            logger.error(f"Error procesando comando de mezcla: {e}")
            self._publish_command_response(
                data,
                topic,
                status="failed",
                code=3,
                result={},
                error=str(e),
            )
    
    def _on_command_control(self, data: Dict[str, Any], topic: str):
        """
        Procesa comandos de control general desde MQTT
        
        Args:
            data: Datos del comando
            topic: Topic MQTT de origen
        """
        try:
            if getattr(self, 'processing_paused', False):
                logger.info("Gateway en pausa: ignorando comando de control recibido por MQTT")
                return
            accion = data.get('accion', '').upper()

            if accion == 'REPOSICION':
                bombo = int(data.get('bombo', 1))
                limite = int(data.get('limite_porcentaje', data.get('limite', 80)))
                # Calcular combinacion esperada por Arduino (1000+limite o 2000+limite)
                convinacion = (1000 + limite) if bombo == 1 else (2000 + limite)
                if self.arduino.send_command('reposicion', valor=convinacion):
                    logger.info(f"Comando REPOSICION enviado al Arduino: Bombo {bombo}, Limite {limite}% (Combo {convinacion})")
                    self.storage.save_event('comando', f'Reposicion Bombo {bombo} ({limite}%)', data, 'mqtt')
                    self.stats['commands_sent'] += 1
                    self._publish_command_response(data, topic, status="executed", code=0, result={"accion": accion, "convinacion": convinacion})
                else:
                    self._publish_command_response(data, topic, status="failed", code=3, result={}, error="No se pudo enviar comando de reposicion al Arduino")
                return

            if accion in ('FRENO_REPOSICION', 'PARAR_REPOSICION'):
                if self.arduino.send_command('frenar'):
                    logger.info("Comando FRENO REPOSICION (F) enviado al Arduino")
                    self.storage.save_event('comando', 'Freno Reposicion', data, 'mqtt')
                    self.stats['commands_sent'] += 1
                    self._publish_command_response(data, topic, status="executed", code=0, result={"accion": accion})
                else:
                    self._publish_command_response(data, topic, status="failed", code=3, result={}, error="No se pudo enviar freno de reposicion al Arduino")
                return
            
            command_map = {
                'CONTINUAR': 'continuar',
                'REANUDAR': 'continuar',
                'PARAR': 'frenar',
                'PAUSAR': 'detener',
                'DETENER': 'detener',
                'DESECHAR': 'desechar',
                'DESCARTAR': 'desechar',
                'VACIAR': 'vaciar'
            }
            
            if accion in command_map:
                comando = command_map[accion]
                if self.arduino.send_command(comando):
                    logger.info(f"Comando de control enviado: {accion}")
                    self.storage.save_event('comando', f'Control: {accion}', data, 'mqtt')
                    self.stats['commands_sent'] += 1
                    self._publish_command_response(
                        data,
                        topic,
                        status="executed",
                        code=0,
                        result={"accion": accion},
                    )
                else:
                    self._publish_command_response(
                        data,
                        topic,
                        status="failed",
                        code=3,
                        result={},
                        error="No se pudo enviar comando de control al Arduino",
                    )
            else:
                logger.warning(f"Acción de control desconocida: {accion}")
                self._publish_command_response(
                    data,
                    topic,
                    status="unsupported",
                    code=2,
                    result={"accion": accion},
                    error="Acción no soportada",
                )
        
        except Exception as e:
            logger.error(f"Error procesando comando de control: {e}")
            self._publish_command_response(
                data,
                topic,
                status="failed",
                code=3,
                result={},
                error=str(e),
            )
    
    def _on_command_config(self, data: Dict[str, Any], topic: str):
        """
        Procesa cambios de configuración desde MQTT
        
        Args:
            data: Datos de configuración
            topic: Topic MQTT de origen
        """
        if getattr(self, 'processing_paused', False):
            logger.info("Gateway en pausa: ignorando configuración recibida por MQTT")
            return

        logger.info(f"Configuración recibida: {data}")
        self.storage.save_event('config', 'Configuración actualizada', data, 'mqtt')
        self._publish_command_response(
            data,
            topic,
            status="executed",
            code=0,
            result={"config_aplicada": True},
        )
    
    def _on_query_historico(self, data: Dict[str, Any], topic: str):
        """
        Procesa consultas de datos históricos desde MQTT
        
        Args:
            data: Parámetros de la consulta
            topic: Topic MQTT de origen
        """
        try:
            if getattr(self, 'processing_paused', False):
                logger.info("Gateway en pausa: ignorando consulta histórica recibida por MQTT")
                return
            from datetime import datetime, timedelta
            
            # Parsear rango de tiempo
            horas_atras = data.get('horas', 24)
            limit = data.get('limit', 1000)
            
            start_time = datetime.now() - timedelta(hours=horas_atras)
            
            # Obtener datos
            mediciones = self.storage.get_measurements(start_time=start_time, limit=limit)
            
            # Publicar respuesta
            response_topic = data.get('response_topic', 'scada/planta1/consultas/respuesta')
            self.mqtt.publish(response_topic, {
                'query': data,
                'count': len(mediciones),
                'data': mediciones[:100]  # Limitar para no saturar MQTT
            })

            self._publish_command_response(
                data,
                topic,
                status="executed",
                code=0,
                result={"registros": len(mediciones), "response_topic": response_topic},
            )
            
            logger.info(f"Consulta histórica procesada: {len(mediciones)} registros")
        
        except Exception as e:
            logger.error(f"Error procesando consulta histórica: {e}")
            self._publish_command_response(
                data,
                topic,
                status="failed",
                code=3,
                result={},
                error=str(e),
            )

    def _publish_command_response(
        self,
        data: Dict[str, Any],
        topic: str,
        status: str,
        code: int,
        result: Dict[str, Any],
        error: Optional[str] = None,
    ):
        """
        Publica respuesta estándar cmd/resp para integración tipo AURA.
        """
        if not self.mqtt:
            return

        self.mqtt.publish_command_response(
            command_data=data,
            source_topic=topic,
            status=status,
            code=code,
            result=result,
            error=error,
        )
    
    def _on_diagnostic_alert(self, alert: Dict[str, Any]):
        """
        Procesa alertas del sistema de diagnóstico
        
        Args:
            alert: Información de la alerta
        """
        # Guardar evento
        self.storage.save_event('alerta_sistema', alert['message'], alert)
        
        # Publicar en MQTT
        self.mqtt.publish('diagnostico/alertas', alert)
    
    def _on_diagnostic_publish(self, diagnostic: Dict[str, Any]):
        """
        Publica datos de diagnóstico
        
        Args:
            diagnostic: Datos de diagnóstico completos
        """
        # Guardar en base de datos
        self.storage.save_diagnostic({
            'cpu_percent': diagnostic['cpu']['percent'],
            'cpu_temp': diagnostic['cpu']['temperature'],
            'memory_percent': diagnostic['memory']['percent'],
            'memory_available_mb': diagnostic['memory']['available_mb'],
            'disk_percent': diagnostic['disk']['percent'],
            'disk_free_gb': diagnostic['disk']['free_gb'],
            'serial_connected': diagnostic['connections']['serial'],
            'mqtt_connected': diagnostic['connections']['mqtt'],
            'uptime_seconds': diagnostic['uptime']['seconds']
        })
        
        # Publicar en MQTT
        self.mqtt.publish('diagnostico', diagnostic)
    
    def get_last_data(self) -> Dict[str, Any]:
        """
        Obtiene los últimos datos enviados y recibidos de forma thread-safe
        
        Returns:
            Diccionario con los últimos datos del Arduino y MQTT
        """
        with self._data_lock:
            return {
                'arduino_sent': self.arduino.last_sent_command if self.arduino else None,
                'arduino_received': self.arduino.last_received_data if self.arduino else None,
                'mqtt_published': self.mqtt.last_published_message if self.mqtt else None,
                'mqtt_received': self.mqtt.last_received_message if self.mqtt else None,
            }

    def get_stats(self) -> Dict[str, Any]:
        """
        Obtiene estadísticas del gateway
        
        Returns:
            Diccionario con estadísticas completas
        """
        uptime = time.time() - self.stats['start_time']
        
        return {
            **self.stats,
            'uptime_seconds': uptime,
            'running': self.running,
            'arduino': self.arduino.get_stats() if self.arduino else {},
            'mqtt': self.mqtt.get_stats() if self.mqtt else {},
            'diagnostics': self.diagnostics.get_stats() if self.diagnostics else {}
        }
    
    def print_status(self):
        """
        Imprime el estado actual del gateway
        """
        stats = self.get_stats()
        
        print("\n" + "=" * 60)
        print("ESTADO DEL GATEWAY")
        print("=" * 60)
        print(f"Estado: {'🟢 Activo' if self.running else '🔴 Inactivo'}")
        print(f"Uptime: {stats['uptime_seconds'] / 3600:.2f} horas")
        print(f"Mensajes procesados: {stats['messages_processed']}")
        print(f"Comandos enviados: {stats['commands_sent']}")
        print(f"Errores: {stats['errors']}")
        print()
        arduino_status = '✓ Conectado' if stats['arduino'].get('connected') else '✗ Desconectado'
        mqtt_status = '✓ Conectado' if stats['mqtt'].get('connected') else '✗ Desconectado'
        print(f"Arduino: {arduino_status}")
        print(f"MQTT: {mqtt_status}")
        print("=" * 60 + "\n")


def signal_handler(signum, frame):
    """
    Manejador de señales para cierre graceful.
    Responde inmediatamente a SIGINT (Ctrl+C) y SIGTERM
    """
    global gateway
    signal_name = "SIGINT (Ctrl+C)" if signum == signal.SIGINT else f"SIGTERM ({signum})"
    logger.info(f"\n{signal_name} recibida, cerrando gateway de forma segura...")
    
    if gateway:
        try:
            # Detener el gateway
            gateway.stop()
            gateway.running = False  # Asegurar que el loop principal termine
            
            # Si hay una GUI thread activa, intentar cerrarla
            if gateway._gui_thread and gateway._gui_thread.is_alive():
                logger.info("Intentando cerrar GUI thread...")
                try:
                    import tkinter as tk
                    # Buscar la ventana raíz de Tkinter si existe
                    try:
                        root = tk.Tk()
                        root.quit()
                        root.destroy()
                    except:
                        pass
                except:
                    pass
                
                # Esperar un poco a que se cierre
                import time
                time.sleep(1)
        except Exception as e:
            logger.error(f"Error en stop(): {e}")
    
    logger.success("Gateway cerrado")
    sys.exit(0)


# Variable global para el gateway
gateway: Optional[SCADAGateway] = None


def main():
    """
    Función principal
    """
    global gateway
    
    # Registrar manejador de señales
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        # Crear y iniciar gateway
        gateway = SCADAGateway()
        
        if gateway.start():
            logger.success("Gateway operativo")
            
            # Loop principal - Responde rápido a Ctrl+C
            # El sleep de 1s es lo suficientemente corto para ser responsivo con signals
            status_counter = 0
            while gateway.running:
                time.sleep(1)
                status_counter += 1
                
                # Intentar reconectar MQTT cada 30 segundos
                if status_counter % 30 == 0:
                    gateway._try_reconnect_mqtt()
                
                # Mostrar estado cada 60 segundos
                if status_counter % 60 == 0:
                    gateway.print_status()
            
            # Si hay thread GUI, esperar a que termine (cuando usuario cierra ventana)
            # IMPORTANTE: Con timeout para no quedar stuck si Tkinter no responde
            if gateway._gui_thread and gateway._gui_thread.is_alive():
                logger.info("Esperando a que se cierre la GUI (timeout=5s)...")
                gateway._gui_thread.join(timeout=5)
                
                # Si sigue vivo después del timeout, forzar salida
                if gateway._gui_thread.is_alive():
                    logger.warning("GUI thread no respondió en tiempo, forzando salida...")
                    sys.exit(0)
        
        else:
            logger.error("No se pudo iniciar el gateway")
            sys.exit(1)
    
    except KeyboardInterrupt:
        # Por si acaso Ctrl+C llega directamente aquí
        logger.info("\nCtrl+C recibido en main(), cerrando...")
        if gateway:
            try:
                gateway.stop()
                gateway.running = False
                # Esperar al thread GUI si existe (timeout corto)
                if gateway._gui_thread and gateway._gui_thread.is_alive():
                    gateway._gui_thread.join(timeout=2)
            except Exception as e:
                logger.error(f"Error en stop(): {e}")
        sys.exit(0)
    
    except Exception as e:
        logger.critical(f"Error fatal: {e}")
        if gateway:
            gateway.stop()
        sys.exit(1)


if __name__ == "__main__":
    main()
