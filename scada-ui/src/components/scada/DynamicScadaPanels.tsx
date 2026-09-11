import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import { useScadaWebSocket } from "@/hooks/useScadaWebSocket";
import { MapeoAccion } from "@/components/scada/GestorComandosModal";
import { Sliders, Play, FlaskConical, Send, Settings, Sparkles, SlidersHorizontal, Hash, Box, Edit, Trash2, CheckCircle2 } from "lucide-react";

interface DynamicScadaPanelsProps {
  selectedSistemaId?: number | string;
  selectedSistemaNombre?: string;
  selectedSeccionNombre?: string;
  selectedPlantaNombre?: string;
  onOpenGestorComandos: () => void;
  onEditControl?: (control: MapeoAccion) => void;
  onCommandExecuted?: () => void;
  onComandosUpdated?: () => void;
  refreshTrigger?: number;
}

export function DynamicScadaPanels({
  selectedSistemaId,
  selectedSistemaNombre = "Sistema SCADA",
  selectedSeccionNombre = "A1",
  selectedPlantaNombre = "Planta Principal",
  onOpenGestorComandos,
  onEditControl,
  onCommandExecuted,
  onComandosUpdated,
  refreshTrigger,
}: DynamicScadaPanelsProps) {
  const [mapeos, setMapeos] = useState<MapeoAccion[]>([]);
  const [recetasPlantillas, setRecetasPlantillas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { sendScadaCommand } = useScadaWebSocket();

  // Parameter values per control: controlId -> { paramName: value }
  const [paramValues, setParamValues] = useState<Record<string | number, Record<string, any>>>({});

  // Recipe selection per control
  const [selectedRecipeTemplate, setSelectedRecipeTemplate] = useState<Record<string | number, string>>({});
  const [recipeModes, setRecipeModes] = useState<Record<string | number, "PLANTILLA" | "MANUAL">>({});

  const extractPlaceholders = (template: string): string[] => {
    if (!template) return [];
    const matches = template.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
    const ignored = new Set(['tenant', 'planta', 'gateway', 'gateway_id', 'seccion', 'sistema', 'accion']);
    const unique = Array.from(new Set(matches.map(m => m.slice(1, -1))));
    return unique.filter(v => !ignored.has(v));
  };

  const formatParamLabel = (key: string): string => {
    if (key === 'bombo') return 'Bombo Seleccionado';
    if (key === 'limite_porcentaje' || key === 'limite') return 'Límite de Carga (%)';
    if (key === 'ingrediente_a' || key === 'ingrediente_a_lts') return 'Aceite de Oliva / Ingrediente A (L)';
    if (key === 'ingrediente_b' || key === 'ingrediente_b_lts') return 'Agua Destilada / Ingrediente B (L)';
    if (key === 'tiempo_horas' || key === 'horas' || key === 'tiempo_mezcla_horas') return 'Tiempo Mezcla (Horas)';
    if (key === 'tiempo_minutos' || key === 'minutos' || key === 'tiempo_mezcla_minutos' || key === 'tiempo_mezcla_min') return 'Tiempo Mezcla (Minutos)';
    if (key === 'tiempo_mezcla' || key === 'tiempo') return 'Tiempo de Mezcla (Minutos)';
    if (key === 'setpoint' || key === 'setpoint_val' || key === 'valor') return 'Valor de Ajuste';
    return key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  };

  const getDefaultValueForParam = (key: string, ctrl: MapeoAccion): any => {
    if (key === 'bombo') return 1;
    if (key.includes('limite') || key.includes('porcentaje')) return 75;
    if (key === 'ingrediente_a' || key.includes('aceite') || key === 'ingrediente_a_lts') return 50;
    if (key === 'ingrediente_b' || key.includes('agua') || key === 'ingrediente_b_lts') return 30;
    if (key.includes('hora')) return 0;
    if (key.includes('minuto') || key.includes('min')) return 1;
    if (key.includes('tiempo')) return 1;
    if (ctrl.min_val !== undefined) return ctrl.min_val;
    return 0;
  };

  const loadPanelsData = async () => {
    setLoading(true);
    try {
      const [resMapeos, resRecetas, resPlantillas] = await Promise.all([
        apiFetch("/api/v1/mapeos-acciones-mqtt/"),
        apiFetch("/api/v1/recetas/"),
        apiFetch("/api/v1/plantillas/"),
      ]);

      let list: MapeoAccion[] = [];
      if (resMapeos.ok) {
        const data = await resMapeos.json();
        list = Array.isArray(data) ? data : data.results || [];
        setMapeos(list);
      }

      let loadedRecipes: any[] = [];
      if (resRecetas.ok) {
        const dRec = await resRecetas.json();
        loadedRecipes = Array.isArray(dRec) ? dRec : dRec.results || [];
        setRecetasPlantillas(loadedRecipes);
      } else if (resPlantillas.ok) {
        const dPla = await resPlantillas.json();
        loadedRecipes = Array.isArray(dPla) ? dPla : dPla.results || [];
        setRecetasPlantillas(loadedRecipes);
      }

      // Initialize parameters state for all controls
      setParamValues(prev => {
        const newParams = { ...prev };
        list.forEach(ctrl => {
          if (!newParams[ctrl.id]) {
            newParams[ctrl.id] = {};
          }
          const placeholders = extractPlaceholders(ctrl.plantilla_payload_json);
          placeholders.forEach(p => {
            if (newParams[ctrl.id][p] === undefined) {
              newParams[ctrl.id][p] = getDefaultValueForParam(p, ctrl);
            }
          });
          // For single slider/numeric controls with single value placeholder
          if (ctrl.tipo_control === 'SLIDER' || ctrl.tipo_control === 'NUMERICO') {
            if (newParams[ctrl.id]['_single_val'] === undefined) {
              newParams[ctrl.id]['_single_val'] = ctrl.min_val ?? 0;
            }
          }
        });
        return newParams;
      });

      // Auto-select first recipe for recipe controls if none selected
      if (loadedRecipes.length > 0) {
        list.filter(c => c.tipo_control === 'RECETA' || c.nombre_accion.includes('receta')).forEach(ctrl => {
          setSelectedRecipeTemplate(prev => {
            if (!prev[ctrl.id]) {
              const firstRecipe = loadedRecipes[0];
              // Populate initial parameters
              setTimeout(() => {
                handleSelectPlantillaForControl(ctrl.id, String(firstRecipe.id), loadedRecipes);
              }, 0);
              return { ...prev, [ctrl.id]: String(firstRecipe.id) };
            }
            return prev;
          });
        });
      }

    } catch (e) {
      console.warn("Error cargando paneles de control dinámicos:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPanelsData();
  }, [selectedSistemaId, refreshTrigger]);

  const toSlug = (str: string) => {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
  };

  const handleParamChange = (ctrlId: string | number, paramName: string, val: any) => {
    setParamValues(prev => ({
      ...prev,
      [ctrlId]: {
        ...(prev[ctrlId] || {}),
        [paramName]: val,
      },
    }));
  };

  const handleSelectPlantillaForControl = (ctrlId: string | number, plantillaId: string, customRecipesList?: any[]) => {
    setSelectedRecipeTemplate(prev => ({ ...prev, [ctrlId]: plantillaId }));
    const list = customRecipesList || recetasPlantillas;
    const item = list.find(r => String(r.id) === plantillaId);
    if (!item) return;

    // 1. Calculate duration / time in hours and minutes
    let calcHoras = 0;
    let calcMinutos = 1;
    if (item.tiempo_horas !== undefined || item.tiempo_minutos !== undefined) {
      calcHoras = Number(item.tiempo_horas) || 0;
      calcMinutos = Number(item.tiempo_minutos) || 0;
    } else if (item.tiempo_mezcla_min || item.tiempo_estimado) {
      const match = String(item.tiempo_mezcla_min || item.tiempo_estimado).match(/(\d+)/);
      const totalMin = match ? Number(match[1]) : 1;
      calcHoras = Math.floor(totalMin / 60);
      calcMinutos = totalMin % 60;
    }
    const totalCalcMinutos = calcHoras * 60 + calcMinutos;

    // 2. Parse ingredients and quantities
    let valA = 50;
    let valB = 30;

    if (item.ingrediente_a_lts !== undefined || item.volumen_a !== undefined) {
      valA = Number(item.ingrediente_a_lts || item.volumen_a) || 50;
    }
    if (item.ingrediente_b_lts !== undefined || item.volumen_b !== undefined) {
      valB = Number(item.ingrediente_b_lts || item.volumen_b) || 30;
    }

    // If ingredients stored in json/text string, extract numbers
    const rawIng = item.ingredientes_json || item.ingredientes;
    if (rawIng) {
      if (typeof rawIng === 'string') {
        const numbers = rawIng.match(/(\d+(?:\.\d+)?)/g)?.map(Number) || [];
        if (numbers.length >= 1) valA = numbers[0];
        if (numbers.length >= 2) valB = numbers[1];
      } else if (Array.isArray(rawIng)) {
        if (rawIng[0]?.cantidad) valA = Number(rawIng[0].cantidad);
        if (rawIng[1]?.cantidad) valB = Number(rawIng[1].cantidad);
      }
    }

    // 3. Update all placeholder keys matching these values in paramValues state
    setParamValues(prev => {
      const cur = { ...(prev[ctrlId] || {}) };
      
      // Update standard recipe parameters
      cur.ingrediente_a = valA;
      cur.ingrediente_a_lts = valA;
      cur.volumen_a = valA;
      cur.aceite = valA;
      cur.aceite_oliva = valA;

      cur.ingrediente_b = valB;
      cur.ingrediente_b_lts = valB;
      cur.volumen_b = valB;
      cur.agua = valB;
      cur.agua_destilada = valB;

      cur.tiempo_horas = calcHoras;
      cur.horas = calcHoras;
      cur.tiempo_mezcla_horas = calcHoras;

      cur.tiempo_minutos = calcMinutos;
      cur.minutos = calcMinutos;
      cur.tiempo_mezcla_minutos = calcMinutos;
      cur.tiempo_mezcla_min = calcMinutos;

      cur.tiempo = totalCalcMinutos;
      cur.tiempo_mezcla = totalCalcMinutos;
      cur.duracion = totalCalcMinutos;

      return {
        ...prev,
        [ctrlId]: cur,
      };
    });

    toast({
      title: `🧪 Receta Cargada: ${item.nombre || item.producto || `Receta #${item.id}`}`,
      description: `Ing. A: ${valA}L, Ing. B: ${valB}L, Tiempo: ${calcHoras}h ${calcMinutos}min`,
    });
  };

  // Execute ANY Dynamic Control
  const handleExecuteControl = async (m: MapeoAccion) => {
    try {
      const subtopic = toSlug(m.nombre_accion);
      const rawSec = selectedSeccionNombre && selectedSeccionNombre !== "Todas las Secciones" ? toSlug(selectedSeccionNombre) : "a1";
      const rawSys = selectedSistemaNombre && selectedSistemaNombre !== "Todos los Sistemas" ? toSlug(selectedSistemaNombre) : "linea_mezclado_1";
      const rawTenant = selectedPlantaNombre && selectedPlantaNombre !== "Todas las Plantas" ? toSlug(selectedPlantaNombre) : "rafaela_sa";
      
      const topic = (m.plantilla_topico || "{tenant}/{gateway}/{seccion}/{sistema}/{accion}")
        .replace(/\{tenant\}/g, rawTenant)
        .replace(/\{planta\}/g, rawTenant)
        .replace(/\{gateway\}/g, "d83add60dbb0")
        .replace(/\{gateway_id\}/g, "d83add60dbb0")
        .replace(/\{seccion\}/g, rawSec)
        .replace(/\{sistema\}/g, rawSys)
        .replace(/\{accion\}/g, subtopic);

      let payloadStr = m.plantilla_payload_json || "{}";
      const placeholders = extractPlaceholders(payloadStr);
      const curCtrlParams = paramValues[m.id] || {};

      if (placeholders.length > 0) {
        placeholders.forEach(paramKey => {
          const rawVal = curCtrlParams[paramKey] !== undefined 
            ? curCtrlParams[paramKey] 
            : getDefaultValueForParam(paramKey, m);
          
          const regex = new RegExp(`\\{${paramKey}\\}`, 'g');
          // If value is numeric, keep as number format, otherwise string
          const formattedVal = typeof rawVal === 'number' ? String(rawVal) : String(rawVal);
          payloadStr = payloadStr.replace(regex, formattedVal);
        });
      } else if (m.tipo_control === 'SLIDER' || m.tipo_control === 'NUMERICO') {
        const singleVal = curCtrlParams['_single_val'] ?? m.min_val ?? 0;
        payloadStr = payloadStr.replace(/\{[a-zA-Z0-9_]+\}/g, String(singleVal));
      }

      const payloadObj = {
        topico: topic,
        payload: payloadStr,
        sistema_id: selectedSistemaId,
        origen: `Panel Dinámico: ${m.nombre}`,
      };

      const result = await sendScadaCommand({
        action: "transmitir",
        payload: payloadObj,
        fallbackHttp: {
          endpoint: "/api/v1/auditoria/transmitir/",
          method: "POST",
          body: payloadObj,
        },
      });

      if (result.ok) {
        toast({
          title: `🚀 ${m.nombre} Enviado`,
          description: `Tópico: ${topic} | ${result.source === "websocket" ? "⚡ WebSocket <10ms" : "HTTP REST"}`,
        });
        if (onCommandExecuted) onCommandExecuted();
      } else {
        toast({
          title: "❌ Error publicando MQTT",
          description: result.error || "Error al transmitir comando",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "❌ Error al enviar comando",
        description: "Comprueba la conexión con el broker MQTT.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteControl = async (id: number | string, nombre: string) => {
    // Actualización optimista inmediata en UI sin esperar al servidor
    setMapeos(prev => prev.filter(m => m.id !== id));
    toast({
      title: "🗑️ Control Eliminado",
      description: `Se eliminó "${nombre}".`,
    });

    try {
      const resp = await apiFetch(`/api/v1/mapeos-acciones-mqtt/${id}/`, {
        method: "DELETE",
      });
      if (resp.ok || resp.status === 204) {
        if (onComandosUpdated) onComandosUpdated();
      } else {
        // Rollback en caso de error
        loadPanelsData();
      }
    } catch (e) {
      loadPanelsData();
      toast({
        title: "❌ Error al eliminar",
        description: "No se pudo comunicarse con el servidor.",
        variant: "destructive",
      });
    }
  };

  // Filter controls relevant for current selected system
  const filteredMapeos = mapeos.filter((m) => {
    if (!m.sistema) return true; // General control
    if (selectedSistemaId && String(m.sistema) === String(selectedSistemaId)) return true;
    return false;
  });

  // Group controls by category/section panel name ("Cuadrados")
  const panelsGrouped: Record<string, MapeoAccion[]> = {};
  filteredMapeos.forEach((m) => {
    const cat = m.categoria_panel || "Controles del Proceso";
    if (!panelsGrouped[cat]) panelsGrouped[cat] = [];
    panelsGrouped[cat].push(m);
  });

  return (
    <Card className="bg-card border-border shadow-md flex flex-col w-full overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-3 border-b border-border/50 bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
              <Sliders className="h-4 w-4 text-cyan-400" />
              Paneles de Control Dinámicos — {selectedSistemaNombre}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Controles parametrizados, sliders, recetas y botones configurables sin modificar código.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenGestorComandos}
            className="h-8 px-2.5 text-xs bg-slate-900 border-cyan-800 text-cyan-300 hover:bg-slate-800 gap-1.5 font-semibold"
          >
            <Settings className="h-3.5 w-3.5" />
            ⚙️ Personalizar Comandos
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-5 flex-1 overflow-y-auto space-y-4">
        {Object.keys(panelsGrouped).length === 0 ? (
          <div className="border border-dashed border-border p-8 rounded-lg text-center space-y-3 bg-muted/20">
            <Sparkles className="h-10 w-10 text-cyan-400/80 mx-auto animate-bounce" />
            <h4 className="text-base font-semibold text-foreground">Sin Comandos ni Secciones Personalizadas</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              No se han registrado controles para el sistema <strong className="text-cyan-300">{selectedSistemaNombre}</strong>. Haz clic en "Personalizar Comandos" para agregar controles parametrizados, botones o sliders.
            </p>
            <Button
              size="sm"
              onClick={onOpenGestorComandos}
              className="bg-primary text-primary-foreground font-semibold text-xs gap-1.5 mt-2"
            >
              <Sparkles className="h-4 w-4" /> Alta de Primer Comando / Panel
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 w-full">
            {Object.entries(panelsGrouped).map(([categoryName, controls]) => (
              <div key={categoryName} className="rounded-lg bg-muted/20 border border-border/80 p-4 space-y-4 w-full overflow-hidden">
                <div className="flex flex-wrap items-center justify-between pb-2 border-b border-border/40 gap-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
                    {categoryName}
                  </h4>
                  <Badge variant="outline" className="text-[10px] font-mono border-cyan-800 text-cyan-300 bg-cyan-950/40">
                    {controls.length} {controls.length === 1 ? "Elemento" : "Elementos"}
                  </Badge>
                </div>

                <div className="space-y-4 w-full">
                  {controls.map((ctrl) => {
                    const placeholders = extractPlaceholders(ctrl.plantilla_payload_json);
                    const isMultiParam = placeholders.length > 0 || ctrl.tipo_control === 'PARAMETRIZADO' || ctrl.tipo_control === 'RECETA';
                    const curParams = paramValues[ctrl.id] || {};

                    // 1. Multi-parameter / Form / Recipe / Reposición Dynamic Control
                    if (isMultiParam) {
                      const isRecipe = ctrl.tipo_control === 'RECETA' || ctrl.nombre_accion.includes('receta');
                      const currentMode = recipeModes[ctrl.id] || (isRecipe && recetasPlantillas.length > 0 ? "PLANTILLA" : "MANUAL");

                      return (
                        <div key={ctrl.id} className="space-y-3 p-4 rounded-lg bg-slate-900/70 border border-slate-800 w-full overflow-hidden relative group">
                          {/* Title & Actions */}
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                            <div className="flex items-center gap-2">
                              {isRecipe ? (
                                <FlaskConical className="h-4 w-4 text-purple-400 flex-shrink-0" />
                              ) : (
                                <Box className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                              )}
                              <span className="font-semibold text-xs text-foreground">{ctrl.nombre}</span>
                              <Badge variant="outline" className="text-[9px] font-mono border-slate-700 text-cyan-300">
                                /{ctrl.nombre_accion}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-1">
                              {onEditControl && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onEditControl(ctrl)}
                                  className="h-6 w-6 text-slate-400 hover:text-cyan-400"
                                  title="Editar comando"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteControl(ctrl.id, ctrl.nombre)}
                                className="h-6 w-6 text-slate-400 hover:text-rose-400"
                                title="Eliminar comando"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          {/* Recipe Mode Selector if Recipe */}
                          {isRecipe && (
                            <div className="flex items-center justify-between gap-2 pt-1 pb-2">
                              <span className="text-[11px] text-purple-300 font-medium">Modo de Carga:</span>
                              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={currentMode === "PLANTILLA" ? "default" : "ghost"}
                                  onClick={() => setRecipeModes(prev => ({ ...prev, [ctrl.id]: "PLANTILLA" }))}
                                  className="h-6 px-2 text-[10px] font-semibold"
                                >
                                  📋 Plantilla
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={currentMode === "MANUAL" ? "default" : "ghost"}
                                  onClick={() => setRecipeModes(prev => ({ ...prev, [ctrl.id]: "MANUAL" }))}
                                  className="h-6 px-2 text-[10px] font-semibold"
                                >
                                  🎚️ Manual
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Recipe Template Selector */}
                          {isRecipe && currentMode === "PLANTILLA" && (
                            <div className="space-y-2">
                              <Label className="text-[11px] text-muted-foreground">Seleccionar Receta Registrada:</Label>
                              <Select
                                value={selectedRecipeTemplate[ctrl.id] || ""}
                                onValueChange={(val) => handleSelectPlantillaForControl(ctrl.id, val)}
                              >
                                <SelectTrigger className="bg-background border-border text-xs h-8 w-full">
                                  <SelectValue placeholder="Seleccionar receta..." />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                  {recetasPlantillas.length === 0 ? (
                                    <SelectItem value="none" disabled>No hay recetas disponibles</SelectItem>
                                  ) : (
                                    recetasPlantillas.map((r) => (
                                      <SelectItem key={r.id} value={String(r.id)}>
                                        🧪 {r.nombre || r.producto || `Receta #${r.id}`}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {/* Dynamic Parameters Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                            {placeholders.map((paramKey) => {
                              const val = curParams[paramKey] !== undefined ? curParams[paramKey] : getDefaultValueForParam(paramKey, ctrl);
                              const isPercentage = paramKey.includes('porcentaje') || paramKey.includes('limite');
                              const isBombo = paramKey === 'bombo';
                              const isHoras = paramKey.includes('hora');
                              const isMinutos = paramKey.includes('minuto') || paramKey.includes('min');

                              return (
                                <div key={paramKey} className="space-y-1.5 p-2.5 rounded bg-slate-950/80 border border-slate-800">
                                  <div className="flex items-center justify-between text-xs">
                                    <Label className="text-[11px] text-slate-300 font-semibold truncate">
                                      {formatParamLabel(paramKey)}
                                    </Label>
                                    <span className="font-mono font-bold text-cyan-300 text-xs">
                                      {val} {isPercentage ? "%" : isBombo ? `(Bombo ${val})` : isHoras ? "h" : isMinutos ? "min" : ""}
                                    </span>
                                  </div>

                                  {/* If Bombo selector */}
                                  {isBombo ? (
                                    <div className="flex gap-1.5 pt-1">
                                      {(() => {
                                        let bomboCount = 2; // Default 2 bombos (1, 2)
                                        const match = ctrl.plantilla_payload_json?.match(/["']?_?bombo_max["']?\s*:\s*(\d+)/i);
                                        if (match) {
                                          const parsed = Number(match[1]);
                                          if (!isNaN(parsed) && parsed >= 2 && parsed <= 8) {
                                            bomboCount = parsed;
                                          }
                                        } else if (ctrl.max_val && ctrl.max_val >= 2 && ctrl.max_val <= 8) {
                                          bomboCount = Math.round(ctrl.max_val);
                                        }
                                        bomboCount = Math.max(2, Math.min(8, bomboCount));

                                        return Array.from({ length: bomboCount }, (_, i) => i + 1).map((num) => (
                                          <Button
                                            key={num}
                                            type="button"
                                            size="sm"
                                            variant={val === num ? "default" : "outline"}
                                            onClick={() => handleParamChange(ctrl.id, paramKey, num)}
                                            className={`flex-1 h-8 text-xs font-mono font-bold ${val === num ? 'bg-cyan-600 text-white shadow-sm' : 'border-slate-800 text-slate-300 hover:bg-slate-800'}`}
                                          >
                                            {num}
                                          </Button>
                                        ));
                                      })()}
                                    </div>
                                  ) : typeof val === 'number' || !isNaN(Number(val)) ? (
                                    <div className="space-y-2 pt-1">
                                      <Slider
                                        value={[Number(val) || 0]}
                                        min={0}
                                        max={isPercentage ? 100 : isHoras ? 24 : isMinutos ? 59 : (ctrl.max_val && ctrl.max_val > 10 ? ctrl.max_val : 500)}
                                        step={1}
                                        onValueChange={(v) => handleParamChange(ctrl.id, paramKey, v[0])}
                                      />
                                      <Input
                                        type="number"
                                        value={val}
                                        onChange={(e) => handleParamChange(ctrl.id, paramKey, Number(e.target.value))}
                                        className="bg-slate-900 border-slate-700 text-xs h-7 font-mono text-cyan-200"
                                      />
                                    </div>
                                  ) : (
                                    <Input
                                      value={val}
                                      onChange={(e) => handleParamChange(ctrl.id, paramKey, e.target.value)}
                                      className="bg-slate-900 border-slate-700 text-xs h-7 font-mono text-cyan-200"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Transmit Button */}
                          <Button
                            size="sm"
                            onClick={() => handleExecuteControl(ctrl)}
                            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs gap-2 py-2 mt-2 shadow"
                          >
                            <Send className="h-3.5 w-3.5" />
                            Transmitir {ctrl.nombre} por MQTT
                          </Button>
                        </div>
                      );
                    }

                    // 2. Single Slider Control
                    if (ctrl.tipo_control === 'SLIDER') {
                      const singleVal = curParams['_single_val'] ?? ctrl.min_val ?? 0;
                      return (
                        <div key={ctrl.id} className="space-y-2 p-3 rounded-lg bg-slate-900/40 border border-border/80 relative group w-full overflow-hidden">
                          <div className="flex items-center justify-between text-xs font-mono gap-2">
                            <span className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                              <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                              <span className="truncate">{ctrl.nombre}</span>
                            </span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span className="font-bold text-emerald-300 text-sm mr-1">
                                {singleVal} {ctrl.unidad}
                              </span>
                              {onEditControl && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onEditControl(ctrl)}
                                  className="h-6 w-6 text-slate-400 hover:text-cyan-400 opacity-70 group-hover:opacity-100"
                                  title="Editar control"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteControl(ctrl.id, ctrl.nombre)}
                                className="h-6 w-6 text-slate-400 hover:text-rose-400 opacity-70 group-hover:opacity-100"
                                title="Eliminar control"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <Slider
                            value={[singleVal]}
                            min={ctrl.min_val ?? 0}
                            max={ctrl.max_val ?? 100}
                            step={1}
                            onValueChange={(v) => handleParamChange(ctrl.id, '_single_val', v[0])}
                          />
                          <div className="flex justify-end pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleExecuteControl(ctrl)}
                              className="h-7 text-xs bg-emerald-950/40 border-emerald-800 text-emerald-300 hover:bg-emerald-900/60 font-mono gap-1"
                            >
                              <Send className="h-3 w-3" /> Aplicar Setpoint
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    // 3. Single Numeric Input Control
                    if (ctrl.tipo_control === 'NUMERICO') {
                      const singleVal = curParams['_single_val'] ?? ctrl.min_val ?? 0;
                      return (
                        <div key={ctrl.id} className="space-y-2 p-3 rounded-lg bg-slate-900/40 border border-border/80 relative group w-full overflow-hidden">
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                              <Hash className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                              <span className="truncate">{ctrl.nombre}</span>
                            </span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span className="text-xs text-muted-foreground font-mono mr-1">({ctrl.unidad})</span>
                              {onEditControl && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onEditControl(ctrl)}
                                  className="h-6 w-6 text-slate-400 hover:text-cyan-400 opacity-70 group-hover:opacity-100"
                                  title="Editar control"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteControl(ctrl.id, ctrl.nombre)}
                                className="h-6 w-6 text-slate-400 hover:text-rose-400 opacity-70 group-hover:opacity-100"
                                title="Eliminar control"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              value={singleVal}
                              onChange={(e) => handleParamChange(ctrl.id, '_single_val', Number(e.target.value))}
                              className="bg-background border-border text-xs h-8 font-mono flex-1"
                            />
                            <Button
                              size="sm"
                              onClick={() => handleExecuteControl(ctrl)}
                              className="h-8 text-xs bg-amber-600 hover:bg-amber-500 text-white font-mono gap-1 flex-shrink-0"
                            >
                              <Send className="h-3 w-3" /> Enviar
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    // 4. Action Button (BOTON)
                    return (
                      <div key={ctrl.id} className="pt-1 flex items-center gap-1.5 group w-full min-w-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExecuteControl(ctrl)}
                          className="flex-1 min-w-0 h-9 text-xs justify-start gap-2 bg-slate-900/80 text-cyan-200 border-slate-700 hover:bg-slate-800 font-semibold px-3"
                        >
                          <Play className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
                          <span className="truncate">{ctrl.nombre}</span>
                        </Button>
                        {onEditControl && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => onEditControl(ctrl)}
                            className="h-8 w-8 flex-shrink-0 text-slate-400 hover:text-cyan-400 opacity-70 group-hover:opacity-100"
                            title="Editar control"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteControl(ctrl.id, ctrl.nombre)}
                          className="h-8 w-8 flex-shrink-0 text-slate-400 hover:text-rose-400 opacity-70 group-hover:opacity-100"
                          title="Eliminar control"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


