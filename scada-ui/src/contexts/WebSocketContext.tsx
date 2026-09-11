import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import apiFetch from "@/lib/api";

export interface ScadaCommandOptions {
  action: string;
  payload: any;
  fallbackHttp?: {
    endpoint: string;
    method?: "POST" | "PUT" | "GET" | "PATCH";
    body?: any;
  };
}

export interface CommandResult {
  ok: boolean;
  source: "websocket" | "http";
  data?: any;
  error?: string;
  cmd_id?: string;
}

interface WebSocketContextType {
  isConnected: boolean;
  status: "connected" | "connecting" | "disconnected";
  lastMessage: any;
  sendScadaCommand: (options: ScadaCommandOptions) => Promise<CommandResult>;
  subscribe: (listener: (data: any) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [status, setStatus] = useState<"connected" | "connecting" | "disconnected">("disconnected");
  const [lastMessage, setLastMessage] = useState<any>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const listenersRef = useRef<Set<(data: any) => void>>(new Set());
  const reconnectAttemptsRef = useRef<number>(0);

  const getWebSocketUrl = useCallback((): string => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const hostname = window.location.hostname || "localhost";
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

    let wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl) {
      if (isLocalhost) {
        const wsPort = import.meta.env.VITE_WS_PORT || "8000";
        wsUrl = `${protocol}//${hostname}:${wsPort}/ws/scada/`;
      } else {
        // En túneles ngrok o producción HTTPS, se usa el mismo host sin puerto extra
        wsUrl = `${protocol}//${window.location.host}/ws/scada/`;
      }
    }
    return wsUrl;
  }, []);

  const connect = useCallback(() => {
    // Si ya existe una conexión activa o conectándose, no duplicar
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      setStatus("connecting");
      const url = getWebSocketUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setStatus("connected");
        reconnectAttemptsRef.current = 0;
        console.log("[WebSocket SCADA Singleton] Conectado exitosamente a:", url);

        // Iniciar Heartbeat Ping cada 25 segundos para mantener el túnel ngrok despierto
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === "pong") return; // Heartbeat ack interno

          setLastMessage(parsed);
          // Notificar a todos los suscriptores activos
          listenersRef.current.forEach((listener) => {
            try {
              listener(parsed);
            } catch (e) {
              console.warn("[WebSocket Listener Error]:", e);
            }
          });
        } catch (e) {
          console.warn("[WebSocket Parse Error]:", event.data);
        }
      };

      ws.onerror = (err) => {
        console.warn("[WebSocket Error]:", err);
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        setStatus("disconnected");
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

        // Reconexión con retroceso exponencial (1s, 2s, 4s... máx 10s)
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 10000);
        reconnectAttemptsRef.current += 1;
        console.log(`[WebSocket SCADA] Desconectado (${event.reason || "cierre"}). Reconectando en ${Math.round(delay)}ms...`);

        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      };
    } catch (err) {
      console.error("[WebSocket Init Error]:", err);
      setIsConnected(false);
      setStatus("disconnected");
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 4000);
    }
  }, [getWebSocketUrl]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Suscribirse a eventos sin crear nuevas conexiones TCP
  const subscribe = useCallback((listener: (data: any) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  // Envío ultra-rápido de comandos por WebSocket con Fallback automático a HTTP
  const sendScadaCommand = useCallback(
    async (options: ScadaCommandOptions): Promise<CommandResult> => {
      const { action, payload, fallbackHttp } = options;
      const cmd_id = `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      // 1. Intentar envío instantáneo por WebSocket si está abierto
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          const message = JSON.stringify({
            type: "command",
            cmd_id,
            action,
            payload,
          });
          wsRef.current.send(message);
          console.log(`[WebSocket Command Sent] ${action} (cmd_id: ${cmd_id})`);
          return { ok: true, source: "websocket", cmd_id };
        } catch (err: any) {
          console.warn("[WebSocket Send Error, aplicando fallback HTTP]:", err);
        }
      }

      // 2. Si el socket no está disponible, aplicar fallback a HTTP REST
      if (fallbackHttp && fallbackHttp.endpoint) {
        console.warn(`[Fallback HTTP Triggered] Enviando comando '${action}' vía REST`);
        try {
          const bodyPayload = fallbackHttp.body !== undefined ? fallbackHttp.body : payload;
          const res = await apiFetch(fallbackHttp.endpoint, {
            method: fallbackHttp.method || "POST",
            headers: { "Content-Type": "application/json" },
            body: typeof bodyPayload === "string" ? bodyPayload : JSON.stringify(bodyPayload),
          });

          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            return { ok: true, source: "http", data, cmd_id };
          } else {
            const errData = await res.json().catch(() => ({}));
            return {
              ok: false,
              source: "http",
              error: errData.error || errData.detail || res.statusText,
              cmd_id,
            };
          }
        } catch (httpErr: any) {
          return {
            ok: false,
            source: "http",
            error: httpErr.message || "Error al conectar con la API SCADA",
            cmd_id,
          };
        }
      }

      return {
        ok: false,
        source: "websocket",
        error: "El WebSocket se encuentra reconectando y no se definió ruta de respaldo.",
        cmd_id,
      };
    },
    []
  );

  return (
    <WebSocketContext.Provider
      value={{
        isConnected,
        status,
        lastMessage,
        sendScadaCommand,
        subscribe,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocketContext debe utilizarse dentro de un <WebSocketProvider>");
  }
  return context;
};
