# Empleados y Recursos Humanos
import random
from datetime import datetime, timedelta
from django.db import models
from django.contrib.auth.models import User
from django.utils.timezone import now
from django.core.exceptions import ValidationError
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db.models.signals import post_save
from django.dispatch import receiver


class Fabrica(models.Model):
    """
    Modelo Fabrica / Planta - Representa una planta industrial con métricas SCADA
    """
    ESTADOS_PLANTA = [
        ('OPERATIVO', 'Operativo'),
        ('ADVERTENCIA', 'Advertencia'),
        ('CRITICO', 'Crítico'),
        ('OFFLINE', 'Offline'),
    ]

    nombre = models.CharField(max_length=100, unique=True)
    ubicacion = models.CharField(max_length=255, blank=True, null=True)
    pais = models.CharField(max_length=100)
    fecha_creacion = models.DateField(default=now)

    # Campos SCADA
    estado = models.CharField(max_length=20, choices=ESTADOS_PLANTA, default='OPERATIVO')
    porcentaje_produccion = models.FloatField(default=0, help_text="Porcentaje de producción actual (0-100)")
    porcentaje_eficiencia = models.FloatField(default=0, help_text="Porcentaje de eficiencia (0-100)")
    temperatura_promedio = models.FloatField(default=0, help_text="Temperatura promedio en °C")
    consumo_energia = models.FloatField(default=0, help_text="Consumo de energía en kWh")
    alarmas_activas = models.IntegerField(default=0, help_text="Número de alarmas activas")

    def __str__(self):
        return self.nombre

    def actualizar_metricas(self):
        """Actualiza automáticamente las métricas de la planta"""
        if self.alarmas_activas >= 5:
            self.estado = 'CRITICO'
        elif self.alarmas_activas > 0:
            self.estado = 'ADVERTENCIA'
        else:
            self.estado = 'OPERATIVO'
        
        self.save()


class Seccion(models.Model):
    nombre = models.CharField(max_length=100)
    fabrica = models.ForeignKey('Fabrica', on_delete=models.CASCADE, related_name="secciones")
    capacidad_trabajadores = models.PositiveIntegerField()
    tamano_seccion = models.FloatField()  # Tamaño en m²
    agenda = models.TextField(blank=True, null=True)  # Cronograma o agenda de actividades
    creado_el = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('nombre', 'fabrica')

    def __str__(self):
        return f"{self.nombre} - {self.fabrica.nombre}"


class HistorialEstadoEmpleado(models.Model):
    empleado = models.ForeignKey('Empleado', on_delete=models.CASCADE, related_name="historial_estados")
    estado_anterior = models.CharField(max_length=20)
    estado_nuevo = models.CharField(max_length=20)
    fecha_cambio = models.DateTimeField(auto_now_add=True)
    motivo = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"De {self.estado_anterior} a {self.estado_nuevo} - {self.empleado.nombre} ({self.fecha_cambio})"


class Empleado(models.Model):
    ESTADOS_EMPLEADO = [
        ('ACTIVO', 'Activo'),
        ('DESPEDIDO', 'Despedido'),
        ('JUBILADO', 'Jubilado'),
        ('SUSPENDIDO', 'Suspendido'),
        ('OTRO', 'Otro'),
    ]

    user = models.OneToOneField(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='empleado')
    nombre = models.CharField(max_length=100)
    apellido = models.CharField(max_length=100)
    documento = models.CharField(max_length=20, primary_key=True, unique=True)
    seccion = models.ForeignKey('Seccion', on_delete=models.CASCADE, related_name="empleados_directos")
    fabrica = models.ForeignKey(Fabrica, on_delete=models.CASCADE, related_name="empleados")

    RANGO_OPCIONES = [
        ('1', 'Director'),
        ('2', 'Gerente'),
        ('3', 'Jefe de Sección'),
        ('4', 'Coordinador'),
        ('5', 'Especialista'),
        ('6', 'Empleado'),
        ('7', 'Pasante'),
        ('8', 'Administrador'),
    ]

    rango = models.CharField(max_length=50, choices=RANGO_OPCIONES)
    fecha_contratacion = models.DateField()
    contacto = models.CharField(max_length=50)
    direccion = models.CharField(max_length=255)
    cbu = models.CharField(max_length=22, blank=True, null=True)
    alias_bancario = models.CharField(max_length=50, blank=True, null=True)
    clave = models.CharField(max_length=10, unique=True, editable=False, default="")
    email = models.EmailField(unique=True)
    estado = models.CharField(max_length=20, choices=ESTADOS_EMPLEADO, default='ACTIVO')

    # `tipo_empleado` removido: usar `rango` como fuente canónica de autorización.
    # Si se desea conservar valores históricos, backfill previo es necesario.

    def save(self, *args, **kwargs):
        # Evitar intentar obtener el objeto original cuando el PK ya fue asignado
        # (por ejemplo, cuando `documento` es primary_key y se establece antes
        # de guardar). Comprobar existencia antes de recuperar.
        if self.pk and Empleado.objects.filter(pk=self.pk).exists():
            original = Empleado.objects.get(pk=self.pk)
            if original.estado != self.estado:
                HistorialEstadoEmpleado.objects.create(
                    empleado=self,
                    estado_anterior=original.estado,
                    estado_nuevo=self.estado,
                    motivo=f"Cambio de estado a {self.estado}"
                )
        super().save(*args, **kwargs)

        # Sincronizar estado laboral con el acceso al sistema (User.is_active e is_staff)
        if self.user:
            is_active = (self.estado == 'ACTIVO')
            is_admin_rango = (str(self.rango) == '8')
            changed = False

            if self.user.is_active != is_active:
                self.user.is_active = is_active
                changed = True

            if not self.user.is_superuser:
                if is_admin_rango and not self.user.is_staff:
                    self.user.is_staff = True
                    changed = True
                elif not is_admin_rango and self.user.is_staff:
                    self.user.is_staff = False
                    changed = True

            if changed:
                self.user.save()

    @property
    def antiguedad(self):
        if not self.fecha_contratacion:
            return 0
        hoy = now().date()
        ant = hoy.year - self.fecha_contratacion.year
        if (hoy.month, hoy.day) < (self.fecha_contratacion.month, self.fecha_contratacion.day):
            ant -= 1
        return max(0, ant)

    def calcular_antiguedad(self):
        return self.antiguedad

    def __str__(self):
        uname = self.user.username if self.user else ''
        return f"{self.nombre} {self.apellido} ({uname}) - {self.fabrica}"


