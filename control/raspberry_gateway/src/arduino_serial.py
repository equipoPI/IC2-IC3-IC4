"""
Módulo de comunicación serial con Arduino
Gestiona la comunicación bidireccional con el Arduino vía puerto serial
Parsea el protocolo de Sistema_SCADA y envía comandos
"""

import serial
import time
import threading
from typing import Optional, Dict, Any, Callable
from queue import Queue
from loguru import logger
import yaml


class ArduinoSerial:
    """
    Clase para gestionar la comunicación serial con Arduino
    """
    
    def __init__(self, config_path: str = "config.yaml", data_lock: Optional[threading.Lock] = None):
        """
        Inicializa la conexión serial con Arduino
        
        Args:
            config_path: Ruta al archivo de configuración
            data_lock: Lock para sincronización thread-safe (opcional)
        """
        # Cargar configuración
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        self.serial_config = self.config['serial']
        self.protocol_config = self.config['arduino_protocol']
        
        # Configuración serial
        self.port = self.serial_config['port']
        self.baudrate = self.serial_config['baudrate']
        self.timeout = self.serial_config['timeout']
        
        # Estado de conexión
        self.serial_conn: Optional[serial.Serial] = None
        self.connected = False
        self.running = False
        
        # Colas de comunicación
        self.send_queue = Queue()  # Comandos a enviar a Arduino
        self.receive_queue = Queue()  # Datos recibidos de Arduino
        
        # Callbacks
        self.data_callback: Optional[Callable] = None
        self.error_callback: Optional[Callable] = None
        
        # Hilos
        self.read_thread: Optional[threading.Thread] = None
        self.write_thread: Optional[threading.Thread] = None
        
        # Lock para sincronización con thread-safety
        self.data_lock = data_lock or threading.Lock()
        
        # Estadísticas
        self.stats = {
            'messages_sent': 0,
            'messages_received': 0,
            'errors': 0,
            'last_message_time': None
        }
        
        # Historial de últimos datos
        self.last_sent_command: Optional[Dict[str, Any]] = None
        self.last_received_data: Optional[Dict[str, Any]] = None
        self.last_raw_line: Optional[str] = None
        
        logger.info(f"ArduinoSerial inicializado para puerto {self.port} @ {self.baudrate}")
    
    def connect(self) -> bool:
        """
        Establece la conexión serial con Arduino
        
        Returns:
            True si la conexión fue exitosa
        """
        try:
            self.serial_conn = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=self.timeout,
                write_timeout=self.timeout
            )
            
            # Esperar a que Arduino se reinicie después de abrir serial
            time.sleep(2)
            
            # Limpiar buffer
            self.serial_conn.reset_input_buffer()
            self.serial_conn.reset_output_buffer()
            
            self.connected = True
            logger.success(f"Conectado a Arduino en {self.port} @ {self.baudrate} bps")
            return True
            
        except FileNotFoundError:
            error_msg = f"Puerto {self.port} no encontrado. Verifica que el Arduino esté conectado."
            logger.error(error_msg)
            self.connected = False
            if self.error_callback:
                self.error_callback({'type': 'port_not_found', 'error': error_msg})
            return False
        except PermissionError:
            error_msg = f"Permiso denegado en puerto {self.port}. Intenta: sudo chmod 666 {self.port}"
            logger.error(error_msg)
            self.connected = False
            if self.error_callback:
                self.error_callback({'type': 'permission_denied', 'error': error_msg})
            return False
        except serial.SerialException as e:
            error_msg = f"Error al conectar con Arduino: {str(e)}"
            logger.error(error_msg)
            self.connected = False
            if self.error_callback:
                self.error_callback({'type': 'connection_error', 'error': error_msg})
            return False
        except Exception as e:
            error_msg = f"Error inesperado al conectar: {str(e)}"
            logger.error(error_msg)
            self.connected = False
            if self.error_callback:
                self.error_callback({'type': 'unknown_error', 'error': error_msg})
            return False
    
    def disconnect(self):
        """
        Cierra la conexión serial
        """
        if self.serial_conn and self.serial_conn.is_open:
            self.serial_conn.close()
            self.connected = False
            logger.info("Desconectado de Arduino")
    
    def start(self):
        """
        Inicia los hilos de lectura y escritura
        
        Returns:
            True si los threads se iniciaron correctamente
        """
        try:
            if not self.connected:
                if not self.connect():
                    logger.error("No se pudo conectar al Arduino en start()")
                    return False
            
            # Verificar que el puerto está abierto
            if not self.serial_conn or not self.serial_conn.is_open:
                logger.error("Puerto serial no está abierto")
                return False
            
            self.running = True
            
            # Iniciar hilo de lectura
            self.read_thread = threading.Thread(target=self._read_loop, daemon=True, name="Arduino-Read")
            self.read_thread.start()
            
            # Iniciar hilo de escritura
            self.write_thread = threading.Thread(target=self._write_loop, daemon=True, name="Arduino-Write")
            self.write_thread.start()
            
            logger.success("Hilos de comunicación serial iniciados exitosamente")
            return True
        
        except Exception as e:
            logger.error(f"Error iniciando threads de Arduino: {e}")
            self.running = False
            return False
    
    def stop(self):
        """
        Detiene los hilos y cierra la conexión
        """
        self.running = False
        
        if self.read_thread:
            self.read_thread.join(timeout=2)
        if self.write_thread:
            self.write_thread.join(timeout=2)
        
        self.disconnect()
        logger.info("Comunicación serial detenida")
    
    def _read_loop(self):
        """
        Hilo que lee continuamente datos del Arduino
        """
        logger.info("Hilo de lectura serial iniciado")
        reconnect_attempts = 0
        max_attempts = self.serial_config.get('max_reconnect_attempts', 10)
        
        while self.running:
            try:
                if not self.connected or not self.serial_conn or not self.serial_conn.is_open:
                    # Intentar reconectar
                    if reconnect_attempts < max_attempts:
                        logger.warning(f"Intentando reconectar... ({reconnect_attempts + 1}/{max_attempts})")
                        time.sleep(self.serial_config['reconnect_delay'])
                        if self.connect():
                            reconnect_attempts = 0
                        else:
                            reconnect_attempts += 1
                    else:
                        logger.error("Máximo de intentos de reconexión alcanzado")
                        time.sleep(10)
                        reconnect_attempts = 0
                    continue
                
                # Leer línea del Arduino
                if self.serial_conn.in_waiting > 0:
                    try:
                        line = self.serial_conn.readline().decode('utf-8').strip()
                        
                        if line:
                            with self.data_lock:
                                self.last_raw_line = line
                            # Parsear datos
                            data = self._parse_arduino_data(line)
                            
                            if data:
                                self.stats['messages_received'] += 1
                                self.stats['last_message_time'] = time.time()
                                with self.data_lock:
                                    self.last_received_data = data
                                
                                # Poner en cola para procesar
                                self.receive_queue.put(data)
                                
                                # Ejecutar callback si existe
                                if self.data_callback:
                                    self.data_callback(data)
                                
                                logger.debug(f"Datos recibidos: {data}")
                    
                    except UnicodeDecodeError as e:
                        logger.warning(f"Error decodificando datos: {e}")
                        self.stats['errors'] += 1
                
                time.sleep(self.serial_config['read_interval'])
            
            except serial.SerialException as e:
                logger.error(f"Error en lectura serial: {e}")
                self.connected = False
                self.stats['errors'] += 1
                time.sleep(1)
            
            except Exception as e:
                logger.error(f"Error inesperado en lectura: {e}")
                self.stats['errors'] += 1
                time.sleep(1)
    
    def _write_loop(self):
        """
        Hilo que envía comandos al Arduino desde la cola
        """
        logger.info("Hilo de escritura serial iniciado")
        
        while self.running:
            try:
                # Esperar comando de la cola (con timeout)
                if not self.send_queue.empty():
                    command = self.send_queue.get(timeout=1)
                    
                    if self.connected and self.serial_conn and self.serial_conn.is_open:
                        # Enviar comando
                        self.serial_conn.write(f"{command}\n".encode('utf-8'))
                        self.serial_conn.flush()
                        
                        self.stats['messages_sent'] += 1
                        with self.data_lock:
                            self.last_sent_command = {
                                'command': command,
                                'timestamp': time.time()
                            }
                        logger.debug(f"Comando enviado: {command}")
                        time.sleep(0.15)  # Pausa entre comandos para procesamiento en ISR del Arduino
                    else:
                        logger.warning(f"No conectado, comando descartado: {command}")
                
                time.sleep(0.01)  # Pequeña pausa para no saturar CPU
            
            except Exception as e:
                logger.error(f"Error en escritura serial: {e}")
                self.stats['errors'] += 1
                time.sleep(1)
    
    def _parse_arduino_data(self, line: str) -> Optional[Dict[str, Any]]:
        """
        Parsea una línea de datos del Arduino según el protocolo
        
        Formato esperado (Sistema_SCADA):
        average1,constrainedPorcentaje1,average2,constrainedPorcentaje2,
        average3,constrainedPorcentaje3,cantidad1,cantidad2,EBomba1,EBomba2,
        EBombaM,EMezclador,EBombaR,error,horaRest,minRest,EProceso
        
        Args:
            line: Línea recibida del Arduino
            
        Returns:
            Diccionario con los datos parseados o None si hay error
        """
        try:
            parts = line.split(',')
            
            # Verificar que tengamos todos los campos esperados
            expected_fields = len(self.protocol_config['receive_format'])
            if len(parts) != expected_fields:
                logger.warning(f"Línea con formato incorrecto: {line}")
                return None
            
            # Parsear según configuración
            data = {
                'timestamp': time.time(),
                'raw': line
            }
            
            for field_config in self.protocol_config['receive_format']:
                name = field_config['name']
                index = field_config['index']
                field_type = field_config['type']
                
                try:
                    value = parts[index].strip()
                    
                    # Convertir según tipo
                    if field_type == 'float':
                        data[name] = float(value)
                    elif field_type == 'int':
                        data[name] = int(value)
                    elif field_type == 'bool':
                        data[name] = bool(int(value))
                    else:
                        data[name] = value
                
                except (ValueError, IndexError) as e:
                    logger.warning(f"Error parseando campo {name}: {e}")
                    data[name] = None
            
            return data
        
        except Exception as e:
            logger.error(f"Error parseando datos: {e}")
            return None
    
    def send_command(self, command_type: str, **kwargs) -> bool:
        """
        Envía un comando al Arduino
        
        Args:
            command_type: Tipo de comando (reposicion, frenar, detener, etc.)
            **kwargs: Parámetros adicionales según el comando
            
        Returns:
            True si el comando fue encolado correctamente
        """
        try:
            commands = self.protocol_config['send_commands']
            
            if command_type not in commands:
                logger.error(f"Comando desconocido: {command_type}")
                return False
            
            command_template = commands[command_type]
            
            # Formatear comando según template
            if '{' in command_template:
                command = command_template.format(**kwargs)
            else:
                command = command_template
            
            # Encolar comando
            self.send_queue.put(command)
            logger.info(f"Comando encolado: {command}")
            return True
        
        except Exception as e:
            logger.error(f"Error enviando comando: {e}")
            return False
    
    def set_data_callback(self, callback: Callable):
        """
        Establece callback para datos recibidos
        
        Args:
            callback: Función a llamar con los datos
        """
        self.data_callback = callback
    
    def set_error_callback(self, callback: Callable):
        """
        Establece callback para errores
        
        Args:
            callback: Función a llamar con información del error
        """
        self.error_callback = callback
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Obtiene estadísticas de la comunicación
        
        Returns:
            Diccionario con estadísticas
        """
        return {
            **self.stats,
            'connected': self.connected,
            'running': self.running,
            'queue_size': self.send_queue.qsize()
        }


# Ejemplo de uso
if __name__ == "__main__":
    # Configurar logger
    logger.add("logs/serial.log", rotation="10 MB")
    
    # Crear instancia
    arduino = ArduinoSerial()
    
    # Definir callback para datos
    def on_data(data):
        print(f"Datos recibidos: {data}")
    
    arduino.set_data_callback(on_data)
    
    # Iniciar comunicación
    if arduino.start():
        print("Comunicación iniciada. Presiona Ctrl+C para salir...")
        
        try:
            # Enviar algunos comandos de prueba
            time.sleep(5)
            arduino.send_command('reposicion', bombo=1, valor='050')
            
            time.sleep(10)
            arduino.send_command('frenar')
            
            # Mantener activo
            while True:
                stats = arduino.get_stats()
                print(f"Stats: {stats}")
                time.sleep(10)
        
        except KeyboardInterrupt:
            print("\nDeteniendo...")
            arduino.stop()
    else:
        print("No se pudo iniciar la comunicación")
