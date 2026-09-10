import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import TankNode from './nodes/TankNode';
import PumpNode from './nodes/PumpNode';
import ValveNode from './nodes/ValveNode';
import MixerNode from './nodes/MixerNode';
import SensorNode from './nodes/SensorNode';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import apiFetch from '@/lib/api';
import { Save, RotateCcw, BoxSelect, Cpu, Layers, AlertCircle } from 'lucide-react';
import { useScadaWebSocket } from '@/hooks/useScadaWebSocket';


const nodeTypes = {
  tank: TankNode,
  pump: PumpNode,
  valve: ValveNode,
  mixer: MixerNode,
  sensor: SensorNode,
};

export const machineDefinitions: Record<string, { label: string; connectedNodes?: string[] }> = {
  'tank-1': { label: 'Tanque A', connectedNodes: ['electrovalvula-1', 'pump-1'] },
  'tank-2': { label: 'Tanque B', connectedNodes: ['electrovalvula-2', 'pump-2'] },
  'electrovalvula-1': { label: 'Válvula Rep. A', connectedNodes: ['bomba_reposicion', 'tank-1'] },
  'electrovalvula-2': { label: 'Válvula Rep. B', connectedNodes: ['bomba_reposicion', 'tank-2'] },
  'bomba_reposicion': { label: 'Bomba Reposición', connectedNodes: ['electrovalvula-1', 'electrovalvula-2'] },
  'pump-1': { label: 'Bomba A', connectedNodes: ['tank-1', 'sensor-3'] },
  'pump-2': { label: 'Bomba B', connectedNodes: ['tank-2', 'sensor_caudal_02'] },
  'sensor-3': { label: 'Caudalímetro 1', connectedNodes: ['pump-1', 'mixer-1'] },
  'sensor_caudal_02': { label: 'Caudalímetro 2', connectedNodes: ['pump-2', 'mixer-1'] },
  'mixer-1': { label: 'Mezclador M1', connectedNodes: ['sensor-3', 'sensor_caudal_02', 'bomba_mezcla'] },
  'bomba_mezcla': { label: 'Bomba de Mezcla', connectedNodes: ['mixer-1', 'tank-3'] },
  'tank-3': { label: 'Tanque Salida', connectedNodes: ['bomba_mezcla'] },
};

const isDeviceActive = (dev: any) => {
  if (!dev) return false;
  const val = dev.valor_lectura;
  return val === 1 || val === 1.0 || String(val) === "1" || String(val) === "1.0" || String(val).toLowerCase() === "true" || String(val).toLowerCase() === "open" || String(val).toLowerCase() === "running" || (typeof val === 'number' && val > 0);
};

export const getCanonicalNodeId = (item: any): string => {
  const s = String(item.node_id || item.numero_serie || item.id || '').toLowerCase();
  if (s === 'bomba1' || s === 'pump-1') return 'pump-1';
  if (s === 'bomba2' || s === 'pump-2') return 'pump-2';
  if (s === 'mixer-1' || s.includes('mezclador') || s.includes('mixer')) return 'mixer-1';
  if (s === 'bomba_mezcla' || s.includes('bomba_mezcla')) return 'bomba_mezcla';
  if (s === 'bomba_reposicion' || s.includes('bomba_reposicion') || s.includes('reposicion')) return 'bomba_reposicion';
  if (s === 'electrovalvula-1' || s === 'electrovalvula1') return 'electrovalvula-1';
  if (s === 'electrovalvula-2' || s === 'electrovalvula2') return 'electrovalvula-2';
  if (s === 'sensor-3' || s === 'caudal1' || s.includes('flujo_a')) return 'sensor-3';
  if (s === 'sensor_caudal_02' || s === 'caudal2' || s.includes('flujo_b')) return 'sensor_caudal_02';
  if (s === 'tank-1' || s.includes('bombo1')) return 'tank-1';
  if (s === 'tank-2' || s.includes('bombo2')) return 'tank-2';
  if (s === 'tank-3' || s.includes('mezcla')) return 'tank-3';
  return item.node_id || item.numero_serie || `dev_${item.id}`;
};

interface ScadaFlowDiagramProps {
  selectedView?: string;
  selectedPlanta: string;
  selectedSeccion: string;
  selectedSistema: string;
  secciones?: any[];
  sistemas?: any[];
  plantas?: any[];
}

