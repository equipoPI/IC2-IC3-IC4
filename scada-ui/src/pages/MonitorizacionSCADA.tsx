import { useState, useMemo, useEffect, useRef } from "react";
import { 
  Factory, 
  AlertTriangle, 
  Activity, 
  Clock, 
  Zap, 
  Thermometer, 
  Gauge, 
  TrendingUp, 
  Search, 
  MapPin, 
  LayoutGrid, 
  List,
  Droplet,
  Settings,
  Plus,
  Trash2,
  AlertOctagon,
  RefreshCw,
  Filter,
  Sliders,
  Calendar,
  Bell,
  ShieldAlert
} from "lucide-react";
import VistaMacroPlanta from "@/components/scada/VistaMacroPlanta";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import apiFetch from "@/lib/api";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar
} from "recharts";

interface Planta {
  id: string;
  nombre: string;
  ubicacion: string;
  estado: "operativo" | "advertencia" | "critico" | "offline";
  produccion: number;
  eficiencia: number;
  temperatura: number;
  consumoEnergia: number;
  alarmasActivas: number;
  variablesVinculadas: any[];
}

interface DispositivoSCADA {
  id: number;
  numero_serie: string;
  nombre: string;
  categoria: string;
  estado: string;
  ultima_lectura: string | null;
  topic_mqtt?: string;
  seccion?: number | null;
  seccion_nombre?: string;
  sistema?: number | null;
  sistema_nombre?: string;
  fabrica?: number | null;
  valor_lectura?: number | null;
  unidad_lectura?: string;
}

interface LecturaSensor {
  id: number;
  dispositivo: number;
  valor: number;
  unidad: string;
  timestamp: string;
  calidad: string;
}

const getEstadoConfig = (estado?: string | null) => {
  const est = (estado || "").toString().toLowerCase();
  if (est.includes("crit") || est.includes("error") || est.includes("fallo")) {
    return { label: "Crítico", dotClass: "status-dot-critical", badgeClass: "bg-destructive/20 text-destructive border-destructive/30", bgClass: "border-destructive/50 bg-destructive/5" };
  }
  if (est.includes("adver") || est.includes("warn") || est.includes("alerta")) {
    return { label: "Advertencia", dotClass: "status-dot-warning", badgeClass: "bg-warning/20 text-warning border-warning/30", bgClass: "border-warning/30" };
  }
  if (est.includes("off") || est.includes("inactiv") || est.includes("desconect")) {
    return { label: "Offline", dotClass: "status-dot-offline", badgeClass: "bg-muted text-muted-foreground border-muted", bgClass: "border-muted/50 opacity-60" };
  }
  return { label: "Operativo", dotClass: "status-dot-operational", badgeClass: "bg-success/20 text-success border-success/30", bgClass: "border-success/30" };
};

const renderIconoMetrica = (icono: string) => {
  switch (icono) {
    case "thermometer": return <Thermometer className="h-4 w-4" />;
    case "zap": return <Zap className="h-4 w-4" />;
    case "droplet": return <Droplet className="h-4 w-4" />;
    case "gauge": return <Gauge className="h-4 w-4" />;
    default: return <Activity className="h-4 w-4" />;
  }
};

