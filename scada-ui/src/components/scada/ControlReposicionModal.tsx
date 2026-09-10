import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import { RefreshCw, Play, Droplet, ShieldAlert, Settings2 } from "lucide-react";

interface ControlReposicionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispositivoId?: string | number;
  plantaNombre?: string;
  seccionNombre?: string;
  sistemaNombre?: string;
}

export function ControlReposicionModal({
  open,
  onOpenChange,
  dispositivoId,
  plantaNombre,
  seccionNombre,
  sistemaNombre,
}: ControlReposicionModalProps) {
  const [bombo, setBombo] = useState<string>("1");
  const [limitePorcentaje, setLimitePorcentaje] = useState<number>(80);
  const [dispositivos, setDispositivos] = useState<any[]>([]);
  const [selectedDispositivo, setSelectedDispositivo] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const getItemId = (item: any) => String(item?.id || item?.numero_serie || item?.pk || "");

  useEffect(() => {
    if (open) {
      fetchDispositivos();
    }
  }, [open]);

  const fetchDispositivos = async () => {
    try {
      const res = await apiFetch("/api/v1/dispositivos/");
      if (res.ok) {
        const data = await res.json();
        const items = data.results || data;
        if (Array.isArray(items) && items.length > 0) {
          setDispositivos(items);
          if (dispositivoId) {
            setSelectedDispositivo(String(dispositivoId));
          } else {
            // Intentar emparejar con bomba de reposición o el primer dispositivo de reposición
            const defaultDev = items.find((d: any) => {
              const name = (d.nombre || d.numero_serie || "").toLowerCase();
              return name.includes("repo") || name.includes("bombo");
            }) || items[0];
            setSelectedDispositivo(getItemId(defaultDev));
          }
        }
      }
    } catch (e) {
      console.warn("No se pudieron cargar los dispositivos:", e);
    }
  };

  const handleSelectBombo = (nuevoBombo: string) => {
    setBombo(nuevoBombo);
    // Vincular automáticamente con el dispositivo correspondiente (bombo1 o bombo2)
    const match = dispositivos.find(d => {
      const name = (d.nombre || d.numero_serie || "").toLowerCase();
      return nuevoBombo === "1" 
        ? name.includes("bombo1") || name.includes("tanque_a") || name.includes("repo")
        : name.includes("bombo2") || name.includes("tanque_b") || name.includes("repo");
    });
    if (match) {
      setSelectedDispositivo(getItemId(match));
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
    const rawSys = (sistemaNombre && sistemaNombre !== 'seleccionar') ? sistemaNombre : (disp?.sistema_nombre ? String(disp.sistema_nombre) : "linea_mezclado_1");
    const sys = cleanSegment(rawSys) || "linea_mezclado_1";
    return `${tenant}/${gw}/${sec}/${sys}/reposicion`;
  };

  const handleIniciarReposicion = async () => {
    setLoading(true);
    try {
      const activeDev = getActiveDevice();
      const fallbackDev = (dispositivos.length > 0 && getItemId(dispositivos[0])) ? getItemId(dispositivos[0]) : "bomba_reposicion";
      const targetId = selectedDispositivo || (activeDev ? getItemId(activeDev) : dispositivoId) || fallbackDev;

      const res = await apiFetch(`/api/v1/dispositivos/${targetId}/reposicion/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bombo: parseInt(bombo),
          limite_porcentaje: limitePorcentaje,
          freno: false,
        }),
      });

      if (res.ok) {
        toast({
          title: "✅ Orden de Reposición Enviada",
          description: `Se inició la reposición hacia el Bombo ${bombo} (Tanque ${bombo === "1" ? "A" : "B"}) hasta el ${limitePorcentaje}% (Comando R enviado)`,
        });
        onOpenChange(false);
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast({
          title: "Error al enviar orden",
          description: errorData.error || errorData.detail || "No se pudo comunicar la reposición con el servidor",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "Error de comunicación", description: "Ocurrió un error al contactar al servidor SCADA", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleFrenoEmergencia = async () => {
    setLoading(true);
    try {
      const activeDev = getActiveDevice();
      const fallbackDev = (dispositivos.length > 0 && getItemId(dispositivos[0])) ? getItemId(dispositivos[0]) : "bomba_reposicion";
      const targetId = selectedDispositivo || (activeDev ? getItemId(activeDev) : dispositivoId) || fallbackDev;

      const res = await apiFetch(`/api/v1/dispositivos/${targetId}/reposicion/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freno: true,
          accion: "frenar",
          comando: "frenar",
          bombo: 0,
          limite_porcentaje: 0,
        }),
      });

      if (res.ok) {
        toast({
          title: "🚨 FRENO DE EMERGENCIA ACTIVADO",
          description: "Se envió la parada inmediata de la Bomba de Reposición y Electroválvulas (Comando F enviado)",
          variant: "destructive",
        });
        onOpenChange(false);
      } else {
        toast({ title: "Error al detener reposición", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error de comunicación", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const activeDev = getActiveDevice();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto border-border bg-card">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
              <RefreshCw className="h-5 w-5 text-primary animate-spin-slow" />
              Control de Reposición
            </DialogTitle>
            {activeDev && (
              <Badge variant="outline" className="text-[11px] bg-primary/10 text-primary border-primary/30 font-mono">
                {activeDev.nombre || activeDev.numero_serie}
              </Badge>
            )}
          </div>
          <DialogDescription>
            Selecciona el tanque de destino (Bombo 1 o Bombo 2) y el porcentaje límite de llenado de materia prima líquida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Selector de Bombo Destino (Principal) */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Tanque / Bombo Destino</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={bombo === "1" ? "default" : "outline"}
                className={`h-14 flex flex-col items-center justify-center gap-1 font-medium transition-all ${
                  bombo === "1" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 border-primary" : "hover:border-primary/50"
                }`}
                onClick={() => handleSelectBombo("1")}
              >
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  <Droplet className="h-4 w-4" />
                  <span>Bombo 1</span>
                </div>
                <span className="text-[11px] opacity-80 font-normal">Tanque A (Ingrediente A)</span>
              </Button>
              <Button
                type="button"
                variant={bombo === "2" ? "default" : "outline"}
                className={`h-14 flex flex-col items-center justify-center gap-1 font-medium transition-all ${
                  bombo === "2" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 border-primary" : "hover:border-primary/50"
                }`}
                onClick={() => handleSelectBombo("2")}
              >
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  <Droplet className="h-4 w-4" />
                  <span>Bombo 2</span>
                </div>
                <span className="text-[11px] opacity-80 font-normal">Tanque B (Ingrediente B)</span>
              </Button>
            </div>
          </div>

          {/* Control Numérico Directo y Slider de Porcentaje Límite */}
          <div className="space-y-3 bg-muted/40 p-4 rounded-lg border border-border">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-semibold">Nivel Límite de Reposición (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={limitePorcentaje}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setLimitePorcentaje(isNaN(val) ? 0 : Math.max(0, Math.min(100, val)));
                  }}
                  className="w-24 h-9 text-right font-mono font-bold bg-background text-primary border-primary/40 text-base"
                />
                <span className="text-sm font-bold text-muted-foreground">%</span>
              </div>
            </div>
            <Slider
              value={[limitePorcentaje]}
              onValueChange={(val) => setLimitePorcentaje(val[0])}
              min={0}
              max={100}
              step={0.1}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0% (Vacío)</span>
              <span>50% (Medio)</span>
              <span>100% (Capacidad Máxima)</span>
            </div>
          </div>

          {/* Opción desplegable de Ajustes Avanzados de Dispositivo SCADA */}
          <div className="border border-border/60 rounded-lg p-2.5 bg-muted/20">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground font-medium"
            >
              <span className="flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-primary" />
                <span>Mapeo Avanzado de Gateway / Dispositivo Target</span>
              </span>
              <span className="font-mono text-[10px]">{showAdvanced ? "▼ Ocultar" : "▶ Configurar"}</span>
            </button>

            {showAdvanced && (
              <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                <Label className="text-xs font-medium">Dispositivo SCADA del Bus:</Label>
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

          {/* Información del Comando Serial y Tópico MQTT */}
          <div className="p-3 bg-muted/20 rounded border border-border/50 text-xs font-mono space-y-1.5">
            <div className="text-muted-foreground flex justify-between items-center gap-2">
              <span>Tópico MQTT Principal:</span>
              <span className="text-cyan-400 font-bold truncate max-w-[240px]">
                {getTopicPreview()}
              </span>
            </div>
            <div className="text-muted-foreground flex justify-between">
              <span>Trama Serial Generada:</span>
              <span className="text-emerald-400 font-bold">
                R{parseInt(bombo) === 1 ? 1000 + limitePorcentaje : 2000 + limitePorcentaje}
              </span>
            </div>
            <div className="text-muted-foreground flex justify-between">
              <span>Electroválvula Objetivo:</span>
              <span className="text-foreground">Electroválvula Bombo {bombo} (Pin {bombo === "1" ? "10" : "8"})</span>
            </div>
            <div className="text-muted-foreground flex justify-between">
              <span>Bomba de Reposición:</span>
              <span className="text-foreground">Bomba Camión (Pin 9 - ON)</span>
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="flex flex-col gap-3 pt-1">
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-11 gap-2 shadow-lg shadow-emerald-950/20"
              disabled={loading}
              onClick={handleIniciarReposicion}
            >
              <Play className="h-4 w-4 fill-current" />
              🚀 Iniciar Reposición de Materia Prima
            </Button>

            <Button
              variant="destructive"
              className="w-full font-semibold h-11 gap-2 border border-destructive/50"
              disabled={loading}
              onClick={handleFrenoEmergencia}
            >
              <ShieldAlert className="h-4 w-4" />
              🚨 Freno de Emergencia Reposición (Comando F)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