const ScadaFlowDiagram = ({
  selectedPlanta,
  selectedSeccion,
  selectedSistema,
  secciones = [],
  sistemas = [],
  plantas = []
}: ScadaFlowDiagramProps) => {
  const [dispositivos, setDispositivos] = useState<any[]>([]);
  const [unidadesAlmacenamiento, setUnidadesAlmacenamiento] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Layout storage key per system selection
  const storageKey = `scada_layout_${selectedSistema || 'global'}_sec_${selectedSeccion || 'all'}_pl_${selectedPlanta || 'all'}`;

  // Fetch real dispositivos (/sensores) and unidades de almacenamiento (/almacenamiento)
  const loadData = async () => {
    try {
      const [rDisp, rUnidades] = await Promise.all([
        apiFetch("/api/v1/dispositivos/"),
        apiFetch("/api/v1/unidades-almacenamiento/")
      ]);

      if (rDisp.ok) {
        const data = await rDisp.json();
        setDispositivos(Array.isArray(data) ? data : data.results || []);
      }
      if (rUnidades.ok) {
        const data = await rUnidades.json();
        setUnidadesAlmacenamiento(Array.isArray(data) ? data : data.results || []);
      }
    } catch (e) {
      console.warn("Error cargando dispositivos para SCADA:", e);
    } finally {
      setLoading(false);
    }
  };

  useScadaWebSocket({
    onMessage: () => {
      if (document.visibilityState === 'visible' && selectedSistema !== 'seleccionar') {
        loadData();
      }
    }
  });

  useEffect(() => {
    loadData();
    // Fallback secundario de respaldo cada 15s en caso de microcorte WS
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && selectedSistema !== 'seleccionar') {
        loadData();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedSistema]);


  // Filter dispositivos based strictly on selected planta, sección, and sistema
  const filteredDispositivos = useMemo(() => {
    if (selectedPlanta === 'seleccionar' || selectedSeccion === 'seleccionar' || selectedSistema === 'seleccionar') {
      return [];
    }
    return dispositivos.filter(d => {
      if (selectedPlanta !== 'seleccionar') {
        const seccionObj = secciones.find(s => String(s.id) === String(d.seccion));
        if (seccionObj && String(seccionObj.fabrica) !== selectedPlanta) {
          return false;
        }
      }
      if (selectedSeccion !== 'seleccionar') {
        if (String(d.seccion) !== selectedSeccion) {
          return false;
        }
      }
      if (selectedSistema !== 'seleccionar') {
        if (String(d.sistema) !== selectedSistema) {
          return false;
        }
      }
      return true;
    });
  }, [dispositivos, selectedPlanta, selectedSeccion, selectedSistema, secciones]);

  // Filter unidades de almacenamiento based on selected planta / seccion
  const filteredUnidades = useMemo(() => {
    if (selectedPlanta === 'seleccionar' || selectedSeccion === 'seleccionar' || selectedSistema === 'seleccionar') {
      return [];
    }
    return unidadesAlmacenamiento.filter(u => {
      if (selectedSistema !== 'seleccionar' && u.sistema && String(u.sistema) !== selectedSistema) {
        return false;
      }
      if (selectedSeccion !== 'seleccionar' && u.seccion && String(u.seccion) !== selectedSeccion) {
        return false;
      }
      return true;
    });
  }, [unidadesAlmacenamiento, selectedPlanta, selectedSeccion, selectedSistema]);

  const isSelectionIncomplete = selectedPlanta === 'seleccionar' || selectedSeccion === 'seleccionar' || selectedSistema === 'seleccionar';

  // Generate ReactFlow Nodes from registered devices and storage units
  const initialNodes = useMemo(() => {
    const nodesList: Node[] = [];
    let gridX = 50;
    let gridY = 80;
    const colWidth = 180;
    const rowHeight = 160;
    const maxCols = 5;
    let count = 0;

    // 1. Map Unidades de Almacenamiento (/almacenamiento)
    filteredUnidades.forEach((unit) => {
      const col = count % maxCols;
      const row = Math.floor(count / maxCols);
      const defaultX = gridX + col * colWidth;
      const defaultY = gridY + row * rowHeight;
      count++;

      nodesList.push({
        id: `unit_${unit.id}`,
        type: 'tank',
        position: { x: defaultX, y: defaultY },
        data: {
          label: `${unit.nombre} (${unit.contenido || 'Sin Contenido'})`,
          level: unit.capacidad ? Math.round(((unit.volumen_actual || 0) / unit.capacidad) * 100) : 50,
          temperature: unit.temperatura || 25,
          capacity: unit.capacidad || 1000,
          unit: unit.unidad || 'L',
          status: (unit.estado || 'ACTIVE').toLowerCase(),
          content: unit.contenido || 'Materia Prima',
          node_id: unit.node_id
        }
      });
    });

    // 2. Map Dispositivos SCADA (/sensores)
    filteredDispositivos.forEach((dev) => {
      const col = count % maxCols;
      const row = Math.floor(count / maxCols);
      const defaultX = gridX + col * colWidth;
      const defaultY = gridY + row * rowHeight;
      count++;

      const isAct = isDeviceActive(dev);
      const cat = (dev.categoria || '').toUpperCase();
      let nodeType: 'pump' | 'valve' | 'mixer' | 'sensor' = 'sensor';

      if (cat === 'BOMBA') nodeType = 'pump';
      else if (cat === 'VALVULA') nodeType = 'valve';
      else if (cat === 'MEZCLADORA') nodeType = 'mixer';
      else nodeType = 'sensor';

      let nodeData: any = { 
        label: dev.nombre || dev.numero_serie,
        numero_serie: dev.numero_serie 
      };

      if (nodeType === 'pump') {
        nodeData = {
          ...nodeData,
          isRunning: isAct,
          rpm: isAct ? 1450 : 0,
          power: isAct ? 75 : 0,
        };
      } else if (nodeType === 'valve') {
        nodeData = {
          ...nodeData,
          isOpen: isAct,
          flowRate: isAct ? 12.5 : 0,
        };
      } else if (nodeType === 'mixer') {
        nodeData = {
          ...nodeData,
          isRunning: isAct,
          speed: isAct ? 120 : 0,
          temperature: 25,
        };
      } else {
        const val = dev.valor_lectura !== null ? Number(dev.valor_lectura) : 0;
        const devName = (dev.nombre || dev.numero_serie || '').toLowerCase();
        const devType = (dev.tipo_sensor || '').toLowerCase();

        let sensorType: 'temperature' | 'pressure' | 'flow' | 'level' = 'flow';
        let unit = dev.unidad_medida;

        if (devName.includes('nivel') || devName.includes('level') || devType.includes('nivel') || devType.includes('level') || devName.includes('bombo')) {
          sensorType = 'level';
          unit = 'cm';
        } else if (devName.includes('temp') || devType.includes('temp')) {
          sensorType = 'temperature';
          unit = unit || '°C';
        } else if (devName.includes('presi') || devType.includes('presi')) {
          sensorType = 'pressure';
          unit = unit || 'bar';
        } else {
          sensorType = 'flow';
          unit = 'L';
        }

        nodeData = {
          ...nodeData,
          value: val,
          unit: unit,
          type: sensorType,
          status: val > 0 ? 'normal' : 'warning',
        };
      }

      nodesList.push({
        id: `dev_${dev.id}_${dev.numero_serie}`,
        type: nodeType,
        position: { x: defaultX, y: defaultY },
        data: nodeData,
      });
    });

    // Default P&ID diagram layout if no specific custom nodes match
    if (nodesList.length === 0) {
      return [
        { id: 'bomba_reposicion', type: 'pump', position: { x: 50, y: 220 }, data: { label: 'Bomba Reposición', isRunning: false, rpm: 0, power: 0 } },
        { id: 'electrovalvula-1', type: 'valve', position: { x: 180, y: 70 }, data: { label: 'Válvula Rep. A', isOpen: false, flowRate: 0 } },
        { id: 'electrovalvula-2', type: 'valve', position: { x: 180, y: 370 }, data: { label: 'Válvula Rep. B', isOpen: false, flowRate: 0 } },
        { id: 'tank-1', type: 'tank', position: { x: 300, y: 50 }, data: { label: 'Tanque A', level: 75, temperature: 25, capacity: 1000, unit: 'L', status: 'active' } },
        { id: 'tank-2', type: 'tank', position: { x: 300, y: 350 }, data: { label: 'Tanque B', level: 45, temperature: 30, capacity: 800, unit: 'L', status: 'active' } },
        { id: 'pump-1', type: 'pump', position: { x: 460, y: 80 }, data: { label: 'Bomba A', isRunning: false, rpm: 0, power: 0 } },
        { id: 'pump-2', type: 'pump', position: { x: 460, y: 380 }, data: { label: 'Bomba B', isRunning: false, rpm: 0, power: 0 } },
        { id: 'sensor-3', type: 'sensor', position: { x: 580, y: 80 }, data: { label: 'Caudalímetro 1', value: 0.0, unit: 'L', type: 'flow', status: 'normal' } },
        { id: 'sensor_caudal_02', type: 'sensor', position: { x: 580, y: 380 }, data: { label: 'Caudalímetro 2', value: 0.0, unit: 'L', type: 'flow', status: 'normal' } },
        { id: 'mixer-1', type: 'mixer', position: { x: 720, y: 200 }, data: { label: 'Mezclador M1', isRunning: false, speed: 0, temperature: 25 } },
        { id: 'tank-3', type: 'tank', position: { x: 860, y: 200 }, data: { label: 'Tanque Salida', level: 30, temperature: 25, capacity: 1500, unit: 'L', status: 'active' } },
        { id: 'bomba_mezcla', type: 'pump', position: { x: 990, y: 220 }, data: { label: 'Bomba de Mezcla', isRunning: false, rpm: 0, power: 0 } },
      ];
    }

    return nodesList;
  }, [filteredDispositivos, filteredUnidades, selectedPlanta, selectedSeccion, selectedSistema]);

  // Initial edges template
  const defaultInitialEdges = useMemo(() => {
    return [
      { id: 'e-repo-1', source: 'bomba_reposicion', target: 'electrovalvula-1', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-repo-2', source: 'bomba_reposicion', target: 'electrovalvula-2', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-valv-1', source: 'electrovalvula-1', target: 'tank-1', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-valv-2', source: 'electrovalvula-2', target: 'tank-2', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-tank-1', source: 'tank-1', target: 'pump-1', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-pump-1', source: 'pump-1', target: 'sensor-3', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-flow-1', source: 'sensor-3', target: 'mixer-1', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-tank-2', source: 'tank-2', target: 'pump-2', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-pump-2', source: 'pump-2', target: 'sensor_caudal_02', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-flow-2', source: 'sensor_caudal_02', target: 'mixer-1', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-mix-1', source: 'mixer-1', target: 'tank-3', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-mix-2', source: 'tank-3', target: 'bomba_mezcla', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
    ];
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Helper para cargar layout del backend PostgreSQL
  const loadBackendLayout = async (sistemaId: string) => {
    if (!sistemaId || sistemaId === 'todas' || sistemaId === 'seleccionar') return null;
    try {
      const resp = await apiFetch(`/api/v1/sistemas/${sistemaId}/`);
      if (resp.ok) {
        const sys = await resp.json();
        if (sys.diagrama_layout_json) {
          const parsed = typeof sys.diagrama_layout_json === 'string'
            ? JSON.parse(sys.diagrama_layout_json)
            : sys.diagrama_layout_json;
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Error leyendo layout de PostgreSQL backend:", e);
    }
    return null;
  };

  // Helper para guardar layout en backend PostgreSQL
  const saveBackendLayout = async (sistemaId: string, layoutData: any): Promise<boolean> => {
    if (!sistemaId || sistemaId === 'todas' || sistemaId === 'seleccionar') return false;
    try {
      const resp = await apiFetch(`/api/v1/sistemas/${sistemaId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagrama_layout_json: JSON.stringify(layoutData)
        })
      });
      return resp.ok;
    } catch (e) {
      console.warn("Error guardando layout en PostgreSQL backend:", e);
      return false;
    }
  };

  // Cargar layout (prioridad: PostgreSQL DB central -> fallback a localStorage)
  useEffect(() => {
    let isMounted = true;

    const initLayout = async () => {
      let cachedPositions: Record<string, { x: number; y: number }> = {};
      let cachedEdges: Edge[] = defaultInitialEdges;
      let loadedFromDb = false;

      // 1. Intentar cargar desde backend PostgreSQL si hay sistema seleccionado
      if (selectedSistema && selectedSistema !== 'todas' && selectedSistema !== 'seleccionar') {
        const dbLayout = await loadBackendLayout(selectedSistema);
        if (dbLayout) {
          if (dbLayout.positions) cachedPositions = dbLayout.positions;
          if (dbLayout.edges && Array.isArray(dbLayout.edges)) cachedEdges = dbLayout.edges;
          loadedFromDb = true;
        }
      }

      // 2. Fallback a localStorage si no hay layout guardado en BD
      if (!loadedFromDb) {
        try {
          const cached = localStorage.getItem(storageKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.positions) cachedPositions = parsed.positions;
            if (parsed.edges && Array.isArray(parsed.edges)) cachedEdges = parsed.edges;
          }
        } catch (e) {
          console.warn("Error leyendo diagramas de localStorage:", e);
        }
      }

      if (!isMounted) return;

      const loadedNodes = initialNodes.map(node => {
        const savedPos = cachedPositions[node.id] ||
                         (node.data?.node_id && cachedPositions[node.data.node_id]) ||
                         (node.data?.numero_serie && cachedPositions[node.data.numero_serie]) ||
                         node.position;
        return {
          ...node,
          position: savedPos
        };
      });

      setNodes(loadedNodes);
      setEdges(cachedEdges);
    };

    initLayout();
    return () => { isMounted = false; };
  }, [storageKey, selectedSistema, initialNodes.length]);

  // Merge updated device telemetry into existing nodes WITHOUT resetting node positions!
  useEffect(() => {
    setNodes(prevNodes => {
      let cachedPositions: Record<string, { x: number; y: number }> = {};
      try {
        const cached = localStorage.getItem(storageKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.positions) cachedPositions = parsed.positions;
        }
      } catch (e) {}

      const hasRealInitialNodes = initialNodes.some(n => n.id.startsWith('dev_') || n.id.startsWith('unit_'));
      const prevHasFallbackNodes = prevNodes.some(n => !n.id.startsWith('dev_') && !n.id.startsWith('unit_'));

      let baseNodes = prevNodes;
      if (hasRealInitialNodes && prevHasFallbackNodes) {
        baseNodes = initialNodes.map(node => {
          const savedPos = cachedPositions[node.id] ||
                           (node.data?.node_id && cachedPositions[node.data.node_id]) ||
                           (node.data?.numero_serie && cachedPositions[node.data.numero_serie]) ||
                           node.position;
          return {
            ...node,
            position: savedPos
          };
        });
      }

      if (baseNodes.length === 0) {
        return initialNodes.map(node => ({
          ...node,
          position: cachedPositions[node.id] || node.position
        }));
      }

      const freshMap = new Map(initialNodes.map(n => [n.id, n]));

      // Keep existing nodes, update data, keep prev.position intact!
      const updatedNodes = baseNodes.map(prev => {
        const fresh = freshMap.get(prev.id);
        if (!fresh) return prev;
        return {
          ...prev,
          data: fresh.data // Keep user position intact!
        };
      });

      // Add any newly registered nodes that weren't in prevNodes
      const prevIds = new Set(baseNodes.map(p => p.id));
      initialNodes.forEach(fresh => {
        if (!prevIds.has(fresh.id)) {
          updatedNodes.push({
            ...fresh,
            position: cachedPositions[fresh.id] || fresh.position
          });
        }
      });

      return updatedNodes;
    });
  }, [initialNodes, storageKey]);

  // Animar tuberías y flujo dinámico según el estado de bombas, mezclador y válvulas
  useEffect(() => {
    const activeMap = new Map<string, boolean>();
    nodes.forEach(n => {
      const isRunning = Boolean(
        n.data?.isRunning ||
        n.data?.isOpen ||
        (n.data?.type === 'flow' && Number(n.data?.value) > 0)
      );
      activeMap.set(n.id, isRunning);
      if (n.data?.numero_serie) {
        activeMap.set(n.data.numero_serie, isRunning);
      }
      if (n.id.startsWith('dev_')) {
        const raw = n.id.replace('dev_', '').split('_')[0];
        activeMap.set(raw, isRunning);
      }
    });

    setEdges(prevEdges => {
      if (!prevEdges || prevEdges.length === 0) return prevEdges;
      let hasChanges = false;
      const updated = prevEdges.map(edge => {
        const sourceActive = activeMap.get(edge.source) || false;
        const targetActive = activeMap.get(edge.target) || false;
        const isActive = sourceActive || targetActive;

        if (edge.animated !== isActive) {
          hasChanges = true;
        }

        return {
          ...edge,
          animated: isActive,
          style: {
            ...edge.style,
            stroke: isActive ? '#06b6d4' : (edge.style?.stroke || 'hsl(var(--primary))'),
            strokeWidth: isActive ? 3 : (edge.style?.strokeWidth || 2),
            filter: isActive ? 'drop-shadow(0 0 6px rgba(6,182,212,0.8))' : 'none'
          }
        };
      });
      return hasChanges ? updated : prevEdges;
    });
  }, [nodes]);

  // Handle drag stop to auto-persist node positions
  const onNodeDragStop = useCallback((_: any, node: Node) => {
    try {
      setNodes(prev => {
        const updated = prev.map(n => n.id === node.id ? { ...n, position: node.position } : n);
        const positions: Record<string, { x: number; y: number }> = {};
        updated.forEach(n => {
          positions[n.id] = n.position;
        });

        const cached = localStorage.getItem(storageKey);
        const layout = cached ? JSON.parse(cached) : {};
        const dataToSave = {
          ...layout,
          positions,
          edges,
          saved_at: new Date().toISOString()
        };

        localStorage.setItem(storageKey, JSON.stringify(dataToSave));
        if (selectedSistema && selectedSistema !== 'todas' && selectedSistema !== 'seleccionar') {
          saveBackendLayout(selectedSistema, dataToSave);
        }
        return updated;
      });
    } catch (e) {
      console.warn("Error guardando posición de nodo:", e);
    }
  }, [storageKey, edges, selectedSistema]);

  // Connect edges interactively by dragging connection lines
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const updated = addEdge({ ...params, animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } }, eds);
        try {
          const cached = localStorage.getItem(storageKey);
          const layout = cached ? JSON.parse(cached) : {};
          const dataToSave = { ...layout, edges: updated };
          localStorage.setItem(storageKey, JSON.stringify(dataToSave));
          if (selectedSistema && selectedSistema !== 'todas' && selectedSistema !== 'seleccionar') {
            saveBackendLayout(selectedSistema, dataToSave);
          }
        } catch (e) {}
        return updated;
      });
    },
    [setEdges, storageKey, selectedSistema]
  );

  // Save current node positions and connection edges for this system
  const handleSaveDiagram = async () => {
    const positions: Record<string, { x: number; y: number }> = {};
    nodes.forEach(n => {
      positions[n.id] = n.position;
    });

    const dataToSave = {
      positions,
      edges,
      saved_at: new Date().toISOString()
    };

    localStorage.setItem(storageKey, JSON.stringify(dataToSave));

    let targetSysId = selectedSistema;
    if ((!targetSysId || targetSysId === 'todas' || targetSysId === 'seleccionar') && sistemas.length > 0) {
      targetSysId = String(sistemas[0].id);
    }

    if (targetSysId && targetSysId !== 'todas' && targetSysId !== 'seleccionar') {
      const ok = await saveBackendLayout(targetSysId, dataToSave);
      if (ok) {
        toast({
          title: "✅ Diagrama Guardado en Servidor (Centralizado)",
          description: `La distribución y conexiones de ${nodes.length} componentes se guardaron en la base de datos PostgreSQL.`,
        });
      } else {
        toast({
          title: "❌ Error al Guardar en Base de Datos",
          description: "No se pudo actualizar la distribución en PostgreSQL.",
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: "✅ Diagrama Guardado Localmente",
        description: `Se guardó la distribución de ${nodes.length} componentes y ${edges.length} conexiones.`,
      });
    }
  };

  // Reset positions to default grid layout
  const handleResetDiagram = async () => {
    localStorage.removeItem(storageKey);
    const resetNodes = initialNodes.map(node => ({ ...node }));
    setNodes(resetNodes);
    setEdges(defaultInitialEdges);

    if (selectedSistema && selectedSistema !== 'todas' && selectedSistema !== 'seleccionar') {
      await saveBackendLayout(selectedSistema, { positions: {}, edges: defaultInitialEdges });
    }

    toast({
      title: "🔄 Diagrama Reiniciado",
      description: "Se restauró la posición inicial de los componentes.",
    });
  };

  const sysName = useMemo(() => {
    if (selectedSistema !== 'todas') {
      const sys = sistemas.find(s => String(s.id) === selectedSistema);
      return sys ? `${sys.nombre} (${sys.tipo_sistema || 'GENERAL'})` : 'Sistema Seleccionado';
    }
    if (selectedSeccion !== 'todas') {
      const sec = secciones.find(s => String(s.id) === selectedSeccion);
      return sec ? `Sección: ${sec.nombre}` : 'Sección Seleccionada';
    }
    return 'Planta General';
  }, [selectedSistema, selectedSeccion, sistemas, secciones]);

  // Delete edge when clicked on the canvas
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setEdges((eds) => {
        const updated = eds.filter((e) => e.id !== edge.id);
        try {
          const cached = localStorage.getItem(storageKey);
          const layout = cached ? JSON.parse(cached) : {};
          localStorage.setItem(storageKey, JSON.stringify({ ...layout, edges: updated }));
        } catch (e) {}
        toast({
          title: "🗑️ Conexión Eliminada",
          description: `Se eliminó la conexión entre nodos.`,
        });
        return updated;
      });
    },
    [setEdges, storageKey]
  );

  return (
    <div className="w-full h-[600px] border border-border rounded-lg overflow-hidden bg-background relative">
      {/* Floating Canvas Controls Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-slate-900/85 backdrop-blur-md p-1.5 rounded-lg border border-slate-700/80 shadow-lg">
        <Badge variant="outline" className="text-cyan-400 border-cyan-500/40 text-xs px-2 font-mono gap-1">
          <Cpu className="h-3.5 w-3.5" />
          {nodes.length} Componentes
        </Badge>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleSaveDiagram}
          className="h-8 px-2.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-medium gap-1.5"
          title="Guardar las posiciones y conexiones actuales del diagrama"
        >
          <Save className="h-3.5 w-3.5" />
          Guardar Diagrama
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleResetDiagram}
          className="h-8 px-2 text-xs border-slate-700 text-slate-300 hover:bg-slate-800"
          title="Resetear distribución"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Prompt if selection incomplete */}
      {isSelectionIncomplete ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950 text-slate-300 p-6 text-center">
          <Layers className="h-12 w-12 text-cyan-400 mb-3 animate-pulse" />
          <h3 className="text-lg font-bold text-slate-100">Selecciona un Sistema</h3>
          <p className="text-sm text-slate-400 max-w-md mt-1">
            Para evitar sobrecargar el sistema, selecciona una <strong className="text-cyan-300">Planta</strong>, <strong className="text-cyan-300">Sección</strong> y <strong className="text-cyan-300">Sistema</strong> en la barra superior para visualizar sus componentes registrados.
          </p>
        </div>
      ) : nodes.length === 0 && !loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950 text-slate-300 p-6 text-center">
          <AlertCircle className="h-12 w-12 text-amber-400 mb-3" />
          <h3 className="text-lg font-bold text-slate-100">Sin componentes dados de alta</h3>
          <p className="text-sm text-slate-400 max-w-md mt-1">
            No se encontraron sensores en <code className="text-cyan-400">/sensores</code> ni tanques en <code className="text-cyan-400">/almacenamiento</code> asignados a <strong className="text-slate-200">{sysName}</strong>.
          </p>
          <p className="text-xs text-slate-500 mt-3">
            Registra los dispositivos desde los módulos de gestión para visualizarlos y conectarlos aquí.
          </p>
        </div>
      )}

      {/* ReactFlow Canvas */}
      <ReactFlow
        nodes={isSelectionIncomplete ? [] : nodes}
        edges={isSelectionIncomplete ? [] : edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        deleteKeyCode={['Backspace', 'Delete']}
        nodeTypes={nodeTypes}
        fitView
        className="bg-slate-950"
      >
        <Background color="#334155" gap={20} size={1} />
        <Controls
          className="!bg-slate-900 !border !border-slate-700 !rounded-lg overflow-hidden shadow-xl [&>button]:!bg-slate-900 [&>button]:!border-b [&>button]:!border-slate-800 [&>button]:!text-cyan-400 [&>button:hover]:!bg-slate-800 [&_svg]:!fill-cyan-400 [&_svg]:!stroke-cyan-400"
        />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'tank') return '#0284c7';
            if (n.type === 'pump') return '#10b981';
            if (n.type === 'valve') return '#f59e0b';
            return '#6366f1';
          }}
          className="bg-slate-900/90 border-slate-700 rounded-md"
        />
      </ReactFlow>
    </div>
  );
};

export default ScadaFlowDiagram;
