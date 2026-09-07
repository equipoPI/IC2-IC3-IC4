import json
import logging
import re
import time
from django.core.management.base import BaseCommand
from django.db import close_old_connections
from django.utils import timezone
import paho.mqtt.client as mqtt

from polls.models import DispositivoSCADA, LecturaSensor, Fabrica, Seccion, ConfiguracionMQTT

logger = logging.getLogger(__name__)

def get_categoria_from_variable(variable):
    var = variable.lower()
    if 'temp' in var or 'temperatura' in var:
        return 'SENSOR_TEMPERATURA'
    elif 'pres' in var or 'presion' in var:
        return 'SENSOR_PRESION'
    elif 'fluj' in var or 'caudal' in var or 'flujo' in var:
        return 'SENSOR_FLUJO'
    elif 'nivel' in var:
        return 'SENSOR_NIVEL'
    elif 'hum' in var or 'humedad' in var:
        return 'SENSOR_HUMEDAD'
    elif 'mot' in var or 'motor' in var:
        return 'MOTOR'
    elif 'bomb' in var or 'bomba' in var:
        return 'BOMBA'
    elif 'valv' in var or 'valvula' in var:
        return 'VALVULA'
    elif 'plc' in var:
        return 'PLC'
    elif 'hmi' in var:
        return 'HMI'
    return 'OTRO'

def get_unidad_from_variable(variable):
    var = variable.lower()
    if 'temp' in var or 'temperatura' in var:
        return '°C'
    elif 'pres' in var or 'presion' in var:
        return 'bar'
    elif 'fluj' in var or 'caudal' in var or 'flujo' in var:
        return 'L/min'
    elif 'nivel' in var:
        if 'porcentaje' in var or 'porc' in var:
            return '%'
        return 'cm'
    elif 'hum' in var or 'humedad' in var:
        return '%'
    return ''

