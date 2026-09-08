from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver
from django.contrib.auth.signals import user_logged_in, user_logged_out
from django.contrib.auth.models import User
import threading
from .models import (
    Fabrica,
    Seccion,
    Sistema,
    DispositivoSCADA,
    ConfiguracionMQTT,
    TopicMQTT,
    MapeoAccionMQTT,
    Empleado,
    Profile,
    OrdenProduccion,
    Receta,
    DetalleReceta,
    EjecucionReceta,
    HistorialProduccion,
    UnidadAlmacenamiento,
    ItemInventario,
    IngredienteAlmacenamiento,
    HistorialMovimientos,
    CronogramaSeccion,
    MantenimientoProgramado,
    RegistroMantenimiento,
    Alarma,
    MetricaConfiguracion,
    VariableVinculada,
    RegistroAuditoria
)
from .middleware import get_current_user, get_current_ip

# Lista de modelos que deseamos auditar de forma automática
AUDITED_MODELS = (
    Fabrica,
    Seccion,
    Sistema,
    DispositivoSCADA,
    ConfiguracionMQTT,
    TopicMQTT,
    MapeoAccionMQTT,
    Empleado,
    Profile,
    OrdenProduccion,
    Receta,
    DetalleReceta,
    EjecucionReceta,
    HistorialProduccion,
    UnidadAlmacenamiento,
    ItemInventario,
    IngredienteAlmacenamiento,
    HistorialMovimientos,
    CronogramaSeccion,
    MantenimientoProgramado,
    RegistroMantenimiento,
    Alarma,
    MetricaConfiguracion,
    VariableVinculada
)

# Almacenamiento local del hilo para registrar los diffs temporales entre pre_save y post_save
_local_diffs = threading.local()

def get_modulo_name(instance):
    """Mapear clase de modelo a nombre de módulo amigable en español"""
    cls_name = instance.__class__.__name__
    mapping = {
        'Fabrica': 'Plantas Industrial',
        'Seccion': 'Secciones de Planta',
        'Sistema': 'Sistemas SCADA',
        'DispositivoSCADA': 'Dispositivos y Actuadores SCADA',
        'ConfiguracionMQTT': 'Comunicaciones y Brokers MQTT',
        'TopicMQTT': 'Topics MQTT',
        'MapeoAccionMQTT': 'Plantillas Tópicos y Acciones MQTT',
        'Empleado': 'Gestión de Personal / Empleados',
        'Profile': 'Perfiles de Usuario',
        'OrdenProduccion': 'Órdenes de Producción',
        'Receta': 'Recetas de Producción',
        'DetalleReceta': 'Recetas de Producción (Detalle)',
        'EjecucionReceta': 'Ejecución de Recetas',
        'HistorialProduccion': 'Historial de Producción',
        'UnidadAlmacenamiento': 'Inventario / Tanques y Almacenes',
        'ItemInventario': 'Inventario / Items de Stock',
        'IngredienteAlmacenamiento': 'Inventario / Materia Prima',
        'HistorialMovimientos': 'Inventario / Movimientos',
        'CronogramaSeccion': 'Planificación de la Producción',
        'MantenimientoProgramado': 'Mantenimiento Preventivo',
        'RegistroMantenimiento': 'Bitácora de Mantenimiento',
        'Alarma': 'Gestión de Alarmas',
        'MetricaConfiguracion': 'Configuración de Métricas SCADA',
        'VariableVinculada': 'Variables Vinculadas SCADA'
    }
    return mapping.get(cls_name, cls_name)

def get_objeto_representation(instance):
    """Mapear representación legible del objeto"""
    for attr in ('nombre', 'numero_serie', 'codigo', 'username', 'email'):
        val = getattr(instance, attr, None)
        if val:
            return str(val)
    return f"ID: {instance.id}" if hasattr(instance, 'id') else str(instance)


IGNORE_AUDIT_FIELDS = (
    'fecha_creacion', 'fecha_actualizacion', 'timestamp', 'last_seen',
    'ultima_lectura', 'valor_lectura', 'nivel_actual',
    'volumen_actual', 'porcentaje', 'ultima_actualizacion', 'progreso',
    'latitud', 'longitud'
)

@receiver(pre_save)
def audit_pre_save(sender, instance, **kwargs):
    if sender not in AUDITED_MODELS:
        return

    # Si la instancia ya posee llave primaria, comparamos contra el estado previo en DB
    if instance.pk:
        try:
            original = sender.objects.get(pk=instance.pk)
            cambios = {}
            for field in instance._meta.fields:
                field_name = field.name
                
                # Ignorar únicamente lecturas continuas de telemetría periódica
                if field_name in IGNORE_AUDIT_FIELDS:
                    continue
                
                val_orig = getattr(original, field_name, None)
                val_nuev = getattr(instance, field_name, None)
                
                # Si hubo variación de estado, conexión o atributos, almacenar diff
                if val_orig != val_nuev:
                    cambios[field_name] = {
                        'antes': str(val_orig) if val_orig is not None else '',
                        'despues': str(val_nuev) if val_nuev is not None else ''
                    }
            
            if cambios:
                if not hasattr(_local_diffs, 'pending'):
                    _local_diffs.pending = {}
                _local_diffs.pending[id(instance)] = cambios
        except Exception:
            pass


