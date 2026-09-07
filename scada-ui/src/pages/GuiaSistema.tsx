import { BookOpen, Server, Cpu, Database, Send, Radio, Terminal, ArrowRight, ShieldAlert, CheckCircle2, Layers, Trash2, Zap, Play, Settings, RefreshCw } from "lucide-react";
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
          Documentación técnica y operativa de la arquitectura IoT, comunicación MQTT, gestión de procesos y módulos del sistema.
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

        {/* Tab 1: Flujo General (Linear Single-Row Layout) */}
        <TabsContent value="flujo-general" className="space-y-6 mt-4">
          <Card className="bg-card border-border overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <CardTitle className="text-xl">Arquitectura de Comunicación & Rendimiento</CardTitle>
              <CardDescription>
                Flujo lineal extremo a extremo desde el dispositivo físico hasta la interfaz reactiva web.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              {/* Diagrama Interactivo en Una Sola Línea */}
              <div className="bg-background/80 rounded-xl p-6 border border-border/80 shadow-inner overflow-x-auto">
                <h3 className="text-center text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-8">
                  Camino de la Información en Tiempo Real (Una Sola Línea Continua)
                </h3>
                
                {/* Single Continuous Row Container */}
                <div className="flex flex-col lg:flex-row items-center justify-between gap-2 min-w-[850px]">
                  {/* Step 1 */}
                  <div className="flex-1 flex flex-col items-center text-center p-3 bg-card rounded-lg border border-primary/20 shadow-md hover:border-primary/50 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-1.5">
                      <Cpu className="h-5 w-5 text-primary animate-pulse" />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">1. Sensores / PLC</span>
                    <h4 className="text-xs font-bold text-foreground mt-0.5">Raspberry / GW</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Genera telemetría cada 1s</p>
                  </div>

                  {/* Arrow 1 */}
                  <div className="flex flex-col items-center justify-center text-muted-foreground px-1 shrink-0">
                    <span className="text-[9px] font-mono text-primary animate-pulse">MQTT 1883</span>
                    <ArrowRight className="h-5 w-5 text-primary/70" />
                  </div>

                  {/* Step 2 */}
                  <div className="flex-1 flex flex-col items-center text-center p-3 bg-card rounded-lg border border-border shadow-md hover:border-primary/30 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-1.5">
                      <Radio className="h-5 w-5 text-emerald-500" />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">2. Broker MQTT</span>
                    <h4 className="text-xs font-bold text-foreground mt-0.5">Mosquitto Broker</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Autenticación por clave</p>
                  </div>

                  {/* Arrow 2 */}
                  <div className="flex flex-col items-center justify-center text-muted-foreground px-1 shrink-0">
                    <span className="text-[9px] font-mono text-emerald-500">Subscripción #</span>
                    <ArrowRight className="h-5 w-5 text-emerald-500/70" />
                  </div>

                  {/* Step 3 */}
                  <div className="flex-1 flex flex-col items-center text-center p-3 bg-card rounded-lg border border-border shadow-md hover:border-primary/30 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mb-1.5">
                      <Server className="h-5 w-5 text-amber-500" />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">3. Django Worker</span>
                    <h4 className="text-xs font-bold text-foreground mt-0.5">mqtt_worker.py</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Ingesta & Auto-Discovery</p>
                  </div>

                  {/* Arrow 3 */}
                  <div className="flex flex-col items-center justify-center text-muted-foreground px-1 shrink-0">
                    <span className="text-[9px] font-mono text-amber-500">ORM Django</span>
                    <ArrowRight className="h-5 w-5 text-amber-500/70" />
                  </div>

                  {/* Step 4 */}
                  <div className="flex-1 flex flex-col items-center text-center p-3 bg-card rounded-lg border border-border shadow-md hover:border-primary/30 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center mb-1.5">
                      <Database className="h-5 w-5 text-cyan-500" />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">4. PostgreSQL</span>
                    <h4 className="text-xs font-bold text-foreground mt-0.5">Base de Datos</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Persistencia y Auditoría</p>
                  </div>

                  {/* Arrow 4 */}
                  <div className="flex flex-col items-center justify-center text-muted-foreground px-1 shrink-0">
                    <span className="text-[9px] font-mono text-cyan-500">API &lt;100ms</span>
                    <ArrowRight className="h-5 w-5 text-cyan-500/70" />
                  </div>

                  {/* Step 5 */}
                  <div className="flex-1 flex flex-col items-center text-center p-3 bg-card rounded-lg border border-primary/20 shadow-md hover:border-primary/50 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-1.5">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">5. Frontend React</span>
                    <h4 className="text-xs font-bold text-foreground mt-0.5">Panel Web SCADA</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Refresco dinámico en vivo</p>
                  </div>
                </div>
              </div>

              {/* Explicación textual */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ¿Cómo funciona el flujo de datos?
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Los dispositivos físicos (Raspberry Pi Gateway) o simuladores publican telemetría en Mosquitto MQTT. El <strong>Worker MQTT</strong> de Django ingiere los tópicos, discrimina entre sensores de hardware y variables de proceso, registrando automáticamente lecturas en PostgreSQL. La API REST optimizada entrega respuestas instantáneas a la web.
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500" />
                    Optimización de Rendimiento
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Se erradicó el problema N+1 en las consultas de base de datos aplicando <code className="text-primary font-mono font-bold">select_related</code> en los ViewSets de Django REST Framework, bajando los tiempos de respuesta de minutos a <strong>menos de 100ms</strong> en todas las vistas del sistema.
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
              <CardTitle>Módulos Operativos de la Plataforma</CardTitle>
              <CardDescription>
                Resumen funcional de cada sección disponible en el menú lateral.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                <Badge className="bg-primary/20 text-primary hover:bg-primary/20 border-primary/30">SCADA Interactivo (/scada)</Badge>
                <h4 className="text-sm font-bold text-foreground">Diagrama de Flujo P&ID (12 Componentes)</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Diagrama animado fiel a la topología física real con 12 componentes industriales (Bombas, Mezclador, Válvulas, Tanques y Sensores de Flujo) en tiempo real. Permite emitir comandos industriales directamente a cada equipo o línea.
                </p>
              </div>

              <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                <Badge className="bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/30">Planificación (/planificacion)</Badge>
                <h4 className="text-sm font-bold text-foreground">Gestión de Órdenes de Producción</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Paginación eficiente (10 por página), Calendario Mensual, Diagrama de Gantt y ejecución/pausa/cancelación de órdenes persistidas exclusivamente en PostgreSQL sin datos falsos estáticos.
                </p>
              </div>

              <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                <Badge className="bg-cyan-500/20 text-cyan-500 hover:bg-cyan-500/20 border-cyan-500/30">Sensores (/sensores)</Badge>
                <h4 className="text-sm font-bold text-foreground">Dispositivos y Máquinas</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Administración del inventario de sensores de hardware. Eliminación segura y atómica con confirmación inmediata y actualización del conteo real (12 dispositivos de planta).
                </p>
              </div>

              <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                <Badge className="bg-amber-500/20 text-amber-500 hover:bg-amber-500/20 border-amber-500/30">Almacenamiento (/almacenamiento)</Badge>
                <h4 className="text-sm font-bold text-foreground">Unidades de Almacenamiento</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Monitoreo de tanques, materias primas y niveles porcentaje en bombos. Integrado con los controles de reposición de materia prima.
                </p>
              </div>

              <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                <Badge className="bg-purple-500/20 text-purple-500 hover:bg-purple-500/20 border-purple-500/30">Monitorización (/monitorizacion)</Badge>
                <h4 className="text-sm font-bold text-foreground">Tendencias e Históricos Recharts</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Gráficos de telemetría filtrados dinámicamente por Planta, Sección, Sistema o Sensor específico, panel macro de salud y registro de alarmas operativas.
                </p>
              </div>

              <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                <Badge className="bg-rose-500/20 text-rose-500 hover:bg-rose-500/20 border-rose-500/30">Empleados (/empleados)</Badge>
                <h4 className="text-sm font-bold text-foreground">Personal y Control de Acceso</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Normalización atómica por DNI, asignación de planta/rango y control de acceso laboral (Activo, Suspendido, Despedido, Jubilado).
                </p>
              </div>

              <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                <Badge className="bg-primary/20 text-primary hover:bg-primary/20 border-primary/30">Credenciales y Permisos (/credenciales)</Badge>
                <h4 className="text-sm font-bold text-foreground">Gestión de Accesos, Broker Mosquitto y Rangos</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Panel unificado para claves de registro de usuarios, credenciales de Mosquitto (`passwd`) con recarga en caliente y resumen de la Matriz de Permisos por Rango (1 a 8).
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Telemetría & Worker MQTT */}
        <TabsContent value="telemetria" className="space-y-6 mt-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Ingesta de Datos, Auto-Discovery & Daemon `mqtt_worker.py`</CardTitle>
              <CardDescription>
                Esquema estructurado de tópicos MQTT y lógica interna del Worker de Django.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Estructura del Tópico */}
              <div className="space-y-4">
                <h3 className="text-md font-bold text-foreground">Estructura del Tópico de Telemetría (Ingesta)</h3>
                <div className="bg-muted p-4 rounded-lg font-mono text-xs border border-border flex items-center justify-between overflow-x-auto">
                  <span className="text-primary font-bold">tenant</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-emerald-500 font-bold">gateway_id</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-amber-500 font-bold">seccion</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-cyan-500 font-bold">sistema</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-purple-400 font-bold">categoria</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-rose-500 font-bold">dispositivo_o_variable</span>
                </div>

                <h3 className="text-md font-bold text-foreground pt-2">Estructuras de Tópicos de Comandos Estándar</h3>
                <div className="grid grid-cols-1 gap-2 text-xs font-mono">
                  <div className="p-2.5 bg-card border border-emerald-500/30 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-emerald-400 font-bold">1. Jerárquico Directo por Acción (Recomendado):</span>
                    <code className="text-foreground font-mono bg-muted px-2 py-1 rounded">tenant/gateway_id/seccion/sistema/reposicion (o /mezcla)</code>
                  </div>
                  <div className="p-2.5 bg-card border border-cyan-500/30 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-cyan-400 font-bold">2. Jerárquico General + Payload JSON:</span>
                    <code className="text-foreground font-mono bg-muted px-2 py-1 rounded">tenant/gateway_id/seccion/sistema/accion</code>
                  </div>
                </div>
              </div>

              {/* Worker MQTT Daemon */}
              <div className="p-4 bg-muted/20 border border-border rounded-lg space-y-3">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Server className="h-4 w-4 text-amber-500" />
                  ¿Qué hace el Daemon `mqtt_worker.py`?
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Es el servicio neurálgico en segundo plano que se conecta permanentemente al broker Mosquitto. Realiza las siguientes tareas clave:
                </p>
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                  <li><strong>Ingesta Unificada</strong>: Captura lecturas de sensores y actualiza `ultima_lectura` y estado `ONLINE`.</li>
                  <li><strong>Auto-Discovery</strong>: Si detecta un sensor no registrado previamente, crea automáticamente la fila en PostgreSQL.</li>
                  <li><strong>Aislamiento de Variables de Proceso</strong>: Tópicos como `/proceso/mezclado` o `/proceso/tiempo_restante` actualizan el avance de la orden activa en `/planificacion` y `/control` sin crear hardware ficticio.</li>
                  <li><strong>Gestión de Alarmas y Diagnóstico</strong>: Captura anomalías y publica actualizaciones de salud global de la fábrica.</li>
                </ul>
              </div>

              {/* Indicador de Red en Sidebar */}
              <div className="p-4 bg-card border border-border rounded-lg space-y-2">
                <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">Panel Red SCADA / MQTT</Badge>
                <h4 className="text-sm font-bold text-foreground mt-1">Conteo y Estado Online Real</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  El indicador inferior de la barra lateral procesa el estado case-insensitive de los dispositivos (`ONLINE`, `ACTIVO`, `OPERATIVO`) y su última lectura tolerando la zona horaria de Argentina (GMT-3), marcando la red en <strong>ACTIVO</strong> y reflejando el conteo exacto de <strong>12 / 12 dispositivos</strong>.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Acciones MQTT & Modos de Control */}
        <TabsContent value="comandos" className="space-y-6 mt-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Operación de Tópicos: Modo Manual (`/scada`) vs Modo Automático (`/planificacion`)</CardTitle>
              <CardDescription>
                Cómo se registran los tópicos en `/comunicacion` y cómo se envían comandos a los actuadores físicos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Explicación de Registro, Modo Manual y Modo Auto */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                  <div className="flex items-center gap-2 text-primary font-bold text-sm">
                    <Settings className="h-4 w-4" />
                    1. Alta en /comunicacion
                  </div>
                  <h5 className="text-xs font-semibold text-foreground">Registro de Parámetros MQTT</h5>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    En <strong>Configuración MQTT</strong> se ingresan las credenciales, Host, Puerto, Tenant predeterminado y el mapa de acciones (`MapeoAccionMQTT`) vinculando comandos como `INICIAR`, `PAUSAR`, `PARAR`, `VACIAR`, `abrir`.
                  </p>
                </div>

                <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                  <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                    <Play className="h-4 w-4" />
                    2. Modo Manual (/scada & /control)
                  </div>
                  <h5 className="text-xs font-semibold text-foreground">Acciones por Botón de Interfaz</h5>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Al pulsar un botón en `/scada` o `/control`, el frontend efectúa un `POST` a Django. Django compone el tópico <code className="text-emerald-500 font-mono">tenant/gateway_id/seccion/sistema/accion</code> y publica el payload MQTT directo al actuador.
                  </p>
                </div>

                <div className="border border-border p-4 rounded-lg bg-card space-y-2">
                  <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                    <RefreshCw className="h-4 w-4" />
                    3. Modo Automático (/planificacion)
                  </div>
                  <h5 className="text-xs font-semibold text-foreground">Carga & Ejecución de Recetas</h5>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Al ejecutar una Orden de Producción en `/planificacion`, Django publica las secuencias de recetas y escucha `/proceso/` para actualizar el avance (`progreso_porcentaje`) automáticamente en tiempo real.
                  </p>
                </div>
              </div>

              {/* Diagrama de escritura */}
              <div className="bg-background/80 rounded-xl p-6 border border-border shadow-inner">
                <h3 className="text-center text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-8">
                  Camino de un Comando Industrial desde la Interfaz Web
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-7 gap-2 items-center text-center">
                  <div className="p-3 bg-card rounded-lg border border-primary/20 shadow-md">
                    <BookOpen className="h-5 w-5 mx-auto text-primary mb-1" />
                    <h5 className="text-xs font-bold text-foreground">1. Clic en Web</h5>
                    <p className="text-[9px] text-muted-foreground mt-0.5">Operador acciona botón</p>
                  </div>
                  <div className="text-muted-foreground text-xs font-mono">POST API</div>
                  <div className="p-3 bg-card rounded-lg border border-border shadow-md">
                    <Server className="h-5 w-5 mx-auto text-foreground mb-1" />
                    <h5 className="text-xs font-bold text-foreground">2. Django API</h5>
                    <p className="text-[9px] text-muted-foreground mt-0.5">Verifica permisos y audita</p>
                  </div>
                  <div className="text-muted-foreground text-xs font-mono">Publish MQTT</div>
                  <div className="p-3 bg-card rounded-lg border border-border shadow-md">
                    <Radio className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
                    <h5 className="text-xs font-bold text-foreground">3. Mosquitto</h5>
                    <p className="text-[9px] text-muted-foreground mt-0.5">Publica comando en broker</p>
                  </div>
                  <div className="text-muted-foreground text-xs font-mono">Subscribe</div>
                  <div className="p-3 bg-card rounded-lg border border-primary/20 shadow-md">
                    <Cpu className="h-5 w-5 mx-auto text-primary mb-1" />
                    <h5 className="text-xs font-bold text-foreground">4. Actuador Real</h5>
                    <p className="text-[9px] text-muted-foreground mt-0.5">Ejecuta acción física</p>
                  </div>
                </div>
              </div>

              {/* Registro de Auditoría y Borrado */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex gap-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-foreground">
                  <ShieldAlert className="h-6 w-6 text-amber-500 shrink-0" />
                  <div className="space-y-1">
                    <h4 className="font-bold">Auditoría Automática</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Cualquier acción de control o modificación queda registrada automáticamente en la tabla de **Auditoría** asociando usuario autenticado, IP y marca temporal.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 p-4 bg-rose-500/10 border border-rose-500/30 rounded-lg text-sm text-foreground">
                  <Trash2 className="h-6 w-6 text-rose-500 shrink-0" />
                  <div className="space-y-1">
                    <h4 className="font-bold">Eliminación Atómica Definitiva</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      El backend resuelve la eliminación en cascada (`perform_destroy`) limpiando lecturas residuales, permitiendo borrar cualquier planta, sección, almacenamiento, sensor o empleado de forma inmediata.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Guía de Desarrollo */}
        <TabsContent value="desarrollo" className="space-y-6 mt-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Comandos Útiles y Operación en Docker</CardTitle>
              <CardDescription>
                Instrucciones para gestionar servicios backend, frontend y broker en desarrollo/producción.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Accordion type="single" collapsible className="w-full">
                {/* Accordion Item 1 */}
                <AccordionItem value="worker" className="border-border">
                  <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                    ¿Cómo funciona y cómo levantar `mqtt_worker.py`?
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 text-xs text-muted-foreground">
                    <p>En el contenedor de backend de Docker corre automáticamente como proceso de fondo. Si deseas ejecutarlo manualmente en desarrollo:</p>
                    <pre className="bg-muted p-3 rounded border border-border font-mono text-foreground overflow-x-auto">
                      python manage.py mqtt_worker
                    </pre>
                  </AccordionContent>
                </AccordionItem>

                {/* Accordion Item 2 */}
                <AccordionItem value="simuladores" className="border-border">
                  <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                    ¿Cómo verificar el compilador de TypeScript?
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 text-xs text-muted-foreground">
                    <p>En el directorio <code>scada-ui</code> podés verificar que no existan errores de tipos:</p>
                    <pre className="bg-muted p-3 rounded border border-border font-mono text-foreground overflow-x-auto">
                      npx tsc --noEmit
                    </pre>
                  </AccordionContent>
                </AccordionItem>

                {/* Accordion Item 3 */}
                <AccordionItem value="mosquitto-cli" className="border-border">
                  <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                    Herramientas de Consola para Monitoreo MQTT
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 text-xs text-muted-foreground">
                    <div>
                      <p className="font-semibold text-foreground mb-1">Escuchar todo el tráfico MQTT en vivo:</p>
                      <pre className="bg-muted p-2 rounded border border-border font-mono text-foreground overflow-x-auto">
                        mosquitto_sub -h localhost -t "#" -v
                      </pre>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Accordion Item 4 */}
                <AccordionItem value="acceso-ngrok" className="border-border">
                  <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                    Acceso Remoto Seguro con Ngrok Tunnel y Comunicaciones MQTT Multiregión
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 text-xs text-muted-foreground">
                    <p>El sistema incluye un contenedor <strong>Ngrok Tunnel (`scada_ngrok_tunnel`)</strong> que expone el frontend y backend a través de una URL pública segura HTTPS sin requerir apertura de puertos en el router:</p>
                    <p className="font-mono text-primary font-bold bg-muted p-2 rounded border border-border">
                      https://remarry-anyplace-appraiser.ngrok-free.dev
                    </p>
                    <p>El broker Mosquitto escucha en el puerto <code>1883</code> (<code>0.0.0.0</code>), permitiendo conexiones autenticadas desde Gateways y Raspberry Pi ubicados en distintas redes e IPs externas.</p>
                  </AccordionContent>
                </AccordionItem>

                {/* Accordion Item 5 */}
                <AccordionItem value="credenciales-permisos" className="border-border">
                  <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                    Gestión de Credenciales y Matriz de Permisos por Rango (1 a 8)
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 text-xs text-muted-foreground">
                    <p>En la nueva sección <strong>`/credenciales`</strong> (acceso exclusivo para Administradores) se centralizan tres paneles clave:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>Claves de Registro:</strong> Administración de claves requeridas para dar de alta cuentas de usuario.</li>
                      <li><strong>Credenciales Mosquitto:</strong> Gestión de usuarios autorizados en el archivo <code>passwd</code> del broker.</li>
                      <li><strong>Matriz de Permisos por Rango:</strong> Control jerárquico que restringe navegación y acciones según el rango (Rango 8 Admin, Rangos 7-6 Alta Dirección, Rangos 5-3 Mandos Medios, Rangos 2-1 Operativos).</li>
                    </ul>
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
