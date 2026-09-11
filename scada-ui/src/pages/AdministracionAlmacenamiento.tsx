import { useState, useEffect } from "react";
import apiFetch from "@/lib/api";
import { Database, Plus, Edit, Trash2, Search, Droplets, Thermometer, ArrowUp, ArrowDown, ArrowUpDown, RefreshCw } from "lucide-react";
import { ControlReposicionModal } from "@/components/scada/ControlReposicionModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useStorage, StorageUnit } from "@/contexts/StorageContext";
import { machineDefinitions } from "@/components/scada/scadaConstants";

const statusConfig = {
  active: { label: "Activo", className: "bg-success/20 text-success border-success/30" },
  inactive: { label: "Inactivo", className: "bg-muted/20 text-muted-foreground border-muted/30" },
  warning: { label: "Advertencia", className: "bg-warning/20 text-warning border-warning/30" },
  error: { label: "Error", className: "bg-destructive/20 text-destructive border-destructive/30" },
};

const typeLabels = {
  tank: "Tanque",
  silo: "Silo",
  deposit: "Depósito",
};



const AdministracionAlmacenamiento = () => {
  const { storageUnits, updateStorageUnit, addStorageUnit, deleteStorageUnit } = useStorage();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isReposicionOpen, setIsReposicionOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<StorageUnit | null>(null);

  const [secciones, setSecciones] = useState<any[]>([]);
  const [sistemas, setSistemas] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [rSec, rSys] = await Promise.all([
          apiFetch("/api/v1/secciones/"),
          apiFetch("/api/v1/sistemas/")
        ]);
        if (rSec.ok) {
          const dSec = await rSec.json();
          setSecciones(Array.isArray(dSec) ? dSec : dSec.results || []);
        }
        if (rSys.ok) {
          const dSys = await rSys.json();
          setSistemas(Array.isArray(dSys) ? dSys : dSys.results || []);
        }
      } catch (e) {
        console.warn("Error cargando secciones/sistemas:", e);
      }
    };
    fetchData();
  }, []);

  // Form state
  const [formData, setFormData] = useState<Omit<StorageUnit, 'id'>>({
    nodeId: '',
    name: '',
    type: 'tank',
    content: '',
    currentVolume: 0,
    capacity: 1000,
    unit: 'L',
    temperature: 25,
    status: 'active',
    seccion: '',
    sistema: '',
  });

  const handleHeaderClick = (key: string) => {
    if (sortKey === key) {
      if (sortOrder === "asc") {
        setSortOrder("desc");
      } else {
        setSortKey("");
      }
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (key: string) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="h-3.5 w-3.5 ml-1 text-muted-foreground/30 hover:text-muted-foreground/80 transition-colors" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 ml-1 text-primary" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 ml-1 text-primary" />
    );
  };

  // Filter and sort logic
  let processedUnits = [...storageUnits];

  if (search) {
    processedUnits = processedUnits.filter((unit) =>
      unit.name.toLowerCase().includes(search.toLowerCase()) ||
      unit.content.toLowerCase().includes(search.toLowerCase())
    );
  }

  if (filterType !== "all") {
    processedUnits = processedUnits.filter((unit) => unit.type === filterType);
  }

  if (filterStatus !== "all") {
    processedUnits = processedUnits.filter((unit) => unit.status === filterStatus);
  }

  if (sortKey) {
    processedUnits.sort((a, b) => {
      let valA = a[sortKey as keyof StorageUnit];
      let valB = b[sortKey as keyof StorageUnit];

      if (sortKey === "volume") {
        valA = a.currentVolume;
        valB = b.currentVolume;
      }

      if (valA === null || valA === undefined) return sortOrder === "asc" ? 1 : -1;
      if (valB === null || valB === undefined) return sortOrder === "asc" ? -1 : 1;

      if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortOrder === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }

  const availableNodes = Object.entries(machineDefinitions)
    .filter(([id]) => id.startsWith('tank'))
    .map(([id, def]) => ({ id, label: def.label }));

  const handleOpenDialog = (unit?: StorageUnit) => {
    if (unit) {
      setEditingUnit(unit);
      setFormData({
        nodeId: unit.nodeId,
        name: unit.name,
        type: unit.type,
        content: unit.content,
        currentVolume: unit.currentVolume,
        capacity: unit.capacity,
        unit: unit.unit,
        temperature: unit.temperature,
        status: unit.status,
        seccion: unit.seccion ? String(unit.seccion) : '',
        sistema: unit.sistema ? String(unit.sistema) : '',
      });
    } else {
      setEditingUnit(null);
      setFormData({
        nodeId: '',
        name: '',
        type: 'tank',
        content: '',
        currentVolume: 0,
        capacity: 1000,
        unit: 'L',
        temperature: 25,
        status: 'active',
        seccion: '',
        sistema: '',
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.content || !formData.nodeId) {
      toast({
        title: "Error",
        description: "Por favor complete todos los campos requeridos",
        variant: "destructive",
      });
      return;
    }

    if (editingUnit) {
      const res = await updateStorageUnit({ ...editingUnit, ...formData, id: editingUnit.id });
      if (res.success) {

        toast({ title: "Actualizado", description: "Unidad de almacenamiento actualizada correctamente" });
        setDialogOpen(false);
      } else {
        toast({ title: "❌ Error al actualizar", description: res.error || "No se pudo guardar la unidad", variant: "destructive" });
      }
    } else {
      const res = await addStorageUnit(formData);
      if (res.success) {
        toast({ title: "Creado", description: "Nueva unidad de almacenamiento registrada" });
        setDialogOpen(false);
      } else {
        toast({ title: "❌ Error al crear", description: res.error || "No se pudo registrar la unidad", variant: "destructive" });
      }
    }
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const confirmDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    const res = await deleteStorageUnit(deleteConfirmId);
    if (res.success) {
      toast({ title: "Eliminado", description: "Unidad de almacenamiento eliminada de la base de datos" });
    } else {
      toast({ title: "❌ Error al eliminar", description: res.error || "No se pudo eliminar la unidad", variant: "destructive" });
    }
    setDeleteConfirmId(null);
  };

  const totalCapacity = storageUnits.reduce((acc, unit) => acc + unit.capacity, 0);
  const totalVolume = storageUnits.reduce((acc, unit) => acc + unit.currentVolume, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Administración de Almacenamiento</h1>
          <p className="text-muted-foreground mt-1">
            Gestione los tanques, silos y depósitos del sistema SCADA
          </p>
        </div>
        <Button 
          onClick={() => setIsReposicionOpen(true)} 
          className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md"
        >
          <RefreshCw className="h-4 w-4" /> Llenado / Reposición (Bombos)
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Unidades</p>
                <p className="text-2xl font-bold text-foreground">{storageUnits.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Droplets className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Capacidad Total</p>
                <p className="text-2xl font-bold text-foreground">{totalCapacity.toLocaleString()} L</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                <Droplets className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Volumen Actual</p>
                <p className="text-2xl font-bold text-foreground">{totalVolume.toLocaleString()} L</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <Thermometer className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ocupación</p>
                <p className="text-2xl font-bold text-foreground">
                  {totalCapacity > 0 ? Math.round((totalVolume / totalCapacity) * 100) : 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Storage Units Table */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-lg">Unidades de Almacenamiento</CardTitle>
          <Button size="sm" onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Unidad
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2 mb-4 flex-wrap items-center">
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o contenido..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background border-border"
              />
            </div>

            {/* Type Filter */}
            <div className="w-full sm:w-40">
              <Select value={filterType} onValueChange={(value) => setFilterType(value)}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Tipo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los Tipos</SelectItem>
                  <SelectItem value="tank">Tanque</SelectItem>
                  <SelectItem value="silo">Silo</SelectItem>
                  <SelectItem value="deposit">Depósito</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="w-full sm:w-40">
              <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value)}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Estado..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los Estados</SelectItem>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                  <SelectItem value="warning">Advertencia</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead 
                    className="text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleHeaderClick('name')}
                  >
                    <div className="flex items-center">
                      Nombre {renderSortIcon('name')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleHeaderClick('type')}
                  >
                    <div className="flex items-center">
                      Tipo {renderSortIcon('type')}
                    </div>
                  </TableHead>
                  <TableHead className="text-muted-foreground select-none">Sección</TableHead>
                  <TableHead className="text-muted-foreground select-none">Sistema</TableHead>
                  <TableHead 
                    className="text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleHeaderClick('content')}
                  >
                    <div className="flex items-center">
                      Contenido {renderSortIcon('content')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleHeaderClick('capacity')}
                  >
                    <div className="flex items-center">
                      Volumen / Capacidad {renderSortIcon('capacity')}
                    </div>
                  </TableHead>
                  <TableHead className="text-muted-foreground select-none">Nivel</TableHead>
                  <TableHead 
                    className="text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleHeaderClick('temperature')}
                  >
                    <div className="flex items-center">
                      Temp. {renderSortIcon('temperature')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleHeaderClick('status')}
                  >
                    <div className="flex items-center">
                      Estado {renderSortIcon('status')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleHeaderClick('nodeId')}
                  >
                    <div className="flex items-center">
                      Nodo SCADA {renderSortIcon('nodeId')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleHeaderClick('creado_el')}
                  >
                    <div className="flex items-center">
                      Fecha de Creación {renderSortIcon('creado_el')}
                    </div>
                  </TableHead>
                  <TableHead className="text-muted-foreground">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processedUnits.map((unit) => {
                  const levelPercent = (unit.currentVolume / unit.capacity) * 100;
                  return (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium text-foreground">{unit.name}</TableCell>
                      <TableCell className="text-foreground">{typeLabels[unit.type]}</TableCell>
                      <TableCell className="text-foreground text-xs font-semibold text-cyan-300">
                        {unit.seccion_nombre || 'General'}
                      </TableCell>
                      <TableCell className="text-foreground text-xs font-semibold text-indigo-300">
                        {unit.sistema_nombre || 'General'}
                      </TableCell>
                      <TableCell className="text-foreground">{unit.content}</TableCell>
                      <TableCell className="text-foreground font-mono">
                        {unit.currentVolume.toLocaleString()} / {unit.capacity.toLocaleString()} {unit.unit}
                      </TableCell>
                      <TableCell className="w-32">
                        <div className="flex items-center gap-2">
                          <Progress value={levelPercent} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground font-mono w-10">
                            {Math.round(levelPercent)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-foreground font-mono">
                        {unit.temperature !== undefined ? `${unit.temperature}°C` : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusConfig[unit.status].className}>
                          {statusConfig[unit.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {unit.nodeId}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {unit.creado_el ? new Date(unit.creado_el).toLocaleString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        }) : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(unit)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => confirmDelete(unit.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Deletion */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive font-bold flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Confirmar Eliminación de Unidad de Almacenamiento
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar permanentemente esta unidad de almacenamiento (tanque/silo) de la base de datos? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={executeDelete}>Eliminar Unidad</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-card border-border">
          <DialogHeader>
            <DialogTitle>
              {editingUnit ? "Editar Unidad de Almacenamiento" : "Nueva Unidad de Almacenamiento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Tanque Principal"
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nodeId">Nodo SCADA / Identificador *</Label>
                <Input
                  id="nodeId"
                  value={formData.nodeId}
                  onChange={(e) => setFormData({ ...formData, nodeId: e.target.value })}
                  placeholder="Ej: tank-1, tank-4, silo-1"
                  className="bg-background border-border font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: 'tank' | 'silo' | 'deposit') =>
                    setFormData({ ...formData, type: value })
                  }
                >
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tank">Tanque</SelectItem>
                    <SelectItem value="silo">Silo</SelectItem>
                    <SelectItem value="deposit">Depósito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Contenido *</Label>
                <Input
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Ej: Aceite de Oliva"
                  className="bg-background border-border"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currentVolume">Volumen Actual</Label>
                <Input
                  id="currentVolume"
                  type="number"
                  value={formData.currentVolume}
                  onChange={(e) => setFormData({ ...formData, currentVolume: Number(e.target.value) })}
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity">Capacidad</Label>
                <Input
                  id="capacity"
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                  className="bg-background border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unidad</Label>
                <Select
                  value={formData.unit}
                  onValueChange={(value) => setFormData({ ...formData, unit: value })}
                >
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L">Litros (L)</SelectItem>
                    <SelectItem value="m³">Metros cúbicos (m³)</SelectItem>
                    <SelectItem value="kg">Kilogramos (kg)</SelectItem>
                    <SelectItem value="T">Toneladas (T)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="seccion">Sección Perteneciente</Label>
                <Select
                  value={formData.seccion ? String(formData.seccion) : "ninguna"}
                  onValueChange={(value) => setFormData({ ...formData, seccion: value === "ninguna" ? "" : value })}
                >
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Seleccionar sección" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguna">Sin sección (General)</SelectItem>
                    {secciones.map((sec) => (
                      <SelectItem key={sec.id} value={String(sec.id)}>
                        📂 {sec.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sistema">Sistema Perteneciente</Label>
                <Select
                  value={formData.sistema ? String(formData.sistema) : "ninguno"}
                  onValueChange={(value) => setFormData({ ...formData, sistema: value === "ninguno" ? "" : value })}
                >
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Seleccionar sistema" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">Sin sistema (General)</SelectItem>
                    {sistemas.map((sys) => (
                      <SelectItem key={sys.id} value={String(sys.id)}>
                        ⚙️ {sys.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={formData.status}
                onValueChange={(value: 'active' | 'inactive' | 'warning' | 'error') =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                  <SelectItem value="warning">Advertencia</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {editingUnit ? "Guardar Cambios" : "Crear Unidad"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Control de Reposición (Bombos) */}
      <ControlReposicionModal open={isReposicionOpen} onOpenChange={setIsReposicionOpen} />
    </div>
  );
};

export default AdministracionAlmacenamiento;
