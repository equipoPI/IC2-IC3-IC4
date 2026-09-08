"""
Sistema de almacenamiento local con SQLite
Gestiona el almacenamiento de datos históricos de la última semana
Incluye limpieza automática y consultas optimizadas
"""

import sqlite3
import os
import time
import threading
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from contextlib import contextmanager
from loguru import logger
import yaml


class DataStorage:
    """
    Gestor de almacenamiento local en SQLite
    """
    
    def __init__(self, config_path: str = "config.yaml"):
        """
        Inicializa el sistema de almacenamiento
        
        Args:
            config_path: Ruta al archivo de configuración
        """
        # Cargar configuración
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        self.db_config = self.config['database']
        
        # Configuración de base de datos
        self.db_path = self.db_config['path']
        self.retention_days = self.db_config['retention_days']
        self.backup_enabled = self.db_config['backup_enabled']
        self.backup_path = self.db_config.get('backup_path', './backups')
        
        # Asegurar que existan los directorios
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        if self.backup_enabled:
            os.makedirs(self.backup_path, exist_ok=True)
        
        # Thread para limpieza automática
        self.cleanup_thread: Optional[threading.Thread] = None
        self.running = False
        
        # Inicializar base de datos
        self._init_database()
        
        logger.info(f"DataStorage inicializado en {self.db_path}")
    
    @contextmanager
    def get_connection(self):
        """
        Context manager para conexiones a la base de datos
        """
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row  # Para acceder por nombre de columna
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Error en transacción de base de datos: {e}")
            raise
        finally:
            conn.close()
    
    def _init_database(self):
        """
        Crea las tablas de la base de datos si no existen
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Tabla de mediciones de sensores
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS mediciones (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL NOT NULL,
                    fecha_hora TEXT NOT NULL,
                    
                    -- Niveles
                    nivel_bombo1 REAL,
                    porcentaje_bombo1 INTEGER,
                    nivel_bombo2 REAL,
                    porcentaje_bombo2 INTEGER,
                    nivel_mezcla REAL,
                    porcentaje_mezcla INTEGER,
                    
                    -- Caudales
                    caudal_1 REAL,
                    caudal_2 REAL,
                    
                    -- Estados de actuadores
                    estado_bomba1 INTEGER,
                    estado_bomba2 INTEGER,
                    estado_bomba_mezcla INTEGER,
                    estado_mezclador INTEGER,
                    estado_bomba_repo INTEGER,
                    
                    -- Proceso
                    hora_restante INTEGER,
                    min_restante INTEGER,
                    estado_proceso INTEGER,
                    error INTEGER,
                    
                    -- Datos raw por si acaso
                    raw_data TEXT
                )
            ''')
            
            # Índices para búsquedas rápidas
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_timestamp ON mediciones(timestamp)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_fecha_hora ON mediciones(fecha_hora)
            ''')
            
            # Tabla de eventos (comandos, cambios de estado)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS eventos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL NOT NULL,
                    fecha_hora TEXT NOT NULL,
                    tipo TEXT NOT NULL,
                    descripcion TEXT,
                    datos_json TEXT,
                    origen TEXT
                )
            ''')
            
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_eventos_timestamp ON eventos(timestamp)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_eventos_tipo ON eventos(tipo)
            ''')
            
            # Tabla de alarmas
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS alarmas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL NOT NULL,
                    fecha_hora TEXT NOT NULL,
                    codigo_error INTEGER NOT NULL,
                    descripcion TEXT,
                    activa INTEGER DEFAULT 1,
                    timestamp_resolucion REAL,
                    fecha_hora_resolucion TEXT
                )
            ''')
            
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_alarmas_timestamp ON alarmas(timestamp)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_alarmas_activa ON alarmas(activa)
            ''')
            
            # Tabla de diagnóstico del sistema Raspberry
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS diagnostico (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL NOT NULL,
                    fecha_hora TEXT NOT NULL,
                    cpu_percent REAL,
                    cpu_temp REAL,
                    memory_percent REAL,
                    memory_available_mb REAL,
                    disk_percent REAL,
                    disk_free_gb REAL,
                    serial_connected INTEGER,
                    mqtt_connected INTEGER,
                    uptime_seconds REAL
                )
            ''')
            
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_diagnostico_timestamp ON diagnostico(timestamp)
            ''')
            
            # Tabla de comandos enviados al Arduino
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS comandos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL NOT NULL,
                    fecha_hora TEXT NOT NULL,
                    comando TEXT NOT NULL,
                    parametros_json TEXT,
                    origen TEXT,
                    ejecutado INTEGER DEFAULT 0,
                    timestamp_ejecucion REAL
                )
            ''')
            
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_comandos_timestamp ON comandos(timestamp)
            ''')
            
            logger.success("Base de datos inicializada correctamente")
    
    def save_measurement(self, data: Dict[str, Any]) -> bool:
        """
        Guarda una medición de sensores
        
        Args:
            data: Diccionario con datos parseados del Arduino
            
        Returns:
            True si se guardó correctamente
        """
        try:
            timestamp = data.get('timestamp', time.time())
            fecha_hora = datetime.fromtimestamp(timestamp).isoformat()
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO mediciones (
                        timestamp, fecha_hora,
                        nivel_bombo1, porcentaje_bombo1,
                        nivel_bombo2, porcentaje_bombo2,
                        nivel_mezcla, porcentaje_mezcla,
                        caudal_1, caudal_2,
                        estado_bomba1, estado_bomba2, estado_bomba_mezcla,
                        estado_mezclador, estado_bomba_repo,
                        hora_restante, min_restante, estado_proceso, error,
                        raw_data
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    timestamp, fecha_hora,
                    data.get('nivel_bombo1'), data.get('porcentaje_bombo1'),
                    data.get('nivel_bombo2'), data.get('porcentaje_bombo2'),
                    data.get('nivel_mezcla'), data.get('porcentaje_mezcla'),
                    data.get('caudal_1'), data.get('caudal_2'),
                    int(data.get('estado_bomba1', False)),
                    int(data.get('estado_bomba2', False)),
                    int(data.get('estado_bomba_mezcla', False)),
                    int(data.get('estado_mezclador', False)),
                    int(data.get('estado_bomba_repo', False)),
                    data.get('hora_restante'), data.get('min_restante'),
                    data.get('estado_proceso'), data.get('error'),
                    data.get('raw')
                ))
            
            return True
        
        except Exception as e:
            logger.error(f"Error guardando medición: {e}")
            return False
    
    def save_event(self, tipo: str, descripcion: str, datos: Optional[Dict] = None, origen: str = "sistema") -> bool:
        """
        Guarda un evento
        
        Args:
            tipo: Tipo de evento (comando, cambio_estado, etc.)
            descripcion: Descripción del evento
            datos: Datos adicionales del evento
            origen: Origen del evento (mqtt, serial, api, sistema)
            
        Returns:
            True si se guardó correctamente
        """
        try:
            timestamp = time.time()
            fecha_hora = datetime.fromtimestamp(timestamp).isoformat()
            datos_json = json.dumps(datos) if datos else None
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO eventos (timestamp, fecha_hora, tipo, descripcion, datos_json, origen)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (timestamp, fecha_hora, tipo, descripcion, datos_json, origen))
            
            logger.info(f"Evento guardado: {tipo} - {descripcion}")
            return True
        
        except Exception as e:
            logger.error(f"Error guardando evento: {e}")
            return False
    
    def save_alarm(self, codigo_error: int, descripcion: str) -> int:
        """
        Guarda una alarma
        
        Args:
            codigo_error: Código de error del Arduino
            descripcion: Descripción de la alarma
            
        Returns:
            ID de la alarma creada o -1 si hay error
        """
        try:
            timestamp = time.time()
            fecha_hora = datetime.fromtimestamp(timestamp).isoformat()
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO alarmas (timestamp, fecha_hora, codigo_error, descripcion, activa)
                    VALUES (?, ?, ?, ?, 1)
                ''', (timestamp, fecha_hora, codigo_error, descripcion))
                
                return cursor.lastrowid
        
        except Exception as e:
            logger.error(f"Error guardando alarma: {e}")
            return -1
    
    def resolve_alarm(self, alarm_id: int) -> bool:
        """
        Marca una alarma como resuelta
        
        Args:
            alarm_id: ID de la alarma
            
        Returns:
            True si se actualizó correctamente
        """
        try:
            timestamp = time.time()
            fecha_hora = datetime.fromtimestamp(timestamp).isoformat()
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE alarmas 
                    SET activa = 0, timestamp_resolucion = ?, fecha_hora_resolucion = ?
                    WHERE id = ?
                ''', (timestamp, fecha_hora, alarm_id))
            
            return True
        
        except Exception as e:
            logger.error(f"Error resolviendo alarma: {e}")
            return False
    
    def save_diagnostic(self, diagnostic_data: Dict[str, Any]) -> bool:
        """
        Guarda datos de diagnóstico del sistema
        
        Args:
            diagnostic_data: Diccionario con datos de diagnóstico
            
        Returns:
            True si se guardó correctamente
        """
        try:
            timestamp = time.time()
            fecha_hora = datetime.fromtimestamp(timestamp).isoformat()
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO diagnostico (
                        timestamp, fecha_hora,
                        cpu_percent, cpu_temp, memory_percent, memory_available_mb,
                        disk_percent, disk_free_gb,
                        serial_connected, mqtt_connected, uptime_seconds
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    timestamp, fecha_hora,
                    diagnostic_data.get('cpu_percent'),
                    diagnostic_data.get('cpu_temp'),
                    diagnostic_data.get('memory_percent'),
                    diagnostic_data.get('memory_available_mb'),
                    diagnostic_data.get('disk_percent'),
                    diagnostic_data.get('disk_free_gb'),
                    int(diagnostic_data.get('serial_connected', False)),
                    int(diagnostic_data.get('mqtt_connected', False)),
                    diagnostic_data.get('uptime_seconds')
                ))
            
            return True
        
        except Exception as e:
            logger.error(f"Error guardando diagnóstico: {e}")
            return False
    
    def save_command(self, comando: str, parametros: Optional[Dict] = None, origen: str = "mqtt") -> int:
        """
        Guarda un comando enviado al Arduino
        
        Args:
            comando: Comando enviado
            parametros: Parámetros del comando
            origen: Origen del comando
            
        Returns:
            ID del comando o -1 si hay error
        """
        try:
            timestamp = time.time()
            fecha_hora = datetime.fromtimestamp(timestamp).isoformat()
            parametros_json = json.dumps(parametros) if parametros else None
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO comandos (timestamp, fecha_hora, comando, parametros_json, origen)
                    VALUES (?, ?, ?, ?, ?)
                ''', (timestamp, fecha_hora, comando, parametros_json, origen))
                
                return cursor.lastrowid
        
        except Exception as e:
            logger.error(f"Error guardando comando: {e}")
            return -1
    
    def get_measurements(self, 
                        start_time: Optional[datetime] = None,
                        end_time: Optional[datetime] = None,
                        limit: int = 1000) -> List[Dict[str, Any]]:
        """
        Obtiene mediciones del rango de tiempo especificado
        
        Args:
            start_time: Tiempo de inicio (None = hace 24 horas)
            end_time: Tiempo final (None = ahora)
            limit: Número máximo de registros
            
        Returns:
            Lista de diccionarios con las mediciones
        """
        try:
            if start_time is None:
                start_time = datetime.now() - timedelta(hours=24)
            if end_time is None:
                end_time = datetime.now()
            
            start_timestamp = start_time.timestamp()
            end_timestamp = end_time.timestamp()
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT * FROM mediciones
                    WHERE timestamp BETWEEN ? AND ?
                    ORDER BY timestamp DESC
                    LIMIT ?
                ''', (start_timestamp, end_timestamp, limit))
                
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
        
        except Exception as e:
            logger.error(f"Error obteniendo mediciones: {e}")
            return []
    
    def get_active_alarms(self) -> List[Dict[str, Any]]:
        """
        Obtiene todas las alarmas activas
        
        Returns:
            Lista de alarmas activas
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT * FROM alarmas
                    WHERE activa = 1
                    ORDER BY timestamp DESC
                ''')
                
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
        
        except Exception as e:
            logger.error(f"Error obteniendo alarmas: {e}")
            return []
    
    def get_latest_measurement(self) -> Optional[Dict[str, Any]]:
        """
        Obtiene la última medición registrada
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT * FROM mediciones
                    ORDER BY id DESC
                    LIMIT 1
                ''')
                row = cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.error(f"Error obteniendo última medición: {e}")
            return None

    def get_recent_commands(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Obtiene los comandos más recientes
        
        Args:
            limit: Cantidad de comandos a retornar
            
        Returns:
            Lista de comandos
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT id, timestamp, fecha_hora, comando, parametros_json, origen, ejecutado
                    FROM comandos
                    ORDER BY id DESC
                    LIMIT ?
                ''', (limit,))
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error obteniendo comandos recientes: {e}")
            return []

    def get_recent_events(self, limit: int = 10, tipo: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Obtiene los eventos más recientes
        
        Args:
            limit: Cantidad de eventos a retornar
            tipo: Filtrar por tipo (opcional)
            
        Returns:
            Lista de eventos
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                if tipo:
                    cursor.execute('''
                        SELECT id, timestamp, fecha_hora, tipo, descripcion, datos_json, origen
                        FROM eventos
                        WHERE tipo = ?
                        ORDER BY id DESC
                        LIMIT ?
                    ''', (tipo, limit))
                else:
                    cursor.execute('''
                        SELECT id, timestamp, fecha_hora, tipo, descripcion, datos_json, origen
                        FROM eventos
                        ORDER BY id DESC
                        LIMIT ?
                    ''', (limit,))
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Error obteniendo eventos recientes: {e}")
            return []

    def cleanup_old_data(self):
        """
        Limpia datos más antiguos que el período de retención
        """
        try:
            cutoff_time = datetime.now() - timedelta(days=self.retention_days)
            cutoff_timestamp = cutoff_time.timestamp()
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Limpiar mediciones
                cursor.execute('DELETE FROM mediciones WHERE timestamp < ?', (cutoff_timestamp,))
                deleted_measurements = cursor.rowcount
                
                # Limpiar eventos (mantener críticos por más tiempo)
                critical_cutoff = datetime.now() - timedelta(
                    days=self.db_config.get('cleanup', {}).get('keep_critical_events', 30)
                )
                cursor.execute('''
                    DELETE FROM eventos 
                    WHERE timestamp < ? AND tipo NOT IN ('alarma_critica', 'fallo_sistema')
                ''', (cutoff_timestamp,))
                deleted_events = cursor.rowcount
                
                # Limpiar diagnósticos
                cursor.execute('DELETE FROM diagnostico WHERE timestamp < ?', (cutoff_timestamp,))
                deleted_diagnostics = cursor.rowcount
                
                # Limpiar comandos ejecutados antiguos
                cursor.execute('''
                    DELETE FROM comandos 
                    WHERE timestamp < ? AND ejecutado = 1
                ''', (cutoff_timestamp,))
                deleted_commands = cursor.rowcount
                
                # VACUUM para recuperar espacio
                if self.db_config.get('auto_vacuum', True):
                    cursor.execute('VACUUM')
                
                logger.info(f"Limpieza completada: {deleted_measurements} mediciones, "
                          f"{deleted_events} eventos, {deleted_diagnostics} diagnósticos, "
                          f"{deleted_commands} comandos eliminados")
        
        except Exception as e:
            logger.error(f"Error en limpieza de datos: {e}")
    
    def start_auto_cleanup(self):
        """
        Inicia el hilo de limpieza automática
        """
        if self.db_config.get('cleanup', {}).get('enabled', True):
            self.running = True
            self.cleanup_thread = threading.Thread(target=self._auto_cleanup_loop, daemon=True)
            self.cleanup_thread.start()
            logger.info("Limpieza automática iniciada")
    
    def stop_auto_cleanup(self):
        """
        Detiene el hilo de limpieza automática
        """
        self.running = False
        if self.cleanup_thread:
            self.cleanup_thread.join(timeout=5)
        logger.info("Limpieza automática detenida")
    
    def _auto_cleanup_loop(self):
        """
        Loop de limpieza automática
        """
        interval_hours = self.db_config.get('cleanup', {}).get('interval_hours', 6)
        interval_seconds = interval_hours * 3600
        
        while self.running:
            try:
                time.sleep(interval_seconds)
                if self.running:
                    logger.info("Ejecutando limpieza automática...")
                    self.cleanup_old_data()
            except Exception as e:
                logger.error(f"Error en loop de limpieza: {e}")
    
    def create_backup(self) -> Optional[str]:
        """
        Crea un backup de la base de datos
        
        Returns:
            Ruta del archivo de backup o None si hay error
        """
        try:
            timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_file = os.path.join(self.backup_path, f"scada_backup_{timestamp_str}.db")
            
            with self.get_connection() as conn:
                backup_conn = sqlite3.connect(backup_file)
                conn.backup(backup_conn)
                backup_conn.close()
            
            logger.success(f"Backup creado: {backup_file}")
            return backup_file
        
        except Exception as e:
            logger.error(f"Error creando backup: {e}")
            return None


# Ejemplo de uso
if __name__ == "__main__":
    logger.add("logs/database.log", rotation="10 MB")
    
    # Crear instancia
    storage = DataStorage()
    
    # Guardar medición de prueba
    test_data = {
        'timestamp': time.time(),
        'nivel_bombo1': 45.5,
        'porcentaje_bombo1': 45,
        'nivel_bombo2': 60.2,
        'porcentaje_bombo2': 60,
        'caudal_1': 5.5,
        'error': 0,
        'raw': 'test data'
    }
    
    storage.save_measurement(test_data)
    storage.save_event('test', 'Evento de prueba', {'dato': 'valor'})
    
    # Obtener mediciones
    measurements = storage.get_measurements(limit=10)
    print(f"Mediciones obtenidas: {len(measurements)}")
    
    # Iniciar limpieza automática
    storage.start_auto_cleanup()
    
    try:
        time.sleep(10)
    except KeyboardInterrupt:
        pass
    finally:
        storage.stop_auto_cleanup()
