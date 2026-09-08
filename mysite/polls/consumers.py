import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer

logger = logging.getLogger(__name__)

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
        if text_data:
            try:
                data = json.loads(text_data)
                # Responder a pings si el cliente lo solicita
                if data.get('type') == 'ping':
                    await self.send(text_data=json.dumps({'type': 'pong'}))
            except Exception as e:
                logger.error(f"Error procesando mensaje recibido en WS SCADA: {e}")

    async def scada_update(self, event):
        """Disparado cuando se recibe una actualización de telemetría MQTT o cambio de estado SCADA."""
        payload = event.get('data', {})
        await self.send(text_data=json.dumps(payload))
