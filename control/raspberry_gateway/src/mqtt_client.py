"""
Cliente MQTT para comunicación con la aplicación web.
Soporta el esquema estándar tenant/gateway/sector/sistema/dispositivo/variable
y mantiene compatibilidad con topics legacy de SCADA/planta.
"""

import json
import re
import time
import uuid
import threading
from queue import Queue
from typing import Optional, Dict, Any, Callable, List

import paho.mqtt.client as mqtt
import yaml
from loguru import logger


class MQTTClient:
    """
    Cliente MQTT para comunicación bidireccional con la app web
    """
    
    def __init__(self, config_path: str = "config.yaml", data_lock: Optional[threading.Lock] = None):
        """
        Inicializa el cliente MQTT
        
        Args:
            config_path: Ruta al archivo de configuración
            data_lock: Lock para sincronización thread-safe (opcional)
        """
        # Cargar configuración
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        self.mqtt_config = self.config["mqtt"]
        
        # Configuración MQTT
        self.broker = self.mqtt_config["broker"]
        self.port = self.mqtt_config["port"]
        self.username = self.mqtt_config.get("username")
        self.password = self.mqtt_config.get("password")
        self.keepalive = self.mqtt_config.get("keepalive", 60)
        self.qos = self.mqtt_config.get("qos", 1)

        # Identidad estándar - SIEMPRE minúsculas para topics MQTT
        raw_tenant = self.mqtt_config.get("tenant", "planta").strip()
        self.tenant = self._sanitize_token(raw_tenant)  # → minúsculas
        
        raw_gateway = self._resolve_gateway_id()
        self.gateway_id = self._sanitize_token(raw_gateway)  # → minúsculas
        
        # Generar un sufijo aleatorio para evitar conflictos de client_id en el broker
        random_suffix = f"_{uuid.uuid4().hex[:6]}"
        self.client_id = self.mqtt_config.get("client_id") or f"rpi_{self.gateway_id}{random_suffix}"

        # Defaults para publicar telemetría estructurada - SIEMPRE minúsculas
        self.default_sector = self._sanitize_token(self.mqtt_config.get("default_sector", "sector_general"))
        self.default_system = self._sanitize_token(self.mqtt_config.get("default_system", "sistema_general"))

        # Configuración de topics
        topics_cfg = self.mqtt_config.get("topics", {})
        self.enable_legacy_topics = topics_cfg.get("enable_legacy_topics", True)
        self.legacy_base_topic = topics_cfg.get("base", "scada/planta1")
        self.publish_topics = topics_cfg.get("publish", {})
        self.subscribe_topics = topics_cfg.get("subscribe", {})
        self.subscribe_filters = self._build_subscribe_filters(topics_cfg.get("subscribe_filters", []))
        
        # Cliente MQTT
        self.client: Optional[mqtt.Client] = None
        self.connected = False
        # último código de retorno de conexión (on_connect)
        self.last_conn_rc: Optional[int] = None
        
        # Cola de mensajes a publicar
        self.publish_queue = Queue()
        
        # Lock para sincronización con thread-safety
        self.data_lock = data_lock or threading.Lock()
        
        # Callbacks personalizados
        self.command_callbacks: Dict[str, Callable] = {}
        
        # Estadísticas
        self.stats = {
            "messages_published": 0,
            "messages_received": 0,
            "errors": 0,
            "last_publish_time": None,
            "last_receive_time": None,
        }
        
        # Historial de últimos datos
        self.last_published_message: Optional[Dict[str, Any]] = None
        self.last_received_message: Optional[Dict[str, Any]] = None

        logger.info(
            f"MQTTClient inicializado para {self.broker}:{self.port} | "
            f"tenant={self.tenant} gateway={self.gateway_id}"
        )

    @property
    def topic_prefix(self) -> str:
        """Retorna el prefijo de topic en minúsculas: tenant/gateway_id"""
        return f"{self.tenant}/{self.gateway_id}"
    
    def get_subscribe_topics_info(self) -> List[Dict[str, str]]:
        """Retorna información sobre los topics a los que se suscribe"""
        topics_info = []
        for name, path in self.subscribe_topics.items():
            full_topic = f"{self.topic_prefix}/{self.default_sector}/{self.default_system}/{path}"
            topics_info.append({
                "nombre": name,
                "topic": full_topic,
                "tipo": "comando"
            })
        return topics_info
    
    def get_publish_topics_info(self) -> List[Dict[str, str]]:
        """Retorna información sobre los topics que publica"""
        topics_info = []
        for name, path in self.publish_topics.items():
            full_topic = f"{self.topic_prefix}/{self.default_sector}/{self.default_system}/{path}"
            topics_info.append({
                "nombre": name,
                "topic": full_topic,
                "tipo": "telemetría"
            })
        return topics_info

    def _sanitize_token(self, value: str) -> str:
        """Convierte a minúsculas y remueve caracteres no permitidos en MQTT topics"""
        token = str(value).strip().lower().replace(" ", "_")
        # Solo permitir: a-z, 0-9, guión bajo (_), guión (-)
        token = re.sub(r"[^a-z0-9_\-]", "", token)
        return token or "na"

    def _resolve_gateway_id(self) -> str:
        """Obtiene el ID del gateway (será sanitizado a minúsculas después)"""
        forced_id = self.mqtt_config.get("gateway_id")
        if forced_id:
            return forced_id.strip()  # Será sanitizado en __init__

        # Si no hay ID forzado, generar desde MAC
        mac_int = uuid.getnode()
        return f"{mac_int:012x}"

    def _apply_topic_tokens(self, topic_filter: str) -> str:
        return (
            topic_filter.replace("{tenant}", self.tenant)
            .replace("{gateway_id}", self.gateway_id)
            .replace("{device}", self.gateway_id)
        )

    def _build_subscribe_filters(self, configured_filters: List[str]) -> List[str]:
        """
        Construye la lista de topics a los que se suscribe.
        ✅ IMPORTANTE: Se suscribe SOLO a los comandos que necesita procesar,
        NO a todo con wildcard (#). Esto evita recibir datos que el gateway mismo publica.
        """
        filters: List[str] = []
        
        # ✅ Construir topics específicos para COMANDOS
        # subscribe_topics contiene: {reposicion, mezcla, freno_reposicion, configuracion, consultas}
        for cmd_name, cmd_path in self.subscribe_topics.items():
            # Construir topic completo: tenant/gateway_id/sector/sistema/comando
            full_topic = f"{self.topic_prefix}/{self.default_sector}/{self.default_system}/{cmd_path}"
            filters.append(full_topic)
            logger.debug(f"📥 Se suscribe a comando: {full_topic}")
        
        # Agregar filtros configurados (si los hay)
        for f in configured_filters:
            applied = self._apply_topic_tokens(f)
            if applied not in filters:
                filters.append(applied)
        
        # Legacy topics (si están habilitados)
        if self.enable_legacy_topics:
            for _, topic_path in self.subscribe_topics.items():
                legacy = f"{self.legacy_base_topic}/{topic_path}"
                if legacy not in filters:
                    filters.append(legacy)
        
        # Remover duplicados y retornar
        unique_filters = []
        for f in filters:
            if f and f not in unique_filters:
                unique_filters.append(f)
        
        logger.info(f"✅ Filtros de suscripción construidos ({len(unique_filters)} topics específicos)")
        return unique_filters

    def rebuild_subscribe_filters(self):
        """
        Reconstruye los filtros de suscripción cuando cambian tenant o gateway_id.
        Esto es necesario cuando se actualizan los parámetros en tiempo de ejecución.
        """
        try:
            self.subscribe_filters = self._build_subscribe_filters(
                self.mqtt_config.get("topics", {}).get("subscribe_filters", [])
            )
            logger.info(f"Filtros de suscripción actualizados. Topic prefix: {self.topic_prefix}")
            
            # Si ya está conectado, re-suscribirse con los nuevos filtros
            if self.connected and self.client:
                # Desuscribirse de los antiguos tópicos
                try:
                    self.client.unsubscribe("#")
                except Exception as e:
                    logger.warning(f"Error desuscribiendo de tópicos antiguos: {e}")
                
                # Suscribirse a los nuevos
                for topic_filter in self.subscribe_filters:
                    try:
                        self.client.subscribe(topic_filter, qos=self.qos)
                        logger.debug(f"Suscrito a: {topic_filter}")
                    except Exception as e:
                        logger.error(f"Error suscribiendo a {topic_filter}: {e}")
                        self.stats["errors"] += 1
        except Exception as e:
            logger.error(f"Error reconstruyendo filtros de suscripción: {e}")
            self.stats["errors"] += 1

    def _extract_command_meta(self, topic: str) -> Optional[Dict[str, str]]:
        # Estructura estándar: {tenant}/{gateway_id}/{sector}/{sistema}/{accion}
        prefix = f"{self.topic_prefix}/"
        if not topic.startswith(prefix):
            return None
        
        path = topic[len(prefix):].strip("/")
        parts = [p for p in path.split("/") if p]
        
        # Necesitamos al menos: sector/sistema/accion (3 partes)
        if len(parts) < 3:
            return None

        action = parts[-1]
        
        # Verificar que la última parte sea una acción conocida
        known_actions = [
            "reposicion", "freno_reposicion", "detener", "reanudar", 
            "vaciar", "desechar", "mezcla", "configuracion", "consultas", 
            "control", "accion", "continuar", "frenar", "parar", "pausar",
            "descartar"
        ]
        
        if action.lower() not in known_actions:
            return None

        meta = {
            "action": action,
            "path": path,
            "scope": "standard",
        }

        if len(parts) >= 1:
            meta["sector"] = self._sanitize_token(parts[0])
        if len(parts) >= 2:
            meta["system"] = self._sanitize_token(parts[1])
        if len(parts) >= 4:
            meta["device"] = self._sanitize_token(parts[3])

        return meta

    def _extract_legacy_meta(self, topic: str) -> Optional[Dict[str, str]]:
        if not topic.startswith(f"{self.legacy_base_topic}/"):
            return None

        relative_topic = topic.replace(f"{self.legacy_base_topic}/", "", 1)
        for command_type in self.command_callbacks.keys():
            if command_type in relative_topic:
                return {
                    "action": command_type,
                    "path": relative_topic,
                    "scope": "legacy",
                }

        return None
    
    def _on_connect(self, client, userdata, flags, rc):
        """
        Callback cuando se conecta al broker MQTT
        """
        if rc == 0:
            self.connected = True
            self.last_conn_rc = rc
            logger.success(f"Conectado al broker MQTT: {self.broker}")

            # Suscribirse a todos los topics de comandos
            self._subscribe_to_topics()
        else:
            self.connected = False
            self.last_conn_rc = rc
            error_messages = {
                1: "Protocolo incorrecto",
                2: "Client ID rechazado",
                3: "Servidor no disponible",
                4: "Usuario/contraseña incorrectos",
                5: "No autorizado"
            }
            logger.error(f"Error conectando a MQTT: {error_messages.get(rc, f'Error {rc}')}")
    
    def _on_disconnect(self, client, userdata, rc):
        """
        Callback cuando se desconecta del broker MQTT
        """
        self.connected = False
        # registrar código de desconexión si aplica
        try:
            self.last_conn_rc = rc
        except Exception:
            pass
        if rc != 0:
            logger.warning(f"Desconexión inesperada del broker MQTT (rc={rc})")
        else:
            logger.info("Desconectado del broker MQTT")

    def _on_message(self, client, userdata, msg):
        """
        Callback cuando se recibe un mensaje MQTT
        """
        try:
            topic = msg.topic
            payload = msg.payload.decode('utf-8')
            
            logger.debug(f"Mensaje recibido en {topic}: {payload}")
            
            # Parsear JSON si es posible
            try:
                data = json.loads(payload)
            except json.JSONDecodeError:
                data = {"raw": payload}

            # Actualizar estadísticas
            self.stats["messages_received"] += 1
            self.stats["last_receive_time"] = time.time()
            with self.data_lock:
                self.last_received_message = {
                    "topic": topic,
                    "payload": payload[:500],
                    "timestamp": time.time()
                }

            # Intentar parsear estándar y luego legacy
            command_meta = self._extract_command_meta(topic)
            if not command_meta:
                command_meta = self._extract_legacy_meta(topic)

            if not command_meta:
                logger.debug(f"Mensaje recibido fuera de cmd/resp esperado: {topic}")
                return

            data["_topic_meta"] = command_meta

            action = command_meta.get("action")
            logger.info(f"🔔 Comando MQTT recibido: acción='{action}' | topic='{topic}'")
            
            # Resolver la acción específica desde el campo 'accion' del payload si la ruta fue /accion
            if action == 'control' and isinstance(data, dict) and data.get('accion'):
                payload_action = str(data.get('accion')).lower()
                if payload_action in self.command_callbacks:
                    action = payload_action
                elif payload_action in ['freno_reposicion', 'parar_reposicion']:
                    action = 'reposicion'

            callback = self.command_callbacks.get(action)
            if callback:
                logger.info(f"✓ Invocando callback para: {action}")
                callback(data, topic)
                return

            logger.warning(f"❌ No hay callback registrado para acción: {action}")
            
        except Exception as e:
            logger.error(f"Error procesando mensaje MQTT: {e}")
            self.stats["errors"] += 1
    
    def _on_publish(self, client, userdata, mid):
        """
        Callback cuando se publica un mensaje exitosamente
        """
        logger.debug(f"Mensaje publicado (mid={mid})")
    
    def _subscribe_to_topics(self):
        """
        Suscribe a todos los topics configurados
        """
        logger.info("="*70)
        logger.info("📡 SUSCRIPCIÓN A TOPICS MQTT")
        logger.info("="*70)
        logger.info(f"Topic Prefix: {self.topic_prefix}")
        logger.info(f"Filtros de suscripción:")
        for i, topic_filter in enumerate(self.subscribe_filters, 1):
            logger.info(f"  {i}. {topic_filter}")
            self.client.subscribe(topic_filter, qos=self.qos)
        logger.info("="*70)
    
    def connect(self) -> bool:
        """
        Conecta al broker MQTT
        
        Returns:
            True si la conexión fue exitosa
        """
        try:
            # Crear cliente MQTT
            self.client = mqtt.Client(client_id=self.client_id)
            
            # Configurar callbacks
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message
            self.client.on_publish = self._on_publish
            
            # Configurar credenciales si existen
            if self.username and self.password:
                self.client.username_pw_set(self.username, self.password)
            
            # Configurar TLS si está habilitado
            tls_config = self.mqtt_config.get('tls', {})
            if tls_config.get('enabled', False):
                import ssl
                self.client.tls_set(
                    ca_certs=tls_config.get('ca_certs'),
                    certfile=tls_config.get('certfile'),
                    keyfile=tls_config.get('keyfile'),
                    tls_version=ssl.PROTOCOL_TLSv1_2
                )
            
            # Configurar will (mensaje de última voluntad) en estándar
            # NOTA: Solo se puede tener UN will_set() por cliente en paho-mqtt
            # El topic estándar es el que Django worker espera para actualizar estado
            self.client.will_set(
                f"{self.topic_prefix}/status",
                payload="offline",
                qos=self.qos,
                retain=True,
            )
            
            # Conectar
            self.client.connect(self.broker, self.port, self.keepalive)
            
            # Iniciar loop en thread separado
            self.client.loop_start()
            
            # Esperar conexión
            timeout = 10
            start_time = time.time()
            while not self.connected and time.time() - start_time < timeout:
                time.sleep(0.1)

            if self.connected:
                # Publicar estado online
                self.publish_status(True)

                if self.enable_legacy_topics:
                    self.publish(
                        "estado/gateway",
                        {
                            "online": True,
                            "timestamp": time.time(),
                            "client_id": self.client_id,
                        },
                        retain=True,
                    )
                
                return True
            else:
                # Si hubo un código de retorno específico, loguearlo
                if self.last_conn_rc is not None:
                    logger.error(f"Conexión MQTT fallida, rc={self.last_conn_rc}")
                else:
                    logger.error("Timeout esperando conexión MQTT")
                self.connected = False
                try:
                    self.client.loop_stop()
                    self.client.disconnect()
                except Exception:
                    pass
                self.client = None
                return False
        
        except Exception as e:
            logger.error(f"Error conectando a MQTT: {e}")
            self.connected = False
            try:
                if self.client:
                    self.client.loop_stop()
                    self.client.disconnect()
            except Exception:
                pass
            self.client = None
            return False
    
    def disconnect(self):
        """
        Desconecta del broker MQTT
        """
        if self.client:
            # Publicar estado offline
            self.publish_status(False)

            if self.enable_legacy_topics:
                self.publish(
                    "estado/gateway",
                    {
                        "online": False,
                        "timestamp": time.time(),
                    },
                    retain=True,
                )
            
            self.client.loop_stop()
            self.client.disconnect()
            self.connected = False
            logger.info("Desconectado del broker MQTT")
    
    def publish(self, topic_name: str, data: Any, retain: bool = False, qos: Optional[int] = None) -> bool:
        """
        Publica datos en un topic MQTT
        
        Args:
            topic_name: Nombre del topic (relativo o completo)
            data: Datos a publicar (dict se convierte a JSON)
            retain: Si el mensaje debe ser retenido por el broker
            qos: Quality of Service (None usa el configurado)
            
        Returns:
            True si la publicación fue exitosa
        """
        try:
            if not self.connected:
                logger.warning(f"No conectado a MQTT, mensaje descartado: {topic_name}")
                return False
            
            # Construir topic completo si es necesario
            if topic_name.startswith(f"{self.tenant}/") or topic_name.startswith(self.legacy_base_topic):
                full_topic = topic_name
            elif self.enable_legacy_topics and topic_name in self.publish_topics:
                full_topic = f"{self.legacy_base_topic}/{self.publish_topics[topic_name]}"
            else:
                full_topic = f"{self.topic_prefix}/{topic_name}"
            
            # Convertir a JSON si es dict
            if isinstance(data, dict):
                payload = json.dumps(data)
            else:
                payload = str(data)
            
            # Debug: log el topic que se va a publicar
            logger.debug(f"Publicando en: {full_topic}")
            
            # Publicar
            result = self.client.publish(
                full_topic,
                payload,
                qos=qos if qos is not None else self.qos,
                retain=retain
            )
            
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                self.stats["messages_published"] += 1
                self.stats["last_publish_time"] = time.time()
                with self.data_lock:
                    self.last_published_message = {
                        "topic": full_topic,
                        "payload": payload[:500],
                        "timestamp": time.time(),
                        "retain": retain
                    }
                logger.debug(f"Publicado OK en {full_topic}: {payload[:100]}")
                return True
            else:
                logger.error(f"Error publicando en {full_topic}: rc={result.rc}, payload_size={len(payload)}")
                self.stats["errors"] += 1
                return False
        
        except Exception as e:
            logger.error(f"Error en publish de {topic_name}: {e}")
            self.stats["errors"] += 1
            return False

    def publish_status(self, online: bool):
        status = "online" if online else "offline"
        self.publish("status", status, retain=True, qos=self.qos)

    def publish_structured(
        self,
        sector: str,
        system: str,
        device: str,
        variable: str,
        value: Any,
        qos: Optional[int] = None,
    ) -> bool:
        full_topic = (
            f"{self.topic_prefix}/"
            f"{self._sanitize_token(sector)}/"
            f"{self._sanitize_token(system)}/"
            f"{self._sanitize_token(device)}/"
            f"{self._sanitize_token(variable)}"
        )
        return self.publish(full_topic, value, retain=False, qos=qos)

    def publish_command_response(
        self,
        command_data: Dict[str, Any],
        source_topic: str,
        status: str,
        code: int,
        result: Dict[str, Any],
        error: Optional[str] = None,
    ) -> bool:
        meta = command_data.get("_topic_meta", {})
        action = meta.get("action") or source_topic.rstrip("/").split("/")[-1]
        sector = meta.get("sector")
        system = meta.get("system")
        device = meta.get("device")

        payload = {
            "command_id": command_data.get("command_id", f"cmd_{int(time.time() * 1000)}"),
            "status": status,
            "code": code,
            "result": result,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "error": error,
        }

        if sector and system and device:
            response_topic = f"resp/{sector}/{system}/{device}/{action}"
        else:
            response_topic = f"resp/{action}"

        logger.debug(f"Construyendo respuesta de comando:")
        logger.debug(f"  - Acción: {action}")
        logger.debug(f"  - Sector: {sector}")
        logger.debug(f"  - System: {system}")
        logger.debug(f"  - Device: {device}")
        logger.debug(f"  - Topic de respuesta (sin prefijo): {response_topic}")
        logger.info(f"✉️  Publicando respuesta: topic='resp/{action}' status='{status}' code={code}")

        return self.publish(response_topic, payload, retain=False, qos=self.qos)
    
    def publish_sensor_data(self, sensor_data: Dict[str, Any]):
        """
        Publica datos de sensores agrupados en formato JSON en los topics correspondientes
        
        Args:
            sensor_data: Diccionario con datos del Arduino parseados
        """
        try:
            sector = self.default_sector
            system = self.default_system
            ts = sensor_data.get("timestamp") or time.time()

            logger.debug(f"Publishing sensor data to: {self.topic_prefix}/{sector}/{system}/...")

            # 1. Sensores de Nivel (Bombos)
            self.publish_structured(sector, system, "sensores", "bombo1", {
                "nivel": sensor_data.get("nivel_bombo1", 0.0),
                "porcentaje": sensor_data.get("porcentaje_bombo1", 0),
                "timestamp": ts
            })
            self.publish_structured(sector, system, "sensores", "bombo2", {
                "nivel": sensor_data.get("nivel_bombo2", 0.0),
                "porcentaje": sensor_data.get("porcentaje_bombo2", 0),
                "timestamp": ts
            })
            self.publish_structured(sector, system, "sensores", "mezcla", {
                "nivel": sensor_data.get("nivel_mezcla", 0.0),
                "porcentaje": sensor_data.get("porcentaje_mezcla", 0),
                "timestamp": ts
            })

            # 2. Caudalímetros
            self.publish_structured(sector, system, "sensores", "caudal", {
                "caudal_1": sensor_data.get("caudal_1", 0.0),
                "caudal_2": sensor_data.get("caudal_2", 0.0),
                "timestamp": ts
            })

            # 3. Actuadores (Bombas y Mezclador)
            self.publish_structured(sector, system, "actuadores", "bombas", {
                "bomba1": int(bool(sensor_data.get("estado_bomba1", False))),
                "bomba2": int(bool(sensor_data.get("estado_bomba2", False))),
                "bomba_mezcla": int(bool(sensor_data.get("estado_bomba_mezcla", False))),
                "bomba_reposicion": int(bool(sensor_data.get("estado_bomba_repo", False))),
                "timestamp": ts
            })
            self.publish_structured(sector, system, "actuadores", "mezclador", {
                "estado": int(bool(sensor_data.get("estado_mezclador", False))),
                "timestamp": ts
            })
            self.publish_structured(sector, system, "actuadores", "electrovalvulas", {
                "electrovalvula1": int(bool(sensor_data.get("estado_electrovalvula1", False))),
                "electrovalvula2": int(bool(sensor_data.get("estado_electrovalvula2", False))),
                "timestamp": ts
            })

            # 4. Proceso (Estado y tiempo restante)
            self.publish_structured(sector, system, "proceso", "mezclado", {
                "estado": sensor_data.get("estado_proceso", 0),
                "error": sensor_data.get("error", 0),
                "timestamp": ts
            })
            self.publish_structured(sector, system, "proceso", "tiempo_restante", {
                "horas": sensor_data.get("hora_restante", 0),
                "minutos": sensor_data.get("min_restante", 0),
                "timestamp": ts
            })

            # Compatibilidad legacy opcional
            if self.enable_legacy_topics:
                self._publish_legacy_sensor_data(sensor_data)
            
            logger.debug(f"Sensor data published successfully")
        
        except Exception as e:
            logger.error(f"Error publicando datos de sensores: {e}")
            self.stats["errors"] += 1

    def _publish_legacy_sensor_data(self, sensor_data: Dict[str, Any]):
        # Publicar estado general
        general_state = {
            "timestamp": sensor_data.get("timestamp"),
            "conectado": self.connected,
            "error": sensor_data.get("error", 0),
        }
        self.publish("estado_general", general_state)

        # Publicar niveles de bombos
        self.publish(
            "nivel_bombo1",
            {
                "nivel": sensor_data.get("nivel_bombo1"),
                "porcentaje": sensor_data.get("porcentaje_bombo1"),
                "timestamp": sensor_data.get("timestamp"),
            },
        )
        self.publish(
            "nivel_bombo2",
            {
                "nivel": sensor_data.get("nivel_bombo2"),
                "porcentaje": sensor_data.get("porcentaje_bombo2"),
                "timestamp": sensor_data.get("timestamp"),
            },
        )
        self.publish(
            "nivel_mezcla",
            {
                "nivel": sensor_data.get("nivel_mezcla"),
                "porcentaje": sensor_data.get("porcentaje_mezcla"),
                "timestamp": sensor_data.get("timestamp"),
            },
        )

        # Publicar caudales
        self.publish("caudal_1", {"caudal": sensor_data.get("caudal_1"), "timestamp": sensor_data.get("timestamp")})
        self.publish("caudal_2", {"caudal": sensor_data.get("caudal_2"), "timestamp": sensor_data.get("timestamp")})

        # Publicar estados de actuadores
        self.publish("bomba1", {"estado": sensor_data.get("estado_bomba1"), "timestamp": sensor_data.get("timestamp")})
        self.publish("bomba2", {"estado": sensor_data.get("estado_bomba2"), "timestamp": sensor_data.get("timestamp")})
        self.publish(
            "bomba_mezcla",
            {"estado": sensor_data.get("estado_bomba_mezcla"), "timestamp": sensor_data.get("timestamp")},
        )
        self.publish("mezclador", {"estado": sensor_data.get("estado_mezclador"), "timestamp": sensor_data.get("timestamp")})
        self.publish("bomba_repo", {"estado": sensor_data.get("estado_bomba_repo"), "timestamp": sensor_data.get("timestamp")})

        self.publish(
            "tiempo_restante",
            {
                "horas": sensor_data.get("hora_restante"),
                "minutos": sensor_data.get("min_restante"),
                "timestamp": sensor_data.get("timestamp"),
            },
        )

        if sensor_data.get("error", 0) != 0:
            self.publish(
                "alarmas",
                {
                    "codigo_error": sensor_data.get("error"),
                    "timestamp": sensor_data.get("timestamp"),
                    "activa": True,
                },
            )
    
    def register_command_callback(self, command_type: str, callback: Callable):
        """
        Registra un callback para un tipo de comando
        
        Args:
            command_type: Tipo de comando (reposicion, mezcla, control, etc.)
            callback: Función a llamar cuando se reciba el comando
        """
        self.command_callbacks[command_type] = callback
        logger.info(f"Callback registrado para comando: {command_type}")
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Obtiene estadísticas del cliente MQTT
        
        Returns:
            Diccionario con estadísticas
        """
        return {
            **self.stats,
            'connected': self.connected,
            'broker': self.broker,
            'topic_prefix': self.topic_prefix,
            'tenant': self.tenant,
            'gateway_id': self.gateway_id,
        }


# Ejemplo de uso
if __name__ == "__main__":
    logger.add("logs/mqtt.log", rotation="10 MB")

    mqtt_client = MQTTClient()

    def on_reposicion(data, topic):
        print(f"Comando de reposición recibido: {topic} -> {data}")

    mqtt_client.register_command_callback("reposicion", on_reposicion)

    if mqtt_client.connect():
        print("Conectado a MQTT. Presiona Ctrl+C para salir...")

        try:
            while True:
                test_data = {
                    "timestamp": time.time(),
                    "nivel_bombo1": 45.5,
                    "porcentaje_bombo1": 45,
                    "nivel_bombo2": 60.2,
                    "porcentaje_bombo2": 60,
                    "nivel_mezcla": 30.1,
                    "porcentaje_mezcla": 30,
                    "caudal_1": 5.5,
                    "caudal_2": 4.2,
                    "estado_bomba1": False,
                    "estado_bomba2": False,
                    "estado_bomba_mezcla": False,
                    "estado_mezclador": True,
                    "estado_bomba_repo": False,
                    "error": 0,
                    "hora_restante": 2,
                    "min_restante": 30,
                    "estado_proceso": 1,
                }

                mqtt_client.publish_sensor_data(test_data)

                stats = mqtt_client.get_stats()
                print(f"Stats: {stats}")

                time.sleep(5)

        except KeyboardInterrupt:
            print("\nDeteniendo...")
            mqtt_client.disconnect()
    else:
        print("No se pudo conectar a MQTT")
