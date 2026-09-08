import { BookOpen, Server, Cpu, Database, Send, Radio, Terminal, ArrowRight, ShieldAlert, CheckCircle2, Layers, Trash2, Zap, Play, Settings, RefreshCw, SlidersHorizontal, FlaskConical, Box, PackageCheck, Droplet, Thermometer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

const GuiaSistema = () => {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-primary" />
          Guía Integral del Sistema SCADA
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Documentación técnica y operativa de la arquitectura IoT, WebSockets en tiempo real, motor de comandos dinámicos y módulos del sistema.
        </p>
      </div>

      {/* Main content tabs */}
      <Tabs defaultValue="flujo-general" className="w-full">
        <TabsList className="grid grid-cols-5 w-full bg-muted/50 p-1 rounded-lg border border-border h-auto">
          <TabsTrigger value="flujo-general" className="py-2.5 text-xs sm:text-sm gap-2">
            <Radio className="h-4 w-4" />
            Arquitectura
          </TabsTrigger>
          <TabsTrigger value="modulos" className="py-2.5 text-xs sm:text-sm gap-2">
            <Layers className="h-4 w-4" />
            Módulos
          </TabsTrigger>
          <TabsTrigger value="telemetria" className="py-2.5 text-xs sm:text-sm gap-2">
            <Cpu className="h-4 w-4" />
            Telemetría
          </TabsTrigger>
          <TabsTrigger value="comandos" className="py-2.5 text-xs sm:text-sm gap-2">
            <Send className="h-4 w-4" />
            Acciones MQTT
          </TabsTrigger>
          <TabsTrigger value="desarrollo" className="py-2.5 text-xs sm:text-sm gap-2">
            <Terminal className="h-4 w-4" />
            Desarrollo
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Flujo General (Arquitectura y WebSockets) */}
        <TabsContent value="flujo-general" className="space-y-6 mt-4">
          <Card className="bg-card border-border overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="text-xl">Arquitectura en Tiempo Real (WebSockets + MQTT)</CardTitle>
              <CardDescription>
                Flujo continuo extremo a extremo desde el dispositivo físico hasta la interfaz reactiva web con latencia inferior a 20ms.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              {/* Diagrama de 6 Pasos */}
              <div className="bg-background/80 rounded-xl p-6 border border-border/80 shadow-inner overflow-x-auto">
                <h3 className="text-center text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-8">
                  Camino de la Información en Tiempo Real (Push Bidireccional &lt;20ms)
                </h3>
                
                <div className="flex flex-col lg:flex-row items-center justify-between gap-1.5 min-w-[950px]">
                  {/* Step 1 */}
                  <div className="flex-1 flex flex-col items-center text-center p-3 bg-card rounded-lg border border-primary/20 shadow-md hover:border-primary/50 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-1.5">
                      <Cpu className="h-5 w-5 text-primary animate-pulse" />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">1. Sensores / PLC</span>
                    <h4 className="text-xs font-bold text-foreground mt-0.5">Raspberry / GW</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Telemetría cada 1s</p>
                  </div>

                  {/* Arrow 1 */}
                  <div className="flex flex-col items-center justify-center text-muted-foreground px-1 shrink-0">
                    <span className="text-[9px] font-mono text-primary">MQTT 1883</span>
                    <ArrowRight className="h-4 w-4 text-primary/70" />
                  </div>

                  {/* Step 2 */}
                  <div className="flex-1 flex flex-col items-center text-center p-3 bg-card rounded-lg border border-border shadow-md hover:border-emerald-500/40 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-1.5">
                      <Radio className="h-5 w-5 text-emerald-500" />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">2. Broker MQTT</span>
                    <h4 className="text-xs font-bold text-foreground mt-0.5">Mosquitto</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Auth segura por passwd</p>
                  </div>

                  {/* Arrow 2 */}
                  <div className="flex flex-col items-center justify-center text-muted-foreground px-1 shrink-0">
                    <span className="text-[9px] font-mono text-emerald-500">Sub #</span>
                    <ArrowRight className="h-4 w-4 text-emerald-500/70" />
                  </div>

                  {/* Step 3 */}
                  <div className="flex-1 flex flex-col items-center text-center p-3 bg-card rounded-lg border border-border shadow-md hover:border-amber-500/40 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mb-1.5">
                      <Server className="h-5 w-5 text-amber-500" />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">3. Ingesta Django</span>
                    <h4 className="text-xs font-bold text-foreground mt-0.5">mqtt_worker.py</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Auto-Discovery & Parse</p>
                  </div>

                  {/* Arrow 3 */}
                  <div className="flex flex-col items-center justify-center text-muted-foreground px-1 shrink-0">
                    <span className="text-[9px] font-mono text-amber-500">ORM / Push</span>
                    <ArrowRight className="h-4 w-4 text-amber-500/70" />
                  </div>

                  {/* Step 4 */}
                  <div className="flex-1 flex flex-col items-center text-center p-3 bg-card rounded-lg border border-border shadow-md hover:border-cyan-500/40 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center mb-1.5">
                      <Database className="h-5 w-5 text-cyan-500" />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">4. PostgreSQL</span>
                    <h4 className="text-xs font-bold text-foreground mt-0.5">Base de Datos</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Persistencia y Auditoría</p>
                  </div>

                  {/* Arrow 4 */}
                  <div className="flex flex-col items-center justify-center text-muted-foreground px-1 shrink-0">
                    <span className="text-[9px] font-mono text-cyan-400">Channels</span>
                    <ArrowRight className="h-4 w-4 text-cyan-400/70" />
                  </div>

                  {/* Step 5 */}
                  <div className="flex-1 flex flex-col items-center text-center p-3 bg-card rounded-lg border border-border shadow-md hover:border-purple-500/40 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center mb-1.5">
                      <Zap className="h-5 w-5 text-purple-400" />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">5. Servidor WS</span>
                    <h4 className="text-xs font-bold text-foreground mt-0.5">Daphne (ASGI)</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">/ws/scada/ Broadcast</p>
                  </div>

                  {/* Arrow 5 */}
                  <div className="flex flex-col items-center justify-center text-muted-foreground px-1 shrink-0">
                    <span className="text-[9px] font-mono text-purple-400">&lt;20ms</span>
                    <ArrowRight className="h-4 w-4 text-purple-400/70" />
                  </div>

                  {/* Step 6 */}
                  <div className="flex-1 flex flex-col items-center text-center p-3 bg-card rounded-lg border border-primary/20 shadow-md hover:border-primary/50 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-1.5">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">6. React SCADA</span>
                    <h4 className="text-xs font-bold text-foreground mt-0.5">useScadaWebSocket</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Render en tiempo real</p>
                  </div>
                </div>
              </div>

              {/* Explicación técnica */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    Comunicación Push sin Polling
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    La integración de <strong>Django Channels</strong> y el servidor ASGI <strong>Daphne</strong> permite que el worker MQTT y las señales de base de datos emitan eventos instantáneos por WebSockets. El hook de React <code>useScadaWebSocket</code> actualiza la interfaz sin necesidad de peticiones HTTP repetitivas.
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500" />
                    Optimización y Consultas Atómicas
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Se aplicó <code className="text-primary font-mono font-bold">select_related</code> y <code className="text-primary font-mono font-bold">prefetch_related</code> en todos los endpoints REST, asegurando respuestas en menos de <strong>100ms</strong> y eliminando el problema N+1 en lecturas masivas.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Módulos del Sistema */}
        <TabsContent value="modulos" className="space-y-6 mt-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Módulos y Funcionalidades del Sistema</CardTitle>
              <CardDescription>
                Resumen de cada sección operativa disponible en la plataforma SCADA.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <Badge className="bg-primary/20 text-primary border-primary/30">SCADA Interactivo (/scada)</Badge>
                  <Badge variant="outline" className="text-[10px] border-cyan-800 text-cyan-300">P&ID + Dinámico</Badge>
                </div>
                <h4 className="text-sm font-bold text-foreground">Visualización y Paneles Parametrizados</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Diagrama de flujo animado de 12 componentes con telemetría en vivo, insignias de tipo de proceso (Fluidos, Sólidos, Empaque, Temperatura) y motor de paneles dinámicos personalizables para reposición, recetas con horas/minutos y controles manuales.
                </p>
              </div>

              <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">Planificación (/planificacion)</Badge>
                <h4 className="text-sm font-bold text-foreground">Gestión de Órdenes y Recetas</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Planificación industrial con diagrama de Gantt, calendario mensual, ejecución automática de recetas y sincronización de progreso en tiempo real.
                </p>
              </div>

              <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                <Badge className="bg-cyan-500/20 text-cyan-500 border-cyan-500/30">Sensores y Dispositivos (/sensores)</Badge>
                <h4 className="text-sm font-bold text-foreground">Inventario y Telemetría IoT</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Monitoreo del parque de 12 sensores industriales (Bombas, Caudalímetros, Mezclador, Válvulas y Nivel), registro de lecturas y auto-descubrimiento.
                </p>
              </div>

              <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">Almacenamiento (/almacenamiento)</Badge>
                <h4 className="text-sm font-bold text-foreground">Tanques y Bombos de Materia Prima</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Monitoreo de tanques de reserva, niveles de llenado en porcentaje y disparo de reposición con control de límite de carga.
                </p>
              </div>

              <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                <Badge className="bg-purple-500/20 text-purple-500 border-purple-500/30">Monitorización (/monitorizacion)</Badge>
                <h4 className="text-sm font-bold text-foreground">Históricos y Alarmas Operativas</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Gráficos de series temporales con Recharts, panel de salud de planta y gestión de alarmas por severidad (Alta, Media, Baja).
                </p>
              </div>

              <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                <Badge className="bg-rose-500/20 text-rose-500 border-rose-500/30">Credenciales y Permisos (/credenciales)</Badge>
                <h4 className="text-sm font-bold text-foreground">Usuarios, Mosquitto y Roles</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Gestión de claves de alta, usuarios autorizados en el archivo <code>passwd</code> del broker Mosquitto y matriz de permisos por rangos (1 a 8).
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Telemetría & Worker MQTT */}
        <TabsContent value="telemetria" className="space-y-6 mt-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Ingesta de Datos, Tópicos MQTT y Auto-Discovery</CardTitle>
              <CardDescription>
                Esquema estructurado de tópicos MQTT y funcionamiento del worker en segundo plano.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Estructura del Tópico */}
              <div className="space-y-4">
                <h3 className="text-md font-bold text-foreground">Estructura Estándar de Telemetría (Ingesta)</h3>
                <div className="bg-muted p-4 rounded-lg font-mono text-xs border border-border flex items-center justify-between overflow-x-auto gap-2">
                  <span className="text-primary font-bold">tenant</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-emerald-400 font-bold">gateway_id</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-amber-400 font-bold">seccion</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-cyan-400 font-bold">sistema</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-purple-400 font-bold">categoria</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-rose-400 font-bold">dispositivo</span>
                </div>

                <h3 className="text-md font-bold text-foreground pt-2">Estructuras de Tópicos de Comandos</h3>
                <div className="grid grid-cols-1 gap-2 text-xs font-mono">
                  <div className="p-2.5 bg-card border border-emerald-500/30 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-emerald-400 font-bold">1. Comando Jerárquico por Acción:</span>
                    <code className="text-foreground font-mono bg-muted px-2 py-1 rounded">tenant/gateway_id/seccion/sistema/accion</code>
                  </div>
                  <div className="p-2.5 bg-card border border-cyan-500/30 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-cyan-400 font-bold">2. Ejemplos Reales:</span>
                    <code className="text-foreground font-mono bg-muted px-2 py-1 rounded">rafaela_sa/d83add60dbb0/a1/linea_mezclado_1/reposicion</code>
                  </div>
                </div>
              </div>

              {/* Tipos de Proceso SCADA */}
              <div className="space-y-3 pt-2">
                <h3 className="text-md font-bold text-foreground">Clasificación de Sistemas Industriales</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-900 border border-cyan-800/80 rounded-lg space-y-1">
                    <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs">
                      <Droplet className="h-4 w-4" /> FLUIDOS / LÍQUIDOS
                    </div>
                    <p className="text-[11px] text-slate-400">Bombas, mezcladores, tanques y caudalímetros.</p>
                  </div>
                  <div className="p-3 bg-slate-900 border border-amber-800/80 rounded-lg space-y-1">
                    <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                      <Layers className="h-4 w-4" /> SÓLIDOS
                    </div>
                    <p className="text-[11px] text-slate-400">Tolvas, silos, cintas y dosificación de polvos.</p>
                  </div>
                  <div className="p-3 bg-slate-900 border border-purple-800/80 rounded-lg space-y-1">
                    <div className="flex items-center gap-2 text-purple-300 font-bold text-xs">
                      <PackageCheck className="h-4 w-4" /> EMPAQUE
                    </div>
                    <p className="text-[11px] text-slate-400">Envasadoras, selladoras, paletizado y etiquetado.</p>
                  </div>
                  <div className="p-3 bg-slate-900 border border-rose-800/80 rounded-lg space-y-1">
                    <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
                      <Thermometer className="h-4 w-4" /> TEMPERATURA
                    </div>
                    <p className="text-[11px] text-slate-400">Hornos, autoclaves, calderas y cámaras de frío.</p>
                  </div>
                </div>
              </div>

              {/* Worker MQTT Daemon */}
              <div className="p-4 bg-muted/20 border border-border rounded-lg space-y-3">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Server className="h-4 w-4 text-amber-500" />
                  Lógica del Daemon `mqtt_worker.py`
                </h4>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                  <li><strong>Ingesta Unificada</strong>: Captura lecturas de sensores y actualiza <code>ultima_lectura</code> y estado <code>ONLINE</code>.</li>
                  <li><strong>Auto-Discovery</strong>: Crea automáticamente en PostgreSQL sensores detectados por primera vez.</li>
                  <li><strong>Difusión WebSocket</strong>: Emite eventos en el grupo <code>scada_telemetry</code> para reflejo instantáneo en la web.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Acciones MQTT & Motor de Parámetros */}
        <TabsContent value="comandos" className="space-y-6 mt-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Motor de Controles Parametrizados y Personalizador de Comandos</CardTitle>
              <CardDescription>
                Creación y ajuste dinámico de botones, sliders, recetas y selectores de bombo sin modificar código fuente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Características del Motor Dinámico */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                  <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                    <Box className="h-4 w-4" />
                    1. Selectores de Bombo (1, 2, 3, 4)
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Permite configurar la cantidad exacta de bombos a mostrar (ej. 2 bombos: botones <code>1</code> y <code>2</code>; 4 bombos: <code>1, 2, 3, 4</code>) persistiendo la elección en el modelo <code>MapeoAccionMQTT</code>.
                  </p>
                </div>

                <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                  <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                    <FlaskConical className="h-4 w-4" />
                    2. Recetas en Horas y Minutos
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Soporte para campos independientes de <strong>Horas (0-24 h)</strong> y <strong>Minutos (0-59 min)</strong> con sincronización automática de recetas precargadas en base de datos.
                  </p>
                </div>

                <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <SlidersHorizontal className="h-4 w-4" />
                    3. Placeholders Dinámicos
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Cualquier variable entre llaves como <code>{`{ingrediente_a}`}</code> o <code>{`{limite_porcentaje}`}</code> genera automáticamente sliders e inputs numéricos con transmisión segura vía MQTT.
                  </p>
                </div>
              </div>

              {/* Gestor de Comandos Modal */}
              <div className="p-4 bg-slate-900 border border-cyan-800/60 rounded-lg space-y-2 text-xs">
                <h4 className="font-bold text-cyan-300 text-sm flex items-center gap-2">
                  <Settings className="h-4 w-4 text-cyan-400" />
                  Uso del Personalizador de Comandos (`⚙️ Personalizar Comandos`)
                </h4>
                <p className="text-slate-300 leading-relaxed">
                  Desde la pantalla <strong>/scada</strong>, al hacer clic en <strong>Personalizar Comandos</strong> o en el icono de edición de cualquier tarjeta, podés:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-400">
                  <li>Asignar el comando a un sistema específico o a nivel general.</li>
                  <li>Agrupar controles en paneles visuales personalizados (ej. "Control de Reposición", "Receta Líquidos").</li>
                  <li>Agregar o quitar parámetros con el menú <strong>➕ Añadir Parámetro</strong>.</li>
                  <li>Seleccionar entre 2, 3, 4 o 6 bombos con botones de selección directa.</li>
                </ul>
              </div>

              {/* Registro de Auditoría y Borrado */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex gap-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-foreground">
                  <ShieldAlert className="h-6 w-6 text-amber-500 shrink-0" />
                  <div className="space-y-1">
                    <h4 className="font-bold">Auditoría Automática</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Cada comando transmitido y cada cambio en mapeos queda registrado en la tabla de Auditoría asociando operador, IP y timestamp.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 p-4 bg-rose-500/10 border border-rose-500/30 rounded-lg text-sm text-foreground">
                  <Trash2 className="h-6 w-6 text-rose-500 shrink-0" />
                  <div className="space-y-1">
                    <h4 className="font-bold">Eliminación Segura y Atómica</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      El backend resuelve la eliminación en cascada con <code>perform_destroy</code> garantizando consistencia referencial en PostgreSQL.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Guía de Desarrollo & Comandos */}
        <TabsContent value="desarrollo" className="space-y-6 mt-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Comandos de Mantenimiento y Desarrollo</CardTitle>
              <CardDescription>
                Guía de comandos para Docker Compose, migraciones, WebSockets y pruebas de consistencia.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Accordion type="single" collapsible className="w-full">
                {/* Accordion Item 1 */}
                <AccordionItem value="docker-dev" className="border-border">
                  <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                    Levantar el stack completo en Docker
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 text-xs text-muted-foreground">
                    <p>Inicia PostgreSQL, Mosquitto, Backend Django (Daphne) y Frontend Vite:</p>
                    <pre className="bg-muted p-3 rounded border border-border font-mono text-foreground overflow-x-auto">
                      docker compose up -d
                    </pre>
                  </AccordionContent>
                </AccordionItem>

                {/* Accordion Item 2 */}
                <AccordionItem value="migrations" className="border-border">
                  <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                    Aplicar migraciones de base de datos en PostgreSQL
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 text-xs text-muted-foreground">
                    <pre className="bg-muted p-3 rounded border border-border font-mono text-foreground overflow-x-auto">
                      docker compose exec backend python manage.py migrate
                    </pre>
                  </AccordionContent>
                </AccordionItem>

                {/* Accordion Item 3 */}
                <AccordionItem value="worker" className="border-border">
                  <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                    Worker MQTT & Ingesta en Segundo Plano
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 text-xs text-muted-foreground">
                    <p>Corre automáticamente en el contenedor <code>scada_backend</code>. Para ejecutarlo manualmente:</p>
                    <pre className="bg-muted p-3 rounded border border-border font-mono text-foreground overflow-x-auto">
                      docker compose exec backend python manage.py mqtt_worker
                    </pre>
                  </AccordionContent>
                </AccordionItem>

                {/* Accordion Item 4 */}
                <AccordionItem value="typescript" className="border-border">
                  <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                    Verificación de tipos TypeScript en Frontend
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 text-xs text-muted-foreground">
                    <pre className="bg-muted p-3 rounded border border-border font-mono text-foreground overflow-x-auto">
                      cd scada-ui && npx tsc --noEmit
                    </pre>
                  </AccordionContent>
                </AccordionItem>

                {/* Accordion Item 5 */}
                <AccordionItem value="mosquitto-sub" className="border-border">
                  <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                    Monitorear el tráfico MQTT en vivo desde consola
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 text-xs text-muted-foreground">
                    <pre className="bg-muted p-3 rounded border border-border font-mono text-foreground overflow-x-auto">
                      docker compose exec mosquitto mosquitto_sub -u admin -P admin -t "#" -v
                    </pre>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GuiaSistema;
