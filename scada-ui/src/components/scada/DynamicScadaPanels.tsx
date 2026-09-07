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
import { MapeoAccion } from "@/components/scada/GestorComandosModal";
import { Sliders, Play, FlaskConical, RefreshCw, Send, Settings, Sparkles, SlidersHorizontal, Hash, CheckCircle2, Edit, Trash2 } from "lucide-react";

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

  // States for values of sliders and numeric inputs: controlId -> value
  const [controlValues, setControlValues] = useState<Record<string | number, number>>({});

  // Recipe Panel State
  const [recipeMode, setRecipeMode] = useState<"PLANTILLA" | "MANUAL">("PLANTILLA");
  const [selectedPlantillaId, setSelectedPlantillaId] = useState<string>("");
  const [recipeParams, setRecipeParams] = useState({
    ingrediente_a: 50,
    ingrediente_b: 30,
    tiempo_mezcla: 15,
  });

  const loadPanelsData = async () => {
    setLoading(true);
    try {
      const [resMapeos, resRecetas, resPlantillas] = await Promise.all([
        apiFetch("/api/v1/mapeos-acciones-mqtt/"),
        apiFetch("/api/v1/recetas/"),
        apiFetch("/api/v1/plantillas/"),
      ]);

      if (resMapeos.ok) {
        const data = await resMapeos.json();
        const list: MapeoAccion[] = Array.isArray(data) ? data : data.results || [];
        setMapeos(list);

        // Init default slider/numeric values
        const initialVals: Record<string | number, number> = {};
        list.forEach((m) => {
          if (m.tipo_control === "SLIDER" || m.tipo_control === "NUMERICO") {
            initialVals[m.id] = m.min_val ?? 0;
          }
        });
        setControlValues(initialVals);
      }

      // Collect recipes & templates
      const recipesList: any[] = [];
      if (resRecetas.ok) {
        const rData = await resRecetas.json();
        const arr = Array.isArray(rData) ? rData : rData.results || [];
        recipesList.push(...arr);
      }
      if (resPlantillas.ok) {
        const pData = await resPlantillas.json();
        const arr = Array.isArray(pData) ? pData : pData.results || [];
        recipesList.push(...arr);
      }
      setRecetasPlantillas(recipesList);

      if (recipesList.length > 0) {
        setSelectedPlantillaId(String(recipesList[0].id));
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

  // When a user selects a recipe template in PLANTILLA mode:
  const handleSelectPlantilla = (idStr: string) => {
    setSelectedPlantillaId(idStr);
    const item = recetasPlantillas.find((r) => String(r.id) === idStr);
    if (item) {
      setRecipeParams({
        ingrediente_a: item.ingrediente_a_lts || item.volumen_a || 100,
        ingrediente_b: item.ingrediente_b_lts || item.volumen_b || 50,
        tiempo_mezcla: item.tiempo_mezcla_min || item.tiempo_estimado || 20,
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

  const toSlug = (str: string) => {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
  };

  // Execute an MQTT Action/Control
  const handleExecuteControl = async (m: MapeoAccion, customVal?: number) => {
    try {
      const subtopic = toSlug(m.nombre_accion);
      const topic = (m.plantilla_topico || "{tenant}/{gateway}/{seccion}/{sistema}/{accion}")
        .replace("{tenant}", "rafaela_sa")
        .replace("{gateway}", "d83add60dbb0")
        .replace("{seccion}", toSlug(selectedSeccionNombre))
        .replace("{sistema}", toSlug(selectedSistemaNombre))
        .replace("{accion}", subtopic);

      let payloadStr = m.plantilla_payload_json || "{}";
      const valToUse = customVal !== undefined ? customVal : (controlValues[m.id] ?? m.min_val ?? 0);

      payloadStr = payloadStr.replace(/\{[a-zA-Z0-9_]+\}/g, String(valToUse));

      const resp = await apiFetch("/api/v1/comunicaciones-mqtt/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          payload: payloadStr,
          direccion: "PUBLICADO",
          qos: 1,
          configuracion: 1,
        }),
      });

      if (resp.ok) {
        toast({
          title: `🚀 ${m.nombre} Enviado`,
          description: `Tópico: ${topic}`,
        });
        if (onCommandExecuted) onCommandExecuted();
      } else {
        const errData = await resp.json().catch(() => ({}));
        toast({
          title: "❌ Error publicando MQTT",
          description: JSON.stringify(errData),
          variant: "destructive"
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

  // Execute Recipe Control (Plantilla vs Manual)
  const handleExecuteReceta = async (m: MapeoAccion) => {
    try {
      const subtopic = toSlug(m.nombre_accion);
      const topic = (m.plantilla_topico || "{tenant}/{gateway}/{seccion}/{sistema}/{accion}")
        .replace("{tenant}", "rafaela_sa")
        .replace("{gateway}", "d83add60dbb0")
        .replace("{seccion}", toSlug(selectedSeccionNombre))
        .replace("{sistema}", toSlug(selectedSistemaNombre))
        .replace("{accion}", subtopic);

      const payloadObj = {
        modo: recipeMode,
        plantilla_id: recipeMode === "PLANTILLA" ? selectedPlantillaId : null,
        ingrediente_a_lts: recipeParams.ingrediente_a,
        ingrediente_b_lts: recipeParams.ingrediente_b,
        tiempo_mezcla_min: recipeParams.tiempo_mezcla,
        timestamp: Date.now() / 1000,
      };

      const resp = await apiFetch("/api/v1/comunicaciones-mqtt/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          payload: JSON.stringify(payloadObj, null, 2),
          direccion: "PUBLICADO",
          qos: 1,
          configuracion: 1,
        }),
      });

      if (resp.ok) {
        toast({
          title: `🧪 Receta Enviada (${recipeMode})`,
          description: `Ing. A: ${recipeParams.ingrediente_a}L, Ing. B: ${recipeParams.ingrediente_b}L, Tiempo: ${recipeParams.tiempo_mezcla}min`,
        });
        if (onCommandExecuted) onCommandExecuted();
      }
    } catch (e) {
      toast({
        title: "❌ Error enviando receta",
        description: "No se pudo comunicar con el bus MQTT.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteControl = async (id: number | string, nombre: string) => {
    try {
      const resp = await apiFetch(`/api/v1/mapeos-acciones-mqtt/${id}/`, {
        method: "DELETE",
      });
      if (resp.ok || resp.status === 204) {
        toast({
          title: "🗑️ Control Eliminado",
          description: `Se eliminó "${nombre}".`,
        });
        loadPanelsData();
        if (onComandosUpdated) onComandosUpdated();
      }
    } catch (e) {
      toast({
        title: "❌ Error al eliminar",
        description: "No se pudo comunicarse con el servidor.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="bg-card border-border shadow-md flex flex-col w-full overflow-hidden">
      {/* Header of Dynamic Sections */}
      <CardHeader className="pb-3 border-b border-border/50 bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
              <Sliders className="h-4 w-4 text-cyan-400" />
              Paneles de Control Dinámicos — {selectedSistemaNombre}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Secciones y controles configurados a medida para este sistema.
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
            <FlaskConical className="h-10 w-10 text-cyan-400/80 mx-auto animate-bounce" />
            <h4 className="text-base font-semibold text-foreground">Sin Paneles Personalizados</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              No se han registrado secciones o controles para el sistema <strong className="text-cyan-300">{selectedSistemaNombre}</strong>. Haz clic en "Personalizar Comandos" para agregar botones, sliders o paneles de receta.
            </p>
            <Button
              size="sm"
              onClick={onOpenGestorComandos}
              className="bg-primary text-primary-foreground font-semibold text-xs gap-1.5 mt-2"
            >
              <Sparkles className="h-4 w-4" /> Alta de Primer Panel / Sección
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 w-full">
            {Object.entries(panelsGrouped).map(([categoryName, controls]) => {
              const recipeControl = controls.find((c) => c.tipo_control === "RECETA");

              return (
                <div key={categoryName} className="rounded-lg bg-muted/20 border border-border/80 p-4 space-y-4 w-full overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between pb-2 border-b border-border/40 gap-2">
                    <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                      {recipeControl ? (
                        <FlaskConical className="h-4 w-4 text-purple-400" />
                      ) : (
                        <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
                      )}
                      {categoryName}
                    </h4>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-mono border-cyan-800 text-cyan-300 bg-cyan-950/40">
                        {controls.length} {controls.length === 1 ? "Control" : "Controles"}
                      </Badge>
                      {recipeControl && (
                        <div className="flex items-center gap-1">
                          {onEditControl && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => onEditControl(recipeControl)}
                              className="h-7 w-7 text-slate-400 hover:text-cyan-400"
                              title="Editar receta"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteControl(recipeControl.id, recipeControl.nombre)}
                            className="h-7 w-7 text-slate-400 hover:text-rose-400"
                            title="Eliminar receta"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 w-full">
                    {/* If section contains a RECETA panel, render Recipe Control with Mode Switch */}
                    {recipeControl && (
                      <div className="space-y-4 p-4 rounded-lg bg-slate-900/60 border border-purple-900/40 w-full overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Label className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                            <FlaskConical className="h-4 w-4 text-purple-400" />
                            Modo de Carga de Mezcla / Receta:
                          </Label>
                          <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-md border border-slate-800">
                            <Button
                              type="button"
                              size="sm"
                              variant={recipeMode === "PLANTILLA" ? "default" : "ghost"}
                              onClick={() => setRecipeMode("PLANTILLA")}
                              className="h-6 px-2 text-[11px] font-semibold"
                            >
                              📋 Plantilla
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={recipeMode === "MANUAL" ? "default" : "ghost"}
                              onClick={() => setRecipeMode("MANUAL")}
                              className="h-6 px-2 text-[11px] font-semibold"
                            >
                              🎚️ Manual
                            </Button>
                          </div>
                        </div>

                        {recipeMode === "PLANTILLA" ? (
                          <div className="space-y-3 pt-2">
                            <Label className="text-xs text-muted-foreground">Seleccionar Receta Registrada en Planificación:</Label>
                            <Select value={selectedPlantillaId} onValueChange={handleSelectPlantilla}>
                              <SelectTrigger className="bg-background border-border text-xs h-9 w-full">
                                <SelectValue placeholder="Seleccionar plantilla de receta" />
                              </SelectTrigger>
                              <SelectContent className="bg-card border-border">
                                {recetasPlantillas.length === 0 ? (
                                  <SelectItem value="none" disabled>No hay plantillas guardadas</SelectItem>
                                ) : (
                                  recetasPlantillas.map((r) => (
                                    <SelectItem key={r.id} value={String(r.id)}>
                                      🧪 {r.nombre || r.producto || `Receta #${r.id}`}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>

                            <div className="grid grid-cols-3 gap-2 text-xs font-mono p-2.5 rounded bg-muted/40 border border-border/60">
                              <div>
                                <span className="text-muted-foreground block text-[10px]">Ingrediente A:</span>
                                <span className="font-bold text-cyan-300">{recipeParams.ingrediente_a} L</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block text-[10px]">Ingrediente B:</span>
                                <span className="font-bold text-cyan-300">{recipeParams.ingrediente_b} L</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block text-[10px]">Tiempo Mezcla:</span>
                                <span className="font-bold text-amber-300">{recipeParams.tiempo_mezcla} min</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4 pt-2">
                            <p className="text-[11px] text-purple-300 italic">
                              Ajusta libremente los volúmenes e ingredientes mediante los deslizadores para lanzar la receta a medida:
                            </p>

                            <div className="space-y-2">
                              <div className="flex justify-between text-xs font-mono">
                                <span>Aceite de Oliva (Ingrediente A):</span>
                                <span className="font-bold text-cyan-300">{recipeParams.ingrediente_a} L</span>
                              </div>
                              <Slider
                                value={[recipeParams.ingrediente_a]}
                                min={0}
                                max={500}
                                step={5}
                                onValueChange={(val) => setRecipeParams({ ...recipeParams, ingrediente_a: val[0] })}
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="flex justify-between text-xs font-mono">
                                <span>Agua Destilada (Ingrediente B):</span>
                                <span className="font-bold text-cyan-300">{recipeParams.ingrediente_b} L</span>
                              </div>
                              <Slider
                                value={[recipeParams.ingrediente_b]}
                                min={0}
                                max={500}
                                step={5}
                                onValueChange={(val) => setRecipeParams({ ...recipeParams, ingrediente_b: val[0] })}
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="flex justify-between text-xs font-mono">
                                <span>Tiempo de Mezcla (Minutos):</span>
                                <span className="font-bold text-amber-300">{recipeParams.tiempo_mezcla} min</span>
                              </div>
                              <Slider
                                value={[recipeParams.tiempo_mezcla]}
                                min={1}
                                max={60}
                                step={1}
                                onValueChange={(val) => setRecipeParams({ ...recipeParams, tiempo_mezcla: val[0] })}
                              />
                            </div>
                          </div>
                        )}

                        <Button
                          size="sm"
                          onClick={() => handleExecuteReceta(recipeControl)}
                          className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs gap-2 py-2 shadow"
                        >
                          <Send className="h-4 w-4" /> Transmitir Receta por MQTT ({recipeMode})
                        </Button>
                      </div>
                    )}

                    {/* Render non-recipe controls (Buttons, Sliders, Numeric inputs) */}
                    {controls.filter((c) => c.tipo_control !== "RECETA").map((ctrl) => {
                      if (ctrl.tipo_control === "SLIDER") {
                        const curVal = controlValues[ctrl.id] ?? ctrl.min_val ?? 0;
                        return (
                          <div key={ctrl.id} className="space-y-2 p-3 rounded-lg bg-slate-900/40 border border-border/80 relative group w-full overflow-hidden">
                            <div className="flex items-center justify-between text-xs font-mono gap-2">
                              <span className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                                <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                                <span className="truncate">{ctrl.nombre}</span>
                              </span>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="font-bold text-emerald-300 text-sm mr-1">
                                  {curVal} {ctrl.unidad}
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
                              value={[curVal]}
                              min={ctrl.min_val ?? 0}
                              max={ctrl.max_val ?? 100}
                              step={1}
                              onValueChange={(v) => setControlValues({ ...controlValues, [ctrl.id]: v[0] })}
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

                      if (ctrl.tipo_control === "NUMERICO") {
                        const curVal = controlValues[ctrl.id] ?? ctrl.min_val ?? 0;
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
                                value={curVal}
                                onChange={(e) => setControlValues({ ...controlValues, [ctrl.id]: Number(e.target.value) })}
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

                      // Action Button (BOTON)
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
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
