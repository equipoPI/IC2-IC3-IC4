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
import { Plus, Trash2, Edit, Save, Terminal, Layers, RefreshCw, HelpCircle, Sliders, Play, FlaskConical, Hash, SlidersHorizontal } from "lucide-react";

export interface MapeoAccion {
  id: number | string;
  nombre: string;
  sistema?: number | string | null;
  sistema_nombre?: string;
  tipo_sistema: string;
  tipo_control?: 'BOTON' | 'SLIDER' | 'NUMERICO' | 'RECETA';
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
    tipo_control: "BOTON" as 'BOTON' | 'SLIDER' | 'NUMERICO' | 'RECETA',
    categoria_panel: "Controles del Proceso",
    nombre_accion: "",
    plantilla_topico: "{tenant}/{gateway}/{seccion}/{sistema}/{accion}",
    plantilla_payload_json: '{\n  "comando": "EJECUTAR",\n  "estado": "ACTIVO"\n}',
    min_val: 0,
    max_val: 100,
    unidad: "L",
  });

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

  const handleOpenNuevo = () => {
    setEditingMapeo(null);
    setForm({
      nombre: "Nuevo Control / Comando",
      sistema: selectedSistemaId ? String(selectedSistemaId) : "general",
      tipo_sistema: normalizeTipoSistema(selectedTipoSistema),
      tipo_control: "BOTON",
      categoria_panel: "Controles del Proceso",
      nombre_accion: "comando_personalizado",
      plantilla_topico: "{tenant}/{gateway}/{seccion}/{sistema}/{accion}",
      plantilla_payload_json: '{\n  "valor": {valor}\n}',
      min_val: 0,
      max_val: 100,
      unidad: "L",
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
      plantilla_topico: form.plantilla_topico.replace("{accion}", cleanSubtopic),
      plantilla_payload_json: form.plantilla_payload_json,
      min_val: Number(form.min_val) || 0,
      max_val: Number(form.max_val) || 100,
      unidad: form.unidad,
      activo: true,
    };

    try {
      if (editingMapeo && editingMapeo.id) {
        const resp = await apiFetch(`/api/v1/mapeos-acciones-mqtt/${editingMapeo.id}/`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadToSave),
        });
        if (resp.ok) {
          toast({
            title: "✅ Control Actualizado",
            description: `Se actualizó el control "${form.nombre}" en PostgreSQL.`,
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
            description: `Se añadió el control "${form.nombre}" para el sistema.`,
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
          description: `Se eliminó la acción "${nombre}" de la base de datos.`,
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

  const aplicarPreset = (tipo: 'BOTON' | 'SLIDER' | 'NUMERICO' | 'RECETA') => {
    setForm(f => {
      let json = f.plantilla_payload_json;
      let cat = f.categoria_panel;
      let name = f.nombre;
      let acc = f.nombre_accion;

      if (tipo === 'BOTON') {
        name = "Botón de Acción Directa";
        acc = "activar_proceso";
        json = '{\n  "comando": "START",\n  "estado": true\n}';
      } else if (tipo === 'SLIDER') {
        name = "Slider de Regulación";
        acc = "setpoint_slider";
        json = '{\n  "setpoint": {setpoint_val}\n}';
      } else if (tipo === 'NUMERICO') {
        name = "Carga de Parámetro Numérico";
        acc = "parametro_numerico";
        json = '{\n  "cantidad": {cantidad_val}\n}';
      } else if (tipo === 'RECETA') {
        cat = "Receta Líquidos";
        name = "Panel de Dosificación de Receta";
        acc = "receta_liquidos";
        json = '{\n  "ingrediente_a_lts": {ingrediente_a},\n  "ingrediente_b_lts": {ingrediente_b},\n  "tiempo_mezcla_min": {tiempo_mezcla}\n}';
      }
      return {
        ...f,
        tipo_control: tipo,
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
              Personalizador de Secciones, Controles y Recetas SCADA
            </DialogTitle>
          </div>
          <DialogDescription className="text-slate-400 text-xs">
            Crea o edita Secciones, Barras Deslizantes (Sliders), Inputs Numéricos o Paneles de Receta para{" "}
            <strong className="text-cyan-300">{selectedSistemaNombre}</strong>.
          </DialogDescription>
        </DialogHeader>

        {!isFormOpen ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="border-cyan-500/40 text-cyan-400 text-xs">
                {mapeos.length} Controles / Secciones Registradas
              </Badge>
              <Button
                size="sm"
                onClick={handleOpenNuevo}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs gap-1.5 font-semibold"
              >
                <Plus className="h-4 w-4" />
                Añadir Control / Sección
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8 text-slate-400 text-sm gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
                Cargando controles registrados...
              </div>
            ) : mapeos.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-800 rounded-lg p-6">
                <Layers className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-300">No hay controles ni paneles personalizados configurados.</p>
                <p className="text-xs text-slate-500 mt-1">Haz clic en "Añadir Control / Sección" para dar de alta uno.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {mapeos.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-100">{m.nombre}</span>
                        <Badge variant="secondary" className="bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono text-[10px] uppercase">
                          {m.tipo_control || 'BOTON'}
                        </Badge>
                        <Badge variant="outline" className="border-indigo-800 bg-indigo-950/40 text-indigo-300 text-[10px]">
                          📂 {m.categoria_panel || "Controles del Proceso"}
                        </Badge>
                        <Badge variant="outline" className="border-slate-700 text-slate-400 text-[10px]">
                          ⚙️ {m.sistema_nombre || "General (Todos los sistemas)"}
                        </Badge>
                      </div>
                      <p className="text-[11px] font-mono text-slate-400">
                        Acción: <span className="text-cyan-300">{m.nombre_accion}</span> | Tópico: <span className="text-slate-300">{m.plantilla_topico}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleOpenEdit(m)}
                        className="h-8 w-8 text-slate-400 hover:text-cyan-400 hover:bg-slate-800"
                        title="Editar control"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(m.id, m.nombre)}
                        className="h-8 w-8 text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Form for Create / Edit */
          <div className="space-y-4 py-2 border-t border-slate-800 pt-4">
            <h4 className="text-sm font-semibold text-cyan-400 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {editingMapeo ? "Editar Control / Sección MQTT" : "Crear Nuevo Control / Sección MQTT"}
            </h4>

            {/* Presets Rápidos */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
              <span className="text-xs font-semibold text-slate-300 block">Tipo de Elemento a Agregar:</span>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <Button
                  type="button"
                  variant={form.tipo_control === 'BOTON' ? "default" : "outline"}
                  onClick={() => aplicarPreset('BOTON')}
                  className="h-8 px-2 text-xs gap-1 border-slate-700"
                >
                  <Play className="h-3.5 w-3.5 text-cyan-400" /> Botón MQTT
                </Button>
                <Button
                  type="button"
                  variant={form.tipo_control === 'SLIDER' ? "default" : "outline"}
                  onClick={() => aplicarPreset('SLIDER')}
                  className="h-8 px-2 text-xs gap-1 border-slate-700"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-400" /> Slider (Barra)
                </Button>
                <Button
                  type="button"
                  variant={form.tipo_control === 'NUMERICO' ? "default" : "outline"}
                  onClick={() => aplicarPreset('NUMERICO')}
                  className="h-8 px-2 text-xs gap-1 border-slate-700"
                >
                  <Hash className="h-3.5 w-3.5 text-amber-400" /> Campo Numérico
                </Button>
                <Button
                  type="button"
                  variant={form.tipo_control === 'RECETA' ? "default" : "outline"}
                  onClick={() => aplicarPreset('RECETA')}
                  className="h-8 px-2 text-xs gap-1 border-slate-700"
                >
                  <FlaskConical className="h-3.5 w-3.5 text-purple-400" /> Panel Receta
                </Button>
              </div>
            </div>

            {/* 1. Nombre y Categoría/Sección */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Etiqueta / Nombre Visible *</Label>
                <Input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Setpoint Caudal Bomba 1"
                  className="bg-slate-900 border-slate-700 text-xs h-9 text-slate-100"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Sección / Tarjeta Contenedora ("Cuadrado")</Label>
                <Input
                  value={form.categoria_panel}
                  onChange={(e) => setForm({ ...form, categoria_panel: e.target.value })}
                  placeholder="Ej: Receta Líquidos, Control Reposición"
                  className="bg-slate-900 border-slate-700 text-xs h-9 text-slate-100 font-semibold text-cyan-300"
                />
              </div>
            </div>

            {/* 2. Sistema Asociado y Sub-tópico */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Sistema Asociado</Label>
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
                <Label className="text-xs text-slate-300">Sub-tópico / Comando (slug)</Label>
                <Input
                  value={form.nombre_accion}
                  onChange={(e) => setForm({ ...form, nombre_accion: e.target.value })}
                  placeholder="Ej: setpoint_caudal, receta_liquidos"
                  className="bg-slate-900 border-slate-700 text-xs h-9 font-mono text-cyan-300"
                />
              </div>
            </div>

            {/* Rango min / max si es Slider o Numérico */}
            {(form.tipo_control === 'SLIDER' || form.tipo_control === 'NUMERICO') && (
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-900 border border-slate-800 rounded-lg">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Valor Mínimo</Label>
                  <Input
                    type="number"
                    value={form.min_val}
                    onChange={(e) => setForm({ ...form, min_val: Number(e.target.value) })}
                    className="bg-slate-950 border-slate-700 text-xs h-8 text-slate-100 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Valor Máximo</Label>
                  <Input
                    type="number"
                    value={form.max_val}
                    onChange={(e) => setForm({ ...form, max_val: Number(e.target.value) })}
                    className="bg-slate-950 border-slate-700 text-xs h-8 text-slate-100 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-300">Unidad de Medida</Label>
                  <Input
                    value={form.unidad}
                    onChange={(e) => setForm({ ...form, unidad: e.target.value })}
                    placeholder="L, °C, %, bar, L/min"
                    className="bg-slate-950 border-slate-700 text-xs h-8 text-slate-100 font-mono"
                  />
                </div>
              </div>
            )}

            {/* 3. Estructura del Tópico MQTT */}
            <div className="space-y-2">
              <Label className="text-xs text-slate-300 font-semibold">Estructura del Tópico MQTT</Label>
              <Input
                value={form.plantilla_topico}
                onChange={(e) => setForm({ ...form, plantilla_topico: e.target.value })}
                placeholder="{tenant}/{gateway}/{seccion}/{sistema}/{accion}"
                className="bg-slate-900 border-slate-700 text-xs h-9 font-mono text-cyan-300"
              />

              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-2 text-xs">
                <div className="text-[11px] text-slate-300 font-semibold flex items-center justify-between">
                  <span>📌 Ejemplo de Tópico MQTT Resultante:</span>
                </div>
                <div className="text-emerald-400 font-bold break-all bg-slate-950 p-2 rounded border border-slate-800 text-[11px] font-mono">
                  {form.plantilla_topico
                    .replace("{tenant}", "rafaela_sa")
                    .replace("{gateway}", "gw_mezcla_01")
                    .replace("{seccion}", "seccion_a")
                    .replace("{sistema}", selectedSistemaNombre.toLowerCase().replace(/\s+/g, "_"))
                    .replace("{accion}", form.nombre_accion || "comando")}
                </div>
              </div>
            </div>

            {/* 4. Payload JSON */}
            <div className="space-y-2">
              <Label className="text-xs text-slate-300 font-semibold">Payload JSON enviado al Broker</Label>
              <Textarea
                rows={4}
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