@receiver(post_save)
def audit_post_save(sender, instance, created, **kwargs):
    # Solo auditar si el modelo está en nuestra lista de interés
    if sender not in AUDITED_MODELS or sender == RegistroAuditoria:
        return

    usuario = get_current_user()
    if usuario and usuario.is_anonymous:
        usuario = None

    accion = 'Creación' if created else 'Modificación'
    modulo = get_modulo_name(instance)
    objeto = get_objeto_representation(instance)
    
    descripcion = f"Creado el registro de {modulo} '{objeto}'" if created else f"Modificado el registro de {modulo} '{objeto}'"
    
    # Recuperar diff de cambios si existiera o ficha completa si es creación
    datos_cambios = None
    if created:
        datos_cambios = {}
        for field in instance._meta.fields:
            field_name = field.name
            if field_name in IGNORE_AUDIT_FIELDS or field_name == 'password':
                continue
            val = getattr(instance, field_name, None)
            if val is not None:
                if hasattr(val, 'id'):
                    datos_cambios[field_name] = str(val.id)
                else:
                    datos_cambios[field_name] = str(val)
    else:
        if hasattr(_local_diffs, 'pending') and id(instance) in _local_diffs.pending:
            datos_cambios = _local_diffs.pending.pop(id(instance))
        else:
            # Si no hay cambios significativos registrados (solo telemetría continua), ignorar
            return

    RegistroAuditoria.objects.create(
        usuario=usuario,
        accion=accion,
        modulo=modulo,
        objeto=objeto,
        descripcion=descripcion,
        datos=datos_cambios,
        ip_origen=get_current_ip()
    )


@receiver(post_delete)
def audit_post_delete(sender, instance, **kwargs):
    if sender not in AUDITED_MODELS:
        return

    usuario = get_current_user()
    if not usuario or usuario.is_anonymous:
        return

    modulo = get_modulo_name(instance)
    objeto = get_objeto_representation(instance)
    descripcion = f"Eliminado el registro de {modulo} '{objeto}'"

    # Capturar ficha de datos del elemento eliminado
    datos_cambios = {}
    for field in instance._meta.fields:
        field_name = field.name
        if field_name in ('fecha_creacion', 'fecha_actualizacion', 'timestamp', 'last_seen', 'password'):
            continue
        val = getattr(instance, field_name, None)
        if val is not None:
            if hasattr(val, 'id'):
                datos_cambios[field_name] = str(val.id)
            else:
                datos_cambios[field_name] = str(val)

    RegistroAuditoria.objects.create(
        usuario=usuario,
        accion='Eliminación',
        modulo=modulo,
        objeto=objeto,
        descripcion=descripcion,
        datos=datos_cambios,
        ip_origen=get_current_ip()
    )


# Registrar también los inicios y cierres de sesión de Django
@receiver(user_logged_in)
def audit_user_logged_in(sender, request, user, **kwargs):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.META.get('REMOTE_ADDR', '127.0.0.1')

    RegistroAuditoria.objects.create(
        usuario=user,
        accion='Inicio de Sesión',
        modulo='Seguridad',
        objeto=user.username,
        descripcion=f"El usuario '{user.username}' inició sesión en el sistema.",
        ip_origen=ip
    )


@receiver(user_logged_out)
def audit_user_logged_out(sender, request, user, **kwargs):
    if not user:
        return
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.META.get('REMOTE_ADDR', '127.0.0.1')

    RegistroAuditoria.objects.create(
        usuario=user,
        accion='Cierre de Sesión',
        modulo='Seguridad',
        objeto=user.username,
        descripcion=f"El usuario '{user.username}' cerró sesión en el sistema.",
        ip_origen=ip
    )


# Registrar los eventos de creación de usuario (Registro)
@receiver(post_save, sender=User)
def audit_user_registration(sender, instance, created, **kwargs):
    if created:
        RegistroAuditoria.objects.create(
            usuario=instance,
            accion='Registro',
            modulo='Seguridad',
            objeto=instance.username,
            descripcion=f"Nuevo usuario registrado en el sistema: '{instance.username}'.",
            ip_origen=get_current_ip()
        )


# Registrar cambio de contraseña de usuario
@receiver(pre_save, sender=User)
def audit_user_password_change(sender, instance, **kwargs):
    if instance.pk:
        try:
            original = User.objects.get(pk=instance.pk)
            if original.password != instance.password:
                # El password ha cambiado
                usuario_actor = get_current_user() or instance
                RegistroAuditoria.objects.create(
                    usuario=usuario_actor,
                    accion='Cambio de Contraseña',
                    modulo='Seguridad',
                    objeto=instance.username,
                    descripcion=f"El usuario '{instance.username}' cambió su contraseña de acceso.",
                    ip_origen=get_current_ip()
                )
        except Exception:
            pass


# Notificaciones WebSocket en tiempo real para cambios en modelos SCADA
def notify_scada_change(model_name):
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                'scada_telemetry',
                {
                    'type': 'scada_update',
                    'data': {'event': 'model_change', 'model': model_name}
                }
            )
    except Exception:
        pass

@receiver(post_save, sender=DispositivoSCADA)
@receiver(post_save, sender=UnidadAlmacenamiento)
@receiver(post_save, sender=Sistema)
@receiver(post_delete, sender=DispositivoSCADA)
@receiver(post_delete, sender=UnidadAlmacenamiento)
@receiver(post_delete, sender=Sistema)
def scada_model_changed(sender, instance, **kwargs):
    notify_scada_change(sender.__name__)
