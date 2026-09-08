import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Search, Download, Calendar, ArrowUpDown, ArrowUp, ArrowDown, Info, Key, Plus, Trash2, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import apiFetch from "@/lib/api";
import { formatArgentinianDate } from "@/lib/utils";

interface RegistroAuditoria {
  id: string;
  fechaHora: string;
  usuario: string;
  accion: string;
  detalle: string;
  modulo: string;
  datos: any;
  ip_origen: string;
}

interface RegistrationKeyItem {
  id: number;
  clave: string;
  activo: boolean;
  actualizado_en: string;
}

type SortField = "id" | "fechaHora" | "usuario" | "accion" | "modulo";
type SortDirection = "asc" | "desc";

const getAccionColor = (accion: string) => {
  const colors: Record<string, string> = {
    "Creación": "bg-success/20 text-success border-success/30",
    "Modificación": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "Eliminación": "bg-destructive/20 text-destructive border-destructive/30",
    "Alarma": "bg-warning/20 text-warning border-warning/30",
    "Inicio de Sesión": "bg-purple-500/20 text-purple-400 border-purple-500/30",
    "Inicio Sesión": "bg-purple-500/20 text-purple-400 border-purple-500/30",
    "Backup": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  };
  const foundKey = Object.keys(colors).find(key => 
    accion.toLowerCase().includes(key.toLowerCase())
  );
  return foundKey ? colors[foundKey] : "bg-muted text-muted-foreground";
};

const RANGOS_AUTORIZADOS = ['1', '2', '3', '4', '8'];

