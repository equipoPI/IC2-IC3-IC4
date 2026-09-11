import { useEffect, useRef, useState, useCallback } from 'react';

interface UseScadaWebSocketOptions {
  onMessage?: (data: any) => void;
  enabled?: boolean;
}

export function useScadaWebSocket(options: UseScadaWebSocketOptions = {}) {
  const { onMessage, enabled = true } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onMessageRef = useRef(onMessage);

  // Keep latest onMessage ref to avoid unnecessary socket reconnections
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (!enabled) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const hostname = window.location.hostname || 'localhost';
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
      
      let wsUrl = import.meta.env.VITE_WS_URL;
      if (!wsUrl) {
        if (isLocalhost) {
          const wsPort = import.meta.env.VITE_WS_PORT || '8000';
          wsUrl = `${protocol}//${hostname}:${wsPort}/ws/scada/`;
        } else {
          wsUrl = `${protocol}//${window.location.host}/ws/scada/`;
        }
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('[SCADA WebSocket] Conectado exitosamente:', wsUrl);
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setLastMessage(parsed);
          if (onMessageRef.current) {
            onMessageRef.current(parsed);
          }
        } catch (e) {
          console.warn('[SCADA WebSocket] Error al parsear mensaje:', event.data);
        }
      };

      ws.onerror = (err) => {
        console.warn('[SCADA WebSocket] Error de conexión:', err);
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        console.log('[SCADA WebSocket] Conexión cerrada. Reconectando en 3s...', event.reason);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };
    } catch (err) {
      console.error('[SCADA WebSocket] Error al inicializar socket:', err);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    }
  }, [enabled]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect loop on unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected, lastMessage };
}
