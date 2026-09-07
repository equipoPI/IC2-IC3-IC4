import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Activity, 
  Factory, 
  Wifi, 
  Shield, 
  ArrowRight, 
  BarChart3, 
  Cpu,
  Gauge,
  Network,
  Bell,
  FileText,
  Zap
} from "lucide-react";

const LandingPage = () => {
  const features = [
    {
      icon: Activity,
      title: "Monitorización en Tiempo Real",
      description: "Visualización de procesos industriales con diagramas dinámicos interactivos mediante React Flow.",
    },
    {
      icon: BarChart3,
      title: "Eficiencia Productiva",
      description: "Herramientas avanzadas para planificación de órdenes de producción y gestión de recetas.",
    },
    {
      icon: Network,
      title: "Conectividad Industrial",
      description: "Integración MQTT perfecta para sensores IoT industriales y comunicación con maquinaria.",
    },
    {
      icon: Shield,
      title: "Seguridad y Alarmas",
      description: "Sistema avanzado de notificaciones y auditoría de registros históricos.",
    },
  ];

  const capabilities = [
    { icon: Gauge, label: "Control de Procesos" },
    { icon: Cpu, label: "Automatización" },
    { icon: Bell, label: "Gestión de Alarmas" },
    { icon: FileText, label: "Auditoría Completa" },
    { icon: Factory, label: "Multi-Planta" },
    { icon: Zap, label: "Alta Disponibilidad" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/favicon.svg" 
              alt="SCADA Emblem" 
              className="w-10 h-10 rounded-lg p-0.5 bg-slate-900 border border-cyan-500/40 shadow-[0_0_12px_rgba(0,229,255,0.4)] object-contain" 
            />
            <span className="font-semibold text-lg hidden sm:block">SCADA Control</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
                Iniciar Sesión
              </Button>
            </Link>
            <Link to="/register">
              <Button className="bg-primary hover:bg-primary/90">
                Registrarse
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>
        
        {/* Gradient Orbs */}
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />

        <div className="container mx-auto text-center relative z-10 flex flex-col items-center">
          <img 
            src="/favicon.svg" 
            alt="SCADA Logo" 
            className="w-20 h-20 mb-6 rounded-2xl p-2 bg-slate-900 border-2 border-cyan-500/50 shadow-[0_0_30px_rgba(0,229,255,0.5)] object-contain transition-transform hover:scale-105" 
          />
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-8">
            <Wifi className="w-4 h-4" />
            Plataforma Industrial de Nueva Generación
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Sistema de Gestión
            <span className="block text-primary">SCADA</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground mb-4 max-w-3xl mx-auto">
            Control y Supervisión Industrial
          </p>
          
          <p className="text-lg text-muted-foreground/80 mb-10 max-w-2xl mx-auto">
            Plataforma industrial de alto rendimiento para monitorización en tiempo real, 
            planificación de producción y automatización de procesos.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/login">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-6 text-lg">
                Acceder al Sistema
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="border-border hover:bg-muted px-8 py-6 text-lg">
              Ver Demostración
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-card/30">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Capacidades Avanzadas del Sistema SCADA
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Una solución integral multiusuario para la gestión, supervisión y automatización de plantas industriales en tiempo real.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="bg-card/50 border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
              >
                <CardContent className="p-6">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                    <feature.icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities Banner */}
      <section className="py-16 px-4 border-y border-border/30">
        <div className="container mx-auto">
          <div className="flex flex-wrap justify-center gap-8 md:gap-16">
            {capabilities.map((cap, index) => (
              <div key={index} className="flex items-center gap-3 text-muted-foreground hover:text-foreground transition-colors">
                <cap.icon className="w-5 h-5 text-primary" />
                <span className="font-medium">{cap.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        
        <div className="container mx-auto text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Comience a Optimizar sus Procesos
          </h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-xl mx-auto">
            Acceda al sistema de gestión SCADA y tome el control total de sus operaciones industriales.
          </p>
          <Link to="/login">
            <Button size="lg" className="bg-primary hover:bg-primary/90 px-10 py-6 text-lg">
              Iniciar Sesión
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border/30">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img 
              src="/favicon.svg" 
              alt="SCADA Logo" 
              className="w-7 h-7 rounded-md p-0.5 bg-slate-900 border border-cyan-500/40 shadow-[0_0_8px_rgba(0,229,255,0.3)] object-contain" 
            />
            <span className="text-sm text-muted-foreground">
              Sistema de Gestión SCADA © {new Date().getFullYear()}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Control y Supervisión Industrial
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