const Auditoria = () => {
  const { usuario } = useAuth();
  const navigate = useNavigate();

  const isAdmin = usuario?.rango === '8' || usuario?.rol === 'Administrador' || Boolean((usuario as any)?.is_staff) || Boolean((usuario as any)?.is_superuser);

  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados de edición locales para los filtros
  const [searchVal, setSearchVal] = useState("");
  const [filtroModulo, setFiltroModulo] = useState<string>("todos");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");

  // Estados de filtros activos aplicados formalmente
  const [activeFilters, setActiveFilters] = useState({
    search: "",
    modulo: "todos",
    fechaInicio: "",
    fechaFin: "",
    horaInicio: "",
    horaFin: ""
  });

  const [sortField, setSortField] = useState<SortField>("fechaHora");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Paginación
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Módulos estáticos del sistema
  // Módulos estáticos del sistema alineados con el backend
  const modulos = [
    { label: "Plantas / Fábricas", value: "Plantas" },
    { label: "Secciones", value: "Secciones" },
    { label: "Dispositivos SCADA", value: "Dispositivos SCADA" },
    { label: "Comunicaciones MQTT", value: "Comunicaciones MQTT" },
    { label: "Empleados", value: "Empleados" },
    { label: "Órdenes de Producción", value: "Órdenes de Producción" },
    { label: "Recetas de Producción", value: "Recetas de Producción" },
    { label: "Inventario / Almacenamiento", value: "Inventario / Almacenamiento" },
    { label: "Gestión de Alarmas", value: "Gestión de Alarmas" },
    { label: "Planificación de la Producción", value: "Planificación de la Producción" },
    { label: "Seguridad / Sesiones", value: "Seguridad" },
    { label: "General", value: "General" }
  ];

  // Estado del diálogo de detalle
  const [selectedLog, setSelectedLog] = useState<RegistroAuditoria | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Verificar acceso jerárquico
  const tieneAcceso = useMemo(() => {
    if (!usuario) return false;
    return RANGOS_AUTORIZADOS.includes(usuario.rango || '') || usuario.rol === 'Administrador';
  }, [usuario]);

  // Redirección si no tiene acceso
  useEffect(() => {
    if (usuario && !tieneAcceso) {
      toast.error('Acceso denegado: No tiene permisos de nivel jerárquico para visualizar auditorías.');
      navigate('/dashboard');
    }
  }, [usuario, tieneAcceso, navigate]);

  // Helper para generar una fecha ISO local correcta con el offset de Argentina (-03:00)
  const toLocalISOString = (dateStr: string, timeStr: string, defaultTime: string): string => {
    const timePart = timeStr || defaultTime;
    return `${dateStr}T${timePart}:00-03:00`;
  };

  // Cargar desde la API real con filtros y paginación en servidor
  const loadLogs = async () => {
    try {
      setLoading(true);
      let url = `/api/v1/auditoria/?page=${page}&page_size=25`;
      
      if (activeFilters.search) {
        url += `&search=${encodeURIComponent(activeFilters.search)}`;
      }
      if (activeFilters.modulo && activeFilters.modulo !== "todos") {
        url += `&modulo=${encodeURIComponent(activeFilters.modulo)}`;
      }
      if (activeFilters.fechaInicio) {
        url += `&fecha_desde=${encodeURIComponent(toLocalISOString(activeFilters.fechaInicio, activeFilters.horaInicio, '00:00'))}`;
      }
      if (activeFilters.fechaFin) {
        url += `&fecha_hasta=${encodeURIComponent(toLocalISOString(activeFilters.fechaFin, activeFilters.horaFin, '23:59'))}`;
      }

      // Ordenamiento por Backend
      let orderingKey = "";
      if (sortField === "fechaHora") orderingKey = "timestamp";
      else if (sortField === "usuario") orderingKey = "usuario__username";
      else orderingKey = sortField;

      if (sortDirection === "desc") {
        orderingKey = `-${orderingKey}`;
      }
      url += `&ordering=${orderingKey}`;

      const resp = await apiFetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      const list = data.results || [];
      setTotalCount(data.count || 0);

      const mapped = list.map((r: any) => {
        return {
          id: `AUD-${r.id}`,
          fechaHora: formatArgentinianDate(r.timestamp),
          usuario: r.usuario_username || "Sistema",
          accion: r.accion || "Acción",
          detalle: r.descripcion || "",
          modulo: r.modulo || "General",
          datos: r.datos || null,
          ip_origen: r.ip_origen || "127.0.0.1"
        };
      });
      setRegistros(mapped);
    } catch (err) {
      toast.error('No se pudieron cargar los registros de auditoría');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tieneAcceso) {
      loadLogs();
    }
  }, [tieneAcceso, page, activeFilters, sortField, sortDirection]);

  // Manejadores para aplicar y limpiar filtros manualmente
  const handleApplyFilters = () => {
    setPage(1);
    setActiveFilters({
      search: searchVal,
      modulo: filtroModulo,
      fechaInicio: fechaInicio,
      fechaFin: fechaFin,
      horaInicio: horaInicio,
      horaFin: horaFin
    });
  };

  const handleClearFilters = () => {
    setSearchVal("");
    setFiltroModulo("todos");
    setFechaInicio("");
    setFechaFin("");
    setHoraInicio("");
    setHoraFin("");
    
    setPage(1);
    setActiveFilters({
      search: "",
      modulo: "todos",
      fechaInicio: "",
      fechaFin: "",
      horaInicio: "",
      horaFin: ""
    });
  };

  const totalPages = Math.ceil(totalCount / 25) || 1;

  // Obtener logs completos filtrados para exportación CSV / PDF
  const fetchAllFilteredLogs = async () => {
    try {
      toast.info("Descargando historial completo filtrado para el reporte...");
      let url = `/api/v1/auditoria/?page_size=100000`;
      
      if (activeFilters.search) url += `&search=${encodeURIComponent(activeFilters.search)}`;
      if (activeFilters.modulo && activeFilters.modulo !== "todos") url += `&modulo=${encodeURIComponent(activeFilters.modulo)}`;
      if (activeFilters.fechaInicio) {
        url += `&fecha_desde=${encodeURIComponent(toLocalISOString(activeFilters.fechaInicio, activeFilters.horaInicio, '00:00'))}`;
      }
      if (activeFilters.fechaFin) {
        url += `&fecha_hasta=${encodeURIComponent(toLocalISOString(activeFilters.fechaFin, activeFilters.horaFin, '23:59'))}`;
      }
      
      let orderingKey = "";
      if (sortField === "fechaHora") orderingKey = "timestamp";
      else if (sortField === "usuario") orderingKey = "usuario__username";
      else orderingKey = sortField;
      if (sortDirection === "desc") orderingKey = `-${orderingKey}`;
      url += `&ordering=${orderingKey}`;

      const resp = await apiFetch(url);
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      const list = data.results || data || [];

      return list.map((r: any) => {
        return {
          id: `AUD-${r.id}`,
          fechaHora: formatArgentinianDate(r.timestamp),
          usuario: r.usuario_username || "Sistema",
          accion: r.accion || "Acción",
          detalle: r.descripcion || "",
          modulo: r.modulo || "General",
          datos: r.datos || null,
          ip_origen: r.ip_origen || "127.0.0.1"
        };
      });
    } catch {
      toast.error("Error al obtener los registros completos");
      return [];
    }
  };

  const handleSort = (field: SortField) => {
    setPage(1);
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1" />;
    return sortDirection === "asc" ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const exportarRegistros = async () => {
    const items = await fetchAllFilteredLogs();
    if (items.length === 0) return;

    const headers = ["ID", "Fecha/Hora", "Usuario", "Acción", "Detalle", "Módulo", "IP"];
    const csvContent = [
      headers.join(","),
      ...items.map(r => 
        [r.id, r.fechaHora, r.usuario, r.accion, `"${r.detalle.replace(/"/g, '""')}"`, r.modulo, r.ip_origen].join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `auditoria_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    toast.success(`Exportación CSV completada: Se han exportado ${items.length} registros`);
  };

  const exportarPDF = async () => {
    const items = await fetchAllFilteredLogs();
    if (items.length === 0) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Habilite los pop-ups para poder generar el reporte PDF");
      return;
    }

    const rows = items.map(r => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">${r.id}</td>
        <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; white-space: nowrap;">${r.fechaHora}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${r.usuario}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">
          <span style="padding: 2px 6px; border-radius: 4px; font-size: 0.85em; font-weight: bold; background: #eee;">${r.accion}</span>
        </td>
        <td style="padding: 8px; border: 1px solid #ddd;">${r.detalle}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${r.modulo}</td>
        <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">${r.ip_origen}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Reporte de Auditoría - SCADA Control</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 30px; color: #333; }
            h1 { text-align: center; font-size: 24px; margin-bottom: 5px; }
            p.meta { text-align: center; color: #666; font-size: 14px; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #f4f4f4; padding: 10px; border: 1px solid #ddd; font-weight: bold; text-align: left; }
            td { font-size: 13px; }
            @page { size: A4 landscape; margin: 1.5cm; }
          </style>
        </head>
        <body>
          <h1>Reporte de Auditoría y Registro de Actividades</h1>
          <p class="meta">Generado el ${new Date().toLocaleString("es-AR")} | Registros totales: ${items.length}</p>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha/Hora</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Detalle</th>
                <th>Módulo</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    toast.success("Documento de impresión PDF generado con éxito");
  };

  if (loading && registros.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <ClipboardList className="h-8 w-8 text-primary animate-pulse mr-2" />
        <span className="text-muted-foreground">Cargando registros de auditoría...</span>
      </div>
    );
  }

  if (!tieneAcceso) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Auditoría y Registro de Actividades</h1>
          <p className="text-muted-foreground mt-1">Historial completo de acciones realizadas en el sistema</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportarRegistros}>
              <Download className="h-4 w-4 mr-2" />
              Descargar CSV
            </Button>
            <Button variant="outline" onClick={exportarPDF}>
              <Download className="h-4 w-4 mr-2" />
              Descargar PDF
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Histórico</p>
                <p className="text-2xl font-bold text-foreground">{totalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Filtrados / Visibles</p>
                <p className="text-2xl font-bold text-foreground">{totalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Módulos</p>
                <p className="text-2xl font-bold text-foreground">{modulos.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <Input
                placeholder="Buscar en registros... (Enter para aplicar)"
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleApplyFilters(); }}
                className="sm:max-w-xs bg-background border-border"
              />
              <Select value={filtroModulo} onValueChange={setFiltroModulo}>
                <SelectTrigger className="w-[180px] bg-background border-border">
                  <SelectValue placeholder="Filtrar módulo" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="todos">Todos los módulos</SelectItem>
                  {modulos.map((modulo) => (
                    <SelectItem key={modulo.value} value={modulo.value}>{modulo.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Desde:</span>
                <Input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-auto bg-background border-border"
                />
                <Input
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  className="w-auto bg-background border-border text-foreground"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Hasta:</span>
                <Input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="w-auto bg-background border-border"
                />
                <Input
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  className="w-auto bg-background border-border text-foreground"
                />
              </div>
            </div>
            
            {/* Botones de acción para filtros */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
              <Button 
                onClick={handleApplyFilters} 
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-9 text-xs font-semibold px-4"
              >
                <Search className="h-4 w-4" />
                Buscar y Filtrar
              </Button>
              <Button 
                variant="outline" 
                onClick={handleClearFilters} 
                className="h-9 text-xs border-border hover:bg-muted text-foreground"
              >
                Limpiar Filtros
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48 bg-muted/5">
                <ClipboardList className="h-6 w-6 text-primary animate-pulse mr-2" />
                <span className="text-xs text-muted-foreground">Actualizando registros de auditoría...</span>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-muted-foreground cursor-pointer" onClick={() => handleSort("id")}>
                      <div className="flex items-center">ID <SortIcon field="id" /></div>
                    </TableHead>
                    <TableHead className="text-muted-foreground cursor-pointer" onClick={() => handleSort("fechaHora")}>
                      <div className="flex items-center">Fecha/Hora <SortIcon field="fechaHora" /></div>
                    </TableHead>
                    <TableHead className="text-muted-foreground cursor-pointer" onClick={() => handleSort("usuario")}>
                      <div className="flex items-center">Usuario <SortIcon field="usuario" /></div>
                    </TableHead>
                    <TableHead className="text-muted-foreground cursor-pointer" onClick={() => handleSort("accion")}>
                      <div className="flex items-center">Acción <SortIcon field="accion" /></div>
                    </TableHead>
                    <TableHead className="text-muted-foreground">Detalle</TableHead>
                    <TableHead className="text-muted-foreground cursor-pointer" onClick={() => handleSort("modulo")}>
                      <div className="flex items-center">Módulo <SortIcon field="modulo" /></div>
                    </TableHead>
                    <TableHead className="text-muted-foreground">IP Origen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registros.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No se encontraron registros de auditoría que coincidan con los filtros.
                      </TableCell>
                    </TableRow>
                  ) : (
                    registros.map((registro) => (
                      <TableRow 
                        key={registro.id} 
                        className="hover:bg-muted/20 border-border cursor-pointer transition-colors"
                        onClick={() => { setSelectedLog(registro); setIsDetailOpen(true); }}
                      >
                        <TableCell className="font-mono text-foreground">{registro.id}</TableCell>
                        <TableCell className="font-mono text-muted-foreground text-sm">{registro.fechaHora}</TableCell>
                        <TableCell className="text-foreground">{registro.usuario}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getAccionColor(registro.accion)}>{registro.accion}</Badge>
                        </TableCell>
                        <TableCell className="text-foreground max-w-md truncate">{registro.detalle}</TableCell>
                        <TableCell><Badge variant="secondary">{registro.modulo}</Badge></TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{registro.ip_origen || '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between border-t border-border px-4 py-4 bg-muted/10 mt-4 rounded-lg">
            <div className="text-xs text-muted-foreground">
              Mostrando página <span className="font-semibold text-foreground">{page}</span> de <span className="font-semibold text-foreground">{totalPages}</span> ({totalCount} registros en total)
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="h-8 px-2 text-xs border-border"
              >
                Primera
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page === 1}
                className="h-8 px-2.5 text-xs border-border"
              >
                Anterior
              </Button>
              <span className="px-3 text-xs font-semibold text-foreground bg-muted rounded py-1.5 border border-border">
                {page}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={page === totalPages}
                className="h-8 px-2.5 text-xs border-border"
              >
                Siguiente
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="h-8 px-2 text-xs border-border"
              >
                Última
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Detalle Completo de Auditoría */}
      {selectedLog && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-2xl bg-card border-border text-foreground text-xs md:text-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
                <Info className="h-5 w-5 text-primary" />
                Detalle del Registro de Auditoría
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                Información técnica y cambios de valores del log seleccionado.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 my-2">
              <div className="grid grid-cols-2 gap-4 border border-border p-3 rounded-lg bg-muted/10 text-xs">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">ID Registro</p>
                  <p className="font-mono text-sm font-bold text-foreground mt-0.5">{selectedLog.id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Fecha / Hora</p>
                  <p className="font-mono text-sm text-foreground mt-0.5">{selectedLog.fechaHora}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Usuario Autor</p>
                  <p className="text-sm text-foreground mt-0.5">{selectedLog.usuario || 'Sistema (Automático)'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Dirección IP</p>
                  <p className="font-mono text-sm text-foreground mt-0.5">{selectedLog.ip_origen}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Módulo Afectado</p>
                  <p className="text-sm mt-0.5"><Badge variant="secondary">{selectedLog.modulo}</Badge></p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Acción</p>
                  <p className="text-sm mt-0.5"><Badge variant="outline" className={getAccionColor(selectedLog.accion)}>{selectedLog.accion}</Badge></p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Descripción del Evento</p>
                <p className="text-sm text-foreground border border-border p-2.5 rounded-lg bg-muted/20 leading-relaxed">
                  {selectedLog.detalle}
                </p>
              </div>

              {/* Renderizar cambios detallados si existen */}
              {selectedLog.datos && typeof selectedLog.datos === 'object' && Object.keys(selectedLog.datos).length > 0 ? (
                <div>
                  {Object.values(selectedLog.datos).some(
                    (v: any) => v && typeof v === "object" && ("antes" in v || "despues" in v)
                  ) ? (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-semibold mb-1.5">Cambios Detectados (Valores)</p>
                      <div className="border border-border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="bg-muted/50 border-b border-border text-xs">
                              <th className="p-2 text-xs font-semibold text-muted-foreground uppercase">Campo</th>
                              <th className="p-2 text-xs font-semibold text-muted-foreground uppercase">Valor Anterior</th>
                              <th className="p-2 text-xs font-semibold text-muted-foreground uppercase">Valor Nuevo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(selectedLog.datos).map(([campo, diff]: [string, any]) => (
                              <tr key={campo} className="border-b border-border/50 hover:bg-muted/10 text-xs">
                                <td className="p-2 font-mono text-xs font-bold text-foreground">{campo}</td>
                                <td className="p-2 text-xs text-destructive bg-destructive/5 font-mono line-through truncate max-w-[150px]">{diff.antes || '(vacio)'}</td>
                                <td className="p-2 text-xs text-success bg-success/5 font-mono truncate max-w-[150px]">{diff.despues || '(vacio)'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-semibold mb-1.5">Ficha de Datos Registrados</p>
                      <div className="border border-border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="bg-muted/50 border-b border-border text-xs">
                              <th className="p-2 text-xs font-semibold text-muted-foreground uppercase">Campo</th>
                              <th className="p-2 text-xs font-semibold text-muted-foreground uppercase">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(selectedLog.datos).map(([campo, valor]: [string, any]) => (
                              <tr key={campo} className="border-b border-border/50 hover:bg-muted/10 text-xs">
                                <td className="p-2 font-mono text-xs font-bold text-foreground">{campo}</td>
                                <td className="p-2 text-xs text-foreground font-mono truncate max-w-[300px]">
                                  {String(valor) || '(vacío)'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : selectedLog.accion === 'Modificación' ? (
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Cambios Realizados</p>
                  <p className="text-xs text-muted-foreground italic border border-border p-2.5 rounded-lg bg-muted/5">
                    No se registran cambios de campos individuales para esta acción.
                  </p>
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button onClick={() => setIsDetailOpen(false)}>Cerrar Detalle</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};



export default Auditoria;
