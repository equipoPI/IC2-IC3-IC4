import { useEffect, useRef } from 'react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';

interface UseScadaWebSocketOptions {
  onMessage?: (data: any) => void;
  enabled?: boolean;
}

export function useScadaWebSocket(options: UseScadaWebSocketOptions = {}) {
  const { onMessage, enabled = true } = options;
  const { isConnected, status, lastMessage, sendScadaCommand, subscribe } = useWebSocketContext();
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = subscribe((data) => {
      if (onMessageRef.current) {
        onMessageRef.current(data);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [enabled, subscribe]);

  return {
    isConnected,
    status,
    lastMessage,
    sendScadaCommand,
  };
}

export { useWebSocketContext };
export type { ScadaCommandOptions, CommandResult } from '@/contexts/WebSocketContext';
