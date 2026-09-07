import { Activity, Settings, Play, Pause, RotateCcw, Maximize2, Filter, Layers, Check, RefreshCw, PackageCheck, Thermometer, Sliders, Cpu, FlaskConical, Droplet, AlertCircle, PlusCircle, Zap, Terminal, Edit } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import apiFetch from "@/lib/api";
import { cn } from "@/lib/utils";
import ScadaFlowDiagram from "@/components/scada/ScadaFlowDiagram";
import { ControlReposicionModal } from "@/components/scada/ControlReposicionModal";
import { ControlDinamicoModal } from "@/components/scada/ControlDinamicoModal";
import { ControlRecetaLiquidosModal } from "@/components/scada/ControlRecetaLiquidosModal";
import { GestorComandosModal } from "@/components/scada/GestorComandosModal";
import { DynamicScadaPanels } from "@/components/scada/DynamicScadaPanels";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const VisualizacionSCADA = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isReposicionOpen, setIsReposicionOpen] = useState(false);
  const [isRecetaLiquidosOpen, setIsRecetaLiquidosOpen] = useState(false);
  const [isDinamicoOpen, setIsDinamicoOpen] = useState(false);
  const [isGestorComandosOpen, setIsGestorComandosOpen] = useState(false);
  const [controlToEdit, setControlToEdit] = useState<any | null>(null);
  const [customComandos, setCustomComandos] = useState<any[]>([]);
  const [panelsRefreshKey, setPanelsRefreshKey] = useState(0);
  const [ultimaTransmision, setUltimaTransmision] = useState<any | null>(null);
  const [dinamicoTipoSistema, setDinamicoTipoSistema] = useState("EMPAQUE");
  const [dinamicoNombreSistema, setDinamicoNombreSistema] = useState("Empaquetadora SCADA");

  // System Edit Modal States
  const [isEditSistemaOpen, setIsEditSistemaOpen] = useState(false);
  const [formSistema, setFormSistema] = useState({
    id: '',
    nombre: '',
    tipo_sistema: 'FLUIDOS',
    fabrica: '',
    descripcion: ''
  });

  const handleOpenEditSistema = () => {
    if (!selectedSistemaObj) return;
    setFormSistema({
      id: String(selectedSistemaObj.id),
      nombre: selectedSistemaObj.nombre,
      tipo_sistema: selectedSistemaObj.tipo_sistema || 'FLUIDOS',
      fabrica: String(selectedSistemaObj.fabrica),
      descripcion: selectedSistemaObj.descripcion || ''
    });
    setIsEditSistemaOpen(true);
  };

  const handleSaveSistema = async () => {
    if (!formSistema.nombre || !formSistema.id) return;
    try {
      const payload: any = {
        nombre: formSistema.nombre,
        tipo_sistema: formSistema.tipo_sistema,
        descripcion: formSistema.descripcion || ""
      };
      if (formSistema.fabrica && formSistema.fabrica !== 'undefined' && formSistema.fabrica !== 'null' && !isNaN(Number(formSistema.fabrica))) {
        payload.fabrica = Number(formSistema.fabrica);
      }

      const resp = await apiFetch(`/api/v1/sistemas/${formSistema.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        const updated = await resp.json();
        toast.success("✅ Sistema y tipo de proceso actualizados");
        setIsEditSistemaOpen(false);
        setSistemas(prev => prev.map(s => String(s.id) === String(formSistema.id) ? { ...s, ...updated } : s));
        setPanelsRefreshKey(k => k + 1);
        await loadFiltros();
      } else {
        const errData = await resp.json().catch(() => ({}));
        const msg = typeof errData === 'object' ? JSON.stringify(errData) : 'Error al actualizar el sistema';
        toast.error(`❌ ${msg}`);
      }
    } catch (e) {
      toast.error("Fallo de red al guardar el sistema");
    }
  };

  const openDinamicoModal = (tipo: string, nombre: string) => {
    setDinamicoTipoSistema(tipo);
    setDinamicoNombreSistema(nombre);
    setIsDinamicoOpen(true);
  };

  const [dispositivos, setDispositivos] = useState<any[]>([]);
  const [plantas, setPlantas] = useState<any[]>([]);
  const [secciones, setSecciones] = useState<any[]>([]);
  const [sistemas, setSistemas] = useState<any[]>([]);

  // Active filter selections
  const [selectedPlanta, setSelectedPlanta] = useState<string>('seleccionar');
  const [selectedSeccion, setSelectedSeccion] = useState<string>('seleccionar');
  const [selectedSistema, setSelectedSistema] = useState<string>('seleccionar');

  // MQTT Config modal states
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [activeConfig, setActiveConfig] = useState<any | null>(null);
  const [nombreConfig, setNombreConfig] = useState('');
  const [brokerUrl, setBrokerUrl] = useState('');
  const [puerto, setPuerto] = useState(1883);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [usarTls, setUsarTls] = useState(false);
  const [keepAlive, setKeepAlive] = useState(60);
  const [topicBase, setTopicBase] = useState('scada/');

  // Cargar dispositivos reales
  const loadDispositivos = async () => {
    try {
      const resp = await apiFetch("/api/v1/dispositivos/");
      if (resp.ok) {
        const data = await resp.json();
        const list = Array.isArray(data) ? data : data.results || [];
        setDispositivos(list);
      }
    } catch (e) {
      // silent
    }
  };

  // Cargar Planta / Sección / Sistema desde DB
  const loadFiltros = async () => {
    try {
      const [rPlantas, rSecciones, rSistemas] = await Promise.all([
        apiFetch("/api/v1/fabricas/"),
        apiFetch("/api/v1/secciones/"),
        apiFetch("/api/v1/sistemas/"),
      ]);

      if (rPlantas.ok) {
        const data = await rPlantas.json();
        const list = Array.isArray(data) ? data : data.results || [];
        setPlantas(list);
      }
      if (rSecciones.ok) {
        const data = await rSecciones.json();
        const list = Array.isArray(data) ? data : data.results || [];
        setSecciones(list);
      }
      if (rSistemas.ok) {
        const data = await rSistemas.json();
        const list = Array.isArray(data) ? data : data.results || [];
        setSistemas(list);
      }
    } catch (e) {
      // silent
    }
  };

  // Cargar configuración de MQTT activa
  const loadMqttConfig = async () => {
    try {
      const resp = await apiFetch("/api/v1/configuraciones-mqtt/");
      if (resp.ok) {
        const data = await resp.json();
        const list = Array.isArray(data) ? data : data.results || [];
        const active = list.find((c: any) => c.activo) || list[0] || null;
        setActiveConfig(active);
        
        if (active) {
          setNombreConfig(active.nombre || '');
          setBrokerUrl(active.broker_url || '');
          setPuerto(active.puerto || 1883);
          setUsuario(active.usuario || '');
          setPassword(active.password || '');
          setUsarTls(active.usar_tls || false);
          setKeepAlive(active.keep_alive || 60);
          setTopicBase(active.topic_base || 'scada/');
        }
      }
    } catch (e) {
      // silent
    }
  };

  // Cargar comandos dinámicos persistentes desde PostgreSQL
  const fetchCustomComandos = async () => {
    try {
      const res = await apiFetch("/api/v1/mapeos-acciones-mqtt/");
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.results || [];
        setCustomComandos(list);
      }
    } catch (e) {
      console.warn("Error cargando mapeos personalizados MQTT:", e);
    }
  };

  // Cargar la última receta / comando transmitido para la receta activa
  const loadUltimaTransmision = async () => {
    if (selectedSistema === 'seleccionar') {
      setUltimaTransmision(null);
      return;
    }
    try {
      const res = await apiFetch(`/api/v1/auditoria/?sistema_id=${selectedSistema}`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.results || [];
        if (list.length > 0) {
          const item = list[0];
          setUltimaTransmision({
            origen: item.origen || (item.comando?.includes("Receta") ? "Receta Programada" : "Comando Manual"),
            tipoOperacion: item.accion || item.comando || "Comando MQTT",
            usuario: item.usuario || "Operador SCADA",
            timestamp: item.timestamp ? new Date(item.timestamp).toLocaleString("es-AR") : new Date().toLocaleString("es-AR"),
            descripcion: item.detalles || item.payload_json || JSON.stringify(item.parametros || {}),
          });
        } else {
          setUltimaTransmision(null);
        }
      }
    } catch (e) {
      console.warn("Error cargando última transmisión:", e);
    }
  };

  // Transmitir un comando personalizado desde los mapeos MQTT
  const handleCustomCommandClick = async (cmd: any) => {
    try {
      toast.info(`Publicando comando '${cmd.nombre_accion || cmd.nombre}'...`);
      const resp = await apiFetch("/api/v1/auditoria/transmitir/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topico: cmd.plantilla_topico,
          payload: cmd.plantilla_payload_json,
          sistema_id: selectedSistema !== 'seleccionar' ? selectedSistema : undefined,
          origen: "Comando Manual Custom"
        }),
      });

      if (resp.ok) {
        toast.success(`Comando '${cmd.nombre}' publicado correctamente por MQTT`);
        loadUltimaTransmision();
      } else {
        toast.error(`Error al transmitir comando '${cmd.nombre}'`);
      }
    } catch (e) {
      toast.error("Error de comunicación al transmitir comando MQTT");
    }
  };

  useEffect(() => {
    loadDispositivos();
    loadFiltros();
    loadMqttConfig();
    fetchCustomComandos();
  }, []);

  useEffect(() => {
    if (selectedSistema !== 'seleccionar') {
      loadUltimaTransmision();
    }
  }, [selectedSistema]);

  // Fullscreen event listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Enviar comando manual al backend vía MQTT
  const handleControlClick = async (deviceId: string, actionLabel: string) => {
    let comando = "";
    const actUpper = actionLabel.toUpperCase();
    if (actUpper.includes("ABRIR")) comando = "ABRIR";
    else if (actUpper.includes("CERRAR")) comando = "CERRAR";
    else if (actUpper.includes("INICIAR") || actUpper.includes("REANUDAR")) comando = "INICIAR";
    else if (actUpper.includes("PAUSAR") || actUpper.includes("DETENER") || actUpper.includes("PARAR")) comando = "PAUSAR";
    else if (actUpper.includes("VACIAR")) comando = "VACIAR";
    else if (actUpper.includes("DESCARTAR") || actUpper.includes("DESECHAR")) comando = "DESCARTAR";
    else comando = actionLabel.toLowerCase();

    if (!comando) return;

    try {
      toast.info(`Enviando comando '${actionLabel}'...`);
      let resp;
      if (deviceId === 'proceso' && selectedSistema !== 'todas') {
        resp = await apiFetch(`/api/v1/sistemas/${selectedSistema}/control/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comando }),
        });
      } else {
        resp = await apiFetch(`/api/v1/dispositivos/${deviceId}/control/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comando }),
        });
      }

      if (resp.ok) {
        toast.success(`Comando '${actionLabel}' publicado exitosamente en el bus MQTT`);
        loadDispositivos();
      } else {
        const errData = await resp.json().catch(() => ({}));
        toast.error(`Error al enviar comando: ${errData.error || resp.statusText}`);
      }
    } catch (e) {
      toast.error("Error de conexión al comunicarse con la API SCADA");
    }
  };

  // Guardar cambios del broker MQTT
  const handleSaveMqttConfig = async () => {
    try {
      toast.info("Guardando configuración MQTT...");
      const body = {
        nombre: nombreConfig || "Configuración SCADA Activa",
        broker_url: brokerUrl,
        puerto: Number(puerto),
        usuario: usuario || null,
        password: password || null,
        usar_tls: usarTls,
        keep_alive: Number(keepAlive),
        topic_base: topicBase,
        activo: true,
      };

      let resp;
      if (activeConfig?.id) {
        resp = await apiFetch(`/api/v1/configuraciones-mqtt/${activeConfig.id}/`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        resp = await apiFetch(`/api/v1/configuraciones-mqtt/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (resp.ok) {
        toast.success("Configuración MQTT guardada y activada con éxito");
        setIsConfigOpen(false);
        loadMqttConfig();
      } else {
        const errData = await resp.json();
        toast.error(`Error al guardar: ${JSON.stringify(errData)}`);
      }
    } catch (e) {
      toast.error("Error al conectar con la API de configuración");
    }
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {
        setIsFullscreen(true);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Obtener datos del dispositivo de proceso
  const procesoDev = dispositivos.find(d => d.numero_serie === 'proceso');
  const totalMin = procesoDev?.valor_lectura !== null ? Number(procesoDev?.valor_lectura) : null;
  const tiempoEst = totalMin !== null && !isNaN(totalMin)
    ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`
    : "0h 0m";
  
  const isRunning = totalMin !== null && totalMin > 0;
  const faseProceso = isRunning ? "Mezclado" : "Detenido";
  const progresoProceso = procesoDev && totalMin && totalMin > 0 
    ? `${Math.max(0, Math.min(100, Math.round(100 - (totalMin / 150) * 100)))}%` 
    : "0%";

  // Objetos seleccionados
  const selectedPlantaObj = useMemo(() => plantas.find(p => String(p.id) === selectedPlanta), [plantas, selectedPlanta]);
  const selectedSeccionObj = useMemo(() => secciones.find(s => String(s.id) === selectedSeccion), [secciones, selectedSeccion]);
  const selectedSistemaObj = useMemo(() => sistemas.find(s => String(s.id) === selectedSistema), [sistemas, selectedSistema]);
  const isSelectionIncomplete = selectedPlanta === 'seleccionar' || selectedSeccion === 'seleccionar' || selectedSistema === 'seleccionar';

  // Filtros dinámicos basados en la selección de Planta
  const filteredSecciones = useMemo(() => {
    if (selectedPlanta === 'seleccionar') return [];
    return secciones.filter(s => String(s.fabrica) === selectedPlanta);
  }, [secciones, selectedPlanta]);

  const filteredSistemas = useMemo(() => {
    if (selectedPlanta === 'seleccionar') return [];
    return sistemas.filter(sys => String(sys.fabrica) === selectedPlanta);
  }, [sistemas, selectedPlanta]);

  // Get relevant controls based on selected filters
  const relevantControls = useMemo(() => {
    const fallbacks = [
      { id: 'bomba_reposicion', label: 'Bomba Reposición', status: 'Detenida', statusColor: 'outline', actions: ['Iniciar'] },
      { id: 'electrovalvula-1', label: 'Válvula Rep. A', status: 'Cerrada', statusColor: 'outline', actions: ['Abrir'] },
      { id: 'electrovalvula-2', label: 'Válvula Rep. B', status: 'Cerrada', statusColor: 'outline', actions: ['Abrir'] },
      { id: 'pump-1', label: 'Bomba A', status: 'Detenida', statusColor: 'outline', actions: ['Iniciar'] },
      { id: 'pump-2', label: 'Bomba B', status: 'Detenida', statusColor: 'outline', actions: ['Iniciar'] },
      { id: 'mixer-1', label: 'Mezclador M1', status: 'Detenido', statusColor: 'outline', actions: ['Iniciar'] },
      { id: 'bomba_mezcla', label: 'Bomba de Mezcla', status: 'Detenida', statusColor: 'outline', actions: ['Iniciar'] },
    ];

    const mappedControls = fallbacks.map(fb => {
      const dev = dispositivos.find(d => d.numero_serie === fb.id);
      if (!dev) return fb;

      const isActivo = dev.valor_lectura === 1 || dev.valor_lectura === "open" || dev.valor_lectura === "running" || String(dev.valor_lectura) === "1.0" || String(dev.valor_lectura) === "true";
      
      if (dev.categoria === 'VALVULA') {
        return {
          id: dev.numero_serie,
          label: dev.nombre || fb.label,
          status: isActivo ? 'Abierta' : 'Cerrada',
          statusColor: isActivo ? 'success' : 'outline',
          actions: isActivo ? ['Cerrar'] : ['Abrir']
        };
      } else {
        return {
          id: dev.numero_serie,
          label: dev.nombre || fb.label,
          status: isActivo ? 'Activo' : 'Detenido',
          statusColor: isActivo ? 'success' : 'outline',
          actions: isActivo ? ['Detener'] : ['Iniciar']
        };
      }
    });

    return mappedControls.filter(control => {
      if (selectedSeccion === 'todas' && selectedSistema === 'todas') return true;
      const dev = dispositivos.find(d => d.numero_serie === control.id);
      if (!dev) return true;
      if (selectedSeccion !== 'todas' && dev.seccion && String(dev.seccion) !== selectedSeccion) return false;
      if (selectedSistema !== 'todas' && dev.sistema && String(dev.sistema) !== selectedSistema) return false;
      return true;
    });
  }, [selectedSeccion, selectedSistema, dispositivos]);

  const currentViewLabel = useMemo(() => {
    if (selectedSistema !== 'todas') {
      const sys = sistemas.find(s => String(s.id) === selectedSistema);
      return sys ? `Sistema: ${sys.nombre}` : 'Todos los Sistemas';
    }
    if (selectedSeccion !== 'todas') {
      const sec = secciones.find(s => String(s.id) === selectedSeccion);
      return sec ? `Sección: ${sec.nombre}` : 'Todas las Secciones';
    }
    if (selectedPlanta !== 'todas') {
      const pl = plantas.find(p => String(p.id) === selectedPlanta);
      return pl ? `Planta: ${pl.nombre}` : 'Todas las Plantas';
    }
    return 'Planta Completa';
  }, [selectedPlanta, selectedSeccion, selectedSistema, plantas, secciones, sistemas]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary-foreground bg-clip-text text-transparent">
            Visualización SCADA
          </h1>
          <p className="text-muted-foreground text-sm">
            Monitoreo en tiempo real de variables físicas y control de actuadores
          </p>
        </div>
      </div>

      {/* Layout Principal: Diagrama SCADA a Ancho Completo */}
      <div className="space-y-6">
        {/* Main SCADA Diagram (Full Width) */}
        <Card className="bg-card border-border shadow-md w-full" ref={containerRef}>
          <CardHeader className="pb-3 bg-card border-b border-border/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Diagrama de Proceso en Tiempo Real
              </CardTitle>

              {/* Current View & Gateway Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-xs bg-muted/50 border border-border">
                  <Filter className="h-3 w-3 mr-1 text-primary" />
                  Ubicación: {currentViewLabel}
                </Badge>

                {selectedSistema !== 'seleccionar' && selectedSistema !== 'todas' && (
                  <Badge variant="outline" className="text-xs font-mono bg-cyan-950/40 text-cyan-300 border-cyan-800/80 gap-1.5">
                    <Cpu className="h-3 w-3 text-cyan-400" />
                    Gateway: <span className="font-bold text-cyan-200">d83add60dbb0</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" title="Gateway Online"></span>
                  </Badge>
                )}
              </div>
            </div>

            {/* Bar of Dropdown Selectors and Action Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              {/* Real Database Dropdown Selectors */}
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {/* Select Planta */}
                <Select value={selectedPlanta} onValueChange={(val) => {
                  setSelectedPlanta(val);
                  setSelectedSeccion('seleccionar');
                  setSelectedSistema('seleccionar');
                }}>
                  <SelectTrigger className="w-[170px] bg-background border-border h-9 text-xs">
                    <SelectValue placeholder="--- Seleccionar Planta ---" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="seleccionar">--- Seleccionar Planta ---</SelectItem>
                    {plantas.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>🏭 {p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Select Sección */}
                <Select value={selectedSeccion} onValueChange={(val) => {
                  setSelectedSeccion(val);
                  setSelectedSistema('seleccionar');
                }} disabled={selectedPlanta === 'seleccionar'}>
                  <SelectTrigger className="w-[170px] bg-background border-border h-9 text-xs">
                    <SelectValue placeholder="--- Seleccionar Sección ---" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="seleccionar">--- Seleccionar Sección ---</SelectItem>
                    {filteredSecciones.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>📂 {s.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Select Sistema */}
                <Select value={selectedSistema} onValueChange={setSelectedSistema} disabled={selectedSeccion === 'seleccionar'}>
                  <SelectTrigger className="w-[170px] bg-background border-border h-9 text-xs">
                    <SelectValue placeholder="--- Seleccionar Sistema ---" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="seleccionar">--- Seleccionar Sistema ---</SelectItem>
                    {filteredSistemas.map(sys => (
                      <SelectItem key={sys.id} value={String(sys.id)}>⚙️ {sys.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedSistema !== 'seleccionar' && selectedSistemaObj && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenEditSistema}
                    className="h-9 px-2 bg-slate-900 border-cyan-800 text-cyan-300 hover:bg-slate-800 text-xs gap-1 font-semibold"
                    title="Editar tipo de proceso (Fluidos, Sólidos, Empaque, etc.) para este sistema"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Editar Sistema
                  </Button>
                )}
              </div>

              {/* SCADA Action Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsGestorComandosOpen(true)}
                  className="h-8 px-2.5 gap-1.5 bg-slate-900 hover:bg-slate-800 text-cyan-300 border-cyan-700/60 font-semibold text-xs shadow-sm"
                  title="Configurar y añadir botones, tópicos MQTT y payloads JSON para este sistema"
                >
                  <Settings className="h-3.5 w-3.5 text-cyan-400" />
                  ⚙️ Personalizar Comandos
                </Button>

                <div className="flex items-center gap-1 pl-1 border-l border-border/80">
                  <Button variant="outline" size="sm" onClick={() => loadDispositivos()} className="h-8 w-8 p-0" title="Actualizar dispositivos">
                    <RotateCcw className="h-3.5 w-3.5 text-slate-300" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={toggleFullscreen} className="h-8 w-8 p-0" title="Pantalla completa">
                    <Maximize2 className="h-3.5 w-3.5 text-slate-300" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsConfigOpen(true)} className="h-8 w-8 p-0" title="Configuración MQTT">
                    <Settings className="h-3.5 w-3.5 text-slate-300" />
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className={isFullscreen ? "p-6 h-[85vh] bg-card" : "p-6"}>
            {/* Dynamic SCADA Flow Diagram */}
            <ScadaFlowDiagram 
              selectedView="planta-completa" 
              selectedPlanta={selectedPlanta} 
              selectedSeccion={selectedSeccion} 
              selectedSistema={selectedSistema} 
              secciones={secciones}
              sistemas={sistemas}
              plantas={plantas}
            />
            
            {/* Legend */}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-primary" />
                <span>Tanques</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-success" />
                <span>Bombas</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-warning" />
                <span>Válvulas</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-info" />
                <span>Mezcladores</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-muted-foreground" />
                <span>Sensores</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bottom Section: 2-Column Grid for Receta Activa & Dynamic Process Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Receta Activa */}
          <Card className="bg-card border-border shadow-md">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                  <FlaskConical className="h-4 w-4 text-cyan-400" />
                  Receta Activa del Sistema
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-muted-foreground hover:text-foreground" 
                  onClick={loadUltimaTransmision}
                  title="Actualizar información de la receta"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              {isSelectionIncomplete ? (
                <div className="p-6 text-center space-y-3 text-muted-foreground bg-muted/20 rounded-lg border border-dashed border-border">
                  <AlertCircle className="h-9 w-9 text-cyan-400 mx-auto opacity-80 animate-pulse" />
                  <p className="text-sm font-semibold text-foreground">Sin Sistema Seleccionado</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Selecciona una <strong className="text-cyan-300">Planta</strong>, <strong className="text-cyan-300">Sección</strong> y <strong className="text-cyan-300">Sistema</strong> en los filtros superiores para consultar la receta activa del proceso.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-bold text-primary truncate">
                        {selectedSistemaObj?.nombre || "Sistema SCADA"}
                      </p>
                      <span className="text-xs font-mono text-muted-foreground block">
                        {selectedPlantaObj?.nombre || "Planta"} / {selectedSeccionObj?.nombre || "A1"}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-xs font-mono bg-cyan-950/40 text-cyan-400 border-cyan-800">
                      {selectedSistemaObj?.tipo_sistema || "FLUIDOS"}
                    </Badge>
                  </div>

                  <Separator />

                  {ultimaTransmision ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          Última Operación Transmitida
                        </span>
                        <Badge variant="outline" className={cn(
                          "text-xs font-semibold px-2.5 py-0.5",
                          ultimaTransmision.origen === "Receta Programada" 
                            ? "bg-cyan-950/40 text-cyan-300 border-cyan-800" 
                            : "bg-emerald-950/40 text-emerald-300 border-emerald-800"
                        )}>
                          {ultimaTransmision.origen}
                        </Badge>
                      </div>

                      <div className="p-3.5 rounded-lg bg-muted/30 border border-border/80 space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Tipo de Acción:</span>
                          <span className="font-semibold text-foreground font-mono">{ultimaTransmision.tipoOperacion}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Operador / Usuario:</span>
                          <span className="font-mono text-primary font-semibold">{ultimaTransmision.usuario}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Fecha / Hora:</span>
                          <span className="font-mono text-muted-foreground">{ultimaTransmision.timestamp}</span>
                        </div>
                      </div>

                      <div>
                        <h5 className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <Droplet className="h-3.5 w-3.5" />
                          Parámetros Transmitidos al Broker
                        </h5>
                        <div className="p-3 rounded bg-muted/40 border border-border/50 text-xs font-mono text-foreground leading-relaxed break-words">
                          {ultimaTransmision.descripcion}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5 py-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Estado del Bus</span>
                        <Badge variant="outline" className="bg-success/20 text-success border-success/30 text-xs">
                          Listo / En Espera
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground italic text-center py-2">
                        Sin transmisiones recientes registradas para este sistema.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 2: Dynamic Process Controls */}
          <DynamicScadaPanels
            selectedSistemaId={selectedSistemaObj?.id}
            selectedSistemaNombre={selectedSistemaObj?.nombre || "Sistema SCADA"}
            selectedSeccionNombre={selectedSeccionObj?.nombre || "A1"}
            selectedPlantaNombre={selectedPlantaObj?.nombre || "Planta Principal"}
            refreshTrigger={panelsRefreshKey}
            onOpenGestorComandos={() => {
              setControlToEdit(null);
              setIsGestorComandosOpen(true);
            }}
            onEditControl={(ctrl) => {
              setControlToEdit(ctrl);
              setIsGestorComandosOpen(true);
            }}
            onCommandExecuted={() => loadUltimaTransmision()}
            onComandosUpdated={() => {
              fetchCustomComandos();
              setPanelsRefreshKey((prev) => prev + 1);
            }}
          />
        </div>
      </div>

      {/* MQTT Configuration Modal */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Configuración del Broker MQTT
            </DialogTitle>
            <DialogDescription>
              Configura los parámetros del broker MQTT activo para la comunicación en tiempo real con los gateways.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nombre" className="text-right text-xs">
                Nombre
              </Label>
              <Input
                id="nombre"
                value={nombreConfig}
                onChange={(e) => setNombreConfig(e.target.value)}
                placeholder="Configuración Activa"
                className="col-span-3 bg-background border-border h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="broker" className="text-right text-xs">
                Broker URL
              </Label>
              <Input
                id="broker"
                value={brokerUrl}
                onChange={(e) => setBrokerUrl(e.target.value)}
                placeholder="mosquitto"
                className="col-span-3 bg-background border-border h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="port" className="text-right text-xs">
                Puerto
              </Label>
              <Input
                id="port"
                type="number"
                value={puerto}
                onChange={(e) => setPuerto(Number(e.target.value))}
                placeholder="1883"
                className="col-span-3 bg-background border-border h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="user" className="text-right text-xs">
                Usuario
              </Label>
              <Input
                id="user"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="Opcional"
                className="col-span-3 bg-background border-border h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="pass" className="text-right text-xs">
                Contraseña
              </Label>
              <Input
                id="pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Opcional"
                className="col-span-3 bg-background border-border h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="base" className="text-right text-xs">
                Topic Base
              </Label>
              <Input
                id="base"
                value={topicBase}
                onChange={(e) => setTopicBase(e.target.value)}
                placeholder="scada/"
                className="col-span-3 bg-background border-border h-9 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigOpen(false)} className="h-9">
              Cancelar
            </Button>
            <Button onClick={handleSaveMqttConfig} className="h-9">
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Control de Reposición (Bombos) */}
      <ControlReposicionModal
        open={isReposicionOpen}
        onOpenChange={setIsReposicionOpen}
        plantaNombre={selectedPlantaObj?.nombre}
        seccionNombre={selectedSeccionObj?.nombre}
        sistemaNombre={selectedSistemaObj?.nombre}
      />

      {/* Modal de Control de Receta y Mezcla de Líquidos */}
      <ControlRecetaLiquidosModal
        open={isRecetaLiquidosOpen}
        onOpenChange={setIsRecetaLiquidosOpen}
        plantaNombre={selectedPlantaObj?.nombre}
        seccionNombre={selectedSeccionObj?.nombre}
        sistemaNombre={selectedSistemaObj?.nombre}
      />

      {/* Modal de Control Dinámico (Empaquetadora / Hornos / Sólidos) */}
      <ControlDinamicoModal
        open={isDinamicoOpen}
        onOpenChange={setIsDinamicoOpen}
        tipoSistema={dinamicoTipoSistema}
        nombreSistema={dinamicoNombreSistema}
      />

      {/* Modal Personalizador de Botones y Comandos MQTT */}
      <GestorComandosModal
        open={isGestorComandosOpen}
        onOpenChange={(val) => {
          setIsGestorComandosOpen(val);
          if (!val) setControlToEdit(null);
        }}
        selectedSistemaId={selectedSistemaObj?.id}
        selectedSistemaNombre={selectedSistemaObj?.nombre || "Sistema SCADA"}
        selectedTipoSistema={selectedSistemaObj?.tipo_sistema || "MEZCLADO"}
        onComandosUpdated={() => {
          fetchCustomComandos();
          setPanelsRefreshKey((prev) => prev + 1);
        }}
        initialControlToEdit={controlToEdit}
      />

      {/* Modal Editar Tipo de Sistema */}
      <Dialog open={isEditSistemaOpen} onOpenChange={setIsEditSistemaOpen}>
        <DialogContent className="sm:max-w-[425px] bg-slate-950 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-cyan-400">
              <Edit className="h-5 w-5" />
              Configurar Sistema: {formSistema.nombre}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Modifica el nombre y el Tipo de Proceso (Fluidos, Sólidos, Empaque, Temperatura) asociado a este sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3 text-xs">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Nombre del Sistema</Label>
              <Input
                value={formSistema.nombre}
                onChange={(e) => setFormSistema({ ...formSistema, nombre: e.target.value })}
                className="bg-slate-900 border-slate-700 text-slate-100 h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 font-semibold">Tipo de Sistema / Proceso Industrial</Label>
              <Select
                value={formSistema.tipo_sistema}
                onValueChange={(val) => setFormSistema({ ...formSistema, tipo_sistema: val })}
              >
                <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-100 h-9 font-semibold text-cyan-300">
                  <SelectValue placeholder="Seleccionar tipo de sistema" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                  <SelectItem value="FLUIDOS">🧪 Fluidos / Líquidos (Tanques, Bombas, Mezcla)</SelectItem>
                  <SelectItem value="SOLIDOS">📦 Procesamiento de Sólidos (Silos, Cintas)</SelectItem>
                  <SelectItem value="EMPAQUE">📦 Empaquetado y Envasado (Empaquetadoras)</SelectItem>
                  <SelectItem value="TEMPERATURA">🔥 Control de Temperatura (Hornos, Calderas)</SelectItem>
                  <SelectItem value="GENERAL">🌐 Sistema General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300">Descripción (Opcional)</Label>
              <Input
                value={formSistema.descripcion}
                onChange={(e) => setFormSistema({ ...formSistema, descripcion: e.target.value })}
                placeholder="Descripción del proceso o componentes..."
                className="bg-slate-900 border-slate-700 text-slate-100 h-9"
              />
            </div>
          </div>
          <DialogFooter className="pt-2 border-t border-slate-800">
            <Button variant="ghost" size="sm" onClick={() => setIsEditSistemaOpen(false)} className="text-xs text-slate-400">
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSaveSistema} className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs gap-1.5 font-bold">
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VisualizacionSCADA;
