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
        self.retention_days = self.db_config.get('retention_days', 2)
        self.measurement_interval = self.db_config.get('measurement_interval_seconds', 5)
        self.save_measurements = self.db_config.get('save_measurements', False)
        self.save_raw_data = self.db_config.get('save_raw_data', False)
        self.max_measurements = self.db_config.get('max_measurements', 25000)
        self.backup_enabled = self.db_config.get('backup_enabled', True)
        self.backup_path = self.db_config.get('backup_path', './backups')
        self.backup_max_files = self.db_config.get('backup_max_files', 3)
        
        # Control de frecuencia de guardado en memoria
        self._last_saved_measurement_time = 0.0
        self._last_saved_state = ()
        
        # Asegurar que existan los directorios
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        if self.backup_enabled:
            os.makedirs(self.backup_path, exist_ok=True)
        
        # Thread para limpieza automática
        self.cleanup_thread: Optional[threading.Thread] = None
        self.running = False
        
        # Inicializar base de datos
        self._init_database()
        
        logger.info(f"DataStorage inicializado en {self.db_path} (muestreo: cada {self.measurement_interval}s, retención: {self.retention_days}d)")
    
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
        Crea las tablas de la base de datos si no existen y aplica pragmas de rendimiento
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Pragmas para minimizar escrituras continuas y acelerar SQLite en Raspberry Pi
            try:
                cursor.execute("PRAGMA journal_mode = WAL;")
                cursor.execute("PRAGMA synchronous = NORMAL;")
                if self.db_config.get('auto_vacuum', True):
                    cursor.execute("PRAGMA auto_vacuum = INCREMENTAL;")
            except Exception as e:
                logger.warning(f"No se pudieron aplicar pragmas SQLite: {e}")

            # Tabla de configuración persistente del sistema en la Raspberry Pi
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS configuracion_sistema (
                    clave TEXT PRIMARY KEY,
                    valor TEXT NOT NULL,
                    actualizado_el TEXT NOT NULL
                )
            ''')
            
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
    
    def save_system_config(self, clave: str, valor: Any) -> bool:
        """
        Guarda o actualiza un parámetro de configuración en la base de datos local
        
        Args:
            clave: Nombre de la sección o parámetro (ej. 'mqtt', 'serial', 'general')
            valor: Diccionario, lista o valor escalar de configuración
            
        Returns:
            True si se guardó correctamente
        """
        try:
            ahora = datetime.now().isoformat()
            valor_str = json.dumps(valor) if not isinstance(valor, str) else valor
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO configuracion_sistema (clave, valor, actualizado_el)
                    VALUES (?, ?, ?)
                    ON CONFLICT(clave) DO UPDATE SET
                        valor = excluded.valor,
                        actualizado_el = excluded.actualizado_el
                ''', (clave, valor_str, ahora))
            logger.info(f"Configuración guardada en base de datos local: [{clave}]")
            return True
        except Exception as e:
            logger.error(f"Error guardando configuración en base de datos local: {e}")
            return False

    def get_system_config(self, clave: str) -> Optional[Any]:
        """
        Recupera un parámetro de configuración de la base de datos local
        
        Args:
            clave: Nombre de la clave de configuración
            
        Returns:
            Valor parseado o None
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT valor FROM configuracion_sistema WHERE clave = ?', (clave,))
                row = cursor.fetchone()
                if row:
                    try:
                        return json.loads(row['valor'])
                    except Exception:
                        return row['valor']
                return None
        except Exception as e:
            logger.error(f"Error leyendo configuración de base de datos local: {e}")
            return None

    def save_measurement(self, data: Dict[str, Any], force: bool = False) -> bool:
        """
        Guarda una medición de sensores con filtrado por intervalo de muestreo.
        Evita saturar el almacenamiento de la tarjeta microSD en la Raspberry Pi.
        
        Args:
            data: Diccionario con datos parseados del Arduino
            force: Forzar guardado ignorando el intervalo de muestreo
            
        Returns:
            True si se procesó correctamente
        """
        try:
            # Si no se desea persistir mediciones periódicas para cuidar la microSD
            if not self.save_measurements and not force:
                return True
            
            now = time.time()
            
            # Detectar cambios de estado en actuadores o errores para guardado prioritario
            current_state = (
                data.get('estado_bomba1'),
                data.get('estado_bomba2'),
                data.get('estado_bomba_mezcla'),
                data.get('estado_mezclador'),
                data.get('estado_bomba_repo'),
                data.get('estado_proceso'),
                data.get('error', 0),
            )
            state_changed = (current_state != self._last_saved_state)
            has_error = (data.get('error', 0) != 0)
            
            # Si no está forzado, no cambiaron actuadores ni hay error, verificar intervalo
            if not force and not state_changed and not has_error:
                if (now - self._last_saved_measurement_time) < self.measurement_interval:
                    return True  # Omitido para mantener la base de datos liviana
            
            self._last_saved_measurement_time = now
            self._last_saved_state = current_state
            
            timestamp = data.get('timestamp', now)
            fecha_hora = datetime.fromtimestamp(timestamp).isoformat()
            raw_data = data.get('raw') if self.save_raw_data else None
            
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
                    raw_data
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
        Limpia datos más antiguos que el período de retención y limita la cantidad máxima de filas
        para no desbordar el almacenamiento de la Raspberry Pi.
        """
        try:
            cutoff_time = datetime.now() - timedelta(days=self.retention_days)
            cutoff_timestamp = cutoff_time.timestamp()
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Limpiar mediciones por tiempo
                cursor.execute('DELETE FROM mediciones WHERE timestamp < ?', (cutoff_timestamp,))
                deleted_measurements = cursor.rowcount
                
                # Limpiar mediciones por cuota máxima (mantener solo las N más recientes)
                if self.max_measurements > 0:
                    cursor.execute('''
                        DELETE FROM mediciones WHERE id NOT IN (
                            SELECT id FROM mediciones ORDER BY id DESC LIMIT ?
                        )
                    ''', (self.max_measurements,))
                    deleted_measurements += cursor.rowcount
                
                # Limpiar eventos (mantener críticos por más tiempo)
                keep_crit_days = self.db_config.get('cleanup', {}).get('keep_critical_events', 7)
                critical_cutoff = (datetime.now() - timedelta(days=keep_crit_days)).timestamp()
                cursor.execute('''
                    DELETE FROM eventos 
                    WHERE timestamp < ? AND tipo NOT IN ('alarma_critica', 'fallo_sistema')
                ''', (critical_cutoff,))
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
                
                logger.info(f"Limpieza completada: {deleted_measurements} mediciones, "
                          f"{deleted_events} eventos, {deleted_diagnostics} diagnósticos, "
                          f"{deleted_commands} comandos eliminados")
            
            # VACUUM fuera de la transacción para recuperar efectivamente espacio en disco
            if self.db_config.get('auto_vacuum', True):
                try:
                    vac_conn = sqlite3.connect(self.db_path, isolation_level=None)
                    vac_conn.execute("VACUUM")
                    vac_conn.close()
                    logger.info("VACUUM completado: espacio de archivo SQLite recuperado")
                except Exception as ve:
                    logger.warning(f"Aviso al ejecutar VACUUM: {ve}")
        
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
        interval_hours = self.db_config.get('cleanup', {}).get('interval_hours', 2)
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
        Crea un backup de la base de datos y rota los backups viejos para controlar espacio
        
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
            
            # Rotar backups para mantener solo los más recientes
            self._rotate_backups()
            
            return backup_file
        
        except Exception as e:
            logger.error(f"Error creando backup: {e}")
            return None

    def _rotate_backups(self):
        """
        Mantiene solo la cantidad de backups indicada en backup_max_files
        """
        try:
            if not os.path.exists(self.backup_path):
                return
            archivos = [
                os.path.join(self.backup_path, f)
                for f in os.listdir(self.backup_path)
                if f.startswith("scada_backup_") and f.endswith(".db")
            ]
            archivos.sort(key=os.path.getmtime, reverse=True)
            if len(archivos) > self.backup_max_files:
                for backup_viejo in archivos[self.backup_max_files:]:
                    try:
                        os.remove(backup_viejo)
                        logger.info(f"Backup antiguo eliminado para liberar espacio: {backup_viejo}")
                    except Exception as e:
                        logger.warning(f"No se pudo eliminar backup antiguo {backup_viejo}: {e}")
        except Exception as e:
            logger.error(f"Error rotando backups: {e}")


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
