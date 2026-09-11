import json
import logging
import time
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
from django.db.models import Q
from .models import RegistroAuditoria, DispositivoSCADA

logger = logging.getLogger('scada')

@database_sync_to_async
def _save_audit_log(accion, modulo, objeto, descripcion, datos, ip='127.0.0.1'):
    try:
        RegistroAuditoria.objects.create(
            accion=accion,
            modulo=modulo,
            objeto=objeto,
            descripcion=descripcion,
            datos=datos,
            ip_origen=ip
        )
    except Exception as e:
        logger.error(f"Error guardando auditoria en WS: {e}")

@database_sync_to_async
def _resolve_device_target(dispositivo_id):
    try:
        if not dispositivo_id:
            return None
        query = Q(id=int(dispositivo_id)) if str(dispositivo_id).isdigit() else Q(numero_serie=str(dispositivo_id))
        disp = DispositivoSCADA.objects.select_related('seccion__fabrica', 'sistema').filter(query).first()
        if disp:
            raw_tenant = disp.seccion.fabrica.nombre if (disp.seccion and disp.seccion.fabrica) else "rafaela_sa"
            tenant = raw_tenant.lower().replace('.', '').replace(' ', '_').replace('-', '_').strip()
            gateway = (disp.gateway_id or 'd83add60dbb0').lower().replace(' ', '_').strip()
            seccion = (disp.seccion.nombre if disp.seccion else 'a1').lower().replace(' ', '_').strip()
            sistema = (disp.sistema.nombre if disp.sistema else 'linea_mezclado_1').lower().replace(' ', '_').strip()
            return {
                'id': disp.id,
                'serie': disp.numero_serie,
                'nombre': disp.nombre,
                'tenant': tenant,
                'gateway': gateway,
                'seccion': seccion,
                'sistema': sistema,
                'topic_base': f"{tenant}/{gateway}/{seccion}/{sistema}"
            }
    except Exception as e:
        logger.warning(f"Error resolviendo dispositivo en WS: {e}")
    return None

class SCADAConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_group_name = 'scada_telemetry'
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()
        logger.info(f"WebSocket SCADA conectado: channel={self.channel_name}")

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        logger.info(f"WebSocket SCADA desconectado (code={close_code}): channel={self.channel_name}")

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return
        try:
            data = json.loads(text_data)
        except Exception as e:
            logger.error(f"Error parseando JSON recibido en WS SCADA: {e}")
            return

        msg_type = data.get('type')
        if msg_type == 'ping':
            await self.send(text_data=json.dumps({'type': 'pong', 'timestamp': time.time()}))
            return

        if msg_type == 'command':
            action = data.get('action', '')
            payload = data.get('payload', {})
            cmd_id = data.get('cmd_id') or f"cmd-{int(time.time() * 1000)}"

            from .views import _publish_mqtt_single

            # Tópico base por defecto para el tenant principal
            tenant = "rafaela_sa"
            gateway = "d83add60dbb0"
            seccion = "a1"
            sistema = "linea_mezclado_1"
            topic_base = f"{tenant}/{gateway}/{seccion}/{sistema}"

            # Si se proporcionó dispositivo_id, resolver dinámicamente
            dev_id = payload.get('dispositivo_id')
            if dev_id:
                dev_info = await _resolve_device_target(dev_id)
                if dev_info:
                    topic_base = dev_info['topic_base']

            target_topic = payload.get('topico')
            publish_data = {}

            if action == 'transmitir':
                target_topic = payload.get('topico') or f"{topic_base}/comandos/control"
                raw_p = payload.get('payload', {})
                if isinstance(raw_p, str):
                    try:
                        publish_data = json.loads(raw_p)
                    except Exception:
                        publish_data = raw_p
                else:
                    publish_data = raw_p
            elif action == 'reposicion':
                target_topic = f"{topic_base}/reposicion"
                freno = payload.get('freno', False)
                if freno:
                    publish_data = {"freno": True, "accion": "frenar", "comando": "frenar"}
                    _publish_mqtt_single(f"{topic_base}/freno_reposicion", publish_data, "ws-freno")
                    _publish_mqtt_single(f"{topic_base}/comandos/control", {"accion": "frenar", "comando": "frenar"}, "ws-cmd-freno")
                else:
                    bombo = int(payload.get('bombo', 1))
                    limite = int(payload.get('limite_porcentaje', payload.get('limite', 80)))
                    publish_data = {"bombo": bombo, "limite_porcentaje": limite}
            elif action == 'control':
                target_topic = payload.get('topico') or f"{topic_base}/comandos/control"
                comando = payload.get('comando') or payload.get('accion')
                publish_data = {"comando": comando}
                if dev_id:
                    publish_data['dispositivo'] = dev_id
            elif action == 'receta':
                target_topic = payload.get('topico') or f"{topic_base}/receta"
                publish_data = payload
            else:
                target_topic = payload.get('topico') or f"{topic_base}/comandos/control"
                publish_data = payload

            # 🚀 Despacho instantáneo al broker MQTT (< 5ms)
            if target_topic:
                _publish_mqtt_single(target_topic, publish_data, f"ws-{action}")

            # ⚡ Respuesta ACK inmediata al cliente
            ack_msg = {
                'type': 'command_ack',
                'cmd_id': cmd_id,
                'action': action,
                'status': 'ok',
                'topic': target_topic,
                'payload': publish_data,
                'timestamp': time.time()
            }
            await self.send(text_data=json.dumps(ack_msg))

            # 📢 Broadcast a todos los navegadores conectados para actualizar la UI en vivo
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'scada_update',
                    'data': {
                        'type': 'command_executed',
                        'action': action,
                        'topico': target_topic,
                        'payload': publish_data,
                        'origen': payload.get('origen') or f"WebSocket SCADA ({action})",
                        'timestamp': timezone.now().isoformat()
                    }
                }
            )

            # 📝 Auditoría asíncrona no bloqueante
            await _save_audit_log(
                accion=f"WS_{action.upper()}",
                modulo="SCADA_WEBSOCKET",
                objeto=str(target_topic),
                descripcion=f"Comando WebSocket '{action}' publicado en '{target_topic}'",
                datos={
                    'cmd_id': cmd_id,
                    'topico': target_topic,
                    'payload': publish_data,
                    'input': payload
                }
            )

    async def scada_update(self, event):
        """Disparado cuando se recibe una actualización de telemetría MQTT o cambio de estado SCADA."""
        payload = event.get('data', {})
        await self.send(text_data=json.dumps(payload))
