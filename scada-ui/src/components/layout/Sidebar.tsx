import { NavLink } from "react-router-dom";
import {
  Users,
  Factory,
  Cpu,
  Monitor,
  LayoutDashboard,
  Calendar,
  Bell,
  FileText,
  ClipboardList,
  ChevronLeft,
  Activity,
  ChevronDown,
  Wifi,
  Database,
  ShieldCheck,
  BarChart3,
  BookOpen,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { useScadaWebSocket } from "@/hooks/useScadaWebSocket";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const [openGroups, setOpenGroups] = useState<string[]>(["Producción y Control"]);
  const { usuario, isAdmin } = useAuth();

  const [stats, setStats] = useState<{ total: number; online: number; lastTime: string }>({
    total: 0,
    online: 0,
    lastTime: "Conectando..."
  });

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await apiFetch("/api/v1/dispositivos/");
      if (resp.ok) {
        const data = await resp.json();
        const list = Array.isArray(data) ? data : data.results || [];
        const now = Date.now();
        let onlineCount = 0;
        let latestTimestamp = 0;

        list.forEach((d: any) => {
          const st = String(d.estado || '').toUpperCase();
          const isExplicitOffline = st.includes('OFF') || st.includes('DESCONECT') || st.includes('INACTIV');

          let isRecent = false;
          if (d.ultima_lectura) {
            const ms = new Date(d.ultima_lectura).getTime();
            if (!isNaN(ms)) {
              if (ms > latestTimestamp) {
                latestTimestamp = ms;
              }
              if (now - ms <= 60000) {
                isRecent = true;
              }
            }
          }

          if (!isExplicitOffline && isRecent) {
            onlineCount++;
          }
        });

        const totalCount = list.length;
        const finalOnline = onlineCount;

        setStats({
          total: totalCount,
          online: finalOnline,
          lastTime: latestTimestamp > 0
            ? new Date(latestTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : "Sin señal"
        });
      }
    } catch (e) {
      // silent
    }
  }, []);

  useScadaWebSocket({
    onMessage: () => {
      if (document.visibilityState === 'visible') {
        fetchStatus();
      }
    }
  });

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchStatus();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const rangoNum = Number(usuario?.rango || (isAdmin ? 8 : 1));

  const isPathAllowed = (path: string) => {
    if (rangoNum === 8 || isAdmin) return true; // Administrador - Acceso total
    if ([1, 2, 3, 4].includes(rangoNum)) { // Director, Gerente, Jefe de Sección, Coordinador
      const blocked = ['/plantas', '/secciones', '/sensores', '/almacenamiento', '/credenciales', '/comunicacion'];
      return !blocked.includes(path);
    }
    if (rangoNum === 5) { // Especialista
      const blocked = ['/empleados', '/plantas', '/secciones', '/sensores', '/almacenamiento', '/auditoria', '/credenciales', '/comunicacion'];
      return !blocked.includes(path);
    }
    // Rangos 6 y 7 (Empleado, Pasante)
    const blocked = ['/empleados', '/plantas', '/secciones', '/sensores', '/almacenamiento', '/plantillas', '/auditoria', '/credenciales', '/comunicacion'];
    return !blocked.includes(path);
  };

  const rawMenuGroups = [
    {
      title: "Principal",
      items: [
        { title: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
        { title: "Guía del Sistema", icon: BookOpen, path: "/guia-sistema" },
      ],
    },
    {
      title: "Gestión Central",
      items: [
        { title: "Gestión de Empleados", icon: Users, path: "/empleados" },
        { title: "Gestión de Plantas y Fábricas", icon: Factory, path: "/plantas" },
        { title: "Gestión de Secciones", icon: ClipboardList, path: "/secciones" },
        { title: "Gestión de Sensores y Máquinas", icon: Cpu, path: "/sensores" },
        { title: "Administración de Almacenamiento", icon: Database, path: "/almacenamiento" },
      ],
    },
    {
      title: "Producción y Control",
      collapsible: true,
      items: [
        { title: "Planificación de la Producción", icon: Calendar, path: "/planificacion" },
        { title: "Gestión de Plantillas (Recetas)", icon: FileText, path: "/plantillas" },
      ],
    },
    {
      title: "Monitoreo y Auditoría",
      items: [
        { title: "Monitorización de Plantas", icon: Monitor, path: "/monitorizacion" },
        { title: "Estadísticas y Análisis", icon: BarChart3, path: "/analisis" },
        { title: "Visualización SCADA", icon: Activity, path: "/scada" },
        { title: "Gestión de Alarmas y Notificaciones", icon: Bell, path: "/alarmas" },
        { title: "Auditoría y Registro de Actividades", icon: ClipboardList, path: "/auditoria" },
      ],
    },
    {
      title: "Comunicación y Accesos",
      items: [
        { title: "Gestión de Credenciales", icon: KeyRound, path: "/credenciales" },
        { title: "Configuración MQTT", icon: Wifi, path: "/comunicacion" },
      ],
    },
  ];

  const menuGroups = rawMenuGroups
    .map(g => ({
      ...g,
      items: g.items.filter(item => isPathAllowed(item.path))
    }))
    .filter(g => g.items.length > 0);

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed top-16 left-0 z-40 h-[calc(100vh-4rem)] w-72 bg-sidebar border-r border-sidebar-border transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0 lg:translate-x-0" : "-translate-x-full lg:-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 lg:hidden">
            <span className="text-sm font-medium text-sidebar-foreground">Navegación</span>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-sidebar-foreground">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>

          <nav className="flex-1 overflow-y-auto py-4">
            {menuGroups.map((group) => (
              <div key={group.title} className="mb-4">
                {group.collapsible ? (
                  <Collapsible
                    open={openGroups.includes(group.title)}
                    onOpenChange={() => toggleGroup(group.title)}
                  >
                    <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                      <span>{group.title}</span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          openGroups.includes(group.title) && "rotate-180"
                        )}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="space-y-1 px-3 mt-1">
                        {group.items.map((item) => (
                          <li key={item.path}>
                            <NavLink
                              to={item.path}
                              onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                              className={({ isActive }) =>
                                cn(
                                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                                  isActive
                                    ? "bg-sidebar-accent text-sidebar-primary glow-primary"
                                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                )
                              }
                            >
                              <item.icon className="h-5 w-5 flex-shrink-0" />
                              <span className="truncate">{item.title}</span>
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <>
                    <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.title}
                    </div>
                    <ul className="space-y-1 px-3">
                      {group.items.map((item) => (
                        <li key={item.path}>
                          <NavLink
                            to={item.path}
                            onClick={() => { if (window.innerWidth < 1024) onClose(); }}
                            className={({ isActive }) =>
                              cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                                isActive
                                  ? "bg-sidebar-accent text-sidebar-primary glow-primary"
                                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              )
                            }
                          >
                            <item.icon className="h-5 w-5 flex-shrink-0" />
                            <span className="truncate">{item.title}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </nav>

          <div className="p-4 border-t border-sidebar-border">
            <div className="scada-panel p-3 bg-muted/20 border border-sidebar-border/60 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "status-dot",
                    stats.online > 0 ? "status-dot-operational bg-success" : "bg-warning"
                  )} />
                  <span className="text-xs font-semibold text-foreground">Red SCADA / MQTT</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                  {stats.online > 0 ? "ACTIVO" : "STANDBY"}
                </span>
              </div>

              <div className="text-xs space-y-1 text-muted-foreground pt-1 border-t border-sidebar-border/50">
                <div className="flex justify-between items-center">
                  <span>Dispositivos Online:</span>
                  <span className="font-mono font-bold text-foreground">{stats.online} / {stats.total}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Última Actividad:</span>
                  <span className="font-mono font-medium text-foreground">{stats.lastTime}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
