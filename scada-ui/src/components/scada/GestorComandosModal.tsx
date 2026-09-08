import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import { Plus, Trash2, Edit, Save, Terminal, Layers, RefreshCw, SlidersHorizontal, Play, FlaskConical, Hash, Sparkles, Box, CheckCircle2 } from "lucide-react";

export interface MapeoAccion {
  id: number | string;
  nombre: string;
  sistema?: number | string | null;
  sistema_nombre?: string;
  tipo_sistema: string;
  tipo_control?: 'BOTON' | 'SLIDER' | 'NUMERICO' | 'PARAMETRIZADO' | 'RECETA';
  categoria_panel?: string;
  nombre_accion: string;
  plantilla_topico: string;
  plantilla_payload_json: string;
  min_val?: number;
  max_val?: number;
  unidad?: string;
  activo?: boolean;
}

interface GestorComandosModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSistemaId?: number | string;
  selectedSistemaNombre?: string;
  selectedTipoSistema?: string;
  onComandosUpdated?: () => void;
  initialControlToEdit?: MapeoAccion | null;
}

export function GestorComandosModal({
  open,
  onOpenChange,
  selectedSistemaId,
  selectedSistemaNombre = "Sistema SCADA",
  selectedTipoSistema = "MEZCLADO",
  onComandosUpdated,
  initialControlToEdit = null,
}: GestorComandosModalProps) {
  const [mapeos, setMapeos] = useState<MapeoAccion[]>([]);
  const [sistemas, setSistemas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingMapeo, setEditingMapeo] = useState<MapeoAccion | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const normalizeTipoSistema = (tipo?: string): string => {
    if (!tipo) return 'FLUIDOS';
    const u = tipo.toUpperCase();
    if (u.includes('FLUID') || u.includes('LIQUID') || u.includes('MEZCL')) return 'FLUIDOS';
    if (u.includes('SOLID')) return 'SOLIDOS';
    if (u.includes('EMPAQ') || u.includes('ENVAS')) return 'EMPAQUE';
    if (u.includes('TEMP') || u.includes('CALOR') || u.includes('FRIO')) return 'TEMPERATURA';
    if (['FLUIDOS', 'SOLIDOS', 'EMPAQUE', 'TEMPERATURA', 'GENERAL'].includes(u)) return u;
    return 'FLUIDOS';
  };

  const [form, setForm] = useState({
    nombre: "",
    sistema: selectedSistemaId ? String(selectedSistemaId) : "general",
    tipo_sistema: normalizeTipoSistema(selectedTipoSistema),
    tipo_control: "BOTON" as 'BOTON' | 'SLIDER' | 'NUMERICO' | 'PARAMETRIZADO' | 'RECETA',
    categoria_panel: "Controles del Proceso",
    nombre_accion: "",
    plantilla_topico: "{tenant}/{gateway}/{seccion}/{sistema}/{accion}",
    plantilla_payload_json: '{\n  "comando": "EJECUTAR",\n  "estado": "ACTIVO"\n}',
    min_val: 0,
    max_val: 100,
    unidad: "L",
  });

  const extractPlaceholders = (template: string): string[] => {
    const matches = template.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
    const ignored = new Set(['tenant', 'planta', 'gateway', 'gateway_id', 'seccion', 'sistema', 'accion']);
    const unique = Array.from(new Set(matches.map(m => m.slice(1, -1))));
    return unique.filter(v => !ignored.has(v));
  };

  const detectedPlaceholders = extractPlaceholders(form.plantilla_payload_json);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resMapeos, resSistemas] = await Promise.all([
        apiFetch("/api/v1/mapeos-acciones-mqtt/"),
        apiFetch("/api/v1/sistemas/"),
      ]);

      if (resMapeos.ok) {
        const data = await resMapeos.json();
        const list: MapeoAccion[] = Array.isArray(data) ? data : data.results || [];
        setMapeos(list);
      }

      if (resSistemas.ok) {
        const dSys = await resSistemas.json();
        const sList = Array.isArray(dSys) ? dSys : dSys.results || [];
        setSistemas(sList);
      }
    } catch (e) {
      console.warn("Error obteniendo mapeos / sistemas:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchData();
      if (initialControlToEdit) {
        handleOpenEdit(initialControlToEdit);
      } else {
        setIsFormOpen(false);
      }
    }
  }, [open, initialControlToEdit]);

  const getBomboCountFromMapeo = (m: { plantilla_payload_json?: string; max_val?: number }): number => {
    const match = m.plantilla_payload_json?.match(/["']?_?bombo_max["']?\s*:\s*(\d+)/i);
    if (match) {
      const parsed = Number(match[1]);
      if (!isNaN(parsed) && parsed >= 2 && parsed <= 8) return parsed;
    }
    if (m.max_val && m.max_val >= 2 && m.max_val <= 8) {
      return Math.round(m.max_val);
    }
    return 2;
  };

  const handleUpdateBomboCount = (count: number) => {
    setForm(f => {
      let json = f.plantilla_payload_json;
      if (json.includes('"_bombo_max"')) {
        json = json.replace(/"_bombo_max"\s*:\s*\d+/g, `"_bombo_max": ${count}`);
      } else {
        json = json.replace(/\}$/, `,\n  "_bombo_max": ${count}\n}`);
      }
      return {
        ...f,
        max_val: count,
        min_val: 1,
        plantilla_payload_json: json,
      };
    });
  };

  const handleOpenNuevo = () => {
    setEditingMapeo(null);
    setForm({
      nombre: "Nuevo Comando Personalizado",
      sistema: selectedSistemaId ? String(selectedSistemaId) : "general",
      tipo_sistema: normalizeTipoSistema(selectedTipoSistema),
      tipo_control: "BOTON",
      categoria_panel: "Controles del Proceso",
      nombre_accion: "nuevo_comando",
      plantilla_topico: "{tenant}/{gateway}/{seccion}/{sistema}/{accion}",
      plantilla_payload_json: '{\n  "comando": "EJECUTAR"\n}',
      min_val: 0,
      max_val: 100,
      unidad: "%",
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (m: MapeoAccion) => {
    setEditingMapeo(m);
    setForm({
      nombre: m.nombre,
      sistema: m.sistema ? String(m.sistema) : "general",
      tipo_sistema: normalizeTipoSistema(m.tipo_sistema),
      tipo_control: m.tipo_control || "BOTON",
      categoria_panel: m.categoria_panel || "Controles del Proceso",
      nombre_accion: m.nombre_accion,
      plantilla_topico: m.plantilla_topico,
      plantilla_payload_json: m.plantilla_payload_json,
      min_val: m.min_val ?? 0,
      max_val: m.max_val ?? 100,
      unidad: m.unidad || "",
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim() || !form.nombre_accion.trim()) {
      toast({
        title: "⚠️ Campos incompletos",
        description: "El nombre y la acción (sub-tópico) son requeridos.",
        variant: "destructive",
      });
      return;
    }

    const cleanSubtopic = form.nombre_accion
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, "_")
      .replace(/-/g, "_");

    const payloadToSave = {
      nombre: form.nombre,
      sistema: form.sistema === "general" || !form.sistema ? null : Number(form.sistema),
      tipo_sistema: normalizeTipoSistema(form.tipo_sistema),
      tipo_control: form.tipo_control,
      categoria_panel: form.categoria_panel || "Controles del Proceso",
      nombre_accion: cleanSubtopic,
      plantilla_topico: form.plantilla_topico.includes("{accion}") ? form.plantilla_topico : `${form.plantilla_topico}/${cleanSubtopic}`,
      plantilla_payload_json: form.plantilla_payload_json,
      min_val: Number(form.min_val) || 0,
      max_val: Number(form.max_val) || 100,
      unidad: form.unidad,
      activo: true,
    };

    try {
      if (editingMapeo && editingMapeo.id) {
        const resp = await apiFetch(`/api/v1/mapeos-acciones-mqtt/${editingMapeo.id}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadToSave),
        });

        if (resp.ok) {
          toast({
            title: "✅ Control Actualizado",
            description: `Se actualizó "${form.nombre}" exitosamente.`,
          });
        } else {
          const errData = await resp.json().catch(() => ({}));
          const errMsg = typeof errData === 'object' ? JSON.stringify(errData) : String(errData);
          toast({
            title: "❌ Error al actualizar",
            description: errMsg || "No se pudo actualizar el control.",
            variant: "destructive",
          });
          return;
        }
      } else {
        const resp = await apiFetch("/api/v1/mapeos-acciones-mqtt/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadToSave),
        });
        if (resp.ok) {
          toast({
            title: "✅ Control Creado",
            description: `Se añadió "${form.nombre}" para el sistema.`,
          });
        } else {
          const errData = await resp.json().catch(() => ({}));
          const errMsg = typeof errData === 'object' ? JSON.stringify(errData) : String(errData);
          toast({
            title: "❌ Error al crear",
            description: errMsg || "No se pudo crear el control.",
            variant: "destructive",
          });
          return;
        }
      }
      setIsFormOpen(false);
      fetchData();
      if (onComandosUpdated) onComandosUpdated();
    } catch (e) {
      toast({
        title: "❌ Error al guardar",
        description: "No se pudo conectar con la base de datos de mapeos.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: number | string, nombre: string) => {
    try {
      const resp = await apiFetch(`/api/v1/mapeos-acciones-mqtt/${id}/`, {
        method: "DELETE",
      });
      if (resp.ok || resp.status === 204) {
        toast({
          title: "🗑️ Control Eliminado",
          description: `Se eliminó "${nombre}".`,
        });
        fetchData();
        if (onComandosUpdated) onComandosUpdated();
      } else {
        toast({
          title: "❌ Error al eliminar",
          description: "No se pudo eliminar el control.",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "❌ Error al eliminar",
        description: "Ocurrió un fallo al comunicarse con el servidor.",
        variant: "destructive",
      });
    }
  };

  const aplicarPreset = (preset: 'BOTON' | 'SLIDER' | 'NUMERICO' | 'REPOSICION' | 'RECETA') => {
    setForm(f => {
      let json = f.plantilla_payload_json;
      let cat = f.categoria_panel;
      let name = f.nombre;
      let acc = f.nombre_accion;
      let tipoCtrl: 'BOTON' | 'SLIDER' | 'NUMERICO' | 'PARAMETRIZADO' | 'RECETA' = 'BOTON';

      if (preset === 'BOTON') {
        tipoCtrl = 'BOTON';
        name = "Botón de Acción Directa";
        acc = "activar_proceso";
        json = '{\n  "comando": "START",\n  "estado": true\n}';
      } else if (preset === 'SLIDER') {
        tipoCtrl = 'SLIDER';
        name = "Slider de Regulación";
        acc = "setpoint_regulacion";
        json = '{\n  "setpoint": {valor}\n}';
      } else if (preset === 'NUMERICO') {
        tipoCtrl = 'NUMERICO';
        name = "Carga de Parámetro Numérico";
        acc = "parametro_numerico";
        json = '{\n  "cantidad": {valor}\n}';
      } else if (preset === 'REPOSICION') {
        tipoCtrl = 'PARAMETRIZADO';
        cat = "Control de Reposición";
        name = "Reposición de Bombos";
        acc = "reposicion";
        json = '{\n  "bombo": {bombo},\n  "limite_porcentaje": {limite_porcentaje}\n}';
      } else if (preset === 'RECETA') {
        tipoCtrl = 'RECETA';
        cat = "Receta Líquidos";
        name = "Panel de Dosificación de Receta";
        acc = "receta_liquidos";
        json = '{\n  "ingrediente_a_lts": {ingrediente_a},\n  "ingrediente_b_lts": {ingrediente_b},\n  "tiempo_horas": {tiempo_horas},\n  "tiempo_minutos": {tiempo_minutos}\n}';
      }
      return {
        ...f,
        tipo_control: tipoCtrl,
        nombre: name,
        nombre_accion: acc,
        categoria_panel: cat,
        plantilla_payload_json: json,
      };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-950 border-slate-800 text-slate-100 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-cyan-400">
            <Terminal className="h-5 w-5" />
            <DialogTitle className="text-xl font-bold text-slate-100">
              Personalizador de Comandos, Secciones y Parámetros SCADA
            </DialogTitle>
          </div>
          <DialogDescription className="text-slate-400 text-xs">
            Crea o edita Secciones, Controles Parametrizados (ej. Reposición, Recetas), Sliders o Botones MQTT para{" "}
            <strong className="text-cyan-300">{selectedSistemaNombre}</strong>.
          </DialogDescription>
        </DialogHeader>

        {!isFormOpen ? (
          <div className="space-y-4">
            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/60 rounded-lg border border-slate-800">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs border-cyan-800 text-cyan-300 bg-cyan-950/40 font-mono">
                  {mapeos.length} Comandos Registrados
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchData}
                  disabled={loading}
                  className="h-8 px-2.5 text-xs border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  size="sm"
                  onClick={handleOpenNuevo}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs gap-1.5 h-8"
                >
                  <Plus className="h-4 w-4" /> Crear Nuevo Comando
                </Button>
              </div>
            </div>

            {/* List of registered commands */}
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {mapeos.length === 0 ? (
                <div className="text-center p-8 border border-dashed border-slate-800 rounded-lg text-slate-400 space-y-2">
                  <Terminal className="h-8 w-8 text-cyan-400 mx-auto opacity-70" />
                  <p className="text-sm font-medium">No hay comandos registrados aún.</p>
                  <p className="text-xs text-slate-400">
                    Haz clic en "Crear Nuevo Comando" para configurar el primer control de tu planta.
                  </p>
                </div>
              ) : (
                mapeos.map((m) => (
                  <div
                    key={m.id}
                    className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-100">{m.nombre}</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-mono bg-cyan-950 text-cyan-300 border-cyan-800"
                        >
                          {m.tipo_control || "BOTON"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono border-slate-700 text-slate-300"
                        >
                          📁 {m.categoria_panel || "Controles del Proceso"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 font-mono flex-wrap">
                        <span>
                          Tópico: <strong className="text-cyan-300">/{m.nombre_accion}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Sistema: <strong className="text-slate-200">{m.sistema ? m.sistema_nombre || `#${m.sistema}` : "General (Todos)"}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 self-end md:self-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenEdit(m)}
                        className="h-8 px-2.5 text-xs border-slate-700 text-slate-200 hover:bg-slate-800 gap-1"
                      >
                        <Edit className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(m.id, m.nombre)}
                        className="h-8 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Form for Create / Edit */
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
                <Edit className="h-4 w-4" />
                {editingMapeo ? `Editando: ${editingMapeo.nombre}` : "Alta de Nuevo Control Personalizado"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsFormOpen(false)}
                className="h-7 px-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Volver a la Lista
              </Button>
            </div>

            {/* Quick Templates / Presets Bar */}
            <div className="p-2.5 bg-cyan-950/30 border border-cyan-900/50 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-cyan-300 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Cargar Plantilla Rápida de Comando:
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => aplicarPreset('REPOSICION')}
                  className="h-7 text-[11px] bg-slate-900/80 border-cyan-800 text-cyan-300 hover:bg-slate-800 gap-1 font-semibold"
                >
                  🎛️ Control de Reposición (Bombos)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => aplicarPreset('RECETA')}
                  className="h-7 text-[11px] bg-slate-900/80 border-purple-800 text-purple-300 hover:bg-slate-800 gap-1 font-semibold"
                >
                  🧪 Panel de Receta (Líquidos)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => aplicarPreset('SLIDER')}
                  className="h-7 text-[11px] bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800 gap-1"
                >
                  🎚️ Slider de Regulación
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => aplicarPreset('NUMERICO')}
                  className="h-7 text-[11px] bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800 gap-1"
                >
                  🔢 Entrada Numérica Directa
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => aplicarPreset('BOTON')}
                  className="h-7 text-[11px] bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800 gap-1"
                >
                  ⚡ Botón de Pulso / Acción
                </Button>
              </div>
            </div>

            {/* 1. Nombre y Tipo de Control */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300 font-semibold">1. Nombre del Control</Label>
                <Input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Reposición de Bombos, Setpoint Bomba"
                  className="bg-slate-900 border-slate-700 text-xs h-9 text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-300 font-semibold">2. Sección / Panel Visual</Label>
                  <Badge variant="outline" className="text-[9px] font-mono border-cyan-800 text-cyan-300">
                    {form.categoria_panel || "General"}
                  </Badge>
                </div>
                <Input
                  value={form.categoria_panel}
                  onChange={(e) => setForm({ ...form, categoria_panel: e.target.value })}
                  placeholder="Ej: Control de Reposición, Receta Líquidos"
                  className="bg-slate-900 border-slate-700 text-xs h-9 text-slate-100 font-semibold"
                />
              </div>
            </div>

            {/* 2. Sistema Asociado y Sub-tópico */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300 font-semibold">3. Sistema Asociado</Label>
                <Select value={form.sistema} onValueChange={(val) => setForm({ ...form, sistema: val })}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-xs h-9 text-slate-100">
                    <SelectValue placeholder="Seleccionar sistema" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                    <SelectItem value="general">🌐 Todos los sistemas (General)</SelectItem>
                    {sistemas.map((sys) => (
                      <SelectItem key={sys.id} value={String(sys.id)}>
                        ⚙️ {sys.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300 font-semibold">4. Sub-tópico MQTT (/acción)</Label>
                <Input
                  value={form.nombre_accion}
                  onChange={(e) => setForm({ ...form, nombre_accion: e.target.value })}
                  placeholder="Ej: reposicion, receta_liquidos"
                  className="bg-slate-900 border-slate-700 text-xs h-9 font-mono text-cyan-300"
                />
              </div>
            </div>

            {/* Visual Parameter Builder / Manager */}
            <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-cyan-400" />
                    5. Campos que se solicitarán en la Pantalla SCADA ({detectedPlaceholders.length})
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Hacé clic en <strong>🗑️ Quitar</strong> para reducir campos o en <strong>➕ Añadir</strong> para incorporar nuevos.
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Select onValueChange={(paramType) => {
                    if (!paramType) return;
                    let newKeys: string[] = [];
                    if (paramType === "bombo") newKeys = ["bombo"];
                    else if (paramType === "limite") newKeys = ["limite_porcentaje"];
                    else if (paramType === "ing_a") newKeys = ["ingrediente_a"];
                    else if (paramType === "ing_b") newKeys = ["ingrediente_b"];
                    else if (paramType === "ing_c") newKeys = ["ingrediente_c"];
                    else if (paramType === "tiempo_ambos") newKeys = ["tiempo_horas", "tiempo_minutos"];
                    else if (paramType === "tiempo_horas") newKeys = ["tiempo_horas"];
                    else if (paramType === "tiempo_minutos") newKeys = ["tiempo_minutos"];
                    else if (paramType === "custom") newKeys = [`parametro_${detectedPlaceholders.length + 1}`];

                    try {
                      let parsed = JSON.parse(form.plantilla_payload_json || "{}");
                      newKeys.forEach(k => { parsed[k] = `{${k}}`; });
                      setForm(f => ({ ...f, plantilla_payload_json: JSON.stringify(parsed, null, 2) }));
                    } catch (e) {
                      let newJson = form.plantilla_payload_json;
                      newKeys.forEach(k => {
                        newJson = newJson.replace(/\}$/, `,\n  "${k}": {${k}}\n}`);
                      });
                      setForm(f => ({ ...f, plantilla_payload_json: newJson }));
                    }
                  }}>
                    <SelectTrigger className="h-7 px-2 text-xs bg-cyan-950 border-cyan-800 text-cyan-300 font-semibold w-[185px]">
                      <SelectValue placeholder="➕ Añadir Parámetro..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                      <SelectItem value="bombo">🎛️ Selector de Bombo</SelectItem>
                      <SelectItem value="limite">📊 Límite Porcentaje (%)</SelectItem>
                      <SelectItem value="ing_a">🧪 Ingrediente A (L)</SelectItem>
                      <SelectItem value="ing_b">💧 Ingrediente B (L)</SelectItem>
                      <SelectItem value="ing_c">🧴 Ingrediente C (L)</SelectItem>
                      <SelectItem value="tiempo_ambos">⏱️ Tiempo (Horas y Minutos)</SelectItem>
                      <SelectItem value="tiempo_horas">⏱️ Tiempo en Horas (h)</SelectItem>
                      <SelectItem value="tiempo_minutos">⏱️ Tiempo en Minutos (min)</SelectItem>
                      <SelectItem value="custom">🔢 Campo Numérico Libre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {detectedPlaceholders.length === 0 ? (
                <div className="p-3 text-center border border-dashed border-slate-800 rounded text-slate-400 text-xs">
                  Este comando es de tipo <strong>Acción Directa (Pulso)</strong> sin campos adicionales. Si deseas que el operador introduzca valores, hacé clic en <strong>➕ Añadir Parámetro</strong> arriba.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {detectedPlaceholders.map((paramKey) => {
                    const isBombo = paramKey === "bombo";
                    const isPercentage = paramKey.includes("porcentaje") || paramKey.includes("limite");
                    const isIngrediente = paramKey.includes("ingrediente") || paramKey.includes("aceite") || paramKey.includes("agua");
                    const isHoras = paramKey.includes("hora");
                    const isMinutos = paramKey.includes("minuto") || paramKey.includes("min");
                    const isTiempo = paramKey.includes("tiempo");

                    return (
                      <div key={paramKey} className="flex items-center justify-between p-2.5 rounded bg-slate-950 border border-slate-800 hover:border-slate-700">
                        <div className="space-y-0.5 min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-slate-200 truncate">
                              {paramKey.replace(/_/g, " ").toUpperCase()}
                            </span>
                            <Badge variant="outline" className="text-[9px] font-mono text-cyan-400 border-cyan-900 bg-cyan-950/60">
                              {`{${paramKey}}`}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-slate-400">
                            {isBombo ? `Selector de Bombos (${Array.from({ length: getBomboCountFromMapeo(form) }, (_, i) => i + 1).join(", ")})` :
                             isPercentage ? "Slider + Input de Porcentaje (0-100%)" :
                             isIngrediente ? "Volumen de Ingrediente (Litros)" :
                             isHoras ? "Tiempo Mezcla en Horas (0-24 h)" :
                             isMinutos ? "Tiempo Mezcla en Minutos (0-59 min)" :
                             isTiempo ? "Tiempo de Mezcla" :
                             "Control con Slider e Input Numérico"}
                          </p>
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            try {
                              let parsed = JSON.parse(form.plantilla_payload_json);
                              delete parsed[paramKey];
                              setForm(f => ({ ...f, plantilla_payload_json: JSON.stringify(parsed, null, 2) }));
                            } catch (e) {
                              const regex = new RegExp(`"?${paramKey}"?\\s*:\\s*\\{?${paramKey}\\}?,?`, 'g');
                              const cleaned = form.plantilla_payload_json.replace(regex, '');
                              setForm(f => ({ ...f, plantilla_payload_json: cleaned }));
                            }
                          }}
                          className="h-7 px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 text-xs font-semibold gap-1 flex-shrink-0"
                          title={`Eliminar el campo ${paramKey} de la pantalla SCADA`}
                        >
                          <Trash2 className="h-3 w-3" /> Quitar
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bombo / Selector Options & Rango Configurator */}
              {detectedPlaceholders.includes("bombo") ? (
                <div className="p-3 rounded bg-slate-950/80 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-[11px] text-slate-300 font-semibold flex items-center gap-1.5">
                      <Box className="h-3.5 w-3.5 text-cyan-400" />
                      Cantidad de Bombos a Mostrar en Pantalla:
                    </Label>
                    <span className="font-mono text-cyan-300 font-bold">
                      {getBomboCountFromMapeo(form)} Bombos ({Array.from({ length: getBomboCountFromMapeo(form) }, (_, i) => `B${i + 1}`).join(", ")})
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[2, 3, 4, 6].map((count) => {
                      const isSelected = getBomboCountFromMapeo(form) === count;
                      return (
                        <Button
                          key={count}
                          type="button"
                          size="sm"
                          variant={isSelected ? "default" : "outline"}
                          onClick={() => handleUpdateBomboCount(count)}
                          className={`h-8 text-xs font-semibold ${
                            isSelected
                              ? "bg-cyan-600 text-white shadow-sm"
                              : "border-slate-700 text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          🎯 {count} Bombos
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-800/80">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-300">Valor Mínimo</Label>
                    <Input
                      type="number"
                      value={form.min_val}
                      onChange={(e) => setForm({ ...form, min_val: Number(e.target.value) })}
                      className="bg-slate-950 border-slate-700 text-xs h-8 text-slate-100 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-300">Valor Máximo</Label>
                    <Input
                      type="number"
                      value={form.max_val}
                      onChange={(e) => setForm({ ...form, max_val: Number(e.target.value) })}
                      className="bg-slate-950 border-slate-700 text-xs h-8 text-slate-100 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-300">Unidad de Medida</Label>
                    <Input
                      value={form.unidad}
                      onChange={(e) => setForm({ ...form, unidad: e.target.value })}
                      placeholder="L, %, °C, bar"
                      className="bg-slate-950 border-slate-700 text-xs h-8 text-slate-100 font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. Estructura del Tópico MQTT */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300 font-semibold">6. Estructura del Tópico MQTT</Label>
              <Input
                value={form.plantilla_topico}
                onChange={(e) => setForm({ ...form, plantilla_topico: e.target.value })}
                placeholder="{tenant}/{gateway}/{seccion}/{sistema}/{accion}"
                className="bg-slate-900 border-slate-700 text-xs h-8 font-mono text-cyan-300"
              />
            </div>

            {/* 4. Payload JSON Avanzado */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-300 font-semibold">
                  7. Vista previa del Payload JSON
                </Label>
              </div>
              <Textarea
                rows={3}
                value={form.plantilla_payload_json}
                onChange={(e) => setForm({ ...form, plantilla_payload_json: e.target.value })}
                className="bg-slate-900 border-slate-700 text-xs font-mono text-slate-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsFormOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                Guardar en PostgreSQL
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-slate-800 pt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