const MonitorizacionSCADA = () => {
  const [activeTab, setActiveTab] = useState<"plantas" | "historico">(() => {
    return (localStorage.getItem("scada_active_tab") as any) || "plantas";
  });

  const handleTabChange = (tab: "plantas" | "historico") => {
    setActiveTab(tab);
    localStorage.setItem("scada_active_tab", tab);
  };
  const [plantas, setPlantas] = useState<Planta[]>([]);
  const [secciones, setSecciones] = useState<any[]>([]);
  const [sistemas, setSistemas] = useState<any[]>([]);
  const [dispositivos, setDispositivos] = useState<DispositivoSCADA[]>([]);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");

  // Filtros de la pestaña de Histórico / Monitorización Individual
  const [selectedFabricaId, setSelectedFabricaId] = useState<string>("todos");
  const [selectedSeccionId, setSelectedSeccionId] = useState<string>("todos");
  const [selectedSistemaId, setSelectedSistemaId] = useState<string>("todos");
  const [selectedDispositivoId, setSelectedDispositivoId] = useState<string>("");
  
  // Nuevos Controles: Modo (Tiempo Real vs Histórico), Rango de Fechas y Escala Eje Y
  const [modoConsulta, setModoConsulta] = useState<"live" | "historico">("live");
  const [rangoHistorico, setRangoHistorico] = useState<"24h" | "7d" | "30d" | "1y" | "custom">("24h");
  const [fechaDesde, setFechaDesde] = useState<string>("");
  const [fechaHasta, setFechaHasta] = useState<string>("");

  // Estilo de Visualización de Gráfica (Tiempo Proporcional Lineal | Muestreo Directo | Homogéneo 50 Buckets)
  const [modoGrafica, setModoGrafica] = useState<"proporcional" | "directo" | "homogeneo">("proporcional");

  // Escala del Eje Y
  const [modoEjeY, setModoEjeY] = useState<"auto" | "manual">("auto");
  const [ejeYMin, setEjeYMin] = useState<string>("");
  const [ejeYMax, setEjeYMax] = useState<string>("");

  const [lecturasHistoricas, setLecturasHistoricas] = useState<LecturaSensor[]>([]);
  const [loadingLecturas, setLoadingLecturas] = useState(false);

  // Estado de alarmas registradas para el componente activo
  const [alarmasComponente, setAlarmasComponente] = useState<any[]>([]);

  // Helper ultraseguro para extraer IDs sin importar si DRF entrega objetos, cadenas, números o nulos
  const getId = (val: any): string => {
    if (val === null || val === undefined) return "";
    if (typeof val === "object") {
      return String(val.id ?? val.numero_serie ?? val.pk ?? "");
    }
    return String(val);
  };

  // Estado y funciones del Panel Macro de Monitorización por Planta (Vista Inline)
  const [plantaMacroSelec, setPlantaMacroSelec] = useState<Planta | null>(null);
  const [macroTab, setMacroTab] = useState<"jerarquia" | "historico" | "alarmas">("jerarquia");
  const [alarmasPlanta, setAlarmasPlanta] = useState<any[]>([]);
  const [lecturasMacroPlanta, setLecturasMacroPlanta] = useState<LecturaSensor[]>([]);
  const [loadingMacro, setLoadingMacro] = useState(false);

  const abrirMonitoreoMacroPlanta = async (planta: Planta) => {
    if (!planta) return;
    setPlantaMacroSelec(planta);
    setMacroTab("jerarquia");
    setLoadingMacro(true);

    try {
      const plantId = getId(planta.id);
      // 1. Cargar alarmas asociadas a esta planta
      if (plantId) {
        const respA = await apiFetch(`/api/v1/alarmas/?planta=${encodeURIComponent(plantId)}`);
        if (respA.ok) {
          const dA = await respA.json();
          setAlarmasPlanta(Array.isArray(dA) ? dA : dA.results || []);
        }
      }

      // 2. Cargar lecturas de sensores vinculados a esta planta para el gráfico macro
      const sensoresPlanta = dispositivos.filter(d => {
        const fabId = getId(d.fabrica || d.fabrica_id);
        if (fabId !== "" && fabId === plantId) return true;

        const secId = getId(d.seccion || d.seccion_id);
        if (secId !== "" && secciones.some(s => getId(s.id) === secId && getId(s.fabrica || s.fabrica_id) === plantId)) return true;

        const sistId = getId(d.sistema || d.sistema_id);
        if (sistId !== "" && sistemas.some(sys => getId(sys.id) === sistId && getId(sys.fabrica || sys.fabrica_id) === plantId)) return true;

        return false;
      });

      if (sensoresPlanta.length > 0) {
        const querySerie = sensoresPlanta[0].numero_serie || getId(sensoresPlanta[0].id);
        if (querySerie) {
          const respL = await apiFetch(`/api/v1/lecturas/?dispositivo=${encodeURIComponent(querySerie)}&modo=historico&limit=1000`);
          if (respL.ok) {
            const dL = await respL.json();
            setLecturasMacroPlanta(Array.isArray(dL) ? dL : dL.results || []);
          }
        }
      } else {
        setLecturasMacroPlanta([]);
      }
    } catch (e) {
      // silent
    } finally {
      setLoadingMacro(false);
    }
  };

  const loadAlarmasComponente = async (dispId: string) => {
    if (!dispId) {
      setAlarmasComponente([]);
      return;
    }
    try {
      const targetDisp = dispositivos.find(d => (d.numero_serie && d.numero_serie === dispId) || (d.id !== undefined && String(d.id) === dispId));
      const serial = targetDisp?.numero_serie || dispId;
      const name = targetDisp?.nombre || "";

      const resp = await apiFetch(`/api/v1/alarmas/?search=${encodeURIComponent(serial)}`);
      if (resp.ok) {
        const data = await resp.json();
        const list = Array.isArray(data) ? data : data.results || [];
        
        const filtered = list.filter((al: any) => {
          const sensorMaquina = String(al.sensor_maquina || "").toLowerCase();
          return sensorMaquina === serial.toLowerCase() || 
                 (name && sensorMaquina === name.toLowerCase()) ||
                 sensorMaquina.includes(serial.toLowerCase());
        });
        
        setAlarmasComponente(filtered);
      }
    } catch (e) {
      // silent
    }
  };

  const loadPlantas = async () => {
    try {
      const resp = await apiFetch("/api/v1/fabricas/");
      if (!resp.ok) return;
      const data = await resp.json();
      const list = Array.isArray(data) ? data : data.results || [];
      const mapped: Planta[] = list.map((f: any) => ({
        id: String(f.id),
        nombre: f.nombre || '',
        ubicacion: f.ubicacion ? `${f.ubicacion}${f.pais ? `, ${f.pais}` : ''}` : f.pais || 'Sin ubicación',
        estado: (f.estado || 'OPERATIVO').toLowerCase() as Planta["estado"],
        produccion: f.porcentaje_produccion || 0,
        eficiencia: f.porcentaje_eficiencia || 0,
        temperatura: f.temperatura_promedio || 0,
        consumoEnergia: f.consumo_energia || 0,
        alarmasActivas: f.alarmas_activas || 0,
        variablesVinculadas: f.variables_vinculadas || [],
      }));
      setPlantas(mapped);

      setPlantaParaConfig((prev) => {
        if (!prev) return null;
        const updated = mapped.find(p => p.id === prev.id);
        return updated || null;
      });
    } catch (err) {
      // silent
    }
  };

  const selectedDispositivoIdRef = useRef(selectedDispositivoId);
  useEffect(() => {
    selectedDispositivoIdRef.current = selectedDispositivoId;
  }, [selectedDispositivoId]);

  const modoConsultaRef = useRef(modoConsulta);
  useEffect(() => {
    modoConsultaRef.current = modoConsulta;
  }, [modoConsulta]);

  const changeModoConsulta = (newModo: "live" | "historico", newRango?: string) => {
    const rangoToUse = newRango || rangoHistorico;
    modoConsultaRef.current = newModo;
    setModoConsulta(newModo);
    if (newRango) setRangoHistorico(newRango as any);
    loadLecturasSensor(selectedDispositivoId, newModo, rangoToUse);
  };

  const loadEstructura = async () => {
    try {
      const [respSec, respSist, respDisp] = await Promise.all([
        apiFetch("/api/v1/secciones/"),
        apiFetch("/api/v1/sistemas/"),
        apiFetch("/api/v1/dispositivos/")
      ]);

      if (respSec.ok) {
        const dSec = await respSec.json();
        setSecciones(Array.isArray(dSec) ? dSec : dSec.results || []);
      }
      if (respSist.ok) {
        const dSist = await respSist.json();
        setSistemas(Array.isArray(dSist) ? dSist : dSist.results || []);
      }
      if (respDisp.ok) {
        const dDisp = await respDisp.json();
        const listDisp: DispositivoSCADA[] = Array.isArray(dDisp) ? dDisp : dDisp.results || [];
        setDispositivos(listDisp);
        
        // Autoseleccionar el primer dispositivo únicamente si no hay uno seleccionado activamente
        setSelectedDispositivoId((prev) => {
          if (prev && listDisp.some(d => (d.numero_serie && d.numero_serie === prev) || (d.id !== undefined && String(d.id) === prev))) {
            return prev;
          }
          if (listDisp.length > 0) {
            return listDisp[0].numero_serie || String(listDisp[0].id || '');
          }
          return "";
        });
      }
    } catch (e) {
      // silent
    }
  };

  const loadLecturasSensor = async (
    dispId: string,
    overrideModo?: "live" | "historico",
    overrideRango?: string,
    overrideDesde?: string,
    overrideHasta?: string
  ) => {
    if (!dispId) return;
    setLoadingLecturas(true);
    try {
      const targetDisp = dispositivos.find(d => (d.numero_serie && d.numero_serie === dispId) || (d.id !== undefined && String(d.id) === dispId));
      const queryVal = targetDisp ? (targetDisp.numero_serie || String(targetDisp.id)) : dispId;

      const modoAct = overrideModo || modoConsulta;
      const rangoAct = overrideRango || rangoHistorico;
      const desdeAct = overrideDesde !== undefined ? overrideDesde : fechaDesde;
      const hastaAct = overrideHasta !== undefined ? overrideHasta : fechaHasta;

      let url = `/api/v1/lecturas/?dispositivo=${queryVal}`;

      if (modoAct === "live") {
        url += `&limit=100`;
      } else {
        url += `&modo=historico`;
        let desdeISO = "";
        let hastaISO = "";
        const now = new Date();

        if (rangoAct === "24h") {
          desdeISO = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
          hastaISO = now.toISOString();
        } else if (rangoAct === "7d") {
          desdeISO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          hastaISO = now.toISOString();
        } else if (rangoAct === "30d") {
          desdeISO = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          hastaISO = now.toISOString();
        } else if (rangoAct === "1y") {
          desdeISO = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
          hastaISO = now.toISOString();
        } else if (rangoAct === "custom") {
          if (desdeAct) {
            const dDate = new Date(desdeAct);
            if (!isNaN(dDate.getTime())) desdeISO = dDate.toISOString();
          }
          if (hastaAct) {
            const hDate = new Date(hastaAct);
            if (!isNaN(hDate.getTime())) {
              hDate.setHours(23, 59, 59);
              hastaISO = hDate.toISOString();
            }
          }
        }

        if (desdeISO) url += `&fecha_desde=${encodeURIComponent(desdeISO)}`;
        if (hastaISO) url += `&fecha_hasta=${encodeURIComponent(hastaISO)}`;
        url += `&limit=1000`;
      }

      const resp = await apiFetch(url);
      if (resp.ok) {
        const data = await resp.json();
        const list: LecturaSensor[] = Array.isArray(data) ? data : data.results || [];
        setLecturasHistoricas(list);

        // Actualización dinámica en tiempo real de estado ONLINE/OFFLINE del dispositivo en el estado React
        if (list.length > 0) {
          const latestReading = list[list.length - 1];
          const lastMs = new Date(latestReading.timestamp).getTime();
          const computedEstado = (Date.now() - lastMs) < 45000 ? "ONLINE" : "OFFLINE";

          setDispositivos((prevDisps) =>
            prevDisps.map((d) => {
              const isMatch = (d.numero_serie && d.numero_serie === queryVal) || (d.id !== undefined && String(d.id) === queryVal);
              if (isMatch) {
                return {
                  ...d,
                  estado: computedEstado,
                  valor_lectura: Number(latestReading.valor),
                  unidad_lectura: latestReading.unidad || d.unidad_lectura,
                  ultima_lectura: latestReading.timestamp
                };
              }
              return d;
            })
          );
        }
      }
      loadAlarmasComponente(queryVal);
    } catch (err) {
      // silent
    } finally {
      setLoadingLecturas(false);
    }
  };



  // Helper para renderizar ícono de métrica
  const renderIconoMetrica = (iconoStr?: string) => {
    switch (iconoStr) {
      case "thermometer": return <Thermometer className="h-3.5 w-3.5" />;
      case "zap": return <Zap className="h-3.5 w-3.5" />;
      case "droplet": return <Droplet className="h-3.5 w-3.5" />;
      case "gauge": return <Gauge className="h-3.5 w-3.5" />;
      default: return <Activity className="h-3.5 w-3.5" />;
    }
  };

  useEffect(() => {
    loadPlantas();
    loadEstructura();

    // 1. Refresco liviano de telemetría cada 1s (solo en modo live)
    const telemetryInterval = setInterval(() => {
      if (activeTab === "historico" && modoConsultaRef.current !== "live") {
        return; // Pausa completa si está analizando gráficos históricos
      }
      if (selectedDispositivoIdRef.current && modoConsultaRef.current === "live") {
        loadLecturasSensor(selectedDispositivoIdRef.current);
      }
    }, 1000);

    // 2. Refresco pesado de estructura de plantas y secciones en segundo plano cada 15s (solo en pestaña "plantas")
    const heavyInterval = setInterval(() => {
      if (activeTab === "plantas") {
        loadPlantas();
      }
    }, 15000);

    return () => {
      clearInterval(telemetryInterval);
      clearInterval(heavyInterval);
    };
  }, [activeTab]);

  // Efecto para recargar datos cuando cambian los parámetros de fecha/modo
  useEffect(() => {
    if (selectedDispositivoId) {
      loadLecturasSensor(selectedDispositivoId);
    }
  }, [modoConsulta, rangoHistorico, fechaDesde, fechaHasta]);

  // Secciones filtradas por Planta
  const seccionesFiltradas = useMemo(() => {
    if (selectedFabricaId === "todos") return secciones;
    return secciones.filter(s => String(s.fabrica) === selectedFabricaId || String(s.fabrica_id) === selectedFabricaId);
  }, [secciones, selectedFabricaId]);

  // Sistemas filtrados por Planta o Sección
  const sistemasFiltrados = useMemo(() => {
    let list = sistemas;
    if (selectedFabricaId !== "todos") {
      list = list.filter(s => String(s.fabrica) === selectedFabricaId || String(s.fabrica_id) === selectedFabricaId);
    }
    if (selectedSeccionId !== "todos") {
      // Buscar si hay sistemas cuyos dispositivos pertenezcan a la sección seleccionada
      const dispEnSeccion = dispositivos.filter(d => String(d.seccion) === selectedSeccionId || String(d.seccion_id) === selectedSeccionId);
      const idsSistemasEnSeccion = new Set(dispEnSeccion.map(d => String(d.sistema || d.sistema_id)).filter(Boolean));
      if (idsSistemasEnSeccion.size > 0) {
        list = list.filter(s => idsSistemasEnSeccion.has(String(s.id)));
      }
    }
    return list;
  }, [sistemas, dispositivos, selectedFabricaId, selectedSeccionId]);

  // Dispositivos filtrados por Planta/Sección/Sistema
  const dispositivosFiltrados = useMemo(() => {
    return dispositivos.filter(d => {
      if (selectedFabricaId !== "todos") {
        const secMatch = secciones.some(s => String(s.id) === String(d.seccion || d.seccion_id) && (String(s.fabrica) === selectedFabricaId || String(s.fabrica_id) === selectedFabricaId));
        const sistMatch = sistemas.some(sys => String(sys.id) === String(d.sistema || d.sistema_id) && (String(sys.fabrica) === selectedFabricaId || String(sys.fabrica_id) === selectedFabricaId));
        const directFabricaMatch = d.fabrica && (String(d.fabrica) === selectedFabricaId || String(d.fabrica_id) === selectedFabricaId);
        if (!secMatch && !sistMatch && !directFabricaMatch && (d.seccion || d.sistema)) return false;
      }
      if (selectedSeccionId !== "todos" && String(d.seccion || d.seccion_id) !== selectedSeccionId) return false;
      if (selectedSistemaId !== "todos" && String(d.sistema || d.sistema_id) !== selectedSistemaId) return false;
      return true;
    });
  }, [dispositivos, secciones, sistemas, selectedFabricaId, selectedSeccionId, selectedSistemaId]);

  // Sincronizar selección activa cuando cambien los filtros
  useEffect(() => {
    if (dispositivosFiltrados.length > 0) {
      const exists = dispositivosFiltrados.some(d => (d.numero_serie && d.numero_serie === selectedDispositivoId) || (d.id !== undefined && String(d.id) === selectedDispositivoId));
      if (!exists) {
        const firstKey = dispositivosFiltrados[0].numero_serie || String(dispositivosFiltrados[0].id || '');
        setSelectedDispositivoId(firstKey);
        if (firstKey) loadLecturasSensor(firstKey);
      }
    } else {
      setSelectedDispositivoId("");
    }
  }, [dispositivosFiltrados]);

  // Dispositivo seleccionado actualmente
  const currentDispositivo = useMemo(() => {
    if (!selectedDispositivoId) return null;
    return dispositivos.find(d => (d.numero_serie && d.numero_serie === selectedDispositivoId) || (d.id !== undefined && String(d.id) === selectedDispositivoId)) || null;
  }, [dispositivos, selectedDispositivoId]);

  // Datos formateados para Recharts según el Modo de Gráfica elegido (homogeneo | proporcional | directo)
  const chartData = useMemo(() => {
    if (!lecturasHistoricas || lecturasHistoricas.length === 0) return [];
    
    const sorted = [...lecturasHistoricas].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const now = new Date();
    let startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    let endDate = now;

    if (modoConsulta === "historico") {
      if (rangoHistorico === "24h") {
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (rangoHistorico === "7d") {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (rangoHistorico === "30d") {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (rangoHistorico === "1y") {
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      } else if (rangoHistorico === "custom") {
        if (fechaDesde && !isNaN(new Date(fechaDesde).getTime())) startDate = new Date(fechaDesde);
        if (fechaHasta && !isNaN(new Date(fechaHasta).getTime())) {
          const hDate = new Date(fechaHasta);
          hDate.setHours(23, 59, 59);
          endDate = hDate;
        }
      }
    }

    // MODO 1: MUESTREO DIRECTO (Puntos tal como están en la BD por orden secuencial)
    if (modoGrafica === "directo") {
      return sorted.map((curr) => {
        const dt = new Date(curr.timestamp);
        let labelHora = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (modoConsulta === "historico") {
          const dia = String(dt.getDate()).padStart(2, '0');
          const mes = String(dt.getMonth() + 1).padStart(2, '0');
          const hr = String(dt.getHours()).padStart(2, '0');
          const min = String(dt.getMinutes()).padStart(2, '0');
          labelHora = rangoHistorico === "1y" ? `${dia}/${mes}/${dt.getFullYear()} ${hr}:${min}` : `${dia}/${mes} ${hr}:${min}`;
        }
        return {
          hora: labelHora,
          valor: Number(curr.valor),
          unidad: curr.unidad || 'u',
          calidad: curr.calidad,
          fullTimestamp: curr.timestamp,
          timestampMs: dt.getTime()
        };
      });
    }

    // MODO 2: TIEMPO PROPORCIONAL LINEAL (Eje X numérico continuo)
    if (modoGrafica === "proporcional") {
      const result: any[] = [];
      const startTime = startDate.getTime();
      const firstTime = new Date(sorted[0].timestamp).getTime();

      if (modoConsulta === "historico" && firstTime > startTime + 60 * 60 * 1000) {
        result.push({
          hora: startDate.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
          valor: 0,
          unidad: sorted[0]?.unidad || '',
          calidad: 'START_ZERO',
          fullTimestamp: startDate.toISOString(),
          timestampMs: startTime
        });
      }

      for (const curr of sorted) {
        const dt = new Date(curr.timestamp);
        result.push({
          hora: dt.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
          valor: Number(curr.valor),
          unidad: curr.unidad || 'u',
          calidad: curr.calidad,
          fullTimestamp: curr.timestamp,
          timestampMs: dt.getTime()
        });
      }
      return result;
    }

    // MODO 3: AGREGACIÓN HOMOGÉNEA (50 Intervalos Temporales de igual tamaño - Predeterminado)
    const NUM_BUCKETS = 50;
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();
    const totalDurationMs = Math.max(endTime - startTime, 1000);
    const bucketDurationMs = totalDurationMs / NUM_BUCKETS;

    const buckets: { timeMs: number; label: string; values: number[]; unidad: string }[] = [];

    for (let b = 0; b < NUM_BUCKETS; b++) {
      const bTime = new Date(startTime + b * bucketDurationMs);
      const dia = String(bTime.getDate()).padStart(2, '0');
      const mes = String(bTime.getMonth() + 1).padStart(2, '0');
      const hr = String(bTime.getHours()).padStart(2, '0');
      const min = String(bTime.getMinutes()).padStart(2, '0');
      const label = rangoHistorico === "1y" ? `${dia}/${mes}/${bTime.getFullYear()} ${hr}:${min}` : `${dia}/${mes} ${hr}:${min}`;

      buckets.push({
        timeMs: bTime.getTime(),
        label,
        values: [],
        unidad: sorted[0]?.unidad || 'u'
      });
    }

    for (const item of sorted) {
      const itemMs = new Date(item.timestamp).getTime();
      if (itemMs < startTime || itemMs > endTime) continue;
      const bIndex = Math.min(Math.floor((itemMs - startTime) / bucketDurationMs), NUM_BUCKETS - 1);
      if (bIndex >= 0 && bIndex < NUM_BUCKETS) {
        buckets[bIndex].values.push(Number(item.valor));
        if (item.unidad) buckets[bIndex].unidad = item.unidad;
      }
    }

    return buckets.map((b) => {
      let val = 0;
      if (b.values.length > 0) {
        val = Number((b.values.reduce((sum, v) => sum + v, 0) / b.values.length).toFixed(2));
      } else {
        val = 0; // Tratar intervalos sin datos como 0
      }
      return {
        hora: b.label,
        valor: val,
        unidad: b.unidad,
        calidad: b.values.length > 0 ? 'GOOD' : 'NO_DATA',
        fullTimestamp: new Date(b.timeMs).toISOString(),
        timestampMs: b.timeMs
      };
    });
  }, [lecturasHistoricas, modoConsulta, rangoHistorico, modoGrafica, fechaDesde, fechaHasta]);

  // Estadísticas del sensor seleccionado (Min, Max, Avg, Último)
  const statsSensor = useMemo(() => {
    const validPoints = chartData.filter(d => d.valor !== null && !isNaN(d.valor));
    if (validPoints.length === 0) return { min: 0, max: 0, avg: 0, count: 0, ultimo: null };
    const valores = validPoints.map(d => d.valor);
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const sum = valores.reduce((a, b) => a + b, 0);
    const avg = Number((sum / validPoints.length).toFixed(2));
    const ultimo = validPoints[validPoints.length - 1];
    return { min, max, avg, count: validPoints.length, ultimo };
  }, [chartData]);

  // Umbrales de advertencia y crítico para el dispositivo seleccionado
  const umbralesDispositivo = useMemo(() => {
    if (!currentDispositivo) return { warning: null, critical: null };
    for (const p of plantas) {
      if (p.variablesVinculadas) {
        const vv = p.variablesVinculadas.find(
          v => v.sensor === currentDispositivo.numero_serie || String(v.sensor) === String(currentDispositivo.id)
        );
        if (vv) {
          return {
            warning: vv.umbral_advertencia ? Number(vv.umbral_advertencia) : null,
            critical: vv.umbral_critico ? Number(vv.umbral_critico) : null,
          };
        }
      }
    }
    return { warning: null, critical: null };
  }, [currentDispositivo, plantas]);

  const plantasFiltradas = useMemo(() => {
    return plantas.filter((planta) => {
      const matchesSearch = planta.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            planta.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            planta.ubicacion.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesEstado = filtroEstado === "todos" || planta.estado === filtroEstado;
      return matchesSearch && matchesEstado;
    });
  }, [plantas, searchQuery, filtroEstado]);

  const statsResumen = useMemo(() => ({
    operativas: plantas.filter(p => p.estado === "operativo").length,
    advertencia: plantas.filter(p => p.estado === "advertencia").length,
    criticas: plantas.filter(p => p.estado === "critico").length,
    offline: plantas.filter(p => p.estado === "offline").length,
    totalAlarmas: plantas.reduce((acc, p) => acc + p.alarmasActivas, 0),
  }), [plantas]);

  const alarmasComponenteAgrupadas = useMemo(() => {
    const conteo: Record<string, { alta: number; media: number; baja: number }> = {};
    const sorted = [...alarmasComponente].sort(
      (a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime()
    );
    for (const al of sorted) {
      if (!al.fecha_hora) continue;
      const dt = new Date(al.fecha_hora);
      const dateLabel = dt.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
      if (!conteo[dateLabel]) {
        conteo[dateLabel] = { alta: 0, media: 0, baja: 0 };
      }
      const sev = (al.severidad || "media").toLowerCase();
      if (sev === "alta") conteo[dateLabel].alta += 1;
      else if (sev === "media") conteo[dateLabel].media += 1;
      else if (sev === "baja") conteo[dateLabel].baja += 1;
    }
    return Object.entries(conteo).map(([fecha, counts]) => ({
      fecha,
      alta: counts.alta,
      media: counts.media,
      baja: counts.baja
    }));
  }, [alarmasComponente]);

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Monitorización SCADA</h1>
          <p className="text-muted-foreground mt-1">Supervisión en tiempo real e historial analítico por componente</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v: any) => handleTabChange(v)} className="w-full space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
            <TabsList className="bg-card border border-border p-1">
              <TabsTrigger value="plantas" className="gap-2">
                <Factory className="h-4 w-4" />
                Supervisión por Plantas
              </TabsTrigger>
              <TabsTrigger value="historico" className="gap-2">
                <Activity className="h-4 w-4" />
                Monitorización e Histórico por Componente
              </TabsTrigger>
            </TabsList>

            {activeTab === "plantas" && (
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === "cards" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setViewMode("cards")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* TAB 1: SUPERVISIÓN DE PLANTAS Y FÁBRICAS */}
          <TabsContent value="plantas" className="space-y-6 outline-none">
            {plantaMacroSelec ? (
              <VistaMacroPlanta 
                planta={plantaMacroSelec} 
                onVolver={() => setPlantaMacroSelec(null)} 
              />
            ) : (
              /* VISTA PRINCIPAL: TARJETAS DE PLANTAS */
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Card className="bg-card border-border">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                      <span className="text-xs text-muted-foreground uppercase font-semibold">Operativas</span>
                      <span className="text-3xl font-bold text-success font-mono mt-1">{statsResumen.operativas}</span>
                    </CardContent>
                  </Card>
                  <Card className="bg-card border-border">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                      <span className="text-xs text-muted-foreground uppercase font-semibold">Advertencia</span>
                      <span className="text-3xl font-bold text-warning font-mono mt-1">{statsResumen.advertencia}</span>
                    </CardContent>
                  </Card>
                  <Card className="bg-card border-border">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                      <span className="text-xs text-muted-foreground uppercase font-semibold">Críticas</span>
                      <span className="text-3xl font-bold text-destructive font-mono mt-1">{statsResumen.criticas}</span>
                    </CardContent>
                  </Card>
                  <Card className="bg-card border-border">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                      <span className="text-xs text-muted-foreground uppercase font-semibold">Offline</span>
                      <span className="text-3xl font-bold text-muted-foreground font-mono mt-1">{statsResumen.offline}</span>
                    </CardContent>
                  </Card>
                  <Card className="bg-card border-border col-span-2 md:col-span-1">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                      <span className="text-xs text-muted-foreground uppercase font-semibold">Alarmas</span>
                      <span className={cn(
                        "text-3xl font-bold font-mono mt-1",
                        statsResumen.totalAlarmas > 0 ? "text-destructive" : "text-success"
                      )}>{statsResumen.totalAlarmas}</span>
                    </CardContent>
                  </Card>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="relative flex-1 w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar planta por nombre, ID o ubicación..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 bg-background border-border"
                    />
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto justify-end">
                    <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                      <SelectTrigger className="w-[180px] bg-background border-border">
                        <SelectValue placeholder="Filtrar estado" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="todos">Todos los estados</SelectItem>
                        <SelectItem value="operativo">Operativo</SelectItem>
                        <SelectItem value="advertencia">Advertencia</SelectItem>
                        <SelectItem value="critico">Crítico</SelectItem>
                        <SelectItem value="offline">Offline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Plants Display */}
                {plantasFiltradas.length === 0 ? (
                  <Card className="bg-card border-border">
                    <CardContent className="p-8 text-center">
                      <Factory className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium text-foreground mb-2">No se encontraron plantas</h3>
                      <p className="text-muted-foreground">Intenta ajustar los filtros de búsqueda</p>
                    </CardContent>
                  </Card>
                ) : viewMode === "cards" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {plantasFiltradas.map((planta) => {
                      const estadoConfig = getEstadoConfig(planta.estado);

                      return (
                        <Card
                          key={planta.id}
                          onClick={() => abrirMonitoreoMacroPlanta(planta)}
                          className={cn(
                            "bg-card border-border transition-all duration-200 hover:shadow-xl cursor-pointer group hover:border-primary/50",
                            estadoConfig.bgClass
                          )}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "w-12 h-12 rounded-lg flex items-center justify-center",
                                  planta.estado === "operativo" ? "bg-success/20" :
                                  planta.estado === "advertencia" ? "bg-warning/20" :
                                  planta.estado === "critico" ? "bg-destructive/20" : "bg-muted"
                                )}>
                                  <Factory className={cn(
                                    "h-6 w-6",
                                    planta.estado === "operativo" ? "text-success" :
                                    planta.estado === "advertencia" ? "text-warning" :
                                    planta.estado === "critico" ? "text-destructive" : "text-muted-foreground"
                                  )} />
                                </div>
                                <div>
                                  <CardTitle className="text-base flex items-center gap-2 group-hover:text-primary transition-colors">
                                    {planta.nombre}
                                  </CardTitle>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                    <MapPin className="h-3 w-3" />
                                    {planta.ubicacion}
                                  </div>
                                </div>
                              </div>
                              <Badge variant="outline" className={estadoConfig.badgeClass}>
                                <div className={cn("status-dot mr-1.5", estadoConfig.dotClass)} />
                                {estadoConfig.label}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0 space-y-3">
                            {/* Alarmas */}
                            {planta.alarmasActivas > 0 && (
                              <div className="flex items-center justify-between text-xs text-destructive bg-destructive/10 p-2 rounded border border-destructive/20">
                                <div className="flex items-center gap-1.5 font-medium">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  <span>{planta.alarmasActivas} alarmas activas</span>
                                </div>
                                <Badge variant="destructive" className="text-[10px]">Atención</Badge>
                              </div>
                            )}

                            {/* Botón de Monitoreo Macro */}
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full text-xs gap-1.5 border-primary/30 hover:bg-primary text-primary hover:text-primary-foreground font-medium transition-all"
                              onClick={(e) => {
                                e.stopPropagation();
                                abrirMonitoreoMacroPlanta(planta);
                              }}
                            >
                              <Activity className="h-3.5 w-3.5" />
                              Ver Monitoreo Macro de Fábrica
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Card className="bg-card border-border">
                    <CardContent className="p-0">
                      <div className="divide-y divide-border">
                        {plantasFiltradas.map((planta) => {
                          const estadoConfig = getEstadoConfig(planta.estado);

                          return (
                            <div
                              key={planta.id}
                              onClick={() => abrirMonitoreoMacroPlanta(planta)}
                              className="p-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-muted/50 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <div className={cn(
                                  "w-10 h-10 rounded-lg flex items-center justify-center",
                                  planta.estado === "operativo" ? "bg-success/20" :
                                  planta.estado === "advertencia" ? "bg-warning/20" :
                                  planta.estado === "critico" ? "bg-destructive/20" : "bg-muted"
                                )}>
                                  <Factory className={cn(
                                    "h-5 w-5",
                                    planta.estado === "operativo" ? "text-success" :
                                    planta.estado === "advertencia" ? "text-warning" :
                                    planta.estado === "critico" ? "text-destructive" : "text-muted-foreground"
                                  )} />
                                </div>
                                <div>
                                  <p className="font-medium text-foreground">{planta.nombre}</p>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <MapPin className="h-3 w-3" />
                                    {planta.ubicacion}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-4">
                                {planta.alarmasActivas > 0 && (
                                  <Badge variant="destructive" className="text-xs">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    {planta.alarmasActivas}
                                  </Badge>
                                )}
                                <Badge variant="outline" className={estadoConfig.badgeClass}>
                                  <div className={cn("status-dot mr-1.5", estadoConfig.dotClass)} />
                                  {estadoConfig.label}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* TAB 2: MONITORIZACIÓN INDIVIDUAL E HISTÓRICO DE COMPONENTES */}
          <TabsContent value="historico" className="space-y-6 outline-none">
            {/* Selector Jerárquico de Ubicación y Componente */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-4 w-4 text-primary" />
                  Selección Jerárquica de Componentes
                </CardTitle>
                <CardDescription>
                  Filtre por Planta, Sección e Integración para seleccionar cualquier sensor o actuador e inspeccionar su lectura en tiempo real e historial.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* 1. Selector Planta */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase font-semibold">1. Fábrica / Planta</Label>
                    <Select value={selectedFabricaId} onValueChange={(v) => { setSelectedFabricaId(v); setSelectedSeccionId("todos"); setSelectedSistemaId("todos"); }}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Todas las plantas" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="todos">Todas las plantas</SelectItem>
                        {plantas.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 2. Selector Sección */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase font-semibold">2. Sección Interna</Label>
                    <Select value={selectedSeccionId} onValueChange={(v) => { setSelectedSeccionId(v); setSelectedSistemaId("todos"); }}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Todas las secciones" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="todos">Todas las secciones</SelectItem>
                        {seccionesFiltradas.map(s => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 3. Selector Sistema */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase font-semibold">3. Sistema Integrado</Label>
                    <Select value={selectedSistemaId} onValueChange={setSelectedSistemaId}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Todos los sistemas" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="todos">Todos los sistemas</SelectItem>
                        {sistemasFiltrados.map(sys => (
                          <SelectItem key={sys.id} value={String(sys.id)}>{sys.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 4. Selector Dispositivo/Sensor */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase font-semibold">4. Componente / Sensor</Label>
                    <Select value={selectedDispositivoId} onValueChange={(v) => { setSelectedDispositivoId(v); loadLecturasSensor(v); }}>
                      <SelectTrigger className="bg-background border-border font-medium text-primary">
                        <SelectValue placeholder="Seleccionar componente..." />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {dispositivosFiltrados.map(d => {
                          const keyVal = d.numero_serie || String(d.id || '');
                          return (
                            <SelectItem key={keyVal} value={keyVal}>
                              [{d.categoria || 'SCADA'}] {d.nombre} ({d.numero_serie})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tarjeta de Detalle del Dispositivo Seleccionado y Panel de Alarmas Lado a Lado */}
            {currentDispositivo ? (
              <div className="space-y-6">
                {/* FILA SUPERIOR: Información/Lectura Instantánea + Alarmas y Notificaciones */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Información y Lectura Instantánea (2 cols) */}
                  <Card className="bg-card border-border lg:col-span-2 flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge variant="outline" className="mb-2 bg-primary/10 text-primary border-primary/20">
                            {currentDispositivo.categoria || "Dispositivo SCADA"}
                          </Badge>
                          <CardTitle className="text-xl">{currentDispositivo.nombre}</CardTitle>
                          <CardDescription className="font-mono text-xs mt-1">
                            S/N: {currentDispositivo.numero_serie}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className={cn(
                          "px-2.5 py-0.5",
                          currentDispositivo.estado === "ONLINE" ? "bg-success/20 text-success border-success/30" : "bg-destructive/20 text-destructive border-destructive/30"
                        )}>
                          <span className={cn(
                            "w-2 h-2 rounded-full mr-1.5 animate-pulse",
                            currentDispositivo.estado === "ONLINE" ? "bg-success" : "bg-destructive"
                          )} />
                          {currentDispositivo.estado || "OFFLINE"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Valor Actual Gigante */}
                      <div className="p-4 rounded-lg bg-background/80 border border-border text-center">
                        <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider block mb-1">
                          Última Lectura Telemitida
                        </span>
                        <div className="text-4xl font-extrabold font-mono text-primary flex items-baseline justify-center gap-2">
                          <span>{statsSensor.ultimo ? statsSensor.ultimo.valor : (currentDispositivo.valor_lectura ?? "0.00")}</span>
                          <span className="text-lg text-muted-foreground font-normal">{statsSensor.ultimo ? statsSensor.ultimo.unidad : (currentDispositivo.unidad_lectura || "")}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
                          <Clock className="h-3 w-3" />
                          {statsSensor.ultimo ? new Date(statsSensor.ultimo.fullTimestamp).toLocaleString() : (currentDispositivo.ultima_lectura ? new Date(currentDispositivo.ultima_lectura).toLocaleString() : "Sin datos recientes")}
                        </p>
                      </div>

                      {/* Estadísticas Calculadas */}
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="p-2 rounded bg-muted/20 border border-border">
                          <span className="text-muted-foreground block">Mínimo</span>
                          <span className="font-mono font-bold text-foreground mt-0.5 block">{statsSensor.min}</span>
                        </div>
                        <div className="p-2 rounded bg-muted/20 border border-border">
                          <span className="text-muted-foreground block">Promedio</span>
                          <span className="font-mono font-bold text-foreground mt-0.5 block">{statsSensor.avg}</span>
                        </div>
                        <div className="p-2 rounded bg-muted/20 border border-border">
                          <span className="text-muted-foreground block">Máximo</span>
                          <span className="font-mono font-bold text-foreground mt-0.5 block">{statsSensor.max}</span>
                        </div>
                      </div>

                      {/* Metadatos Tópico MQTT */}
                      {currentDispositivo.topic_mqtt && (
                        <div className="p-3 rounded bg-muted/30 border border-border/60 text-xs font-mono text-muted-foreground">
                          <span className="text-foreground font-semibold block mb-0.5">Tópico MQTT Asignado:</span>
                          <span className="break-all">{currentDispositivo.topic_mqtt}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Panel de Alarmas y Notificaciones del Componente (1 col) */}
                  <Card className="bg-card border-border lg:col-span-1 flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Bell className="h-4 w-4 text-warning" />
                        Alarmas y Alertas ({alarmasComponente.length})
                      </CardTitle>
                      <CardDescription>
                        Historial y severidad de alertas registradas
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto max-h-[340px] pr-1">
                      {alarmasComponente.length > 0 && (
                        <div className="mb-3 p-2 rounded-lg bg-muted/20 border border-border">
                          <p className="text-[9px] text-muted-foreground uppercase font-semibold mb-1 text-center font-sans tracking-wide">Frecuencia y Severidad Temporal</p>
                          <div className="w-full h-[90px]">
                            <ResponsiveContainer width="100%" height={90}>
                              <BarChart data={alarmasComponenteAgrupadas} margin={{ top: 5, right: 5, left: -32, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                                <XAxis dataKey="fecha" stroke="hsl(var(--muted-foreground))" fontSize={8} />
                                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={8} allowDecimals={false} />
                                <Bar dataKey="alta" name="Alta" stackId="a" fill="#ef4444" />
                                <Bar dataKey="media" name="Media" stackId="a" fill="#f97316" />
                                <Bar dataKey="baja" name="Baja" stackId="a" fill="#3b82f6" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                      
                      {alarmasComponente.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground space-y-2">
                          <ShieldAlert className="h-8 w-8 mx-auto text-success/40" />
                          <p className="text-xs font-medium">Sin alarmas activas</p>
                          <p className="text-[11px] text-muted-foreground">El componente está operando dentro de los parámetros normales.</p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {alarmasComponente.map((a: any) => {
                            const sevStr = (a.severidad || "media").toLowerCase();
                            const isAlta = sevStr === "alta";
                            const isMedia = sevStr === "media";
                            const isOpen = a.estado === "abierta";

                            return (
                              <div key={a.id} className="p-2.5 rounded-lg bg-muted/30 border border-border text-xs space-y-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1">
                                    <Badge variant="outline" className={cn(
                                      "text-[9px] px-1 py-0 font-bold",
                                      isAlta ? "bg-destructive/20 text-destructive border-destructive/30" : 
                                      isMedia ? "bg-warning/20 text-warning border-warning/30" : 
                                      "bg-primary/20 text-primary border-primary/30"
                                    )}>
                                      {sevStr.toUpperCase()}
                                    </Badge>
                                    <Badge variant="outline" className={cn(
                                      "text-[9px] px-1 py-0 font-bold",
                                      isOpen ? "border-warning text-warning bg-warning/5" : "border-success text-success bg-success/5"
                                    )}>
                                      {isOpen ? "ABIERTA" : "CERRADA"}
                                    </Badge>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">
                                    {a.fecha_hora ? new Date(a.fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Reciente"}
                                  </span>
                                </div>
                                <p className="font-semibold text-foreground leading-snug">{a.descripcion}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* FILA INFERIOR: Gráfica de Histórico Temporal a Pantalla Completa (Full Width) */}
                <Card className="bg-card border-border w-full flex flex-col justify-between">
                  <CardHeader className="pb-3 space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-primary" />
                          Evolución Temporal de Telemetría
                        </CardTitle>
                        <CardDescription>
                          {modoConsulta === "live" 
                            ? "Lecturas en tiempo real con refresco automático continuo" 
                            : "Consulta histórica de lecturas en la base de datos SCADA"}
                        </CardDescription>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="gap-1.5 text-xs h-8" 
                          onClick={() => loadLecturasSensor(selectedDispositivoId)}
                          disabled={loadingLecturas}
                        >
                          <RefreshCw className={cn("h-3.5 w-3.5", loadingLecturas && "animate-spin")} />
                          Actualizar
                        </Button>
                      </div>
                    </div>

                    {/* Barra de Controles de Tiempo y Escala del Eje Y */}
                    <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        {/* Selector de Modo: Tiempo Real vs Histórico */}
                        <div className="flex items-center gap-1 bg-background border border-border p-1 rounded-md">
                          <Button 
                            variant={modoConsulta === "live" ? "default" : "ghost"} 
                            size="sm" 
                            className="h-7 text-xs gap-1.5 px-2.5"
                            onClick={() => changeModoConsulta("live")}
                          >
                            <Zap className="h-3.5 w-3.5" />
                            Tiempo Real (3s)
                          </Button>
                          <Button 
                            variant={modoConsulta === "historico" ? "default" : "ghost"} 
                            size="sm" 
                            className="h-7 text-xs gap-1.5 px-2.5"
                            onClick={() => changeModoConsulta("historico")}
                          >
                            <Calendar className="h-3.5 w-3.5" />
                            Histórico
                          </Button>
                        </div>

                        {/* Rango de Tiempo (Si es Histórico) */}
                        {modoConsulta === "historico" && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground font-semibold">Período:</Label>
                            <Select 
                              value={rangoHistorico} 
                              onValueChange={(v: any) => changeModoConsulta("historico", v)}
                            >
                              <SelectTrigger className="h-8 w-[170px] bg-background border-border text-xs font-medium">
                                <SelectValue placeholder="Período" />
                              </SelectTrigger>
                              <SelectContent className="bg-card border-border text-xs">
                                <SelectItem value="24h">Últimas 24 Horas</SelectItem>
                                <SelectItem value="7d">Últimos 7 Días</SelectItem>
                                <SelectItem value="30d">Últimos 30 Días</SelectItem>
                                <SelectItem value="1y">Último Año (365d)</SelectItem>
                                <SelectItem value="custom">Personalizado...</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Modo / Estilo de Visualización de Gráfica */}
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1 font-semibold">
                            <Activity className="h-3 w-3 text-primary" />
                            Estilo Gráfica:
                          </Label>
                          <Select value={modoGrafica} onValueChange={(v: any) => setModoGrafica(v)}>
                            <SelectTrigger className="h-8 w-[190px] bg-background border-border text-xs font-medium">
                              <SelectValue placeholder="Estilo de Gráfica" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-xs">
                              <SelectItem value="proporcional">Tiempo Proporcional (Lineal)</SelectItem>
                              <SelectItem value="directo">Muestreo Directo (Puntos Fijos)</SelectItem>
                              <SelectItem value="homogeneo">50 Intervalos (Homogéneo)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Control del Eje Y */}
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Sliders className="h-3 w-3" />
                            Eje Y:
                          </Label>
                          <Select value={modoEjeY} onValueChange={(v: any) => setModoEjeY(v)}>
                            <SelectTrigger className="h-8 w-[120px] bg-background border-border text-xs">
                              <SelectValue placeholder="Escala" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-xs">
                              <SelectItem value="auto">Automático</SelectItem>
                              <SelectItem value="manual">Manual Mín/Máx</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Fila secundaria para Rangos Personalizados o Límites de Eje Y */}
                      {(modoConsulta === "historico" && rangoHistorico === "custom" || modoEjeY === "manual") && (
                        <div className="pt-2 border-t border-border/60 flex flex-wrap items-center gap-4 text-xs">
                          {modoConsulta === "historico" && rangoHistorico === "custom" && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Desde:</span>
                              <Input 
                                type="date" 
                                value={fechaDesde} 
                                onChange={(e) => setFechaDesde(e.target.value)} 
                                className="h-7 text-xs bg-background border-border w-[130px]" 
                              />
                              <span className="text-muted-foreground">Hasta:</span>
                              <Input 
                                type="date" 
                                value={fechaHasta} 
                                onChange={(e) => setFechaHasta(e.target.value)} 
                                className="h-7 text-xs bg-background border-border w-[130px]" 
                              />
                              <Button 
                                size="sm" 
                                className="h-7 text-xs px-2.5"
                                onClick={() => loadLecturasSensor(selectedDispositivoId, "historico", "custom", fechaDesde, fechaHasta)}
                              >
                                Aplicar Fechas
                              </Button>
                            </div>
                          )}

                          {modoEjeY === "manual" && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Límit. Eje Y:</span>
                              <Input 
                                type="number" 
                                placeholder="Mínimo" 
                                value={ejeYMin} 
                                onChange={(e) => setEjeYMin(e.target.value)} 
                                className="h-7 text-xs bg-background border-border w-[80px]" 
                              />
                              <span className="text-muted-foreground">a</span>
                              <Input 
                                type="number" 
                                placeholder="Máximo" 
                                value={ejeYMax} 
                                onChange={(e) => setEjeYMax(e.target.value)} 
                                className="h-7 text-xs bg-background border-border w-[80px]" 
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-2 flex-1 min-h-[380px] flex flex-col justify-center">
                    {chartData.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground space-y-3">
                        <Activity className="h-10 w-10 mx-auto text-muted-foreground/40 animate-pulse" />
                        <p className="text-sm font-medium">No se registran lecturas históricas para este componente</p>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                          Los datos aparecerán automáticamente en este gráfico tan pronto como el dispositivo o simulador publique telemetría en el broker MQTT.
                        </p>
                      </div>
                    ) : (
                      <div className="w-full h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorLectura" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                            {modoGrafica === "proporcional" ? (
                              <XAxis 
                                type="number" 
                                dataKey="timestampMs" 
                                domain={['dataMin', 'dataMax']} 
                                stroke="hsl(var(--muted-foreground))" 
                                fontSize={11} 
                                tickFormatter={(ms) => {
                                  const d = new Date(ms);
                                  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                                }} 
                              />
                            ) : (
                              <XAxis dataKey="hora" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                            )}
                            <YAxis 
                              stroke="hsl(var(--muted-foreground))" 
                              fontSize={11} 
                              domain={
                                modoEjeY === "manual" && (ejeYMin !== "" || ejeYMax !== "")
                                  ? [ejeYMin !== "" ? Number(ejeYMin) : 0, ejeYMax !== "" ? Number(ejeYMax) : 28]
                                  : [0, 28]
                              } 
                            />
                            <RechartsTooltip 
                              contentStyle={{ 
                                backgroundColor: "hsl(var(--card))", 
                                borderColor: "hsl(var(--border))",
                                borderRadius: "0.5rem",
                                color: "hsl(var(--foreground))",
                                fontSize: "12px"
                              }}
                              formatter={(value: any) => [`${value} ${chartData[0]?.unidad || ''}`, 'Valor']}
                              labelFormatter={(label, items) => {
                                const item = items[0]?.payload;
                                return item?.fullTimestamp ? new Date(item.fullTimestamp).toLocaleString() : label;
                              }}
                            />
                            {umbralesDispositivo.warning !== null && (
                              <ReferenceLine 
                                y={umbralesDispositivo.warning} 
                                stroke="hsl(var(--warning))" 
                                strokeDasharray="4 4" 
                                label={{ value: `Advertencia (${umbralesDispositivo.warning})`, fill: 'hsl(var(--warning))', fontSize: 10, position: 'insideTopLeft' }} 
                              />
                            )}
                            {umbralesDispositivo.critical !== null && (
                              <ReferenceLine 
                                y={umbralesDispositivo.critical} 
                                stroke="hsl(var(--destructive))" 
                                strokeDasharray="4 4" 
                                label={{ value: `Crítico (${umbralesDispositivo.critical})`, fill: 'hsl(var(--destructive))', fontSize: 10, position: 'insideTopRight' }} 
                              />
                            )}
                            <Area 
                              type="monotone" 
                              dataKey="valor" 
                              stroke="hsl(var(--primary))" 
                              strokeWidth={2}
                              fillOpacity={1} 
                              fill="url(#colorLectura)" 
                              connectNulls={true}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="bg-card border-border">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Activity className="h-10 w-10 mx-auto text-muted-foreground/40 animate-pulse mb-3" />
                  <p className="text-sm font-medium">Seleccione un componente del desplegable superior</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

    </div>
  );
};

export default MonitorizacionSCADA;
