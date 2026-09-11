import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import { useScadaWebSocket } from "@/hooks/useScadaWebSocket";
import { FlaskConical, Play, Clock, Droplet, Settings2, FileText, AlertTriangle } from "lucide-react";

interface ControlRecetaLiquidosModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispositivoId?: string | number;
  nombreSistema?: string;
  plantaNombre?: string;
  seccionNombre?: string;
  sistemaNombre?: string;
}

export function ControlRecetaLiquidosModal({
  open,
  onOpenChange,
  dispositivoId,
  nombreSistema = "linea_mezclado_1",
  plantaNombre,
  seccionNombre,
  sistemaNombre,
}: ControlRecetaLiquidosModalProps) {
  const [liquido1, setLiquido1] = useState<number>(50);
  const [liquido2, setLiquido2] = useState<number>(30);
  const [hora, setHora] = useState<number>(0);
  const [minuto, setMinuto] = useState<number>(1);
  const [dispositivos, setDispositivos] = useState<any[]>([]);
  const [plantillas, setPlantillas] = useState<any[]>([]);
  const [selectedPlantilla, setSelectedPlantilla] = useState<string>("");
  const [selectedDispositivo, setSelectedDispositivo] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const { sendScadaCommand } = useScadaWebSocket();
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [unidadMedida, setUnidadMedida] = useState<"L" | "mL">("L");
  const [modoCarga, setModoCarga] = useState<"plantilla" | "manual">("manual");

  const [tankMezclaInfo, setTankMezclaInfo] = useState<{ volumen: number; capacidad: number; porcentaje: number } | null>(null);

  const getItemId = (item: any) => String(item?.id || item?.numero_serie || item?.pk || "");

  const isTankFull = (tankMezclaInfo?.porcentaje || 0) > 5.0;

  useEffect(() => {
    if (open) {
      fetchDispositivosYPlantillas();
    }
  }, [open]);

  const fetchDispositivosYPlantillas = async () => {
    try {
      // Cargar dispositivos SCADA
      const resDisp = await apiFetch("/api/v1/dispositivos/");
      if (resDisp.ok) {
        const dataDisp = await resDisp.json();
        const items = dataDisp.results || dataDisp;
        if (Array.isArray(items) && items.length > 0) {
          setDispositivos(items);
          if (dispositivoId) {
            setSelectedDispositivo(String(dispositivoId));
          } else {
            const match = items.find((d: any) => {
              const name = (d.nombre || d.numero_serie || "").toLowerCase();
              return name.includes("mezcla") || name.includes("mixer") || name.includes("bombo");
            }) || items[0];
            setSelectedDispositivo(getItemId(match));
          }
        }
      }

      // Cargar unidades de almacenamiento para verificar nivel de mezcla
      const resTanks = await apiFetch("/api/v1/unidades-almacenamiento/");
      if (resTanks.ok) {
        const dataTanks = await resTanks.json();
        const tanks = Array.isArray(dataTanks) ? dataTanks : dataTanks.results || [];
        const mixTank = tanks.find((t: any) => t.node_id === 'tank-3' || (t.nombre && t.nombre.toLowerCase().includes('mezcla')));
        if (mixTank && mixTank.capacidad) {
          const vol = Number(mixTank.volumen_actual || 0);
          const cap = Number(mixTank.capacidad || 1500);
          const pct = (vol / cap) * 100;
          setTankMezclaInfo({ volumen: vol, capacidad: cap, porcentaje: pct });
        }
      }

      // Cargar plantillas de recetas
      const resPlant = await apiFetch("/api/v1/plantillas/");
      if (resPlant.ok) {
        const dataPlant = await resPlant.json();
        const list = Array.isArray(dataPlant) ? dataPlant : dataPlant.results || [];
        setPlantillas(list);
      }
    } catch (e) {
      console.warn("Error al cargar datos para recetas de líquidos:", e);
    }
  };

  const handleSelectPlantilla = (plantillaId: string) => {
    setSelectedPlantilla(plantillaId);
    const selected = plantillas.find(p => String(p.id) === plantillaId);
    if (selected) {
      if (selected.liquido_1 !== undefined) setLiquido1(Number(selected.liquido_1));
      if (selected.liquido_2 !== undefined) setLiquido2(Number(selected.liquido_2));
      if (selected.hora_mezcla !== undefined) setHora(Number(selected.hora_mezcla));
      if (selected.minuto_mezcla !== undefined) setMinuto(Number(selected.minuto_mezcla));
      toast({
        title: "📋 Receta Cargada",
        description: `Se aplicaron los parámetros de la plantilla '${selected.nombre || selected.titulo}'.`,
      });
    }
  };

  const getActiveDevice = () => {
    return dispositivos.find(d => getItemId(d) === selectedDispositivo) || (dispositivos.length > 0 ? dispositivos[0] : null);
  };

  const cleanSegment = (val?: string) => {
    if (!val || val === 'seleccionar') return '';
    return val.toLowerCase().replace(/\./g, '').replace(/[\s-]+/g, '_').trim();
  };

  const getTopicPreview = () => {
    const disp = getActiveDevice();
    const rawTenant = (plantaNombre && plantaNombre !== 'seleccionar') ? plantaNombre : (disp?.tenant || disp?.planta_nombre || "rafaela_sa");
    const tenant = cleanSegment(rawTenant) || "rafaela_sa";
    const gw = cleanSegment(disp?.gateway_id || disp?.mac_address || disp?.numero_serie || "d83add60dbb0") || "d83add60dbb0";
    const rawSec = (seccionNombre && seccionNombre !== 'seleccionar') ? seccionNombre : (disp?.seccion_nombre ? String(disp.seccion_nombre) : "a1");
    const sec = cleanSegment(rawSec) || "a1";
    const rawSys = (sistemaNombre && sistemaNombre !== 'seleccionar') ? sistemaNombre : (disp?.sistema_nombre ? String(disp.sistema_nombre) : nombreSistema);
    const sys = cleanSegment(rawSys) || "linea_mezclado_1";
    return `${tenant}/${gw}/${sec}/${sys}/mezcla`;
  };

  const handleTransmitirReceta = async () => {
    if (isTankFull) {
      toast({
        title: "⚠️ Bombo de mezcla ocupado",
        description: `El tanque contiene ${tankMezclaInfo?.volumen} L de producto terminado. Vacíe o deseche el contenido antes de iniciar.`,
        variant: "destructive"
      });
      return;
    }
    setLoading(true);
    try {
      const activeDev = getActiveDevice();
      const fallbackDev = (dispositivos.length > 0 && getItemId(dispositivos[0])) ? getItemId(dispositivos[0]) : "bomba_mezcla";
      const targetId = selectedDispositivo || (activeDev ? getItemId(activeDev) : dispositivoId) || fallbackDev;
      const targetTopic = getTopicPreview();

      const payloadObj = {
        accion: "MEZCLA",
        comando: "MEZCLA",
        liquido_1: liquido1,
        liquido_2: liquido2,
        hora: hora,
        minuto: minuto,
        topico: targetTopic,
        dispositivo_id: targetId,
        timestamp: new Date().toISOString(),
      };

      const result = await sendScadaCommand({
        action: "receta",
        payload: payloadObj,
        fallbackHttp: {
          endpoint: `/api/v1/dispositivos/${targetId}/control/`,
          method: "POST",
          body: {
            comando: "MEZCLA",
            parametros: payloadObj,
          },
        },
      });

      if (result.ok) {
        toast({
          title: "🧪 Receta de Líquidos Transmitida",
          description: `Ing. 1: ${liquido1}L | Ing. 2: ${liquido2}L | Tiempo: ${hora}h ${minuto}m (${result.source === "websocket" ? "⚡ WebSocket <15ms" : "HTTP REST"})`,
        });
        onOpenChange(false);
      } else {
        toast({
          title: "Error al transmitir receta",
          description: result.error || "No se pudo comunicar con el servidor SCADA",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "Error de comunicación", description: "No se pudo conectar al backend SCADA", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const activeDev = getActiveDevice();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[85vh] overflow-y-auto border-border bg-card">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
              <FlaskConical className="h-5 w-5 text-cyan-500 animate-pulse" />
              Carga y Mezcla de Receta de Líquidos
            </DialogTitle>
            {activeDev && (
              <Badge variant="outline" className="text-[11px] bg-cyan-500/10 text-cyan-400 border-cyan-500/30 font-mono">
                {activeDev.nombre || activeDev.numero_serie}
              </Badge>
            )}
          </div>
          <DialogDescription>
            Configura la dosificación por caudalímetro y el tiempo de mezclado en el reactor principal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Selector de Modo: Manual vs Plantilla Predefinida */}
          <div className="flex gap-2 p-1 bg-muted/40 rounded-lg border border-border">
            <Button
              type="button"
              variant={modoCarga === "manual" ? "default" : "ghost"}
              size="sm"
              onClick={() => setModoCarga("manual")}
              className={`flex-1 text-xs font-semibold h-8 ${modoCarga === "manual" ? "bg-primary text-primary-foreground shadow" : ""}`}
            >
              ✏️ Ingreso Manual
            </Button>
            <Button
              type="button"
              variant={modoCarga === "plantilla" ? "default" : "ghost"}
              size="sm"
              onClick={() => setModoCarga("plantilla")}
              className={`flex-1 text-xs font-semibold h-8 ${modoCarga === "plantilla" ? "bg-primary text-primary-foreground shadow" : ""}`}
            >
              📋 Cargar Receta Predefinida
            </Button>
          </div>

          {/* Cargar Plantilla Preexistente (Opcional) */}
          {modoCarga === "plantilla" && (
            <div className="space-y-1.5 p-3.5 bg-cyan-950/20 border border-cyan-500/30 rounded-lg animate-in fade-in duration-200">
              <Label className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                <span>Seleccionar Receta Registrada en Sistema</span>
              </Label>
              <Select value={selectedPlantilla} onValueChange={handleSelectPlantilla}>
                <SelectTrigger className="bg-background border-cyan-500/40 h-9 text-xs">
                  <SelectValue placeholder="Elegir receta guardada..." />
                </SelectTrigger>
                <SelectContent>
                  {plantillas.length === 0 ? (
                    <SelectItem value="none" disabled>No hay plantillas disponibles</SelectItem>
                  ) : (
                    plantillas.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.nombre || p.titulo || `Plantilla #${p.id}`}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Selector de Unidad de Medida (Litros vs Mililitros) */}
          <div className="flex items-center justify-between p-3 bg-muted/20 border border-border rounded-lg">
            <span className="text-xs font-medium text-muted-foreground">Unidad de Medida del Caudalímetro:</span>
            <div className="flex items-center gap-1 bg-background border border-border p-1 rounded-md">
              <button
                type="button"
                onClick={() => setUnidadMedida("L")}
                className={`px-2.5 py-0.5 text-xs font-bold rounded ${unidadMedida === "L" ? "bg-cyan-600 text-white shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
              >
                Litros (L)
              </button>
              <button
                type="button"
                onClick={() => setUnidadMedida("mL")}
                className={`px-2.5 py-0.5 text-xs font-bold rounded ${unidadMedida === "mL" ? "bg-indigo-600 text-white shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
              >
                Mililitros (mL)
              </button>
            </div>
          </div>

          {/* Dosificación Ingrediente 1 (Bombo 1 / Caudalímetro 1) */}
          <div className="space-y-2 bg-muted/30 p-3.5 rounded-lg border border-border">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Droplet className="h-4 w-4 text-cyan-400 fill-current" />
                Ingrediente A (Bombo 1 - Caudalímetro 1)
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={unidadMedida === "L" ? 1000 : 100000}
                  value={liquido1}
                  onChange={(e) => setLiquido1(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-24 h-8 text-right font-mono font-bold bg-background text-cyan-400 border-cyan-500/40"
                />
                <span className="text-xs font-bold text-cyan-400 w-6">{unidadMedida}</span>
              </div>
            </div>
            <Slider
              value={[liquido1]}
              onValueChange={(val) => setLiquido1(val[0])}
              min={0}
              max={unidadMedida === "L" ? 500 : 50000}
              step={1}
              className="py-1"
            />
          </div>

          {/* Dosificación Ingrediente 2 (Bombo 2 / Caudalímetro 2) */}
          <div className="space-y-2 bg-muted/30 p-3.5 rounded-lg border border-border">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Droplet className="h-4 w-4 text-indigo-400 fill-current" />
                Ingrediente B (Bombo 2 - Caudalímetro 2)
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={unidadMedida === "L" ? 1000 : 100000}
                  value={liquido2}
                  onChange={(e) => setLiquido2(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-24 h-8 text-right font-mono font-bold bg-background text-indigo-400 border-indigo-500/40"
                />
                <span className="text-xs font-bold text-indigo-400 w-6">{unidadMedida}</span>
              </div>
            </div>
            <Slider
              value={[liquido2]}
              onValueChange={(val) => setLiquido2(val[0])}
              min={0}
              max={unidadMedida === "L" ? 500 : 50000}
              step={1}
              className="py-1"
            />
          </div>

          {/* Tiempos de Mezclado */}
          <div className="space-y-2 bg-muted/30 p-3.5 rounded-lg border border-border">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-emerald-400" />
              Tiempo de Mezclado Reactor
            </Label>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <Label className="text-xs text-muted-foreground">Horas</Label>
                <Input
                  type="number"
                  min={0}
                  max={24}
                  value={hora}
                  onChange={(e) => setHora(Math.max(0, parseInt(e.target.value) || 0))}
                  className="font-mono text-center h-9 font-bold bg-background"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Minutos</Label>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={minuto}
                  onChange={(e) => setMinuto(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="font-mono text-center h-9 font-bold bg-background"
                />
              </div>
            </div>
          </div>

          {/* Dispositivo Target Avanzado */}
          <div className="border border-border/60 rounded-lg p-2.5 bg-muted/20">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground font-medium"
            >
              <span className="flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-primary" />
                <span>Mapeo de Dispositivo / Gateway Target</span>
              </span>
              <span className="font-mono text-[10px]">{showAdvanced ? "▼ Ocultar" : "▶ Configurar"}</span>
            </button>

            {showAdvanced && (
              <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                <Label className="text-xs font-medium">Dispositivo SCADA:</Label>
                <Select value={selectedDispositivo} onValueChange={setSelectedDispositivo}>
                  <SelectTrigger className="w-full bg-background border-input h-9 text-xs">
                    <SelectValue placeholder="Seleccionar dispositivo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {dispositivos.map((d) => {
                      const idVal = getItemId(d);
                      return (
                        <SelectItem key={idVal} value={idVal}>
                          {d.nombre || idVal} ({d.numero_serie || idVal})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Información Tópico MQTT */}
          <div className="p-3 bg-muted/20 rounded border border-border/50 text-xs font-mono space-y-1">
            <div className="text-muted-foreground flex justify-between items-center gap-2">
              <span>Tópico MQTT Objetivo:</span>
              <span className="text-cyan-400 font-bold truncate max-w-[260px]">
                {getTopicPreview()}
              </span>
            </div>
            <div className="text-muted-foreground flex justify-between">
              <span>Payload Generado:</span>
              <span className="text-emerald-400 font-bold">
                {`{"liquido_1": ${liquido1}, "liquido_2": ${liquido2}, "hora": ${hora}, "minuto": ${minuto}}`}
              </span>
            </div>
          </div>

          {isTankFull && (
            <div className="p-3 bg-amber-950/30 border border-amber-500/50 rounded-lg flex items-start gap-2.5 text-xs text-amber-200 animate-in fade-in">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-amber-300">Bombo de Mezcla con producto pendiente ({tankMezclaInfo?.volumen} L - {Math.round(tankMezclaInfo?.porcentaje || 0)}%)</span>
                <span>Debe vaciar o desechar la mezcla terminada antes de poder transmitir una nueva orden de preparación.</span>
              </div>
            </div>
          )}

          {/* Botón de Transmisión */}
          <Button
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold h-11 gap-2 shadow-lg shadow-cyan-950/20 disabled:opacity-50"
            disabled={loading || isTankFull}
            onClick={handleTransmitirReceta}
          >
            <Play className="h-4 w-4 fill-current" />
            {isTankFull ? "🚫 Bombo de Mezcla Ocupado (Vacíe antes de iniciar)" : "🚀 Transmitir Receta al Sistema de Mezcla"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
