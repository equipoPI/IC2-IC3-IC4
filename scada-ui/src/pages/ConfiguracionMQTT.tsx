import { useState, useEffect, useMemo } from "react";
import { Wifi, Plus, Edit, Trash2, Save, X, Search, SlidersHorizontal, Cpu, Info, CheckCircle2, Radio, Terminal } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";

interface ConexionMQTT {
  id: string;
  nombre: string;
  ip: string;
  puerto: number;
  estado?: "conectado" | "desconectado" | "error";
  usuario?: string;
  password?: string;
}

interface TopicMQTT {
  id: string;
  configuracion: string; // FK to ConfiguracionMQTT
  topic: string;
  tipo: "suscripcion" | "publicacion";
  tipoDato?: string;
  descripcion?: string;
  activo?: boolean;
}

interface MapeoAccion {
  id: string | number;
  nombre: string;
  tipo_sistema: string;
  tipo_sistema_display?: string;
  nombre_accion: string;
  plantilla_topico: string;
  plantilla_payload_json: string;
  activo?: boolean;
}

const tiposDato = ["string", "integer", "float", "boolean", "json"];

const ConfiguracionMQTT = () => {
  const [conexiones, setConexiones] = useState<ConexionMQTT[]>([]);
  const [topics, setTopics] = useState<TopicMQTT[]>([]);
  const [mapeos, setMapeos] = useState<MapeoAccion[]>([]);
  const [dialogConexion, setDialogConexion] = useState(false);
  const [dialogTopic, setDialogTopic] = useState(false);
  const [dialogMapeo, setDialogMapeo] = useState(false);
  const [editingConexion, setEditingConexion] = useState<ConexionMQTT | null>(null);
  const [editingTopic, setEditingTopic] = useState<TopicMQTT | null>(null);
  const [editingMapeo, setEditingMapeo] = useState<MapeoAccion | null>(null);

  const [formConexion, setFormConexion] = useState({ nombre: "", ip: "", puerto: "1883", usuario: "", password: "" });
  const [formTopic, setFormTopic] = useState({ configuracion: "", topic: "", tipo: "suscripcion" as "suscripcion" | "publicacion", tipoDato: "string", descripcion: "" });
  const [formMapeo, setFormMapeo] = useState({
    nombre: "",
    tipo_sistema: "FLUIDOS",
    nombre_accion: "reposicion",
    plantilla_topico: "{planta}/{gateway}/{seccion}/{sistema}/accion",
    plantilla_payload_json: '{"accion": "{accion}", "parametros": {}}'
  });

  const [searchMapeo, setSearchMapeo] = useState("");
  const [filterTipoSistema, setFilterTipoSistema] = useState("TODOS");

  const [mqttUsers, setMqttUsers] = useState<{ username: string }[]>([]);
  const [dialogMqttUser, setDialogMqttUser] = useState(false);
  const [formMqttUser, setFormMqttUser] = useState({ username: "", password: "" });
  const [deleteMqttUser, setDeleteMqttUser] = useState<string | null>(null);

  const fetchMqttUsers = async () => {
    try {
      const res = await apiFetch('/api/v1/mqtt-users/');
      if (res.ok) {
        const data = await res.json();
        setMqttUsers(Array.isArray(data) ? data : []);
      }
    } catch (e) {}
  };

  const handleSaveMqttUser = async () => {
    if (!formMqttUser.username || !formMqttUser.password) {
      toast({ title: 'Error', description: 'Complete usuario y contraseña', variant: 'destructive' });
      return;
    }
    try {
      const res = await apiFetch('/api/v1/mqtt-users/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formMqttUser)
      });
      if (res.ok) {
        toast({ title: 'Usuario guardado', description: `Credenciales de ${formMqttUser.username} actualizadas en Mosquitto` });
        setDialogMqttUser(false);
        setFormMqttUser({ username: "", password: "" });
        fetchMqttUsers();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: errData.detail || 'Error al guardar usuario en Mosquitto', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Error de red', variant: 'destructive' });
    }
  };

  const executeDeleteMqttUser = async () => {
    if (!deleteMqttUser) return;
    try {
      const res = await apiFetch(`/api/v1/mqtt-users/${deleteMqttUser}/`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Usuario eliminado', description: `Usuario ${deleteMqttUser} eliminado de Mosquitto` });
        setDeleteMqttUser(null);
        fetchMqttUsers();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: errData.detail || 'Error eliminando usuario', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Error de red', variant: 'destructive' });
    }
  };

  const mapeosFiltrados = useMemo(() => {
    return mapeos.filter((m) => {
      const matchTipo = filterTipoSistema === "TODOS" || m.tipo_sistema === filterTipoSistema;
      const matchSearch =
        !searchMapeo ||
        m.nombre.toLowerCase().includes(searchMapeo.toLowerCase()) ||
        m.nombre_accion.toLowerCase().includes(searchMapeo.toLowerCase()) ||
        m.plantilla_topico.toLowerCase().includes(searchMapeo.toLowerCase());
      return matchTipo && matchSearch;
    });
  }, [mapeos, filterTipoSistema, searchMapeo]);

  const handleSaveConexion = async () => {
    if (!formConexion.nombre || !formConexion.ip || !formConexion.puerto) {
      toast({ title: "Error", description: "Complete todos los campos", variant: "destructive" });
      return;
    }

    const payload = { 
      nombre: formConexion.nombre, 
      broker_url: formConexion.ip, 
      puerto: parseInt(formConexion.puerto),
      usuario: formConexion.usuario || null,
      password: formConexion.password || null
    };

    try {
      if (editingConexion && editingConexion.id) {
        const resp = await apiFetch(`/api/v1/configuraciones-mqtt/${editingConexion.id}/`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          const data = await resp.json();
          setConexiones(conexiones.map(c => c.id === String(data.id) ? { ...c, nombre: data.nombre, ip: data.broker_url, puerto: data.puerto, usuario: data.usuario } : c));
          toast({ title: 'Conexión actualizada', description: 'La conexión se ha actualizado correctamente' });
        } else {
          const errData = await resp.json();
          const detail = errData.detail || Object.entries(errData).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" | ") || "Error al actualizar la conexión";
          toast({ title: 'Error', description: detail, variant: "destructive" });
          return;
        }
      } else {
        const resp = await apiFetch('/api/v1/configuraciones-mqtt/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          const data = await resp.json();
          setConexiones([...conexiones, { id: String(data.id), nombre: data.nombre, ip: data.broker_url, puerto: data.puerto, estado: 'desconectado', usuario: data.usuario }]);
          toast({ title: 'Conexión creada', description: 'La conexión se ha creado correctamente' });
        } else {
          const errData = await resp.json();
          const detail = errData.detail || Object.entries(errData).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" | ") || "Error al crear la conexión";
          toast({ title: 'Error', description: detail, variant: "destructive" });
          return;
        }
      }
      setDialogConexion(false);
      setEditingConexion(null);
      setFormConexion({ nombre: "", ip: "", puerto: "1883", usuario: "", password: "" });
    } catch (e) {
      toast({ title: 'Error', description: 'Error de red con el servidor', variant: "destructive" });
    }
  };

  const handleSaveTopic = async () => {
    if (!formTopic.configuracion || !formTopic.topic || !formTopic.tipoDato) {
      toast({ title: "Error", description: "Complete todos los campos", variant: "destructive" });
      return;
    }

    const payload: any = { configuracion: formTopic.configuracion, topic: formTopic.topic, tipo: formTopic.tipo === 'suscripcion' ? 'SUSCRIPCION' : 'PUBLICACION', tipo_dato: formTopic.tipoDato, descripcion: formTopic.descripcion };
    
    try {
      if (editingTopic && editingTopic.id) {
        const resp = await apiFetch(`/api/v1/mqtt-topics/${editingTopic.id}/`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          const data = await resp.json();
          setTopics(topics.map(t => t.id === String(data.id) ? { id: String(data.id), configuracion: String(data.configuracion), topic: data.topic, tipo: (data.tipo || '').toString().toLowerCase(), tipoDato: data.tipo_dato, descripcion: data.descripcion } : t));
          toast({ title: 'Topic actualizado', description: 'El topic se ha actualizado correctamente' });
        } else {
          const errData = await resp.json();
          const detail = errData.detail || Object.entries(errData).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" | ") || "Error al actualizar el topic";
          toast({ title: 'Error', description: detail, variant: "destructive" });
          return;
        }
      } else {
        const resp = await apiFetch('/api/v1/mqtt-topics/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          const data = await resp.json();
          setTopics([...topics, { id: String(data.id), configuracion: String(data.configuracion), topic: data.topic, tipo: (data.tipo || '').toString().toLowerCase(), tipoDato: data.tipo_dato, descripcion: data.descripcion }]);
          toast({ title: 'Topic creado', description: 'El topic se ha creado correctamente' });
        } else {
          const errData = await resp.json();
          const detail = errData.detail || Object.entries(errData).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" | ") || "Error al crear el topic";
          toast({ title: 'Error', description: detail, variant: "destructive" });
          return;
        }
      }
      setDialogTopic(false);
      setEditingTopic(null);
      setFormTopic({ configuracion: "", topic: "", tipo: "suscripcion", tipoDato: "string", descripcion: "" });
    } catch (e) {
      toast({ title: 'Error', description: 'Error de red con el servidor', variant: "destructive" });
    }
  };

  const handleEditConexion = (conexion: ConexionMQTT) => {
    setEditingConexion(conexion);
    setFormConexion({ 
      nombre: conexion.nombre, 
      ip: conexion.ip, 
      puerto: String(conexion.puerto),
      usuario: conexion.usuario || "",
      password: "" 
    });
    setDialogConexion(true);
  };

  const handleEditTopic = (topic: TopicMQTT) => {
    setEditingTopic(topic);
    setFormTopic({ configuracion: String(topic.configuracion), topic: topic.topic, tipo: topic.tipo, tipoDato: topic.tipoDato || 'string', descripcion: topic.descripcion || '' });
    setDialogTopic(true);
  };

  const [deleteConfirmConexionId, setDeleteConfirmConexionId] = useState<string | null>(null);
  const [deleteConfirmMapeoId, setDeleteConfirmMapeoId] = useState<string | null>(null);

  const confirmDeleteConexion = (id: string) => {
    setDeleteConfirmConexionId(id);
  };

  const executeDeleteConexion = async () => {
    if (!deleteConfirmConexionId) return;
    const id = deleteConfirmConexionId;
    try {
      await apiFetch(`/api/v1/configuraciones-mqtt/${id}/`, { method: 'DELETE' });
      setConexiones(conexiones.filter(c => String(c.id) !== id));
      setTopics(topics.filter(t => String(t.configuracion) !== id));
      toast({ title: 'Conexión eliminada', description: 'La conexión y sus topics han sido eliminados' });
    } catch (e) {
      toast({ title: 'Error', description: 'No se pudo eliminar la conexión' });
    } finally {
      setDeleteConfirmConexionId(null);
    }
  };

  const handleDeleteTopic = (id: string) => {
    apiFetch(`/api/v1/mqtt-topics/${id}/`, { method: 'DELETE' }).then(() => {
      setTopics(topics.filter(t => String(t.id) !== id));
      toast({ title: 'Topic eliminado', description: 'El topic ha sido eliminado' });
    });
  };

  const fetchMapeos = async () => {
    try {
      const res = await apiFetch("/api/v1/mapeos-acciones-mqtt/");
      if (res.ok) {
        const data = await res.json();
        setMapeos(Array.isArray(data) ? data : data.results || []);
      }
    } catch (e) {
      console.warn("No se pudieron cargar los mapeos de acciones MQTT:", e);
    }
  };

  const handleNuevoMapeo = () => {
    setEditingMapeo(null);
    setFormMapeo({
      nombre: "",
      tipo_sistema: "FLUIDOS",
      nombre_accion: "reposicion",
      plantilla_topico: "{tenant}/{gateway}/{seccion}/{sistema}/accion",
      plantilla_payload_json: '{"accion": "{accion}", "parametros": {}}'
    });
    setDialogMapeo(true);
  };

  const handleEditMapeo = (m: MapeoAccion) => {
    setEditingMapeo(m);
    setFormMapeo({
      nombre: m.nombre,
      tipo_sistema: m.tipo_sistema,
      nombre_accion: m.nombre_accion,
      plantilla_topico: m.plantilla_topico,
      plantilla_payload_json: m.plantilla_payload_json
    });
    setDialogMapeo(true);
  };

  const handleSaveMapeo = async () => {
    if (!formMapeo.nombre || !formMapeo.nombre_accion || !formMapeo.plantilla_topico) {
      toast({ title: "Error", description: "Complete los campos obligatorios del mapeo", variant: "destructive" });
      return;
    }

    try {
      if (editingMapeo && editingMapeo.id) {
        const resp = await apiFetch(`/api/v1/mapeos-acciones-mqtt/${editingMapeo.id}/`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formMapeo)
        });
        if (resp.ok) {
          toast({ title: "Plantilla actualizada", description: "La plantilla de acción MQTT se actualizó correctamente" });
          fetchMapeos();
        } else {
          toast({ title: "Error", description: "No se pudo actualizar la plantilla", variant: "destructive" });
        }
      } else {
        const resp = await apiFetch("/api/v1/mapeos-acciones-mqtt/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formMapeo)
        });
        if (resp.ok) {
          toast({ title: "Plantilla creada", description: "La plantilla de acción MQTT fue guardada exitosamente" });
          fetchMapeos();
        } else {
          toast({ title: "Error", description: "No se pudo crear la plantilla", variant: "destructive" });
        }
      }
      setDialogMapeo(false);
    } catch (e) {
      toast({ title: "Error", description: "Error de red con la API", variant: "destructive" });
    }
  };

  const confirmDeleteMapeo = (id: string) => {
    setDeleteConfirmMapeoId(id);
  };

  const executeDeleteMapeo = async () => {
    if (!deleteConfirmMapeoId) return;
    const id = deleteConfirmMapeoId;
    try {
      const resp = await apiFetch(`/api/v1/mapeos-acciones-mqtt/${id}/`, { method: "DELETE" });
      if (resp.ok) {
        setMapeos(mapeos.filter(m => String(m.id) !== id));
        toast({ title: "Plantilla eliminada", description: "Se eliminó el mapeo de acción MQTT" });
      }
    } catch (e) {
      toast({ title: "Error", description: "No se pudo eliminar la plantilla", variant: "destructive" });
    } finally {
      setDeleteConfirmMapeoId(null);
    }
  };

  // cargar desde backend
  useEffect(() => {
    apiFetch('/api/v1/configuraciones-mqtt/')
      .then(r => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.results || [];
        setConexiones(list.map((c: any) => ({ 
          id: String(c.id), 
          nombre: c.nombre, 
          ip: c.broker_url, 
          puerto: c.puerto, 
          estado: c.activo ? 'conectado' : 'desconectado',
          usuario: c.usuario
        })));
      });

    apiFetch('/api/v1/mqtt-topics/')
      .then(r => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.results || [];
        setTopics(list.map((t: any) => ({ 
          id: String(t.id), 
          configuracion: String(t.configuracion), 
          topic: t.topic, 
          tipo: (t.tipo || '').toString().toLowerCase(), 
          tipoDato: t.tipo_dato, 
          descripcion: t.descripcion 
        })));
      });

    fetchMapeos();
    fetchMqttUsers();
  }, []);

  const getEstadoConfig = (estado: ConexionMQTT["estado"]): { label: string; className: string } => {
    switch (estado) {
      case "conectado": return { label: "Conectado", className: "bg-success/20 text-success border-success/30" };
      case "desconectado": return { label: "Desconectado", className: "bg-muted text-muted-foreground border-muted" };
      case "error": return { label: "Error", className: "bg-destructive/20 text-destructive border-destructive/30" };
      default: return { label: "Desconocido", className: "bg-muted text-muted-foreground border-muted" };
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Configuración de Comunicación MQTT</h1>
        <p className="text-muted-foreground mt-1">Gestiona las conexiones y topics MQTT del sistema</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Wifi className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Brokers Conectados</p>
                <p className="text-2xl font-bold text-foreground">{conexiones.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                <Wifi className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado de Servidor</p>
                <p className="text-2xl font-bold text-foreground">
                  {conexiones.filter(c => c.estado === "conectado").length > 0 ? "Online" : "Standby"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <SlidersHorizontal className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Plantillas de Tópicos</p>
                <p className="text-2xl font-bold text-foreground">{mapeos.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <Cpu className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tipos de Procesos</p>
                <p className="text-2xl font-bold text-foreground">
                  {new Set(mapeos.map(m => m.tipo_sistema)).size}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conexiones */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-lg">Conexiones MQTT</CardTitle>
          <Button size="sm" onClick={() => { setEditingConexion(null); setFormConexion({ nombre: "", ip: "", puerto: "1883", usuario: "", password: "" }); setDialogConexion(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Conexión
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-muted-foreground">ID</TableHead>
                  <TableHead className="text-muted-foreground">Nombre</TableHead>
                  <TableHead className="text-muted-foreground">Dirección IP</TableHead>
                  <TableHead className="text-muted-foreground">Puerto</TableHead>
                  <TableHead className="text-muted-foreground">Estado</TableHead>
                  <TableHead className="text-muted-foreground">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conexiones.map((conexion) => (
                  <TableRow key={conexion.id}>
                    <TableCell className="font-mono text-foreground">{conexion.id}</TableCell>
                    <TableCell className="text-foreground font-medium">{conexion.nombre}</TableCell>
                    <TableCell className="font-mono text-foreground">{conexion.ip}</TableCell>
                    <TableCell className="font-mono text-foreground">{conexion.puerto}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getEstadoConfig(conexion.estado).className}>
                        {getEstadoConfig(conexion.estado).label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEditConexion(conexion)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => confirmDeleteConexion(String(conexion.id))}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Resumen Informativo: Tópicos Soportados por Gateway y SCADA */}
      <Card className="bg-slate-900/60 border-cyan-500/30 text-slate-100 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-cyan-400 animate-pulse" />
            <CardTitle className="text-base font-bold text-cyan-300">
              Estructura de Tópicos MQTT Soportados en el Sistema
            </CardTitle>
          </div>
          <p className="text-xs text-slate-400">
            Formatos válidos para publicación y recepción de telemetría y comandos en Gateways (Raspberry Pi) y Backend SCADA:
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
            <div className="p-3 rounded-lg bg-slate-950/80 border border-emerald-500/30 space-y-1">
              <div className="flex justify-between items-center text-emerald-400 font-bold text-xs">
                <span>REPOSICIÓN</span>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Serial: R1075</Badge>
              </div>
              <p className="text-cyan-300 text-[11px]">rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/reposicion</p>
              <p className="text-slate-400 text-[10px]">Payload: <code className="text-slate-200">{`{"bombo": 1, "limite_porcentaje": 75}`}</code></p>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/80 border border-rose-500/30 space-y-1">
              <div className="flex justify-between items-center text-rose-400 font-bold text-xs">
                <span>FRENO REPOSICIÓN</span>
                <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-400 border-rose-500/30">Serial: F</Badge>
              </div>
              <p className="text-cyan-300 text-[11px]">rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/freno_reposicion</p>
              <p className="text-slate-400 text-[10px]">Payload: <code className="text-slate-200">{`{}`}</code></p>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/80 border border-amber-500/30 space-y-1">
              <div className="flex justify-between items-center text-amber-400 font-bold text-xs">
                <span>DETENER</span>
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">Serial: D</Badge>
              </div>
              <p className="text-cyan-300 text-[11px]">rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/detener</p>
              <p className="text-slate-400 text-[10px]">Payload: <code className="text-slate-200">{`{}`}</code></p>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/80 border border-blue-500/30 space-y-1">
              <div className="flex justify-between items-center text-blue-400 font-bold text-xs">
                <span>REANUDAR</span>
                <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30">Serial: A</Badge>
              </div>
              <p className="text-cyan-300 text-[11px]">rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/reanudar</p>
              <p className="text-slate-400 text-[10px]">Payload: <code className="text-slate-200">{`{}`}</code></p>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/80 border border-indigo-500/30 space-y-1">
              <div className="flex justify-between items-center text-indigo-400 font-bold text-xs">
                <span>VACIAR</span>
                <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-400 border-indigo-500/30">Serial: V</Badge>
              </div>
              <p className="text-cyan-300 text-[11px]">rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/vaciar</p>
              <p className="text-slate-400 text-[10px]">Payload: <code className="text-slate-200">{`{}`}</code></p>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/80 border border-purple-500/30 space-y-1">
              <div className="flex justify-between items-center text-purple-400 font-bold text-xs">
                <span>DESECHAR</span>
                <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/30">Serial: X</Badge>
              </div>
              <p className="text-cyan-300 text-[11px]">rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/desechar</p>
              <p className="text-slate-400 text-[10px]">Payload: <code className="text-slate-200">{`{}`}</code></p>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/80 border border-cyan-500/30 md:col-span-2 space-y-1">
              <div className="flex justify-between items-center text-cyan-400 font-bold text-xs">
                <span>MEZCLA</span>
                <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/30">Serial: L1 50, L2 30, H 0, M 15</Badge>
              </div>
              <p className="text-cyan-300 text-[11px]">rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/mezcla</p>
              <p className="text-slate-400 text-[10px]">Payload: <code className="text-slate-200">{`{"liquido_1": 50, "liquido_2": 30, "hora": 0, "minuto": 15}`}</code></p>
            </div>
          </div>

          <div className="p-2.5 rounded bg-slate-950/50 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <Info className="h-4 w-4 text-cyan-400 shrink-0" />
              <span><strong>Especificación Canónica Estándar:</strong> Estructura jerárquica de 5 niveles en minúsculas sin puntos y sincronización serial directa a Arduino.</span>
            </span>
            <span className="text-slate-500 text-[10px]">Estructura: <code className="text-cyan-400 font-mono font-bold">{`rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/{accion}`}</code></span>
          </div>
        </CardContent>
      </Card>



      {/* Dialog Conexión */}
      <Dialog open={dialogConexion} onOpenChange={setDialogConexion}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editingConexion ? "Editar Conexión" : "Nueva Conexión MQTT"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={formConexion.nombre} onChange={(e) => setFormConexion({...formConexion, nombre: e.target.value})} placeholder="Broker Principal" className="bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label>Dirección IP</Label>
              <Input value={formConexion.ip} onChange={(e) => setFormConexion({...formConexion, ip: e.target.value})} placeholder="192.168.1.100" className="bg-background border-border" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Puerto</Label>
                <Input type="number" value={formConexion.puerto} onChange={(e) => setFormConexion({...formConexion, puerto: e.target.value})} placeholder="1883" className="bg-background border-border" />
              </div>
              <div className="space-y-2">
                <Label>Usuario (Opcional)</Label>
                <Input value={formConexion.usuario} onChange={(e) => setFormConexion({...formConexion, usuario: e.target.value})} placeholder="admin" className="bg-background border-border" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contraseña (Opcional)</Label>
              <Input type="password" value={formConexion.password} onChange={(e) => setFormConexion({...formConexion, password: e.target.value})} placeholder="••••••••" className="bg-background border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogConexion(false)}><X className="h-4 w-4 mr-2" />Cancelar</Button>
            <Button onClick={handleSaveConexion}><Save className="h-4 w-4 mr-2" />Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Topic */}
      <Dialog open={dialogTopic} onOpenChange={setDialogTopic}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editingTopic ? "Editar Topic" : "Nuevo Topic MQTT"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Conexión</Label>
              <Select value={formTopic.configuracion} onValueChange={(v) => setFormTopic({...formTopic, configuracion: v})}>
                <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Seleccionar conexión" /></SelectTrigger>
                <SelectContent>
                  {conexiones.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Topic</Label>
              <Input value={formTopic.topic} onChange={(e) => setFormTopic({...formTopic, topic: e.target.value})} placeholder="planta/norte/temperatura" className="bg-background border-border" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={formTopic.tipo} onValueChange={(v: "suscripcion" | "publicacion") => setFormTopic({...formTopic, tipo: v})}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="suscripcion">Suscripción</SelectItem>
                  <SelectItem value="publicacion">Publicación</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de Dato</Label>
              <Select value={formTopic.tipoDato} onValueChange={(v) => setFormTopic({...formTopic, tipoDato: v})}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tiposDato.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={formTopic.descripcion} onChange={(e) => setFormTopic({...formTopic, descripcion: e.target.value})} placeholder="Descripción del topic" className="bg-background border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogTopic(false)}><X className="h-4 w-4 mr-2" />Cancelar</Button>
            <Button onClick={handleSaveTopic}><Save className="h-4 w-4 mr-2" />Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Mapeo Acción */}
      <Dialog open={dialogMapeo} onOpenChange={setDialogMapeo}>
        <DialogContent className="bg-card border-border max-h-[85vh] overflow-y-auto sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>{editingMapeo ? "Editar Mapeo de Acción" : "Nuevo Mapeo de Acción y Tópico"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre Descriptivo</Label>
              <Input value={formMapeo.nombre} onChange={(e) => setFormMapeo({...formMapeo, nombre: e.target.value})} placeholder="Control de Reposición de Materia Prima" className="bg-background border-border" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Sistema</Label>
                <Select value={formMapeo.tipo_sistema} onValueChange={(v) => setFormMapeo({...formMapeo, tipo_sistema: v})}>
                  <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FLUIDOS">Fluidos / Líquidos</SelectItem>
                    <SelectItem value="SOLIDOS">Procesamiento de Sólidos</SelectItem>
                    <SelectItem value="EMPAQUE">Empaquetado y Envasado</SelectItem>
                    <SelectItem value="TEMPERATURA">Control de Temperatura</SelectItem>
                    <SelectItem value="GENERAL">Sistema General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Código de Acción (Accion Payload)</Label>
                <Input value={formMapeo.nombre_accion} onChange={(e) => setFormMapeo({...formMapeo, nombre_accion: e.target.value})} placeholder="reposicion" className="bg-background border-border" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Plantilla Tópico MQTT</Label>
              <Input value={formMapeo.plantilla_topico} onChange={(e) => setFormMapeo({...formMapeo, plantilla_topico: e.target.value})} placeholder="scada/{planta}/{gateway}/{seccion}/{sistema}/accion" className="bg-background border-border font-mono text-xs" />
              <p className="text-[11px] text-muted-foreground">Variables soportadas: {`{planta}`}, {`{mac}`}, {`{gateway}`}, {`{seccion}`}, {`{sistema}`}</p>
            </div>
            <div className="space-y-2">
              <Label>Payload Base (JSON)</Label>
              <textarea
                value={formMapeo.plantilla_payload_json}
                onChange={(e) => setFormMapeo({...formMapeo, plantilla_payload_json: e.target.value})}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder='{"accion": "{accion}", "parametros": {}}'
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMapeo(false)}><X className="h-4 w-4 mr-2" />Cancelar</Button>
            <Button onClick={handleSaveMapeo}><Save className="h-4 w-4 mr-2" />Guardar Plantilla</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialogs for Deletion */}
      <Dialog open={!!deleteConfirmConexionId} onOpenChange={(open) => !open && setDeleteConfirmConexionId(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive font-bold flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Confirmar Eliminación de Conexión MQTT
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar permanentemente esta conexión broker MQTT? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirmConexionId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={executeDeleteConexion}>Eliminar Conexión</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmMapeoId} onOpenChange={(open) => !open && setDeleteConfirmMapeoId(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive font-bold flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Confirmar Eliminación de Plantilla MQTT
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar permanentemente esta plantilla de acción MQTT? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirmMapeoId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={executeDeleteMapeo}>Eliminar Plantilla</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConfiguracionMQTT;