class Command(BaseCommand):
    help = "Inicia el worker MQTT para ingesta de telemetría, Auto-Discovery y Heartbeats LWT"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Iniciando MQTT Worker de Django..."))

        # Cargar configuración desde la base de datos o usar valores de fallback robustos
        config = ConfiguracionMQTT.objects.filter(activo=True).first()
        if config:
            broker_url = config.broker_url
            puerto = config.puerto
            usuario = config.usuario
            password = config.password
            self.stdout.write(f"Cargada configuración activa: {config.nombre} ({broker_url}:{puerto})")
        else:
            broker_url = "mosquitto"
            puerto = 1883
            usuario = None
            password = None
            self.stdout.write(self.style.WARNING("No se encontró configuración activa en DB. Usando fallback default (mosquitto:1883)"))

        client = mqtt.Client(client_id="django_mqtt_worker")

        if usuario and password:
            client.username_pw_set(usuario, password)

        # Configurar callbacks
        client.on_connect = self.on_connect
        client.on_message = self.on_message
        client.on_disconnect = self.on_disconnect

        # Intentar conectar con reintentos
        connected = False
        while not connected:
            try:
                client.connect(broker_url, puerto, keepalive=60)
                connected = True
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error al conectar al broker {broker_url}:{puerto}. Reintentando en 5s... Detalles: {e}"))
                time.sleep(5)

        # Loop infinito
        try:
            client.loop_forever()
        except KeyboardInterrupt:
            self.stdout.write(self.style.SUCCESS("Deteniendo MQTT Worker de forma segura..."))
            client.disconnect()

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.stdout.write(self.style.SUCCESS("Conectado exitosamente al broker MQTT"))
            # Suscribirse a todos los tópicos para no perder ningún mensaje
            client.subscribe("#", qos=1)
            self.stdout.write("Suscrito a todos los tópicos (#) de control y telemetría SCADA")
        else:
            self.stdout.write(self.style.ERROR(f"Conexión MQTT fallida con código de retorno: {rc}"))

    def on_disconnect(self, client, userdata, rc):
        self.stdout.write(self.style.WARNING(f"Desconectado del broker MQTT (rc={rc})"))

    def on_message(self, client, userdata, msg):
        try:
            close_old_connections()
            topic = msg.topic
            payload_str = msg.payload.decode('utf-8').strip()
            telemetria_parts = topic.split('/')

            # 1. Procesar Alarmas enviadas por el Gateway
            if topic.endswith('/alarmas') or '/alarmas' in topic:
                try:
                    payload_dict = json.loads(payload_str)
                except Exception:
                    payload_dict = {'mensaje': payload_str, 'nivel': 'CRITICO'}
                
                from polls.models import Alarma, Fabrica
                parts = topic.split('/')
                tenant_name = parts[0] if len(parts) > 0 else 'rafaela_sa'
                fabrica = Fabrica.objects.filter(nombre__iexact=tenant_name).first() or Fabrica.objects.first()
                
                msg_txt = payload_dict.get('mensaje') or payload_dict.get('alarma') or payload_str
                nivel_txt = str(payload_dict.get('nivel', 'CRITICO')).upper()
                if nivel_txt not in ['INFO', 'ADVERTENCIA', 'CRITICO']:
                    nivel_txt = 'CRITICO'

                Alarma.objects.create(
                    fabrica=fabrica,
                    titulo=f"Alarma Gateway {parts[1] if len(parts) > 1 else ''}",
                    descripcion=msg_txt,
                    nivel=nivel_txt,
                    estado='ACTIVA'
                )
                self.stdout.write(self.style.WARNING(f"[Alarma SCADA] {topic} -> {msg_txt} ({nivel_txt})"))
                return

            # 2. Procesar Estado General y Diagnóstico
            if topic.endswith('/estado/general') or topic.endswith('/diagnostico'):
                try:
                    payload_dict = json.loads(payload_str)
                except Exception:
                    payload_dict = {'estado': payload_str}
                
                from polls.models import Fabrica
                parts = topic.split('/')
                tenant_name = parts[0] if len(parts) > 0 else 'rafaela_sa'
                fabrica = Fabrica.objects.filter(nombre__iexact=tenant_name).first() or Fabrica.objects.first()
                if fabrica:
                    if 'estado' in payload_dict and payload_dict['estado'] in ['OPERATIVO', 'ADVERTENCIA', 'CRITICO', 'OFFLINE']:
                        fabrica.estado = payload_dict['estado']
                    if 'porcentaje_produccion' in payload_dict:
                        fabrica.porcentaje_produccion = float(payload_dict['porcentaje_produccion'])
                    if 'temperatura_promedio' in payload_dict:
                        fabrica.temperatura_promedio = float(payload_dict['temperatura_promedio'])
                    fabrica.save(update_fields=['estado', 'porcentaje_produccion', 'temperatura_promedio'])
                self.stdout.write(f"[Diagnóstico SCADA] {topic} -> {payload_dict}")
                return

            # 3. Procesar Variables y Estado de Proceso (ej: proceso/mezclado, proceso/tiempo_restante)
            if '/proceso/' in topic or (len(telemetria_parts) >= 2 and 'proceso' in [p.lower() for p in telemetria_parts]):
                try:
                    payload_dict = json.loads(payload_str)
                except Exception:
                    payload_dict = {'valor': payload_str}
                
                from polls.models import OrdenProduccion
                self.stdout.write(f"[Proceso SCADA] Variable de monitoreo {topic} -> {payload_dict}")
                
                active_orden = OrdenProduccion.objects.filter(estado__in=['EN_PROCESO', 'en_proceso']).first()
                if active_orden:
                    if 'progreso' in payload_dict or 'porcentaje' in payload_dict:
                        try:
                            val = float(payload_dict.get('progreso', payload_dict.get('porcentaje', 0)))
                            active_orden.progreso_porcentaje = min(max(val, 0.0), 100.0)
                            active_orden.save(update_fields=['progreso_porcentaje'])
                        except Exception:
                            pass
                return

            if len(telemetria_parts) in [4, 5, 6]:
                if len(telemetria_parts) == 4:
                    # Formato 4 partes: scada/planta1/actuadores/bomba1
                    tenant = telemetria_parts[0]
                    gateway_id = telemetria_parts[1]
                    sector = 'general'
                    system = 'general'
                    category = telemetria_parts[2].lower()
                    device_id = telemetria_parts[3]
                elif len(telemetria_parts) == 5:
                    # Formato 5 partes: scada/planta1/sensores/nivel/bombo1
                    tenant = telemetria_parts[0]
                    gateway_id = telemetria_parts[1]
                    sector = 'general'
                    system = 'general'
                    category = telemetria_parts[2].lower()
                    device_id = telemetria_parts[4]
                else:
                    # Formato 6 partes: tenant/gateway_id/sector/system/category/device
                    tenant, gateway_id, sector, system, category, device_id = telemetria_parts
                    category = category.lower()

                if category in ['sensores', 'actuadores', 'nivel', 'caudal']:
                    # =========================================================================
                    # PROCESADOR UNIFICADO DE TELEMETRÍA
                    # =========================================================================
                    try:
                        payload_dict = json.loads(payload_str)
                    except json.JSONDecodeError:
                        try:
                            # Reparar llaves sin comillas ({estado: true} -> {"estado": true})
                            repaired = re.sub(r'([{\s,])([a-zA-Z0-9_]+)\s*:', r'\1"\2":', payload_str)
                            repaired = repaired.replace("True", "true").replace("False", "false")
                            payload_dict = json.loads(repaired)
                        except Exception:
                            # Si el payload es un valor numérico simple (float/int) o boolean
                            try:
                                val_float = float(payload_str)
                                payload_dict = {'value': val_float}
                            except ValueError:
                                if payload_str.lower() in ['true', 'open', 'on']:
                                    payload_dict = {'estado': 1}
                                elif payload_str.lower() in ['false', 'close', 'off']:
                                    payload_dict = {'estado': 0}
                                else:
                                    logger.warning(f"Payload no procesable en {topic}: {payload_str}")
                                    return
                    
                    from polls.models import Fabrica, Seccion, Sistema, UnidadAlmacenamiento
                    
                    # 1. Resolver/Crear Fábrica, Sección y Sistema
                    fabrica, _ = Fabrica.objects.get_or_create(
                        nombre=tenant,
                        defaults={
                            'pais': 'Argentina',
                            'ubicacion': 'No especificada',
                            'estado': 'OPERATIVO'
                        }
                    )
                    
                    seccion, _ = Seccion.objects.get_or_create(
                        nombre=sector,
                        fabrica=fabrica,
                        defaults={
                            'capacidad_trabajadores': 10,
                            'tamano_seccion': 100.0,
                            'agenda': "Configuración inicial"
                        }
                    )
                    
                    sistema, _ = Sistema.objects.get_or_create(
                        nombre=system,
                        fabrica=fabrica,
                        defaults={
                            'descripcion': f"Sistema {system} auto-detectado"
                        }
                    )

                    # Auxiliar para obtener o crear dispositivos con la seccion y sistema correspondientes
                    def get_or_create_device(num_serie, name_default, cat_default):
                        dev, created = DispositivoSCADA.objects.get_or_create(
                            numero_serie=num_serie,
                            defaults={
                                'nombre': name_default,
                                'categoria': cat_default,
                                'estado': 'ONLINE',
                                'gateway_id': gateway_id,
                                'topic_mqtt': topic,
                                'seccion': seccion,
                                'sistema': sistema,
                                'descripcion': f"Dispositivo detectado automáticamente por MQTT en: {topic}"
                            }
                        )
                        # Actualizar metadatos sólo si no están definidos aún (preservar configuraciones del usuario)
                        updated = []
                        if dev.seccion is None and seccion is not None:
                            dev.seccion = seccion
                            updated.append('seccion')
                        if dev.sistema is None and sistema is not None:
                            dev.sistema = sistema
                            updated.append('sistema')
                        if dev.gateway_id != gateway_id:
                            dev.gateway_id = gateway_id
                            updated.append('gateway_id')
                        if dev.topic_mqtt != topic:
                            dev.topic_mqtt = topic
                            updated.append('topic_mqtt')
                        
                        dev.ultima_lectura = timezone.now()
                        dev.estado = "ONLINE"
                        updated.extend(['ultima_lectura', 'estado'])
                        dev.save(update_fields=updated)
                        return dev

                    # Extraer metadatos
                    timestamp_sender = payload_dict.pop('timestamp', None)
                    
                    # 2. Sincronizar niveles de bombos con Unidades de Almacenamiento en BD (usando porcentaje)
                    # Y registrar la lectura física de nivel (usando nivel)
                    tank_mapping = {
                        'bombo1': ('tank-1', 'sensor_nivel_bombo1', 'Sensor Nivel Bombo 1'),
                        'bombo2': ('tank-2', 'sensor_nivel_bombo2', 'Sensor Nivel Bombo 2'),
                        'mezcla': ('tank-3', 'sensor_nivel_mezcla', 'Sensor Nivel Mezcla')
                    }
                    
                    if device_id in tank_mapping:
                        node_id, sensor_serie, sensor_nombre = tank_mapping[device_id]
                        porcentaje = payload_dict.get('porcentaje')
                        nivel = payload_dict.get('nivel')
                        
                        # Actualizar almacenamiento
                        if porcentaje is not None:
                            try:
                                from polls.models import Inventario
                                inventario, _ = Inventario.objects.get_or_create(
                                    fabrica=fabrica,
                                    defaults={
                                        'nombre': f"Inventario General {fabrica.nombre}",
                                        'capacidad_m2': 500.0,
                                    }
                                )
                                tank, created = UnidadAlmacenamiento.objects.get_or_create(
                                    node_id=node_id,
                                    defaults={
                                        'inventario': inventario,
                                        'nombre': 'Tanque A (Aceite)' if device_id == 'bombo1' else 'Tanque B (Agua)' if device_id == 'bombo2' else 'Tanque Salida (Mezcla)',
                                        'tipo': 'TANK',
                                        'contenido': 'Aceite de Oliva' if device_id == 'bombo1' else 'Agua Destilada' if device_id == 'bombo2' else 'Mezcla de Jabón',
                                        'capacidad': 1000.0 if device_id == 'bombo1' else 800.0 if device_id == 'bombo2' else 1500.0,
                                        'volumen_actual': 0,
                                        'unidad': 'L',
                                        'estado': 'ACTIVE',
                                        'seccion': seccion,
                                        'sistema': sistema,
                                    }
                                )
                                tank_updated = ['volumen_actual']
                                tank.volumen_actual = round(tank.capacidad * (float(porcentaje) / 100.0), 2)
                                if tank.seccion is None and seccion is not None:
                                    tank.seccion = seccion
                                    tank_updated.append('seccion')
                                if tank.sistema is None and sistema is not None:
                                    tank.sistema = sistema
                                    tank_updated.append('sistema')
                                tank.save(update_fields=tank_updated)
                            except Exception as ex:
                                logger.error(f"Error actualizando UnidadAlmacenamiento {node_id}: {ex}")
                                
                        # Registrar lectura física en dispositivo sensor de nivel
                        if nivel is not None:
                            try:
                                val = float(nivel)
                                sensor_dev = get_or_create_device(sensor_serie, sensor_nombre, 'SENSOR_NIVEL')
                                LecturaSensor.objects.create(
                                    dispositivo=sensor_dev,
                                    valor=val,
                                    unidad='cm',
                                    calidad='BUENA'
                                )
                            except (ValueError, TypeError):
                                pass
                        return

                    # 3. Procesar tiempo de proceso restante
                    if device_id == 'tiempo_restante' and part5 == 'proceso':
                        horas = payload_dict.get('horas', 0)
                        minutos = payload_dict.get('minutos', 0)
                        total_minutos = int(horas) * 60 + int(minutos)
                        
                        proc_dispo = get_or_create_device('proceso', 'Proceso Mezclador', 'PLC')
                        LecturaSensor.objects.create(
                            dispositivo=proc_dispo,
                            valor=float(total_minutos),
                            unidad='min',
                            calidad='BUENA'
                        )
                        return

                    # 4. Procesar caudalímetros
                    if device_id == 'caudal':
                        # caudal_1 -> sensor-3 (Sensor de Flujo Tubería A)
                        # caudal_2 -> sensor_caudal_02 (Sensor de Flujo Tubería B)
                        caudal_1 = payload_dict.get('caudal_1')
                        caudal_2 = payload_dict.get('caudal_2')
                        
                        if caudal_1 is not None:
                            try:
                                val = float(caudal_1)
                                dev = get_or_create_device('sensor-3', 'Sensor de Flujo Tubería A', 'SENSOR_FLUJO')
                                LecturaSensor.objects.create(
                                    dispositivo=dev,
                                    valor=val,
                                    unidad='L/min',
                                    calidad='BUENA'
                                )
                            except (ValueError, TypeError):
                                pass
                        if caudal_2 is not None:
                            try:
                                val = float(caudal_2)
                                dev = get_or_create_device('sensor_caudal_02', 'Sensor de Flujo Tubería B', 'SENSOR_FLUJO')
                                LecturaSensor.objects.create(
                                    dispositivo=dev,
                                    valor=val,
                                    unidad='L/min',
                                    calidad='BUENA'
                                )
                            except (ValueError, TypeError):
                                pass
                        return

                    # 5. Procesar actuadores (Bombas, Mezclador y Electroválvulas)
                    if device_id == 'electrovalvulas':
                        valvulas_map = {
                            'electrovalvula1': ('electrovalvula-1', 'Válvula Rep. A', 'VALVULA'),
                            'electrovalvula2': ('electrovalvula-2', 'Válvula Rep. B', 'VALVULA')
                        }
                        for var_name, var_value in payload_dict.items():
                            if var_name in valvulas_map:
                                try:
                                    val = float(var_value)
                                    serie, name, cat = valvulas_map[var_name]
                                    dev = get_or_create_device(serie, name, cat)
                                    LecturaSensor.objects.create(
                                        dispositivo=dev,
                                        valor=val,
                                        unidad='',
                                        calidad='BUENA'
                                    )
                                except (ValueError, TypeError):
                                    pass
                        return

                    if device_id == 'bombas':
                        # bomba1 -> pump-1
                        # bomba2 -> pump-2
                        # bomba_mezcla -> bomba_mezcla
                        # bomba_reposicion -> bomba_reposicion
                        bombas_map = {
                            'bomba1': ('bomba1', 'Bomba Principal P1', 'BOMBA'),
                            'pump-1': ('pump-1', 'Bomba Principal P1', 'BOMBA'),
                            'bomba2': ('bomba2', 'Bomba P2', 'BOMBA'),
                            'pump-2': ('pump-2', 'Bomba P2', 'BOMBA'),
                            'bomba_mezcla': ('bomba_mezcla', 'Bomba de Mezcla', 'BOMBA'),
                            'bomba_reposicion': ('bomba_reposicion', 'Bomba de Reposición', 'BOMBA')
                        }
                        for var_name, var_value in payload_dict.items():
                            if var_name in bombas_map:
                                try:
                                    val = float(var_value)
                                    serie, name, cat = bombas_map[var_name]
                                    dev = get_or_create_device(serie, name, cat)
                                    LecturaSensor.objects.create(
                                        dispositivo=dev,
                                        valor=val,
                                        unidad='',
                                        calidad='BUENA'
                                    )
                                except (ValueError, TypeError):
                                    pass
                        return

                    if device_id == 'mezclador':
                        estado = payload_dict.get('estado')
                        if estado is not None:
                            try:
                                val = float(estado)
                                dev = get_or_create_device('mixer-1', 'Mezclador M1', 'MEZCLADORA')
                                LecturaSensor.objects.create(
                                    dispositivo=dev,
                                    valor=val,
                                    unidad='',
                                    calidad='BUENA'
                                )
                            except (ValueError, TypeError):
                                pass
                        return

                    # 6. Procesar cualquier otro dispositivo genérico agrupado
                    dispositivo = get_or_create_device(
                        device_id,
                        f"Auto-detected {device_id}",
                        'MOTOR' if 'motor' in device_id else 'BOMBA' if 'bomba' in device_id else 'VALVULA' if 'valv' in device_id else 'OTRO'
                    )
                    for var_name, var_value in payload_dict.items():
                        try:
                            val = float(var_value)
                        except (ValueError, TypeError):
                            continue
                        
                        LecturaSensor.objects.create(
                            dispositivo=dispositivo,
                            valor=val,
                            unidad=get_unidad_from_variable(var_name),
                            calidad='BUENA'
                        )
                    self.stdout.write(f"[Telemetría SCADA] Tópico '{topic}' -> {payload_dict}")

                elif len(telemetria_parts) == 6:
                    # =========================================================================
                    # FORMATO ANTIGUO (Legacy de 6 niveles con variable plana)
                    # =========================================================================
                    tenant, gateway_id, sector, system, device, variable = telemetria_parts
                    
                    try:
                        try:
                            parsed = json.loads(payload_str)
                            valor_lectura = float(parsed.get('value') or parsed.get('valor') or payload_str)
                        except (json.JSONDecodeError, ValueError, TypeError):
                            valor_lectura = float(payload_str)
                    except ValueError:
                        logger.warning(f"Ignorando lectura no numérica en {topic}: {payload_str}")
                        return
     
                    dispositivo, created = DispositivoSCADA.objects.get_or_create(
                        numero_serie=device,
                        defaults={
                            'nombre': f"Auto-detected {device}",
                            'categoria': get_categoria_from_variable(variable),
                            'estado': 'OFFLINE',
                            'gateway_id': gateway_id,
                            'topic_mqtt': topic,
                            'descripcion': f"Dispositivo detectado automáticamente por telemetría MQTT en el tópico: {topic}"
                        }
                    )
     
                    updated_fields = []
                    if not dispositivo.gateway_id:
                        dispositivo.gateway_id = gateway_id
                        updated_fields.append('gateway_id')
                    if not dispositivo.topic_mqtt:
                        dispositivo.topic_mqtt = topic
                        updated_fields.append('topic_mqtt')
                    
                    dispositivo.ultima_lectura = timezone.now()
                    dispositivo.estado = "ONLINE"
                    updated_fields.extend(['ultima_lectura', 'estado'])
                    dispositivo.save(update_fields=updated_fields)
     
                    LecturaSensor.objects.create(
                        dispositivo=dispositivo,
                        valor=valor_lectura,
                        unidad=get_unidad_from_variable(variable),
                        calidad='BUENA'
                    )
                
                # self.stdout.write(f"[Telemetría] {device} -> {valor_lectura} {get_unidad_from_variable(variable)}")

        except Exception as e:
            logger.error(f"Error procesando mensaje MQTT en el worker: {e}", exc_info=True)