class EmpleadoSeccion(models.Model):
    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE, related_name="secciones")
    seccion = models.ForeignKey('Seccion', on_delete=models.CASCADE, related_name="empleados_historial")
    fecha_union = models.DateField(default=now)
    fecha_salida = models.DateField(blank=True, null=True)

    class Meta:
        unique_together = ('empleado', 'seccion', 'fecha_union')

    def __str__(self):
        return f"{self.empleado} en {self.seccion} desde {self.fecha_union}"


# Perfil para usuarios del sistema: rol derivado desde `Empleado.rango`

class Profile(models.Model):
    """Perfil extendido para `User` con metadatos adicionales.

    Nota: el campo `role` fue eliminado como columna persistente. El rol
    efectivo se deriva de la relación `user.empleado.rango`. Se exponen
    utilidades `role` (propiedad) y `get_role_display()` para compatibilidad
    con código que previamente consumía esas llamadas.
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    telefono = models.CharField(max_length=30, blank=True, null=True)
    email_confirmed = models.BooleanField(default=False)
    last_seen = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Profile'
        verbose_name_plural = 'Profiles'

    def __str__(self):
        return f"{self.user.username} ({self.get_role_display()})"

    @property
    def role(self):
        """Código de rol interno derivado desde `Empleado.rango`.

        Devuelve uno de: 'admin', 'manager', 'operator'. Si no existe
        un `Empleado` asociado, retorna 'operator' por defecto.
        """
        try:
            emp = getattr(self.user, 'empleado', None)
            if emp and getattr(emp, 'rango', None):
                r = str(emp.rango)
                if r == '8':
                    return 'admin'
                if r in ['1', '2', '3']:
                    return 'manager'
                return 'operator'
        except Exception:
            pass
        return 'operator'

    def get_role_display(self):
        """Etiqueta legible del rol derivada desde `Empleado.rango`.

        Mantiene la compatibilidad con llamadas existentes a
        `perfil.get_role_display()`.
        """
        try:
            emp = getattr(self.user, 'empleado', None)
            if emp and getattr(emp, 'rango', None):
                mapping = dict(getattr(models.Empleado, 'RANGO_OPCIONES', []))
                return mapping.get(str(emp.rango), 'Empleado')
        except Exception:
            pass
        return 'Empleado'


class RegistrationConfig(models.Model):
    """Configuración editable por admin para la clave de registro.

    - `clave` es la clave que los usuarios deben introducir para registrarse.
    - `activo` permite desactivar temporalmente registros basados en DB.
    """
    clave = models.CharField(max_length=128, help_text="Clave de acceso/clave de registro")
    activo = models.BooleanField(default=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Registro Config'
        verbose_name_plural = 'Configuración de Registro'

    def __str__(self):
        status = 'activo' if self.activo else 'inactivo'
        return f"Clave registro ({status}) - actualizado: {self.actualizado_en}"

    @classmethod
    def get_current_key(cls):
        obj = cls.objects.filter(activo=True).order_by('-actualizado_en').first()
        return obj.clave if obj else None


# Señal para crear/actualizar Profile automáticamente
@receiver(post_save, sender=User)
def create_or_update_user_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.create(user=instance)
        # Intento crear un registro `Empleado` básico si existen fábricas y secciones.
        try:
            # Evitar crear si ya existe un Empleado vinculado
            if not Empleado.objects.filter(user=instance).exists():
                if Fabrica.objects.exists():
                    fab = Fabrica.objects.first()
                    sec = Seccion.objects.filter(fabrica=fab).first()
                    if sec:
                        doc = instance.username
                        # Evitar duplicados por documento o email
                        if not Empleado.objects.filter(documento=doc).exists() and not Empleado.objects.filter(email=instance.email).exists():
                            emp = Empleado(
                                user=instance,
                                documento=doc,
                                nombre=instance.first_name or instance.username,
                                apellido=instance.last_name or '',
                                fabrica=fab,
                                seccion=sec,
                                rango='6',
                                fecha_contratacion=now().date(),
                                contacto='',
                                direccion='',
                                email=instance.email or ''
                            )
                            emp.save()
        except Exception:
            # No bloquear el registro de usuario si fallan estas operaciones
            pass
    else:
        try:
            instance.profile.save()
        except Profile.DoesNotExist:
            Profile.objects.create(user=instance)


class Inventario(models.Model):
    fabrica = models.ForeignKey('Fabrica', on_delete=models.CASCADE, related_name="inventarios")
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True, null=True)
    capacidad_m2 = models.FloatField()
    usados_m2 = models.FloatField(default=0)
    creado_el = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.nombre} ({self.fabrica.nombre})"


class ItemInventario(models.Model):
    TIPOS = [
        ('PRODUCTO', 'Producto'),
        ('MATERIA PRIMA', 'Materia Prima'),
    ]

    numero_serie = models.CharField(max_length=50, primary_key=True)
    inventario = models.ForeignKey('Inventario', on_delete=models.CASCADE, related_name="items")
    seccion = models.ForeignKey('Seccion', on_delete=models.SET_NULL, null=True, blank=True)
    categoria = models.CharField(max_length=40, choices=TIPOS)
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True, null=True)
    cantidad = models.PositiveIntegerField()
    unidad = models.CharField(max_length=50, default="unidades")
    espacio_m2 = models.FloatField()
    creado_el = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.numero_serie} - {self.nombre} ({self.inventario.nombre})"


class HistorialMovimientos(models.Model):
    ACCIONES = [
        ('AL_INVENTARIO', 'A Inventario'),
        ('A_SECCION', 'A Sección'),
    ]

    item = models.ForeignKey(ItemInventario, on_delete=models.CASCADE, related_name='movimientos')
    seccion = models.ForeignKey(Seccion, on_delete=models.SET_NULL, null=True, blank=True, related_name='movimientos')
    accion = models.CharField(max_length=20, choices=ACCIONES)
    cantidad = models.PositiveIntegerField()
    fecha_hora = models.DateTimeField(auto_now_add=True)
    usuario = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    observaciones = models.TextField(blank=True, null=True)

    def __str__(self):
        seccion_nombre = self.seccion.nombre if self.seccion else "Inventario"
        return f"{self.accion} {self.cantidad} de {self.item.nombre} a {seccion_nombre} el {self.fecha_hora}"


class CronogramaSeccion(models.Model):
    seccion = models.ForeignKey(Seccion, on_delete=models.CASCADE, related_name="cronogramas")
    item = models.ForeignKey(ItemInventario, on_delete=models.CASCADE, related_name="cronogramas")
    fecha_inicio = models.DateTimeField()
    fecha_fin = models.DateTimeField()
    descripcion = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.seccion.nombre} - {self.item.nombre} ({self.fecha_inicio} a {self.fecha_fin})"


class Receta(models.Model):
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True, null=True)
    ingredientes = models.ManyToManyField(ItemInventario, through='DetalleReceta', related_name='recetas')
    tipo = models.CharField(max_length=50, choices=[('Líquido', 'Líquido'), ('Sólido', 'Sólido'), ('Combinado', 'Combinado')])

    def __str__(self):
        return self.nombre


class DetalleReceta(models.Model):
    receta = models.ForeignKey(Receta, on_delete=models.CASCADE, related_name='detalles')
    ingrediente = models.ForeignKey(ItemInventario, on_delete=models.CASCADE, related_name='detalles_receta')
    cantidad = models.PositiveIntegerField()
    unidad = models.CharField(max_length=50, choices=[('kg', 'Kilogramos'), ('litros', 'Litros'), ('unidades', 'Unidades')])

    def __str__(self):
        return f"{self.cantidad} {self.unidad} de {self.ingrediente.nombre} en {self.receta.nombre}"


class EjecucionReceta(models.Model):
    receta = models.ForeignKey(Receta, on_delete=models.CASCADE, related_name='ejecuciones')
    seccion = models.ForeignKey(Seccion, on_delete=models.CASCADE, related_name='ejecuciones')
    tiempo_inicio = models.DateTimeField(default=now)
    tiempo_fin = models.DateTimeField(blank=True, null=True)
    estado = models.CharField(max_length=50, choices=[
        ('PENDIENTE', 'Pendiente'),
        ('EN_PROGRESO', 'En Progreso'),
        ('COMPLETADO', 'Completado'),
        ('FALLIDO', 'Fallido'),
    ], default='PENDIENTE')

    def __str__(self):
        return f"Ejecución de {self.receta.nombre} en {self.seccion.nombre} ({self.tiempo_inicio})"


class RegistroAuditoria(models.Model):
    """Registro de auditoría para acciones del sistema.

    Guarda la máxima información posible sobre la acción: usuario (si hay),
    tipo de acción, módulo, objeto afectado, descripción libre, datos
    adicionales en JSON, IP y timestamp.
    """
    usuario = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    accion = models.CharField(max_length=200)
    modulo = models.CharField(max_length=200, blank=True, null=True)
    objeto = models.CharField(max_length=500, blank=True, null=True)
    descripcion = models.TextField(blank=True, null=True)
    datos = models.JSONField(blank=True, null=True)
    ip_origen = models.CharField(max_length=50, blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Registro de Auditoría'
        verbose_name_plural = 'Registros de Auditoría'

    def __str__(self):
        user = self.usuario.username if self.usuario else 'Anon'
        return f"[{self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}] {user} - {self.accion} ({self.modulo})"


class Produccion(models.Model):
    receta = models.ForeignKey(Receta, on_delete=models.CASCADE, related_name='producciones')
    seccion = models.ForeignKey(Seccion, on_delete=models.CASCADE, related_name='producciones')
    cronograma = models.ForeignKey(CronogramaSeccion, on_delete=models.SET_NULL, null=True, blank=True, related_name="producciones")
    fecha_inicio = models.DateTimeField()
    fecha_fin = models.DateTimeField(blank=True, null=True)
    cantidad_producida = models.FloatField()
    tipo_producto = models.CharField(max_length=50, choices=[('Líquido', 'Líquido'), ('Sólido', 'Sólido'), ('Combinado', 'Combinado')])

    def __str__(self):
        return f"Producción de {self.receta.nombre} en {self.seccion.nombre} ({self.fecha_inicio})"


class RegistroMantenimiento(models.Model):
    componente = models.ForeignKey(ItemInventario, on_delete=models.CASCADE, related_name="mantenimientos")
    seccion_origen = models.ForeignKey(Seccion, on_delete=models.CASCADE, related_name="mantenimientos_realizados")
    seccion_destino = models.ForeignKey(Seccion, on_delete=models.CASCADE, related_name="mantenimientos_recibidos")
    empleado_responsable = models.ForeignKey(Empleado, on_delete=models.SET_NULL, null=True, blank=True, related_name="mantenimientos")
    fecha_inicio = models.DateTimeField(auto_now_add=True)
    fecha_fin = models.DateTimeField(blank=True, null=True)
    descripcion_mantenimiento = models.TextField(blank=True, null=True)
    estado = models.CharField(
        max_length=50,
        choices=[
            ('PENDIENTE', 'Pendiente'),
            ('EN_PROCESO', 'En Proceso'),
            ('COMPLETADO', 'Completado'),
        ],
        default='PENDIENTE'
    )
    devuelto_a_origen = models.BooleanField(default=False)

    def marcar_completado(self):
        self.estado = 'COMPLETADO'
        self.fecha_fin = now()
        self.save()

    def marcar_devuelto(self):
        self.devuelto_a_origen = True
        self.save()

    def __str__(self):
        return f"{self.componente.nombre} - {self.estado} (De {self.seccion_origen.nombre} a {self.seccion_destino.nombre})"


class Sistema(models.Model):
    TIPOS_SISTEMA = [
        ('FLUIDOS', 'Fluidos / Líquidos'),
        ('SOLIDOS', 'Procesamiento de Sólidos'),
        ('EMPAQUE', 'Empaquetado y Envasado'),
        ('TEMPERATURA', 'Control de Temperatura'),
        ('GENERAL', 'Sistema General'),
    ]

    nombre = models.CharField(max_length=100)
    fabrica = models.ForeignKey(Fabrica, on_delete=models.CASCADE, related_name='sistemas')
    tipo_sistema = models.CharField(max_length=30, choices=TIPOS_SISTEMA, default='FLUIDOS')
    descripcion = models.TextField(blank=True, null=True)
    diagrama_layout_json = models.TextField(blank=True, null=True, help_text="Distribucion de nodos y conexiones de ReactFlow en JSON")
    activo = models.BooleanField(default=True)

    class Meta:
        unique_together = ('nombre', 'fabrica')
        verbose_name_plural = "Sistemas"

    def __str__(self):
        return f"{self.nombre} - {self.fabrica.nombre}"


class DispositivoSCADA(models.Model):
    CATEGORIAS = [
        ('SENSOR_TEMPERATURA', 'Sensor de Temperatura'),
        ('SENSOR_PRESION', 'Sensor de Presión'),
        ('SENSOR_FLUJO', 'Sensor de Flujo'),
        ('SENSOR_NIVEL', 'Sensor de Nivel'),
        ('SENSOR_HUMEDAD', 'Sensor de Humedad'),
        ('MOTOR', 'Motor'),
        ('BOMBA', 'Bomba'),
        ('VALVULA', 'Válvula'),
        ('PLC', 'PLC'),
        ('HMI', 'HMI'),
        ('MEZCLADORA', 'Mezcladora'),
        ('ENVASADORA', 'Envasadora'),
        ('TRANSPORTADOR', 'Transportador'),
        ('ROBOT', 'Robot'),
        ('OTRO', 'Otro'),
    ]

    ESTADOS = [
        ('ONLINE', 'Online'),
        ('OFFLINE', 'Offline'),
        ('MANTENIMIENTO', 'En Mantenimiento'),
        ('ERROR', 'Error'),
    ]

    numero_serie = models.CharField(max_length=50, unique=True, primary_key=True)
    nombre = models.CharField(max_length=100)
    categoria = models.CharField(max_length=50, choices=CATEGORIAS)
    sistema = models.ForeignKey(Sistema, on_delete=models.SET_NULL, null=True, blank=True, related_name='dispositivos')
    seccion = models.ForeignKey(Seccion, on_delete=models.SET_NULL, null=True, blank=True, related_name='dispositivos')
    inventario = models.ForeignKey(Inventario, on_delete=models.SET_NULL, null=True, blank=True, related_name='dispositivos')
    estado = models.CharField(max_length=20, choices=ESTADOS, default='OFFLINE')
    topic_mqtt = models.CharField(max_length=255, blank=True, null=True, help_text="Topic MQTT para este dispositivo")
    gateway_id = models.CharField(max_length=100, blank=True, null=True, help_text="ID del gateway/Raspberry asignado")
    fecha_instalacion = models.DateField(default=now)
    creado_el = models.DateTimeField(auto_now_add=True)
    ultima_lectura = models.DateTimeField(null=True, blank=True)
    valor_lectura = models.FloatField(null=True, blank=True, help_text="Último valor medido")
    unidad_lectura = models.CharField(max_length=20, default="N/A", blank=True, help_text="Unidad de medida")
    descripcion = models.TextField(blank=True, null=True)

    class Meta:
        verbose_name = "Dispositivo SCADA"
        verbose_name_plural = "Dispositivos SCADA"

    @property
    def id(self):
        return self.numero_serie

    def __str__(self):
        return f"{self.numero_serie} - {self.nombre}"


class LecturaSensor(models.Model):
    dispositivo = models.ForeignKey(DispositivoSCADA, on_delete=models.CASCADE, related_name='lecturas')
    timestamp = models.DateTimeField(default=now, db_index=True)
    valor = models.FloatField()
    unidad = models.CharField(max_length=20, default="N/A")
    calidad = models.CharField(max_length=20, default="GOOD", help_text="GOOD, BAD, UNCERTAIN")

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['dispositivo', '-timestamp']),
        ]
        verbose_name = "Lectura de Sensor"
        verbose_name_plural = "Lecturas de Sensores"

    def __str__(self):
        return f"{self.dispositivo.nombre}: {self.valor} {self.unidad} ({self.timestamp})"


class OrdenProduccion(models.Model):
    ESTADOS_ORDEN = [
        ('PENDIENTE', 'Pendiente'),
        ('EN_PROCESO', 'En Proceso'),
        ('COMPLETADA', 'Completada'),
        ('CANCELADA', 'Cancelada'),
    ]

    codigo = models.CharField(max_length=50, unique=True, editable=False)
    producto = models.CharField(max_length=100)
    cantidad = models.IntegerField()
    unidad = models.CharField(max_length=20, default='UN')
    fecha_inicio = models.DateField()
    hora_inicio = models.TimeField(default='08:00')
    fecha_fin = models.DateField()
    hora_fin = models.TimeField(default='17:00')
    
    fabrica = models.ForeignKey(Fabrica, on_delete=models.CASCADE, related_name='ordenes_produccion')
    sistema = models.ForeignKey(Sistema, on_delete=models.SET_NULL, null=True, blank=True, related_name='ordenes')
    dispositivo = models.ForeignKey(DispositivoSCADA, on_delete=models.SET_NULL, null=True, blank=True, related_name='ordenes')
    estado = models.CharField(max_length=20, choices=ESTADOS_ORDEN, default='PENDIENTE')
    progreso = models.IntegerField(default=0, help_text="Porcentaje de progreso 0-100")
    receta = models.ForeignKey(Receta, on_delete=models.SET_NULL, null=True, blank=True, related_name='ordenes_produccion')
    creado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='ordenes_creadas')
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    observaciones = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-fecha_creacion']
        verbose_name = "Orden de Producción"
        verbose_name_plural = "Órdenes de Producción"

    def save(self, *args, **kwargs):
        if not self.codigo:
            year = datetime.now().year
            count = OrdenProduccion.objects.filter(codigo__startswith=f'OP-{year}').count() + 1
            self.codigo = f'OP-{year}-{count:04d}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.codigo} - {self.producto}"


class PlantillaProduccion(models.Model):
    TIPOS = [
        ('PRODUCCION', 'Producción'),
        ('ESPECIALIDAD', 'Especialidad'),
        ('MANTENIMIENTO', 'Mantenimiento'),
        ('CALIBRACION', 'Calibración'),
    ]

    nombre = models.CharField(max_length=100)
    tipo = models.CharField(max_length=50, choices=TIPOS)
    descripcion = models.TextField(blank=True, null=True)
    tiempo_horas = models.IntegerField(default=0)
    tiempo_minutos = models.IntegerField(default=0)
    ingredientes_json = models.TextField(blank=True, null=True, help_text="JSON con lista de ingredientes")
    receta_base = models.ForeignKey(Receta, on_delete=models.SET_NULL, null=True, blank=True, related_name='plantillas')
    activo = models.BooleanField(default=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Plantilla de Producción"
        verbose_name_plural = "Plantillas de Producción"

    def __str__(self):
        return f"{self.nombre} ({self.tipo})"

    @property
    def tiempo_estimado(self):
        if self.tiempo_horas > 0 and self.tiempo_minutos > 0:
            return f"{self.tiempo_horas}h {self.tiempo_minutos}m"
        elif self.tiempo_horas > 0:
            return f"{self.tiempo_horas}h"
        else:
            return f"{self.tiempo_minutos}m"


class ConfiguracionMQTT(models.Model):
    nombre = models.CharField(max_length=100, unique=True)
    broker_url = models.CharField(max_length=255, help_text="URL del broker MQTT")
    puerto = models.IntegerField(default=1883)
    usuario = models.CharField(max_length=100, blank=True, null=True)
    password = models.CharField(max_length=100, blank=True, null=True)
    usar_tls = models.BooleanField(default=False)
    keep_alive = models.IntegerField(default=60, help_text="Keep alive en segundos")
    topic_base = models.CharField(max_length=255, default="scada/", help_text="Topic base para suscripciones")
    activo = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Configuración MQTT"
        verbose_name_plural = "Configuraciones MQTT"

    def __str__(self):
        return f"{self.nombre} ({self.broker_url}:{self.puerto})"


class TopicMQTT(models.Model):
    TIPOS = [
        ('SUSCRIPCION', 'Suscripción'),
        ('PUBLICACION', 'Publicación'),
    ]

    configuracion = models.ForeignKey(ConfiguracionMQTT, on_delete=models.CASCADE, related_name='topics')
    topic = models.CharField(max_length=255, db_index=True)
    tipo = models.CharField(max_length=20, choices=TIPOS, default='SUSCRIPCION')
    tipo_dato = models.CharField(max_length=50, blank=True, null=True)
    descripcion = models.TextField(blank=True, null=True)
    activo = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Topic MQTT'
        verbose_name_plural = 'Topics MQTT'
        indexes = [
            models.Index(fields=['topic']),
            models.Index(fields=['configuracion']),
        ]

    def __str__(self):
        return f"{self.topic} ({self.configuracion.nombre})"


class IngredienteAlmacenamiento(models.Model):
    CATEGORIAS = [
        ('RAW_MATERIAL', 'Materia Prima'),
        ('ADDITIVE', 'Aditivo'),
        ('CATALYST', 'Catalizador'),
        ('BASE', 'Base'),
    ]

    nombre = models.CharField(max_length=100, unique=True)
    categoria = models.CharField(max_length=20, choices=CATEGORIAS, default='RAW_MATERIAL')
    unidad_medida = models.CharField(max_length=20, default="L")
    stock_actual = models.FloatField(default=0)
    stock_minimo = models.FloatField(default=0)
    unidad_almacenamiento = models.ForeignKey(
        'UnidadAlmacenamiento',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ingredientes_disponibles'
    )
    activo = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Ingrediente"
        verbose_name_plural = "Ingredientes"

    @property
    def available_in_storage(self):
        return self.stock_actual > 0

    def __str__(self):
        return f"{self.nombre} ({self.stock_actual} {self.unidad_medida})"


class MantenimientoProgramado(models.Model):
    ESTADOS = [
        ('PROGRAMADO', 'Programado'),
        ('EN_CURSO', 'En Curso'),
        ('COMPLETADO', 'Completado'),
        ('CANCELADO', 'Cancelado'),
    ]

    nombre = models.CharField(max_length=200)
    descripcion = models.TextField()
    fecha_inicio = models.DateField()
    hora_inicio = models.TimeField()
    fecha_fin = models.DateField()
    hora_fin = models.TimeField()
    fabrica = models.ForeignKey(Fabrica, on_delete=models.CASCADE, related_name='mantenimientos_programados')
    sistema = models.ForeignKey(Sistema, on_delete=models.SET_NULL, null=True, blank=True, related_name='mantenimientos_programados')
    dispositivo = models.ForeignKey(DispositivoSCADA, on_delete=models.SET_NULL, null=True, blank=True, related_name='mantenimientos_programados')
    estado = models.CharField(max_length=20, choices=ESTADOS, default='PROGRAMADO')
    registro_mantenimiento = models.OneToOneField(
        RegistroMantenimiento,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mantenimiento_programado_origen'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['fecha_inicio', 'hora_inicio']
        verbose_name = 'Mantenimiento Programado'
        verbose_name_plural = 'Mantenimientos Programados'
        indexes = [
            models.Index(fields=['fecha_inicio', 'estado']),
            models.Index(fields=['fabrica', 'estado']),
        ]

    def __str__(self):
        return f"{self.nombre} - {self.fabrica.nombre} ({self.fecha_inicio})"

    @property
    def duracion_planificada(self):
        from datetime import datetime
        inicio = datetime.combine(self.fecha_inicio, self.hora_inicio)
        fin = datetime.combine(self.fecha_fin, self.hora_fin)
        return fin - inicio


class UnidadAlmacenamiento(models.Model):
    TIPOS = [
        ('TANK', 'Tanque'),
        ('SILO', 'Silo'),
        ('DEPOSIT', 'Depósito'),
    ]

    ESTADOS = [
        ('ACTIVE', 'Activo'),
        ('INACTIVE', 'Inactivo'),
        ('WARNING', 'Advertencia'),
        ('ERROR', 'Error'),
    ]

    inventario = models.ForeignKey(Inventario, on_delete=models.CASCADE, related_name='unidades_almacenamiento')
    seccion = models.ForeignKey(Seccion, on_delete=models.SET_NULL, null=True, blank=True, related_name='unidades_almacenamiento')
    sistema = models.ForeignKey(Sistema, on_delete=models.SET_NULL, null=True, blank=True, related_name='unidades_almacenamiento')
    nombre = models.CharField(max_length=100)
    tipo = models.CharField(max_length=20, choices=TIPOS)
    contenido = models.CharField(max_length=200)
    volumen_actual = models.FloatField(default=0)
    capacidad = models.FloatField()
    unidad = models.CharField(max_length=20, default='L')
    temperatura = models.FloatField(null=True, blank=True)
    estado = models.CharField(max_length=20, choices=ESTADOS, default='ACTIVE')
    node_id = models.CharField(max_length=50, null=True, blank=True, unique=True)
    dispositivo_sensor = models.ForeignKey(DispositivoSCADA, on_delete=models.SET_NULL, null=True, blank=True, related_name='unidades_monitoreadas')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['nombre']
        verbose_name = 'Unidad de Almacenamiento'
        verbose_name_plural = 'Unidades de Almacenamiento'
        indexes = [
            models.Index(fields=['node_id']),
            models.Index(fields=['estado']),
        ]

    def __str__(self):
        return f"{self.nombre} ({self.contenido})"

    @property
    def nivel_porcentaje(self):
        if self.capacidad > 0:
            return round((self.volumen_actual / self.capacidad) * 100, 2)
        return 0

    @property
    def espacio_disponible(self):
        return max(0, self.capacidad - self.volumen_actual)


class HistorialProduccion(models.Model):
    orden_produccion = models.OneToOneField(OrdenProduccion, on_delete=models.CASCADE, related_name='historial')
    producto = models.CharField(max_length=200)
    fabrica = models.ForeignKey(Fabrica, on_delete=models.SET_NULL, null=True, related_name='historial_producciones')
    cantidad_planificada = models.IntegerField()
    cantidad_producida = models.IntegerField()
    porcentaje_cumplimiento = models.FloatField()
    tiempo_planificado = models.DurationField()
    tiempo_real = models.DurationField()
    fecha_inicio_real = models.DateTimeField()
    fecha_fin_real = models.DateTimeField()
    empleados_asignados = models.ManyToManyField(Empleado, blank=True, related_name='producciones_historial')
    receta_utilizada = models.ForeignKey(Receta, on_delete=models.SET_NULL, null=True, blank=True, related_name='producciones_historial')
    defectos_detectados = models.IntegerField(default=0)
    porcentaje_calidad = models.FloatField(default=100)
    costo_materiales = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    costo_mano_obra = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    costo_energia = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    costo_total = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    observaciones = models.TextField(blank=True, null=True)
    fecha_registro = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_fin_real']
        verbose_name = 'Historial de Producción'
        verbose_name_plural = 'Historiales de Producción'
        indexes = [
            models.Index(fields=['-fecha_fin_real']),
            models.Index(fields=['fabrica', '-fecha_fin_real']),
            models.Index(fields=['producto', '-fecha_fin_real']),
        ]

    def __str__(self):
        return f"{self.producto} - {self.fecha_fin_real.strftime('%Y-%m-%d')}"

    @property
    def eficiencia_temporal(self):
        if self.tiempo_real.total_seconds() > 0:
            return round((self.tiempo_planificado.total_seconds() / self.tiempo_real.total_seconds()) * 100, 2)
        return 0

    def save(self, *args, **kwargs):
        if self.cantidad_planificada > 0:
            self.porcentaje_cumplimiento = round((self.cantidad_producida / self.cantidad_planificada) * 100, 2)
        
        if self.costo_materiales or self.costo_mano_obra or self.costo_energia:
            self.costo_total = (
                (self.costo_materiales or 0) +
                (self.costo_mano_obra or 0) +
                (self.costo_energia or 0)
            )
        super().save(*args, **kwargs)


class ComunicacionMQTT(models.Model):
    DIRECCIONES = [
        ('PUBLICADO', 'Publicado'),
        ('RECIBIDO', 'Recibido'),
    ]

    configuracion = models.ForeignKey(ConfiguracionMQTT, on_delete=models.CASCADE, related_name='comunicaciones')
    topic = models.CharField(max_length=255, db_index=True)
    payload = models.TextField()
    direccion = models.CharField(max_length=20, choices=DIRECCIONES)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    qos = models.IntegerField(default=0)
    dispositivo = models.ForeignKey(DispositivoSCADA, on_delete=models.SET_NULL, null=True, blank=True, related_name='comunicaciones_mqtt')
    exitoso = models.BooleanField(default=True)
    mensaje_error = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Comunicación MQTT'
        verbose_name_plural = 'Comunicaciones MQTT'
        indexes = [
            models.Index(fields=['topic', '-timestamp']),
            models.Index(fields=['dispositivo', '-timestamp']),
            models.Index(fields=['exitoso', '-timestamp']),
        ]

    def __str__(self):
        return f"{self.direccion} - {self.topic} ({self.timestamp.strftime('%Y-%m-%d %H:%M:%S')})"


class MetricaConfiguracion(models.Model):
    nombre = models.CharField(max_length=100, unique=True)
    unidad_medida = models.CharField(max_length=20)
    icono = models.CharField(max_length=50, help_text="Nombre de icono Lucide (e.g. thermometer, gauge, zap, droplet)")
    rango_minimo = models.FloatField(default=0.0)
    rango_maximo = models.FloatField(default=100.0)
    activo = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Configuración de Métrica"
        verbose_name_plural = "Configuraciones de Métricas"

    def __str__(self):
        return f"{self.nombre} ({self.unidad_medida})"


class VariableVinculada(models.Model):
    fabrica = models.ForeignKey(Fabrica, on_delete=models.CASCADE, related_name='variables_vinculadas')
    metrica_config = models.ForeignKey(MetricaConfiguracion, on_delete=models.CASCADE, related_name='vinculos')
    sensor = models.ForeignKey(DispositivoSCADA, on_delete=models.SET_NULL, null=True, blank=True, related_name='variables_vinculadas')
    umbral_advertencia = models.FloatField(blank=True, null=True)
    umbral_critico = models.FloatField(blank=True, null=True)
    activo = models.BooleanField(default=True)

    class Meta:
        unique_together = ('fabrica', 'metrica_config')
        verbose_name = "Variable Vinculada"
        verbose_name_plural = "Variables Vinculadas"

    def __str__(self):
        sensor_str = self.sensor.numero_serie if self.sensor else "Sin sensor"
        return f"{self.fabrica.nombre} - {self.metrica_config.nombre} ({sensor_str})"


class Alarma(models.Model):
    SEVERIDADES = [
        ('alta', 'Alta'),
        ('media', 'Media'),
        ('baja', 'Baja'),
    ]
    ESTADOS = [
        ('abierta', 'Abierta'),
        ('cerrada', 'Cerrada'),
    ]
    planta = models.ForeignKey(Fabrica, on_delete=models.CASCADE, related_name='alarmas_sistema')
    seccion = models.ForeignKey(Seccion, on_delete=models.SET_NULL, null=True, blank=True, related_name='alarmas_sistema')
    sensor_maquina = models.CharField(max_length=255)
    descripcion = models.TextField()
    severidad = models.CharField(max_length=20, choices=SEVERIDADES, default='media')
    fecha_hora = models.DateTimeField(auto_now_add=True)
    estado = models.CharField(max_length=20, choices=ESTADOS, default='abierta')

    class Meta:
        ordering = ['-fecha_hora']
        verbose_name = "Alarma"
        verbose_name_plural = "Alarmas"

    def __str__(self):
        return f"ALM - {self.descripcion} ({self.planta.nombre})"


class MapeoAccionMQTT(models.Model):
    TIPOS_SISTEMA = [
        ('FLUIDOS', 'Fluidos / Líquidos'),
        ('SOLIDOS', 'Procesamiento de Sólidos'),
        ('EMPAQUE', 'Empaquetado y Envasado'),
        ('TEMPERATURA', 'Control de Temperatura'),
        ('GENERAL', 'Sistema General'),
    ]

    TIPOS_CONTROL = [
        ('BOTON', 'Botón de Acción MQTT'),
        ('SLIDER', 'Barra Deslizante (Slider)'),
        ('NUMERICO', 'Campo Numérico (Input)'),
        ('PARAMETRIZADO', 'Control Parametrizado (Campos Dinámicos)'),
        ('RECETA', 'Panel de Receta (Manual / Plantilla)'),
    ]

    nombre = models.CharField(max_length=100)
    sistema = models.ForeignKey(Sistema, on_delete=models.CASCADE, null=True, blank=True, related_name='mapeos_acciones')
    tipo_sistema = models.CharField(max_length=30, choices=TIPOS_SISTEMA, default='FLUIDOS')
    tipo_control = models.CharField(max_length=30, choices=TIPOS_CONTROL, default='BOTON')
    categoria_panel = models.CharField(max_length=100, default='Controles del Proceso', help_text="Sección o tarjeta contenedora")
    nombre_accion = models.CharField(max_length=50, help_text="Ej: reposicion, mezcla, receta, emergencia")
    plantilla_topico = models.CharField(max_length=255, default="scada/{tenant}/{gateway}/{seccion}/{sistema}/accion")
    plantilla_payload_json = models.TextField(default='{"accion": "{accion}", "parametros": {}}')
    min_val = models.FloatField(default=0.0, null=True, blank=True)
    max_val = models.FloatField(default=100.0, null=True, blank=True)
    unidad = models.CharField(max_length=20, default='', blank=True)
    activo = models.BooleanField(default=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Mapeo de Acción MQTT"
        verbose_name_plural = "Mapeos de Acciones MQTT"

    def __str__(self):
        return f"{self.nombre} ({self.tipo_control}) - {self.nombre_accion}"