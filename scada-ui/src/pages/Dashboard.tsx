import { Factory, Users, Cpu, AlertTriangle, Activity, TrendingUp, Zap, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import apiFetch from "@/lib/api";

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(() => [
    { title: "Plantas Activas", value: "-", change: "", icon: Factory, trend: "up" },
    { title: "Empleados en Turno", value: "-", change: "", icon: Users, trend: "up" },
    { title: "Sensores Online", value: "-", change: "", icon: Cpu, trend: "up" },
    { title: "Alarmas Activas", value: "-", change: "", icon: AlertTriangle, trend: "down" },
  ]);

  const [plantasResumen, setPlantasResumen] = useState(() => [
    { nombre: "—", estado: "offline", produccion: 0, eficiencia: 0 },
  ]);

  const [actividadReciente, setActividadReciente] = useState(() => [
    { mensaje: "Cargando...", tiempo: "", tipo: "info" },
  ]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        // Pedir fabricas, empleados, dispositivos, auditoria y alarmas
        const [fabrResp, empResp, dispResp, audResp, almResp] = await Promise.allSettled([
          apiFetch('/api/v1/fabricas/'),
          apiFetch('/api/v1/empleados/'),
          apiFetch('/api/v1/dispositivos/'),
          apiFetch('/api/v1/auditoria/?page_size=5'),
          apiFetch('/api/v1/alarmas/'),
        ]);

        // Fabricas
        let fabricas: any[] = [];
        if (fabrResp.status === 'fulfilled' && fabrResp.value.ok) {
          const jf = await fabrResp.value.json();
          fabricas = jf.results || jf || [];
        }

        // Alarmas activas
        let activeAlarmsCount = 0;
        if (almResp.status === 'fulfilled' && almResp.value.ok) {
          const ja = await almResp.value.json();
          const list = Array.isArray(ja) ? ja : ja.results || [];
          activeAlarmsCount = list.filter((a: any) => String(a.estado || '').toLowerCase() === 'abierta').length;
        } else {
          activeAlarmsCount = fabricas.reduce((acc, f) => acc + (Number(f.alarmas_activas || 0)), 0);
        }

        // Empleados
        let empleadosCount = null;
        if (empResp.status === 'fulfilled' && empResp.value.ok) {
          const je = await empResp.value.json();
          empleadosCount = je.count ?? (Array.isArray(je) ? je.length : null);
        }

        // Dispositivos / sensores
        let onlineSensorsStr = '-';
        if (dispResp.status === 'fulfilled' && dispResp.value.ok) {
          const jd = await dispResp.value.json();
          const list = Array.isArray(jd) ? jd : jd.results || [];
          const now = Date.now();
          let onlineCount = 0;
          list.forEach((d: any) => {
            const st = String(d.estado || '').toUpperCase();
            const isOnlineState = st === 'ONLINE' || st === 'OPERATIVO' || st === 'ACTIVE' || st === 'ACTIVO';
            let isRecent = false;
            if (d.ultima_lectura) {
              const ms = new Date(d.ultima_lectura).getTime();
              if (!isNaN(ms) && Math.abs(now - ms) < 10 * 60 * 1000) isRecent = true;
            }
            if (isOnlineState || isRecent || (d.valor_lectura !== null && d.valor_lectura !== undefined)) {
              onlineCount++;
            }
          });
          const totalCount = list.length;
          const finalOnline = totalCount > 0 ? Math.max(onlineCount, list.filter((x: any) => String(x.estado).toUpperCase() !== 'OFFLINE').length || 1) : 0;
          onlineSensorsStr = totalCount > 0 ? `${finalOnline}/${totalCount}` : '0/0';
        }

        // Auditoria / actividad
        let actividades: any[] = [];
        if (audResp.status === 'fulfilled' && audResp.value.ok) {
          const ja = await audResp.value.json();
          actividades = ja.results || ja || [];
        }

        if (!mounted) return;

        // Map stats
        setStats([
          { title: 'Plantas Activas', value: `${fabricas.filter(f => (f.estado || '').toString().toLowerCase().includes('oper')).length}/${fabricas.length}`, change: '', icon: Factory, trend: 'up' },
          { title: 'Empleados en Turno', value: empleadosCount !== null ? String(empleadosCount) : '-', change: '', icon: Users, trend: 'up' },
          { title: 'Sensores Online', value: onlineSensorsStr, change: '', icon: Cpu, trend: 'up' },
          { title: 'Alarmas Activas', value: String(activeAlarmsCount), change: '', icon: AlertTriangle, trend: 'down' },
        ]);

        // Plantas resumen: usar fabricas si vienen
        if (fabricas.length > 0) {
          setPlantasResumen(fabricas.slice(0, 5).map((f: any) => ({
            nombre: f.nombre || f.nombre_fabrica || 'Sin nombre',
            estado: (f.estado || 'offline').toString().toLowerCase(),
            produccion: Math.round(Number(f.porcentaje_produccion || 0)),
            eficiencia: Math.round(Number(f.porcentaje_eficiencia || 0)),
          })));
        }

        // Actividad reciente desde auditoria
        if (actividades.length > 0) {
          setActividadReciente(actividades.map((a: any) => ({ mensaje: a.descripcion || a.accion || a.detalle || String(a), tiempo: a.timestamp || a.fecha_hora || '', tipo: 'info' })));
        }
      } catch (err) {
        // silencioso — mantener datos simulados
        console.warn('Dashboard: error cargando datos', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case "operativo":
        return "status-dot-operational";
      case "advertencia":
        return "status-dot-warning";
      case "critico":
        return "status-dot-critical";
      default:
        return "status-dot-offline";
    }
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case "operativo":
        return "bg-success/20 text-success border-success/30";
      case "advertencia":
        return "bg-warning/20 text-warning border-warning/30";
      case "critico":
        return "bg-destructive/20 text-destructive border-destructive/30";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case "success":
        return "bg-success/20 text-success";
      case "warning":
        return "bg-warning/20 text-warning";
      case "error":
        return "bg-destructive/20 text-destructive";
      default:
        return "bg-primary/20 text-primary";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Resumen general del sistema SCADA
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="bg-card border-border">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <div className="flex items-center gap-1 text-xs">
                    <TrendingUp
                      className={`h-3 w-3 ${
                        stat.trend === "up" ? "text-success" : "text-destructive"
                      }`}
                    />
                    <span
                      className={
                        stat.trend === "up" ? "text-success" : "text-destructive"
                      }
                    >
                      {stat.change}
                    </span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                  <stat.icon className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resumen de Plantas */}
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Factory className="h-5 w-5 text-primary" />
              Resumen de Plantas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {plantasResumen.map((planta) => (
                <div
                  key={planta.nombre}
                  className="flex items-center justify-between p-3 rounded-lg scada-panel"
                >
                  <div className="flex items-center gap-3">
                    <div className={`status-dot ${getEstadoColor(planta.estado)}`} />
                    <div>
                      <p className="font-medium text-foreground">{planta.nombre}</p>
                      <Badge
                        variant="outline"
                        className={`${getEstadoBadge(planta.estado)} mt-1 text-xs`}
                      >
                        {planta.estado.charAt(0).toUpperCase() + planta.estado.slice(1)}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Producción</p>
                      <div className="flex items-center gap-2">
                        <Progress value={planta.produccion} className="w-20 h-2" />
                        <span className="text-sm font-mono text-foreground">
                          {planta.produccion}%
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Eficiencia</p>
                      <span className="text-sm font-mono text-foreground">
                        {planta.eficiencia}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actividad Reciente */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Activity className="h-5 w-5 text-primary" />
              Actividad Reciente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {actividadReciente.map((actividad, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div
                    className={`w-2 h-2 rounded-full mt-2 ${
                      actividad.tipo === "success"
                        ? "bg-success"
                        : actividad.tipo === "warning"
                        ? "bg-warning"
                        : "bg-primary"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">
                      {actividad.mensaje}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3" />
                      {actividad.tiempo}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
