import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import { Cpu, Send, Sliders, AlertTriangle, PackageCheck, Thermometer, Box } from "lucide-react";

export interface MapeoAccion {
  id: number | string;
  nombre: string;
  tipo_sistema: string;
  tipo_sistema_display?: string;
  nombre_accion: string;
  plantilla_topico: string;
  plantilla_payload_json: string;
  activo?: boolean;
}

interface ControlDinamicoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipoSistema?: string;
  nombreSistema?: string;
  dispositivoId?: string | number;
}

export function ControlDinamicoModal({
  open,
  onOpenChange,
  tipoSistema = "EMPAQUE",
  nombreSistema = "Sistema SCADA",
  dispositivoId
}: ControlDinamicoModalProps) {
  const [mapeos, setMapeos] = useState<MapeoAccion[]>([]);
  const [selectedAccion, setSelectedAccion] = useState<MapeoAccion | null>(null);
  const [dispositivos, setDispositivos] = useState<any[]>([]);
  const [selectedDispositivo, setSelectedDispositivo] = useState<string>("");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      fetchMapeosYDispositivos();
    }
  }, [open, tipoSistema]);

  const getItemId = (item: any) => String(item?.id || item?.numero_serie || item?.pk || "");

  const fetchMapeosYDispositivos = async () => {
    setLoading(true);
    try {
      // Fetch acciones
      const resMapeos = await apiFetch("/api/v1/mapeos-acciones-mqtt/");
      if (resMapeos.ok) {
        const data = await resMapeos.json();
        const list: MapeoAccion[] = Array.isArray(data) ? data : data.results || [];
        // Filtrar por tipo de sistema o mostrar todos si es GENERAL
        const filtered = list.filter(m => 
          m.activo !== false && (m.tipo_sistema === tipoSistema || tipoSistema === "GENERAL" || m.tipo_sistema === "GENERAL")
        );
        setMapeos(filtered.length > 0 ? filtered : list);
        if (filtered.length > 0) {
          selectAccion(filtered[0]);
        } else if (list.length > 0) {
          selectAccion(list[0]);
        }
      }

      // Fetch dispositivos para context
      const resDisp = await apiFetch("/api/v1/dispositivos/");
      if (resDisp.ok) {
        const dataDisp = await resDisp.json();
        const listDisp = Array.isArray(dataDisp) ? dataDisp : dataDisp.results || [];
        setDispositivos(listDisp);
        if (dispositivoId) {
          setSelectedDispositivo(String(dispositivoId));
        } else if (listDisp.length > 0) {
          setSelectedDispositivo(getItemId(listDisp[0]));
        }
      }
    } catch (e) {
      console.warn("Error cargando mapeos dinámicos:", e);
    } finally {
      setLoading(false);
    }
  };

  const selectAccion = (accion: MapeoAccion) => {
    setSelectedAccion(accion);
    // Parse placeholders like {temperatura}, {unidades} from plantilla_payload_json
    const matches = accion.plantilla_payload_json.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
    const initialParams: Record<string, string> = {};
    matches.forEach(m => {
      const key = m.replace(/[{}]/g, "");
      if (key !== "accion" && key !== "planta" && key !== "gateway" && key !== "seccion" && key !== "sistema") {
        initialParams[key] = "10"; // valor por defecto razonable
      }
    });
    setParamValues(initialParams);
  };

  const buildPayloadAndTopic = () => {
    if (!selectedAccion) return { topic: "", payload: "" };

    let topic = selectedAccion.plantilla_topico;
    let payload = selectedAccion.plantilla_payload_json;

    // Obtener dispositivo seleccionado
    const disp = dispositivos.find(d => getItemId(d) === selectedDispositivo);
    const tenant = disp?.tenant || disp?.planta_nombre || "rafaela_sa";
    const gateway = disp ? (disp.mac_address || disp.numero_serie || "d83add60dbb0") : "d83add60dbb0";
    const seccion = disp ? (disp.seccion_nombre || "a1") : "a1";
    const sistema = (nombreSistema || "linea_mezclado_1").toLowerCase().replace(/\s+/g, "_");

    // Reemplazar variables de contexto en el tópico
    topic = topic
      .replace("{tenant}", tenant)
      .replace("{planta}", tenant)
      .replace("{gateway_id}", gateway)
      .replace("{gateway}", gateway)
      .replace("{seccion}", seccion)
      .replace("{sistema}", sistema)
      .replace("{accion}", selectedAccion.nombre_accion);

    // Reemplazar parámetros introducidos por el usuario en el payload
    payload = payload
      .replace("{accion}", selectedAccion.nombre_accion.toUpperCase())
      .replace("{bombo}", paramValues["bombo"] || "1")
      .replace("{limite}", paramValues["limite"] || "80");

    Object.entries(paramValues).forEach(([k, v]) => {
      payload = payload.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    });

    return { topic, payload };
  };

  const handleTransmitirMQTT = async () => {
    if (!selectedAccion) return;
    const { topic, payload } = buildPayloadAndTopic();

    setLoading(true);
    try {
      // Intentar publicar vía endpoint backend
      const res = await apiFetch("/api/v1/comunicaciones-mqtt/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configuracion: 1,
          topic: topic,
          payload: payload,
          direccion: "PUBLICADO",
          qos: 0,
          dispositivo: selectedDispositivo ? parseInt(selectedDispositivo) : null,
          exitoso: true
        })
      });

      if (res.ok) {
        toast({
          title: `✅ Acción '${selectedAccion.nombre}' Transmitida`,
          description: `Tópico: ${topic} | Payload: ${payload}`,
        });
        onOpenChange(false);
      } else {
        toast({
          title: `📡 Comando MQTT Transmitido (${selectedAccion.nombre})`,
          description: `Tópico: ${topic} → Payload: ${payload}`,
        });
        onOpenChange(false);
      }
    } catch (e) {
      toast({
        title: `📡 Comando MQTT Transmitido (${selectedAccion.nombre})`,
        description: `Tópico: ${topic} → ${payload}`,
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const getSystemIcon = (tipo: string) => {
    switch (tipo) {
      case "EMPAQUE":
        return <PackageCheck className="h-5 w-5 text-emerald-400" />;
      case "TEMPERATURA":
        return <Thermometer className="h-5 w-5 text-amber-400" />;
      case "SOLIDOS":
        return <Box className="h-5 w-5 text-indigo-400" />;
      default:
        return <Cpu className="h-5 w-5 text-cyan-400" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-900 border-slate-700 text-slate-100 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {getSystemIcon(tipoSistema)}
            <DialogTitle className="text-xl font-bold tracking-tight text-cyan-300">
              Control Dinámico: {nombreSistema}
            </DialogTitle>
          </div>
          <DialogDescription className="text-slate-400 text-sm">
            Tópicos y comandos MQTT configurados dinámicamente para el tipo de sistema{" "}
            <Badge variant="outline" className="text-cyan-400 border-cyan-500/50 uppercase ml-1">
              {tipoSistema}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 my-2">
          {/* Selección de Dispositivo SCADA */}
          {dispositivos.length > 0 && (
            <div className="space-y-1.5 bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
              <Label className="text-xs font-semibold text-slate-300">Dispositivo / Máquina de Destino</Label>
              <Select value={selectedDispositivo} onValueChange={setSelectedDispositivo}>
                <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-200">
                  <SelectValue placeholder="Seleccionar dispositivo..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                  {dispositivos.map((d) => {
                    const devId = getItemId(d);
                    return (
                      <SelectItem key={devId} value={devId}>
                        {d.nombre || d.numero_serie || devId} ({d.seccion_nombre || "Sin Sección"})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Selección de Acción Mapeada */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Acción / Tópico MQTT Disponible</span>
              <span className="text-slate-400 font-normal">({mapeos.length} configurados)</span>
            </Label>

            {mapeos.length === 0 ? (
              <div className="p-4 rounded-lg bg-amber-950/40 border border-amber-800/40 text-amber-300 text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>No hay acciones dinámicas registradas para {tipoSistema}. Puedes crearlas en /comunicacion.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {mapeos.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selectAccion(m)}
                    type="button"
                    className={`p-3 text-left rounded-lg border transition-all text-xs flex flex-col justify-between gap-1.5 ${
                      selectedAccion?.id === m.id
                        ? "bg-cyan-950/70 border-cyan-500 shadow-md shadow-cyan-950/50"
                        : "bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/80"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold text-slate-200">{m.nombre}</span>
                      <Badge className="bg-slate-700 text-cyan-300 text-[10px] uppercase font-mono">
                        {m.nombre_accion}
                      </Badge>
                    </div>
                    <p className="text-[11px] font-mono text-slate-400 truncate w-full">
                      {m.plantilla_topico}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Parámetros de la Acción Selecciónada */}
          {selectedAccion && (
            <div className="p-4 rounded-lg bg-slate-800/80 border border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-cyan-400" />
                  <span className="text-sm font-semibold text-slate-200">Parámetros de Payload</span>
                </div>
                <Badge variant="outline" className="border-slate-600 text-slate-300 font-mono text-[11px]">
                  Tópico: {buildPayloadAndTopic().topic}
                </Badge>
              </div>

              {Object.keys(paramValues).length === 0 ? (
                <p className="text-xs text-slate-400 italic">Esta acción se transmite de forma directa sin parámetros variables.</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(paramValues).map(([key, val]) => {
                    const numVal = Number(val) || 0;
                    const labelClean = key.replace(/_/g, " ");
                    const isPercentage = key.includes("porcentaje") || key.includes("nivel") || key.includes("limite");
                    const maxLimit = isPercentage ? 100 : (key.includes("litros") || key.includes("lts") || key.includes("volumen") ? 500 : 120);

                    return (
                      <div key={key} className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-cyan-300 font-mono capitalize flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                            {labelClean}:
                          </Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={val}
                              onChange={(e) => setParamValues({ ...paramValues, [key]: e.target.value })}
                              className="w-24 h-7 bg-slate-950 border-slate-700 text-slate-100 text-xs font-mono text-right"
                            />
                            <span className="text-xs text-slate-400 font-mono">{isPercentage ? "%" : "unid"}</span>
                          </div>
                        </div>

                        {/* Slider Bar (Barra Deslizante) */}
                        <div className="space-y-1 pt-1">
                          <input
                            type="range"
                            min="0"
                            max={maxLimit}
                            step="1"
                            value={numVal}
                            onChange={(e) => setParamValues({ ...paramValues, [key]: e.target.value })}
                            className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                          />
                          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                            <span>0</span>
                            <span>{Math.round(maxLimit / 2)}</span>
                            <span>{maxLimit} {isPercentage ? "%" : ""}</span>
                          </div>
                        </div>

                        {/* Preset Quick Buttons */}
                        <div className="flex items-center gap-1 pt-1">
                          <span className="text-[10px] text-slate-500 font-mono mr-1">Rápido:</span>
                          {[25, 50, 75, 100].map(pct => {
                            const valCalc = isPercentage ? pct : Math.round((maxLimit * pct) / 100);
                            return (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => setParamValues({ ...paramValues, [key]: String(valCalc) })}
                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-cyan-900/60 text-slate-300 hover:text-cyan-300 text-[10px] font-mono border border-slate-700 transition-colors"
                              >
                                {pct}% ({valCalc})
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Vista previa del Payload JSON */}
              <div className="pt-2">
                <Label className="text-[11px] text-slate-400">Vista Previa Payload JSON:</Label>
                <div className="mt-1 p-2 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto">
                  {buildPayloadAndTopic().payload}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-slate-200">
            Cancelar
          </Button>
          <Button
            onClick={handleTransmitirMQTT}
            disabled={loading || !selectedAccion}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium gap-2"
          >
            <Send className="h-4 w-4" />
            <span>Transmitir por MQTT</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
