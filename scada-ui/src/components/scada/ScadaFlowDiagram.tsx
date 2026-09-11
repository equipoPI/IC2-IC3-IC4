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

import { machineDefinitions, getCanonicalNodeId } from './scadaConstants';

const isDeviceActive = (dev: any) => {
  if (!dev) return false;
  const val = dev.valor_lectura;
  return val === 1 || val === 1.0 || String(val) === "1" || String(val) === "1.0" || String(val).toLowerCase() === "true" || String(val).toLowerCase() === "open" || String(val).toLowerCase() === "running" || (typeof val === 'number' && val > 0);
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
    // Sondeo de alta frecuencia cada 1.5s sincronizado con el ciclo de telemetría de hardware
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && selectedSistema !== 'seleccionar') {
        loadData();
      }
    }, 1500);
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

  // Generate ReactFlow Nodes from registered devices and storage units with canonical P&ID topology (15 Componentes: 12 sistema + 3 tanques)
  const initialNodes = useMemo(() => {
    const defaultLayoutPositions: Record<string, { x: number; y: number }> = {
      'bomba_reposicion': { x: 40, y: 300 },
      'electrovalvula-1': { x: 160, y: 140 },
      'electrovalvula-2': { x: 160, y: 460 },
      'sensor_nivel_bombo1': { x: 320, y: 20 },
      'tank-1': { x: 320, y: 140 },
      'sensor_nivel_bombo2': { x: 320, y: 340 },
      'tank-2': { x: 320, y: 460 },
      'pump-1': { x: 520, y: 140 },
      'pump-2': { x: 520, y: 460 },
      'sensor-3': { x: 680, y: 140 },
      'sensor_caudal_02': { x: 680, y: 460 },
      'mixer-1': { x: 840, y: 300 },
      'sensor_nivel_mezcla': { x: 1000, y: 180 },
      'tank-3': { x: 1000, y: 300 },
      'bomba_mezcla': { x: 1180, y: 300 },
    };

    // Mapear lecturas directas de sensores de nivel ultrasónicos (en cm de 28cm vacío a 4cm lleno)
    const levelSensorsMap: Record<string, number> = {};
    filteredDispositivos.forEach(d => {
      const canon = getCanonicalNodeId(d);
      if (canon === 'sensor_nivel_bombo1') levelSensorsMap['tank-1'] = Number(d.valor_lectura);
      else if (canon === 'sensor_nivel_bombo2') levelSensorsMap['tank-2'] = Number(d.valor_lectura);
      else if (canon === 'sensor_nivel_mezcla') levelSensorsMap['tank-3'] = Number(d.valor_lectura);
    });

    const findDevice = (canonicalId: string) => {
      return filteredDispositivos.find(d => getCanonicalNodeId(d) === canonicalId || d.numero_serie === canonicalId);
    };

    const findUnit = (canonicalId: string) => {
      return filteredUnidades.find(u => getCanonicalNodeId(u) === canonicalId || u.node_id === canonicalId);
    };

    const nodesList: Node[] = [];

    // 1. BOMBA REPOSICIÓN
    const devRepo = findDevice('bomba_reposicion');
    const isRepoActive = isDeviceActive(devRepo);
    nodesList.push({
      id: 'bomba_reposicion',
      type: 'pump',
      position: defaultLayoutPositions['bomba_reposicion'],
      data: {
        label: devRepo?.nombre || 'Bomba Reposición',
        numero_serie: devRepo?.numero_serie || 'bomba_reposicion',
        isRunning: isRepoActive,
        rpm: isRepoActive ? 1450 : 0,
        power: isRepoActive ? 75 : 0,
        estado: devRepo?.estado || 'ONLINE',
      }
    });

    // 2. ELECTROVÁLVULA 1 (Válvula Rep. A)
    const devValv1 = findDevice('electrovalvula-1');
    const isValv1Active = isDeviceActive(devValv1);
    nodesList.push({
      id: 'electrovalvula-1',
      type: 'valve',
      position: defaultLayoutPositions['electrovalvula-1'],
      data: {
        label: devValv1?.nombre || 'Válvula Rep. A',
        numero_serie: devValv1?.numero_serie || 'electrovalvula-1',
        isOpen: isValv1Active,
        flowRate: isValv1Active ? 12.5 : 0,
        estado: devValv1?.estado || 'ONLINE',
      }
    });

    // 3. ELECTROVÁLVULA 2 (Válvula Rep. B)
    const devValv2 = findDevice('electrovalvula-2');
    const isValv2Active = isDeviceActive(devValv2);
    nodesList.push({
      id: 'electrovalvula-2',
      type: 'valve',
      position: defaultLayoutPositions['electrovalvula-2'],
      data: {
        label: devValv2?.nombre || 'Válvula Rep. B',
        numero_serie: devValv2?.numero_serie || 'electrovalvula-2',
        isOpen: isValv2Active,
        flowRate: isValv2Active ? 12.5 : 0,
        estado: devValv2?.estado || 'ONLINE',
      }
    });

    // 4. SENSOR DE NIVEL BOMBO 1 (Ultrasónico)
    const devLvl1 = findDevice('sensor_nivel_bombo1');
    const valLvl1 = devLvl1 ? Number(devLvl1.valor_lectura || 0) : 0;
    nodesList.push({
      id: 'sensor_nivel_bombo1',
      type: 'sensor',
      position: defaultLayoutPositions['sensor_nivel_bombo1'],
      data: {
        label: devLvl1?.nombre || 'Sensor Nivel Bombo 1',
        numero_serie: devLvl1?.numero_serie || 'sensor_nivel_bombo1',
        value: valLvl1,
        unit: 'cm',
        type: 'level',
        status: (valLvl1 > 0 && valLvl1 < 35) ? 'normal' : 'warning',
        estado: devLvl1?.estado || 'ONLINE',
      }
    });

    // 5. TANQUE A (tank-1)
    const unit1 = findUnit('tank-1');
    const cap1 = unit1?.capacidad || 1000;
    const rawDist1 = levelSensorsMap['tank-1'];
    let level1 = 50;
    if (rawDist1 !== undefined && rawDist1 > 0 && rawDist1 <= 35) {
      level1 = Math.round(Math.max(0, Math.min(100, (28.0 - rawDist1) * 100.0 / 24.0)));
    } else if (unit1 && unit1.capacidad) {
      level1 = Math.round(((unit1.volumen_actual || 0) / unit1.capacidad) * 100);
    }
    nodesList.push({
      id: 'tank-1',
      type: 'tank',
      position: defaultLayoutPositions['tank-1'],
      data: {
        label: unit1?.nombre || 'Tanque A (Líquido 1)',
        node_id: 'tank-1',
        level: level1,
        temperature: unit1?.temperatura || 25,
        capacity: cap1,
        volume: Math.round((level1 / 100) * cap1),
        unit: 'ml',
        status: (unit1?.estado || 'ACTIVE').toLowerCase(),
        content: unit1?.contenido || 'Líquido 1 (ml)',
      }
    });

    // 6. SENSOR DE NIVEL BOMBO 2 (Ultrasónico)
    const devLvl2 = findDevice('sensor_nivel_bombo2');
    const valLvl2 = devLvl2 ? Number(devLvl2.valor_lectura || 0) : 0;
    nodesList.push({
      id: 'sensor_nivel_bombo2',
      type: 'sensor',
      position: defaultLayoutPositions['sensor_nivel_bombo2'],
      data: {
        label: devLvl2?.nombre || 'Sensor Nivel Bombo 2',
        numero_serie: devLvl2?.numero_serie || 'sensor_nivel_bombo2',
        value: valLvl2,
        unit: 'cm',
        type: 'level',
        status: (valLvl2 > 0 && valLvl2 < 35) ? 'normal' : 'warning',
        estado: devLvl2?.estado || 'ONLINE',
      }
    });

    // 7. TANQUE B (tank-2)
    const unit2 = findUnit('tank-2');
    const cap2 = unit2?.capacidad || 800;
    const rawDist2 = levelSensorsMap['tank-2'];
    let level2 = 45;
    if (rawDist2 !== undefined && rawDist2 > 0 && rawDist2 <= 35) {
      level2 = Math.round(Math.max(0, Math.min(100, (28.0 - rawDist2) * 100.0 / 24.0)));
    } else if (unit2 && unit2.capacidad) {
      level2 = Math.round(((unit2.volumen_actual || 0) / unit2.capacidad) * 100);
    }
    nodesList.push({
      id: 'tank-2',
      type: 'tank',
      position: defaultLayoutPositions['tank-2'],
      data: {
        label: unit2?.nombre || 'Tanque B (Líquido 2)',
        node_id: 'tank-2',
        level: level2,
        temperature: unit2?.temperatura || 28,
        capacity: cap2,
        volume: Math.round((level2 / 100) * cap2),
        unit: 'ml',
        status: (unit2?.estado || 'ACTIVE').toLowerCase(),
        content: unit2?.contenido || 'Líquido 2 (ml)',
      }
    });

    // 8. BOMBA A (pump-1 / bomba1)
    const devPump1 = findDevice('pump-1');
    const isPump1Active = isDeviceActive(devPump1);
    nodesList.push({
      id: 'pump-1',
      type: 'pump',
      position: defaultLayoutPositions['pump-1'],
      data: {
        label: devPump1?.nombre || 'Bomba P1',
        numero_serie: devPump1?.numero_serie || 'bomba1',
        isRunning: isPump1Active,
        rpm: isPump1Active ? 1450 : 0,
        power: isPump1Active ? 75 : 0,
        estado: devPump1?.estado || 'ONLINE',
      }
    });

    // 9. BOMBA B (pump-2 / bomba2)
    const devPump2 = findDevice('pump-2');
    const isPump2Active = isDeviceActive(devPump2);
    nodesList.push({
      id: 'pump-2',
      type: 'pump',
      position: defaultLayoutPositions['pump-2'],
      data: {
        label: devPump2?.nombre || 'Bomba P2',
        numero_serie: devPump2?.numero_serie || 'bomba2',
        isRunning: isPump2Active,
        rpm: isPump2Active ? 1450 : 0,
        power: isPump2Active ? 75 : 0,
        estado: devPump2?.estado || 'ONLINE',
      }
    });

    // 10. SENSOR DE FLUJO A (sensor-3 / caudalímetro 1)
    const devFlow1 = findDevice('sensor-3');
    const valFlow1 = devFlow1 ? Number(devFlow1.valor_lectura || 0) : 0;
    nodesList.push({
      id: 'sensor-3',
      type: 'sensor',
      position: defaultLayoutPositions['sensor-3'],
      data: {
        label: devFlow1?.nombre || 'Caudalímetro 1',
        numero_serie: devFlow1?.numero_serie || 'sensor-3',
        value: valFlow1,
        unit: 'ml',
        type: 'flow',
        status: (valFlow1 > 0 || isPump1Active) ? 'normal' : 'warning',
        estado: devFlow1?.estado || 'ONLINE',
      }
    });

    // 11. SENSOR DE FLUJO B (sensor_caudal_02 / caudalímetro 2)
    const devFlow2 = findDevice('sensor_caudal_02');
    const valFlow2 = devFlow2 ? Number(devFlow2.valor_lectura || 0) : 0;
    nodesList.push({
      id: 'sensor_caudal_02',
      type: 'sensor',
      position: defaultLayoutPositions['sensor_caudal_02'],
      data: {
        label: devFlow2?.nombre || 'Caudalímetro 2',
        numero_serie: devFlow2?.numero_serie || 'sensor_caudal_02',
        value: valFlow2,
        unit: 'ml',
        type: 'flow',
        status: (valFlow2 > 0 || isPump2Active) ? 'normal' : 'warning',
        estado: devFlow2?.estado || 'ONLINE',
      }
    });

    // 12. MEZCLADOR (mixer-1)
    const devMixer = findDevice('mixer-1');
    const isMixerActive = isDeviceActive(devMixer);
    nodesList.push({
      id: 'mixer-1',
      type: 'mixer',
      position: defaultLayoutPositions['mixer-1'],
      data: {
        label: devMixer?.nombre || 'Mezclador M1',
        numero_serie: devMixer?.numero_serie || 'mixer-1',
        isRunning: isMixerActive,
        speed: isMixerActive ? 120 : 0,
        temperature: 25,
        estado: devMixer?.estado || 'ONLINE',
      }
    });

    // 13. SENSOR DE NIVEL BOMBO MEZCLA (Ultrasónico)
    const devLvl3 = findDevice('sensor_nivel_mezcla');
    const valLvl3 = devLvl3 ? Number(devLvl3.valor_lectura || 0) : 0;
    nodesList.push({
      id: 'sensor_nivel_mezcla',
      type: 'sensor',
      position: defaultLayoutPositions['sensor_nivel_mezcla'],
      data: {
        label: devLvl3?.nombre || 'Sensor Nivel Mezcla',
        numero_serie: devLvl3?.numero_serie || 'sensor_nivel_mezcla',
        value: valLvl3,
        unit: 'cm',
        type: 'level',
        status: (valLvl3 > 0 && valLvl3 < 35) ? 'normal' : 'warning',
        estado: devLvl3?.estado || 'ONLINE',
      }
    });

    // 14. TANQUE SALIDA / MEZCLA (tank-3)
    const unit3 = findUnit('tank-3');
    const cap3 = unit3?.capacidad || 1500;
    const rawDist3 = levelSensorsMap['tank-3'];
    let level3 = 30;
    if (rawDist3 !== undefined && rawDist3 > 0 && rawDist3 <= 35) {
      level3 = Math.round(Math.max(0, Math.min(100, (28.0 - rawDist3) * 100.0 / 24.0)));
    } else if (unit3 && unit3.capacidad) {
      level3 = Math.round(((unit3.volumen_actual || 0) / unit3.capacidad) * 100);
    }
    nodesList.push({
      id: 'tank-3',
      type: 'tank',
      position: defaultLayoutPositions['tank-3'],
      data: {
        label: unit3?.nombre || 'Tanque Salida (Mezcla)',
        node_id: 'tank-3',
        level: level3,
        temperature: unit3?.temperatura || 26,
        capacity: cap3,
        volume: Math.round((level3 / 100) * cap3),
        unit: 'ml',
        status: (unit3?.estado || 'ACTIVE').toLowerCase(),
        content: unit3?.contenido || 'Mezcla Homogénea (ml)',
      }
    });

    // 15. BOMBA DE MEZCLA / VACIADO (bomba_mezcla)
    const devBombaM = findDevice('bomba_mezcla');
    const isBombaMActive = isDeviceActive(devBombaM);
    nodesList.push({
      id: 'bomba_mezcla',
      type: 'pump',
      position: defaultLayoutPositions['bomba_mezcla'],
      data: {
        label: devBombaM?.nombre || 'Bomba de Mezcla',
        numero_serie: devBombaM?.numero_serie || 'bomba_mezcla',
        isRunning: isBombaMActive,
        rpm: isBombaMActive ? 1450 : 0,
        power: isBombaMActive ? 75 : 0,
        estado: devBombaM?.estado || 'ONLINE',
      }
    });

    // Agregar cualquier dispositivo físico adicional registrado que no forme parte de la topología base de 15 nodos
    const coreCanonicalIds = new Set([
      'bomba_reposicion', 'electrovalvula-1', 'electrovalvula-2', 'tank-1', 'tank-2',
      'pump-1', 'pump-2', 'sensor-3', 'sensor_caudal_02', 'mixer-1', 'tank-3', 'bomba_mezcla',
      'sensor_nivel_bombo1', 'sensor_nivel_bombo2', 'sensor_nivel_mezcla'
    ]);
    const ignoredVirtualIds = new Set(['proceso', 'desechar', 'bomba1', 'bomba2']);

    let extraCount = 0;
    filteredDispositivos.forEach(dev => {
      const canon = getCanonicalNodeId(dev);
      const cat = (dev.categoria || '').toUpperCase();
      const numSerie = String(dev.numero_serie || '').toLowerCase();
      
      // Excluir dispositivos virtuales, PLCs de monitoreo o alias duplicados
      if (
        !coreCanonicalIds.has(canon) &&
        !ignoredVirtualIds.has(canon) &&
        !ignoredVirtualIds.has(numSerie) &&
        cat !== 'PLC' &&
        cat !== 'HMI' &&
        cat !== 'OTRO'
      ) {
        const isAct = isDeviceActive(dev);
        let nodeType: 'pump' | 'valve' | 'mixer' | 'sensor' = 'sensor';
        if (cat === 'BOMBA') nodeType = 'pump';
        else if (cat === 'VALVULA') nodeType = 'valve';
        else if (cat === 'MEZCLADORA') nodeType = 'mixer';

        nodesList.push({
          id: `dev_${dev.id}_${dev.numero_serie}`,
          type: nodeType,
          position: { x: 50 + (extraCount % 4) * 180, y: 550 + Math.floor(extraCount / 4) * 160 },
          data: {
            label: dev.nombre || dev.numero_serie,
            numero_serie: dev.numero_serie,
            isRunning: isAct,
            isOpen: isAct,
            value: dev.valor_lectura !== null ? Number(dev.valor_lectura) : 0,
            unit: dev.unidad_medida || 'ml',
            type: 'flow',
            status: dev.estado === 'ONLINE' ? 'normal' : 'warning',
            estado: dev.estado || 'ONLINE',
          }
        });
        extraCount++;
      }
    });

    return nodesList;
  }, [filteredDispositivos, filteredUnidades, selectedPlanta, selectedSeccion, selectedSistema]);

  // Initial edges template (15 conexiones: 12 tuberías de flujo + 3 telemetrías de nivel ultrasónico)
  const defaultInitialEdges = useMemo(() => {
    return [
      { id: 'e-repo-1', source: 'bomba_reposicion', target: 'electrovalvula-1', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-repo-2', source: 'bomba_reposicion', target: 'electrovalvula-2', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-valv-1', source: 'electrovalvula-1', target: 'tank-1', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-valv-2', source: 'electrovalvula-2', target: 'tank-2', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-lvl-1', source: 'sensor_nivel_bombo1', target: 'tank-1', animated: false, style: { stroke: '#a855f7', strokeWidth: 1.5, strokeDasharray: '4,4' } },
      { id: 'e-lvl-2', source: 'sensor_nivel_bombo2', target: 'tank-2', animated: false, style: { stroke: '#a855f7', strokeWidth: 1.5, strokeDasharray: '4,4' } },
      { id: 'e-tank-1', source: 'tank-1', target: 'pump-1', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-pump-1', source: 'pump-1', target: 'sensor-3', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-flow-1', source: 'sensor-3', target: 'mixer-1', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-tank-2', source: 'tank-2', target: 'pump-2', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-pump-2', source: 'pump-2', target: 'sensor_caudal_02', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-flow-2', source: 'sensor_caudal_02', target: 'mixer-1', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-mix-1', source: 'mixer-1', target: 'tank-3', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
      { id: 'e-lvl-3', source: 'sensor_nivel_mezcla', target: 'tank-3', animated: false, style: { stroke: '#a855f7', strokeWidth: 1.5, strokeDasharray: '4,4' } },
      { id: 'e-mix-2', source: 'tank-3', target: 'bomba_mezcla', animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } },
    ];
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Helper para resolver el ID numérico del sistema a partir de selectedSistema
  const resolveSistemaId = (sysIdOrName: string): string => {
    if (!sysIdOrName || sysIdOrName === 'todas' || sysIdOrName === 'seleccionar') return '';
    if (/^\d+$/.test(sysIdOrName)) return sysIdOrName;
    const found = sistemas.find(s => 
      String(s.id) === sysIdOrName || 
      s.nombre?.toLowerCase() === sysIdOrName.toLowerCase() ||
      s.nombre?.toLowerCase().replace(/\s+/g, '_') === sysIdOrName.toLowerCase() ||
      sysIdOrName.toLowerCase().includes(s.nombre?.toLowerCase())
    );
    if (found) return String(found.id);
    return sysIdOrName;
  };

  // Helper para cargar layout del backend PostgreSQL
  const loadBackendLayout = async (sistemaId: string) => {
    const targetId = resolveSistemaId(sistemaId);
    if (!targetId) return null;
    try {
      const resp = await apiFetch(`/api/v1/sistemas/${targetId}/`);
      if (resp.ok) {
        const sys = await resp.json();
        if (sys.diagrama_layout_json) {
          let parsed = sys.diagrama_layout_json;
          while (typeof parsed === 'string') {
            try {
              parsed = JSON.parse(parsed);
            } catch {
              break;
            }
          }
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
    const targetId = resolveSistemaId(sistemaId);
    if (!targetId) return false;
    try {
      const resp = await apiFetch(`/api/v1/sistemas/${targetId}/`, {
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
        if (dbLayout && typeof dbLayout === 'object') {
          if (dbLayout.positions && typeof dbLayout.positions === 'object') cachedPositions = dbLayout.positions;
          if (dbLayout.edges && Array.isArray(dbLayout.edges) && dbLayout.edges.length > 0) cachedEdges = dbLayout.edges;
          loadedFromDb = true;
        }
      }

      // 2. Fallback a localStorage si no hay layout guardado en BD
      if (!loadedFromDb) {
        try {
          const cached = localStorage.getItem(storageKey);
          if (cached) {
            let parsed = JSON.parse(cached);
            while (typeof parsed === 'string') {
              try { parsed = JSON.parse(parsed); } catch { break; }
            }
            if (parsed && typeof parsed === 'object') {
              if (parsed.positions) cachedPositions = parsed.positions;
              if (parsed.edges && Array.isArray(parsed.edges) && parsed.edges.length > 0) cachedEdges = parsed.edges;
            }
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
  }, [storageKey, selectedSistema]);

  // Merge updated device telemetry into existing nodes WITHOUT resetting node positions or looping!
  useEffect(() => {
    setNodes(prevNodes => {
      if (!prevNodes || prevNodes.length === 0) {
        return initialNodes;
      }

      const freshMap = new Map(initialNodes.map(n => [n.id, n]));
      let hasAnyChange = false;

      const updatedNodes = prevNodes.map(prev => {
        const fresh = freshMap.get(prev.id);
        if (!fresh) return prev;

        const prevData = prev.data || {};
        const freshData = fresh.data || {};
        const isDataEqual = Object.keys(freshData).every(k => freshData[k] === prevData[k]) &&
                            Object.keys(prevData).every(k => prevData[k] === freshData[k]);

        if (isDataEqual) return prev;

        hasAnyChange = true;
        return {
          ...prev,
          data: fresh.data // Keep position intact!
        };
      });

      const prevIds = new Set(prevNodes.map(p => p.id));
      initialNodes.forEach(fresh => {
        if (!prevIds.has(fresh.id)) {
          hasAnyChange = true;
          updatedNodes.push(fresh);
        }
      });

      // Crucial: return identical array if no values changed to break infinite re-render loop
      return hasAnyChange ? updatedNodes : prevNodes;
    });
  }, [initialNodes]);

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
        let isActive = sourceActive || targetActive;
        if (edge.id === 'e-flow-1' && (activeMap.get('pump-1') || activeMap.get('sensor-3'))) isActive = true;
        if (edge.id === 'e-flow-2' && (activeMap.get('pump-2') || activeMap.get('sensor_caudal_02'))) isActive = true;
        if (edge.id === 'e-valv-1' && (activeMap.get('bomba_reposicion') || activeMap.get('electrovalvula-1'))) isActive = true;
        if (edge.id === 'e-valv-2' && (activeMap.get('bomba_reposicion') || activeMap.get('electrovalvula-2'))) isActive = true;
        if (edge.id === 'e-mix-1' && activeMap.get('mixer-1')) isActive = true;
        if (edge.id === 'e-mix-2' && activeMap.get('bomba_mezcla')) isActive = true;

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

  // Handle drag stop to auto-persist node positions safely
  const onNodeDragStop = useCallback((_: any, node: Node) => {
    setNodes(prev => prev.map(n => n.id === node.id ? { ...n, position: node.position } : n));

    setTimeout(() => {
      try {
        const positions: Record<string, { x: number; y: number }> = {};
        nodes.forEach(n => {
          positions[n.id] = n.id === node.id ? node.position : n.position;
        });

        const cached = localStorage.getItem(storageKey);
        let layout: any = {};
        if (cached) {
          try { layout = JSON.parse(cached); } catch {}
        }
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
      } catch (e) {
        console.warn("Error guardando posición de nodo:", e);
      }
    }, 50);
  }, [storageKey, edges, selectedSistema, nodes]);

  // Connect edges interactively by dragging connection lines
  const onConnect = useCallback(
    (params: Connection) => {
      let updatedEdges: Edge[] = [];
      setEdges((eds) => {
        updatedEdges = addEdge({ ...params, animated: false, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } }, eds);
        return updatedEdges;
      });

      setTimeout(() => {
        try {
          const cached = localStorage.getItem(storageKey);
          let layout: any = {};
          if (cached) {
            try { layout = JSON.parse(cached); } catch {}
          }
          const dataToSave = { ...layout, edges: updatedEdges };
          localStorage.setItem(storageKey, JSON.stringify(dataToSave));
          if (selectedSistema && selectedSistema !== 'todas' && selectedSistema !== 'seleccionar') {
            saveBackendLayout(selectedSistema, dataToSave);
          }
        } catch (e) {}
      }, 50);
    },
    [storageKey, selectedSistema]
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
      description: "Se restauró la posición inicial de fábrica de los componentes.",
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
          className="h-8 px-2.5 text-xs border-amber-500/80 bg-amber-500/20 text-amber-300 hover:bg-amber-400 hover:text-black font-semibold transition-colors shadow-sm gap-1.5"
          title="Resetear distribución a posiciones predeterminadas"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Resetear distribución</span>
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
