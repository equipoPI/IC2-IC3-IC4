import os
import subprocess
import json
from django.utils import timezone
from django.shortcuts import render, redirect
from django.http import HttpResponse

# --- Importaciones de Django REST Framework ---
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

# --- Importaciones de Modelos y Serializers ---
# ACÁ AGREGAMOS ORDENPRODUCCION
from .models import Fabrica, OrdenProduccion, Receta, HistorialProduccion, DispositivoSCADA, LecturaSensor
from .serializers import (
    FabricaSerializer,
    OrdenProduccionSerializer, 
    OrdenProduccionListSerializer,
    RecetaSerializer,
    DispositivoSCADASerializer,
    LecturaSensorSerializer,
) 
from rest_framework import viewsets, permissions
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from .permissions import CanManageEmployees, IsAdminUserOrReadOnly, CanAccessSystemConfig
from .models import ConfiguracionMQTT
from .serializers import ConfiguracionMQTTSerializer
from .models import TopicMQTT
from .serializers import TopicMQTTSerializer
from . import models
from . import serializers
from .serializers import (
    SeccionSerializer,
    EmpleadoSerializer,
    InventarioSerializer,
    ItemInventarioSerializer,
    HistorialMovimientosSerializer,
    CronogramaSeccionSerializer,
)


def _clean_topic_segment(val):
    if not val:
        return ""
    return str(val).lower().replace('.', '').replace(' ', '_').replace('-', '_').strip()


def _publish_mqtt_single(topic, payload, client_id_prefix="django-backend"):
    """
    Publica un mensaje MQTT en Mosquitto utilizando autenticación activa si está configurada,
    o credenciales predeterminadas ('admin'/'admin') para Mosquitto con allow_anonymous false.
    Se ejecuta de forma asíncrona en un hilo en segundo plano para evitar bloquear la respuesta HTTP.
    """
    import threading

    def _do_publish():
        try:
            import paho.mqtt.publish as publish
            import time

            config = ConfiguracionMQTT.objects.filter(activo=True).first()
            broker_url = "mosquitto"
            puerto = 1883
            auth = None

            if config:
                if config.broker_url:
                    broker_url = config.broker_url
                if config.puerto:
                    puerto = config.puerto
                if config.usuario and config.password:
                    auth = {'username': config.usuario, 'password': config.password}

            if not auth:
                auth = {'username': 'admin', 'password': 'admin'}

            payload_str = json.dumps(payload) if isinstance(payload, (dict, list)) else str(payload)
            client_id = f"{client_id_prefix}-{int(time.time() * 1000)}"

            kwargs = {
                'topic': topic,
                'payload': payload_str,
                'hostname': broker_url,
                'port': puerto,
                'client_id': client_id
            }
            if auth:
                kwargs['auth'] = auth

            publish.single(**kwargs)
        except Exception as e:
            import logging
            logging.getLogger('scada').error(f"Error publicando mensaje MQTT a {topic}: {e}")

    threading.Thread(target=_do_publish, daemon=True).start()



from .serializers import (
    ProduccionSerializer,
    RegistroMantenimientoSerializer,
    SistemaSerializer,
    PlantillaProduccionSerializer,
    IngredienteAlmacenamientoSerializer,
    MantenimientoProgramadoSerializer,
    UnidadAlmacenamientoSerializer,
    HistorialProduccionSerializerBasic,
    ComunicacionMQTTSerializer,
)
from django.contrib.auth.models import User
from rest_framework import generics
from .serializers import UserSerializer, ProfileSerializer
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_exempt
import logging
from allauth.account.models import EmailConfirmation, EmailAddress
from django.utils import timezone


@api_view(['GET'])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def api_csrf_token(request):
    """Devuelve el token CSRF actual en JSON para que la SPA lo use en headers.

    Esto evita problemas donde la cookie CSRF no es legible desde JS
    (SameSite/Secure) y permite al frontend obtener el token explícitamente.
    """
    token = get_token(request)
    try:
        logger = logging.getLogger('scada.csrf_debug')
        cookie = request.META.get('HTTP_COOKIE', '') or ''
        logger.warning('api_csrf_token called; cookie_len=%d, cookie_sample=%s, origin=%s, host=%s',
                       len(cookie), (cookie[:200] + '...') if len(cookie) > 200 else cookie,
                       request.META.get('HTTP_ORIGIN'), request.get_host())
    except Exception:
        pass
    return JsonResponse({'csrfToken': token})


def redirect_verify_email(request):
    """Redirige requests entrantes al backend hacia la ruta de verificación
    del frontend. Útil cuando el enlace recibido por el usuario apunta al
    backend (p.ej. http://localhost:8000/verify-email?key=...) y queremos
    reenviarlo al SPA en `FRONTEND_URL`.

    Devuelve 302 hacia: {FRONTEND_URL}/verify-email?key=<key>
    """
    key = request.GET.get('key', '')
    from django.conf import settings
    frontend = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    target = f"{frontend.rstrip('/')}/verify-email"
    if key:
        # conservar el parámetro 'key' si existe
        target = f"{target}?key={key}"
    return redirect(target)


class UserViewSet(viewsets.ModelViewSet):
    """Exponer usuarios (solo admins pueden listar/editar)."""
    queryset = User.objects.all().order_by('username')
    serializer_class = UserSerializer
    permission_classes = [IsAdminUser]


class ProfileViewSet(viewsets.ModelViewSet):
    """Exponer profiles (admins o self-view)."""
    queryset = models.Profile.objects.all().order_by('-created_at')
    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]


class RegisterAPIView(generics.CreateAPIView):
    """Endpoint público para registrar cuentas. Crea usuario inactivo.

    POST payload: `username`, `email`, `password`, `first_name`, `last_name`
    """
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        user = serializer.save()
        # Profile se crea automáticamente por la señal post_save
        # Aquí podríamos enviar email de confirmación (pendiente SMTP)
        return user


class ConfiguracionMQTTViewSet(viewsets.ModelViewSet):
    """CRUD para configuraciones MQTT"""
    queryset = ConfiguracionMQTT.objects.all().order_by('-id')
    serializer_class = ConfiguracionMQTTSerializer
    permission_classes = [IsAuthenticated]


from rest_framework.permissions import IsAdminUser, IsAuthenticated, IsAuthenticatedOrReadOnly

class DispositivoSCADAViewSet(viewsets.ModelViewSet):
    """CRUD para dispositivos SCADA"""
    queryset = DispositivoSCADA.objects.select_related('seccion', 'sistema', 'inventario').all().order_by('numero_serie')
    serializer_class = DispositivoSCADASerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def perform_destroy(self, instance):
        # Limpiar lecturas y registros vinculados para evitar IntegrityError por Foreign Key
        instance.lecturas.all().delete()
        instance.variables_vinculadas.all().delete()
        models.ComunicacionMQTT.objects.filter(dispositivo=instance.numero_serie).delete()
        instance.delete()

    def _get_dispositivo(self, pk):
        if not pk:
            return DispositivoSCADA.objects.first()
        if str(pk).isdigit():
            d = DispositivoSCADA.objects.filter(pk=int(pk)).first()
            if d:
                return d
        d = DispositivoSCADA.objects.filter(numero_serie=str(pk)).first()
        if d:
            return d
        d = DispositivoSCADA.objects.filter(nombre__iexact=str(pk)).first()
        if d:
            return d
        return DispositivoSCADA.objects.first()

    @action(detail=True, methods=['post'])
    def control(self, request, pk=None):
        dispositivo = self._get_dispositivo(pk)
        if not dispositivo:
            return Response({'error': f'Dispositivo no encontrado (ID/Serie: {pk})'}, status=status.HTTP_404_NOT_FOUND)

        comando = request.data.get('comando') or request.data.get('accion') # 'abrir', 'cerrar', 'CONTINUAR', 'REANUDAR', 'PARAR', 'PAUSAR', 'DETENER', 'DESECHAR', 'DESCARTAR', 'VACIAR'
        
        if not comando:
            return Response({'error': 'Comando/Acción no especificada'}, status=status.HTTP_400_BAD_REQUEST)
            
        comando_upper = str(comando).upper()
        
        # Mapeo para dispositivos simples o actuadores generales
        valor_mqtt = "0"
        if comando_upper in ['ABRIR', 'INICIAR', 'CONTINUAR', 'REANUDAR']:
            valor_mqtt = "1"
        elif comando_upper in ['CERRAR', 'DETENER', 'PARAR', 'PAUSAR']:
            valor_mqtt = "0"
        elif comando_upper in ['DESECHAR', 'DESCARTAR']:
            valor_mqtt = "X"
        elif comando_upper in ['VACIAR']:
            valor_mqtt = "V"
        else:
            valor_mqtt = str(comando)

        raw_tenant = "rafaela_sa"
        if dispositivo.seccion and dispositivo.seccion.fabrica:
            raw_tenant = dispositivo.seccion.fabrica.nombre

        tenant = _clean_topic_segment(raw_tenant) or "rafaela_sa"
        seccion_slug = _clean_topic_segment(dispositivo.seccion.nombre if dispositivo.seccion else "a1") or "a1"
        sistema_slug = _clean_topic_segment(dispositivo.sistema.nombre if dispositivo.sistema else "linea_mezclado_1") or "linea_mezclado_1"
        gateway = _clean_topic_segment(dispositivo.gateway_id or 'd83add60dbb0') or 'd83add60dbb0'

        # Determinar acción canónica y tópico objetivo
        accion_path = _clean_topic_segment(comando_upper)
        if comando_upper in ['ABRIR', 'INICIAR', 'CONTINUAR', 'REANUDAR']:
            accion_path = "reanudar"
            payload_dict = {}
        elif comando_upper in ['CERRAR', 'DETENER', 'PARAR', 'PAUSAR']:
            accion_path = "detener"
            payload_dict = {}
        elif comando_upper in ['DESECHAR', 'DESCARTAR']:
            accion_path = "desechar"
            payload_dict = {}
        elif comando_upper in ['VACIAR']:
            accion_path = "vaciar"
            payload_dict = {}
        elif comando_upper in ['MEZCLA']:
            accion_path = "mezcla"
            params = request.data.get('parametros', {})
            payload_dict = {
                "liquido_1": int(params.get('liquido_1', 50)),
                "liquido_2": int(params.get('liquido_2', 30)),
                "hora": int(params.get('hora', 0)),
                "minuto": int(params.get('minuto', 15))
            }
        else:
            payload_dict = request.data.get('parametros', {})

        topic_target = f"{tenant}/{gateway}/{seccion_slug}/{sistema_slug}/{accion_path}"

        try:
            # Publicar el comando específico en el broker MQTT
            _publish_mqtt_single(topic_target, payload_dict, f"django-backend-cmd-{dispositivo.pk}")
            
            models.RegistroAuditoria.objects.create(
                usuario=request.user if request.user and request.user.is_authenticated else None,
                accion='CONTROL_MANUAL',
                modulo='SCADA',
                objeto=dispositivo.numero_serie,
                descripcion=f"Enviado comando '{accion_path}' (Topic: {topic_target}) a dispositivo {dispositivo.nombre}",
                ip_origen=request.META.get('REMOTE_ADDR') or '127.0.0.1'
            )
            
            return Response({
                'status': 'Comando enviado exitosamente',
                'topic': topic_target,
                'accion': accion_path,
                'payload': payload_dict
            })
        except Exception as e:
            return Response({'error': f'Error al publicar en MQTT: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def reposicion(self, request, pk=None):
        dispositivo = self._get_dispositivo(pk)
        if not dispositivo:
            return Response({'error': f'Dispositivo no encontrado (ID/Serie: {pk})'}, status=status.HTTP_404_NOT_FOUND)
        bombo = request.data.get('bombo', 1)
        limite_porcentaje = request.data.get('limite_porcentaje', request.data.get('limite', 80))
        freno = request.data.get('freno', False)

        raw_tenant = "rafaela_sa"
        if dispositivo.seccion and dispositivo.seccion.fabrica:
            raw_tenant = dispositivo.seccion.fabrica.nombre

        tenant = _clean_topic_segment(raw_tenant) or "rafaela_sa"
        seccion_slug = _clean_topic_segment(dispositivo.seccion.nombre if dispositivo.seccion else "a1") or "a1"
        sistema_slug = _clean_topic_segment(dispositivo.sistema.nombre if dispositivo.sistema else "linea_mezclado_1") or "linea_mezclado_1"
        gateway = _clean_topic_segment(dispositivo.gateway_id or 'd83add60dbb0') or 'd83add60dbb0'

        if freno:
            accion_str = "freno_reposicion"
            topic_target = f"{tenant}/{gateway}/{seccion_slug}/{sistema_slug}/freno_reposicion"
            payload_dict = {}
        else:
            accion_str = "reposicion"
            topic_target = f"{tenant}/{gateway}/{seccion_slug}/{sistema_slug}/reposicion"
            payload_dict = {
                "bombo": int(bombo),
                "limite_porcentaje": int(limite_porcentaje)
            }

        try:
            # Publicar únicamente en el tópico objetivo directo
            _publish_mqtt_single(topic_target, payload_dict, f"django-backend-reposicion-{dispositivo.pk}")

            models.RegistroAuditoria.objects.create(
                usuario=request.user if request.user and request.user.is_authenticated else None,
                accion='CONTROL_REPOSICION',
                modulo='SCADA',
                objeto=dispositivo.numero_serie,
                descripcion=f"Acción '{accion_str}' enviada a {dispositivo.nombre} (Topic: {topic_target})",
                ip_origen=request.META.get('REMOTE_ADDR') or '127.0.0.1'
            )

            return Response({
                'status': 'Instrucción enviada exitosamente',
                'topic': topic_target,
                'accion': accion_str,
                'payload': payload_dict
            })
        except Exception as e:
            return Response({'error': f'Error al publicar orden de reposición MQTT: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)




class LecturaSensorViewSet(viewsets.ModelViewSet):
    """CRUD para lecturas de sensores con filtros temporales y de límite"""
    serializer_class = LecturaSensorSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        dispositivo_param = self.request.query_params.get('dispositivo') or self.request.query_params.get('dispositivo_id')
        dispositivo_serie = self.request.query_params.get('dispositivo_serie')
        fecha_desde = self.request.query_params.get('fecha_desde')
        fecha_hasta = self.request.query_params.get('fecha_hasta')
        limit = self.request.query_params.get('limit')
        modo = self.request.query_params.get('modo')

        queryset = LecturaSensor.objects.select_related('dispositivo').all()

        if dispositivo_param:
            if str(dispositivo_param).isdigit():
                queryset = queryset.filter(dispositivo_id=int(dispositivo_param))
            else:
                queryset = queryset.filter(dispositivo__numero_serie=dispositivo_param)
        elif dispositivo_serie:
            queryset = queryset.filter(dispositivo__numero_serie=dispositivo_serie)

        if fecha_desde:
            try:
                from django.utils.dateparse import parse_datetime
                dt_desde = parse_datetime(fecha_desde)
                if dt_desde:
                    queryset = queryset.filter(timestamp__gte=dt_desde)
                else:
                    queryset = queryset.filter(timestamp__gte=fecha_desde)
            except Exception:
                pass

        if fecha_hasta:
            try:
                from django.utils.dateparse import parse_datetime
                dt_hasta = parse_datetime(fecha_hasta)
                if dt_hasta:
                    queryset = queryset.filter(timestamp__lte=dt_hasta)
                else:
                    queryset = queryset.filter(timestamp__lte=fecha_hasta)
            except Exception:
                pass

        # Modo Histórico: ordenar por timestamp ASC (de pasado a presente) y devolver hasta 1000 lecturas bien distribuidas
        if fecha_desde or fecha_hasta or modo == 'historico':
            queryset = queryset.order_by('timestamp')
            total_count = queryset.count()
            if total_count > 1000:
                step = max(1, total_count // 1000)
                all_ids = list(queryset.order_by('timestamp').values_list('id', flat=True))
                sampled_ids = all_ids[::step]
                queryset = LecturaSensor.objects.filter(pk__in=sampled_ids).select_related('dispositivo').order_by('timestamp')
        else:
            # Modo Tiempo Real (live): ordenar por timestamp DESC (más recientes)
            recent_ids = list(queryset.order_by('-timestamp').values_list('id', flat=True)[:300])
            queryset = LecturaSensor.objects.filter(pk__in=recent_ids).select_related('dispositivo').order_by('timestamp')

        return queryset

    def list(self, request, *args, **kwargs):
        from rest_framework.response import Response
        qs = self.filter_queryset(self.get_queryset())
        readings = list(qs.values('id', 'dispositivo_id', 'timestamp', 'valor', 'unidad', 'calidad'))
        for r in readings:
            r['dispositivo'] = r.pop('dispositivo_id')
            if r['timestamp']:
                r['timestamp'] = r['timestamp'].isoformat()
        return Response(readings)


class TopicMQTTViewSet(viewsets.ModelViewSet):
    """CRUD para topics MQTT"""
    queryset = TopicMQTT.objects.all().order_by('id')
    serializer_class = TopicMQTTSerializer
    permission_classes = [IsAuthenticated]


class MetricaConfiguracionViewSet(viewsets.ModelViewSet):
    """CRUD para la configuración conceptual de métricas"""
    queryset = models.MetricaConfiguracion.objects.all().order_by('nombre')
    serializer_class = serializers.MetricaConfiguracionSerializer
    permission_classes = [IsAuthenticated]


class VariableVinculadaViewSet(viewsets.ModelViewSet):
    """CRUD para asociar métricas a sensores reales por planta"""
    serializer_class = serializers.VariableVinculadaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = models.VariableVinculada.objects.all().order_by('id')
        fabrica_id = self.request.query_params.get('fabrica')
        if fabrica_id:
            queryset = queryset.filter(fabrica_id=fabrica_id)
        return queryset

# =============================================================================
# Vistas tradicionales
# =============================================================================
def index(request):
    return HttpResponse("Hello, world. You're at the polls index.")


@api_view(['GET'])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def api_csrf(request):
    """Endpoint simple para poner la cookie CSRF (GET).

    Útil para SPAs que necesitan que el proxy (`/api`) solicite primero
    este endpoint y así obtener la cookie `csrftoken` del backend.
    """
    try:
        logger = logging.getLogger('scada.csrf_debug')
        cookie = request.META.get('HTTP_COOKIE', '') or ''
        logger.warning('api_csrf called; cookie_len=%d, cookie_sample=%s, origin=%s, host=%s, remote_addr=%s',
                       len(cookie), (cookie[:200] + '...') if len(cookie) > 200 else cookie,
                       request.META.get('HTTP_ORIGIN'), request.get_host(), request.META.get('REMOTE_ADDR'))
    except Exception:
        pass
    return JsonResponse({'ok': True})



@csrf_exempt
def verify_email_get(request):
    """Confirmar email vía GET con parámetro `key`.

    Útil como fallback cuando la verificación por POST falla por CSRF
    en SPAs de desarrollo. Devuelve 200 {'detail':'ok'} o 404.
    """
    key = request.GET.get('key')
    if not key:
        return JsonResponse({'detail': 'No encontrado.'}, status=404)
    # Usar la utilidad `from_key` de allauth; algunos entornos o versiones
    # pueden devolver None si el formato no coincide exactamente. Añadimos
    # un fallback directo por `key` para mayor robustez en el entorno dev.
    conf = EmailConfirmation.from_key(key)
    if conf is None:
        try:
            conf = EmailConfirmation.objects.filter(key=key).first()
        except Exception:
            conf = None
    if not conf:
        return JsonResponse({'detail': 'No encontrado.'}, status=404)
    try:
        # Algunos objetos EmailConfirmation creados por pruebas no tienen
        # el campo `sent` inicializado; Confirm requiere `sent` no-null.
        if getattr(conf, 'sent', None) is None:
            conf.sent = timezone.now()
            conf.save()
        conf.confirm(request)
        return JsonResponse({'detail': 'ok'})
    except Exception as e:
        return JsonResponse({'detail': str(e)}, status=500)


# =============================================================================
# Vistas de la API - MÓDULO DE FÁBRICAS
# =============================================================================
class FabricaViewSet(viewsets.ModelViewSet):
    """CRUD para Fabricas/Plantas"""
    queryset = Fabrica.objects.all()
    serializer_class = FabricaSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]


class OrdenProduccionViewSet(viewsets.ModelViewSet):
    """CRUD para Ordenes de Producción. Usa serializer completo en list."""
    queryset = OrdenProduccion.objects.select_related('fabrica', 'sistema', 'dispositivo', 'receta', 'creado_por').all().order_by('-fecha_creacion')
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_serializer_class(self):
        if self.action == 'list':
            return OrdenProduccionListSerializer
        return OrdenProduccionSerializer


# -----------------------------------------------------------------------------
# ViewSets adicionales: Exponer manualmente los modelos restantes para CRUD
# Permisos: `IsAuthenticatedOrReadOnly` permite desarrollo SPA sin login
# pero protege cambios cuando se requiera cambiar por `IsAdminUser`.
# -----------------------------------------------------------------------------


class SeccionViewSet(viewsets.ModelViewSet):
    queryset = models.Seccion.objects.select_related('fabrica').all().order_by('nombre')
    serializer_class = SeccionSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def perform_destroy(self, instance):
        models.DispositivoSCADA.objects.filter(seccion=instance).update(seccion=None)
        instance.delete()


class EmpleadoViewSet(viewsets.ModelViewSet):
    queryset = models.Empleado.objects.all().order_by('apellido')
    serializer_class = EmpleadoSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    
    def list(self, request, *args, **kwargs):
        """Listar empleados: combinar registros de `Empleado` con usuarios activos
        que tengan `Profile` cuando no exista una fila `Empleado` asociada.

        Esto permite que usuarios que se registraron en el sistema aparezcan
        en la UI aunque aún no tengan un `Empleado` creado en la base de datos.
        """
        # Serializar empleados existentes
        empleados_qs = models.Empleado.objects.select_related('user', 'seccion', 'fabrica').all().order_by('apellido')
        serialized = EmpleadoSerializer(empleados_qs, many=True, context={'request': request}).data

        # Recolectar documentos existentes para evitar duplicados
        existing_docs = set(emp.get('documento') for emp in serialized if emp.get('documento'))

        # Opcional: incluir usuarios activos sin Empleado si se pasa ?include_users=1
        include_users = str(request.query_params.get('include_users', '')).lower() in ['1', 'true', 'yes']
        if include_users:
            usuarios = User.objects.filter(is_active=True).exclude(profile__isnull=True)
            for u in usuarios:
                # Evitar incluir usuarios cuyo username o email ya figura como documento
                if str(u.username) in existing_docs or (u.email and u.email in existing_docs):
                    continue
                perfil = getattr(u, 'profile', None)
                if perfil is None:
                    continue
                # Construir representación compatible con el serializer frontend
                usuario_entry = {
                    'documento': u.username,
                    'nombre': u.first_name or u.username,
                    'apellido': u.last_name or '',
                    'seccion': None,
                    'seccion_nombre': '',
                    'fabrica': None,
                    'fabrica_nombre': '',
                    'rango': None,
                    'rol': perfil.get_role_display() if hasattr(perfil, 'get_role_display') else (perfil.role if perfil and perfil.role else 'Empleado'),
                    'fecha_contratacion': None,
                    'contacto': perfil.telefono if getattr(perfil, 'telefono', None) else '',
                    'direccion': '',
                    'email': u.email or '',
                    'estado': 'ACTIVO' if u.is_active else 'OTRO',
                    # Defaulting role to match previous behavior; frontend will read `rango` when available.
                    # `tipo_empleado` eliminado: no incluir clave en payload
                }
                serialized.append(usuario_entry)

        # Rellenar email en empleados existentes mediante búsqueda por lote en User
        docs_to_lookup = [emp.get('documento') for emp in serialized if emp.get('documento') and not emp.get('email')]
        if docs_to_lookup:
            users_qs = User.objects.filter(models.Q(username__in=docs_to_lookup) | models.Q(email__in=docs_to_lookup))
            email_map = {}
            for u in users_qs:
                if u.username:
                    email_map[u.username] = u.email or ''
                if u.email:
                    email_map[u.email] = u.email or ''
            for emp in serialized:
                if not emp.get('email') and emp.get('documento') in email_map:
                    emp['email'] = email_map[emp['documento']]

        return Response(serialized)

    def destroy(self, request, *args, **kwargs):
        """Al borrar un Empleado, también eliminar su User y EmailAddress.

        Esto hace que la cuenta quede totalmente removida y obligue a
        recrear todo el proceso de registro si se desea volver a ingresar.
        """
        instancia = self.get_object()
        usuario = instancia.user
        # Borrar la instancia Empleado primero
        self.perform_destroy(instancia)

        # Si había un usuario asociado, eliminarlo y sus emails
        if usuario:
            try:
                # Eliminar registros de EmailAddress explícitamente por seguridad
                EmailAddress.objects.filter(user=usuario).delete()
            except Exception:
                pass
            try:
                usuario.delete()
            except Exception:
                pass

        return Response(status=status.HTTP_204_NO_CONTENT)


class InventarioViewSet(viewsets.ModelViewSet):
    queryset = models.Inventario.objects.all().order_by('id')
    serializer_class = InventarioSerializer
    permission_classes = [IsAuthenticated]


class ItemInventarioViewSet(viewsets.ModelViewSet):
    queryset = models.ItemInventario.objects.all().order_by('numero_serie')
    serializer_class = ItemInventarioSerializer
    permission_classes = [IsAuthenticated]


class HistorialMovimientosViewSet(viewsets.ModelViewSet):
    queryset = models.HistorialMovimientos.objects.all().order_by('-fecha_hora')
    serializer_class = HistorialMovimientosSerializer
    permission_classes = [IsAuthenticated]


class CronogramaSeccionViewSet(viewsets.ModelViewSet):
    queryset = models.CronogramaSeccion.objects.all().order_by('fecha_inicio')
    serializer_class = CronogramaSeccionSerializer
    permission_classes = [IsAuthenticated]


class ProduccionViewSet(viewsets.ModelViewSet):
    queryset = models.Produccion.objects.all().order_by('-fecha_inicio')
    serializer_class = ProduccionSerializer
    permission_classes = [IsAuthenticated]


class RegistroMantenimientoViewSet(viewsets.ModelViewSet):
    queryset = models.RegistroMantenimiento.objects.all().order_by('-fecha_inicio')
    serializer_class = RegistroMantenimientoSerializer
    permission_classes = [IsAuthenticated]


from rest_framework.pagination import PageNumberPagination

class AuditoriaPageNumberPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100

class RegistroAuditoriaViewSet(viewsets.ModelViewSet):
    """ViewSet para registros de auditoría: creación por usuarios autenticados
    y lectura por administradores.
    """
    serializer_class = serializers.RegistroAuditoriaSerializer
    pagination_class = AuditoriaPageNumberPagination
    search_fields = ['accion', 'modulo', 'descripcion', 'ip_origen', 'usuario__username']
    filterset_fields = ['modulo', 'accion']
    ordering_fields = ['timestamp', 'modulo', 'accion', 'usuario__username']

    def get_queryset(self):
        queryset = models.RegistroAuditoria.objects.all().order_by('-timestamp')
        fecha_desde = self.request.query_params.get('fecha_desde')
        fecha_hasta = self.request.query_params.get('fecha_hasta')
        if fecha_desde:
            queryset = queryset.filter(timestamp__gte=fecha_desde)
        if fecha_hasta:
            queryset = queryset.filter(timestamp__lte=fecha_hasta)
            
        # Filtros de módulo y acción manuales
        modulo = self.request.query_params.get('modulo')
        accion = self.request.query_params.get('accion')
        if modulo:
            queryset = queryset.filter(modulo=modulo)
        if accion:
            queryset = queryset.filter(accion=accion)
            
        return queryset
    
    def get_permissions(self):
        from rest_framework.permissions import IsAdminUser
        # Crear: cualquier usuario autenticado puede reportar una acción.
        if self.action in ['create']:
            return [IsAuthenticated()]
        # List/retrieve: solo administradores
        return [IsAdminUser()]


class SistemaViewSet(viewsets.ModelViewSet):
    serializer_class = SistemaSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        queryset = models.Sistema.objects.select_related('fabrica').all().order_by('nombre')
        fabrica_id = self.request.query_params.get('fabrica') or self.request.query_params.get('fabrica_id')
        if fabrica_id and fabrica_id != 'todos':
            try:
                queryset = queryset.filter(fabrica_id=int(fabrica_id))
            except ValueError:
                pass
        return queryset

    @action(detail=True, methods=['post'])
    def control(self, request, pk=None):
        sistema = self.get_object()
        comando = request.data.get('comando') or request.data.get('accion') # 'INICIAR', 'PAUSAR', 'REANUDAR', 'PARAR', 'VACIAR', 'DESCARTAR'
        if not comando:
            return Response({'error': 'Comando/Acción no especificada'}, status=status.HTTP_400_BAD_REQUEST)
        
        comando_upper = str(comando).upper()
        raw_tenant = "rafaela_sa"
        gateway = "d83add60dbb0"
        seccion_slug = "seccion"
        sistema_slug = _clean_topic_segment(sistema.nombre) or "linea_mezclado_1"

        if sistema.seccion:
            seccion_slug = _clean_topic_segment(sistema.seccion.nombre) or "seccion"
            if sistema.seccion.fabrica:
                raw_tenant = sistema.seccion.fabrica.nombre
        elif sistema.fabrica:
            raw_tenant = sistema.fabrica.nombre

        tenant = _clean_topic_segment(raw_tenant) or "rafaela_sa"
        topic_action = f"{tenant}/{gateway}/{seccion_slug}/{sistema_slug}/accion"

        payload = {
            'accion': comando_upper,
            'comando': comando_upper,
            'sistema_id': sistema.id,
            'sistema': sistema.nombre,
            'timestamp': str(timezone.now())
        }

        try:
            _publish_mqtt_single(topic_action, payload, f"django-backend-sistema-{sistema.id}")
            models.RegistroAuditoria.objects.create(
                usuario=request.user if request.user.is_authenticated else None,
                accion=f"CONTROL_SISTEMA_{comando_upper}",
                modulo="SCADA",
                objeto=sistema.nombre,
                descripcion=f"Enviada acción '{comando_upper}' al sistema {sistema.nombre} vía MQTT topic {topic_action}",
                ip_origen=request.META.get('REMOTE_ADDR') or '127.0.0.1'
            )
            return Response({
                'status': 'Comando publicado exitosamente',
                'comando': comando_upper,
                'sistema': sistema.nombre,
                'topic': topic_action
            })
        except Exception as e:
            return Response({'error': f'Error publicando comando MQTT: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PlantillaProduccionViewSet(viewsets.ModelViewSet):
    queryset = models.PlantillaProduccion.objects.all().order_by('-fecha_creacion')
    serializer_class = PlantillaProduccionSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['post'])
    def ejecutar(self, request, pk=None):
        plantilla = self.get_object()
        sistema_id = request.data.get('sistema_id')
        
        tenant = "scada"
        gateway = "gw1"
        seccion_slug = "produccion"
        sistema_slug = "mezclador_1"

        if sistema_id:
            try:
                sistema_obj = models.Sistema.objects.get(id=sistema_id)
                sistema_slug = sistema_obj.nombre.lower().replace(' ', '_')
                if sistema_obj.seccion:
                    seccion_slug = sistema_obj.seccion.nombre.lower().replace(' ', '_')
                    if sistema_obj.seccion.fabrica:
                        tenant = sistema_obj.seccion.fabrica.nombre.lower().replace(' ', '_')
            except models.Sistema.DoesNotExist:
                pass

        topic_action = f"scada/{tenant}/{gateway}/{seccion_slug}/{sistema_slug}/accion"
        
        payload_mezcla = {
            'accion': 'MEZCLA',
            'plantilla': plantilla.nombre,
            'tipo': plantilla.tipo,
            'hora': plantilla.tiempo_horas,
            'minuto': plantilla.tiempo_minutos,
            'ingredientes': plantilla.ingredientes_json,
            'timestamp': str(timezone.now())
        }
        
        payload_inicio = {
            'accion': 'CONTINUAR',
            'plantilla': plantilla.nombre,
            'timestamp': str(timezone.now())
        }

        try:
            _publish_mqtt_single(topic_action, payload_mezcla, "django-backend-plantilla-mezcla")
            _publish_mqtt_single(topic_action, payload_inicio, "django-backend-plantilla-inicio")
            
            historial = models.HistorialProduccion.objects.create(
                codigo_lote=f"LOTE-{int(timezone.now().timestamp())}",
                fecha_inicio=timezone.now(),
                receta_base=plantilla.receta_base,
                estado='EN_PROCESO',
                cantidad_producida=0.0
            )

            models.RegistroAuditoria.objects.create(
                usuario=request.user,
                accion='EJECUCION_PLANTILLA',
                modulo='PRODUCCION',
                objeto=plantilla.nombre,
                descripcion=f"Ejecutada plantilla '{plantilla.nombre}' ({plantilla.tipo}) en sistema {sistema_slug}",
                ip_origen=request.META.get('REMOTE_ADDR') or '127.0.0.1'
            )

            return Response({
                'status': 'Plantilla ejecutada e iniciada exitosamente',
                'plantilla': plantilla.nombre,
                'lote': historial.codigo_lote,
                'topic': topic_action
            })
        except Exception as e:
            return Response({'error': f'Error publicando comando de plantilla en MQTT: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class IngredienteAlmacenamientoViewSet(viewsets.ModelViewSet):
    queryset = models.IngredienteAlmacenamiento.objects.select_related('unidad_almacenamiento').all().order_by('nombre')
    serializer_class = IngredienteAlmacenamientoSerializer
    permission_classes = [IsAuthenticated]


class MantenimientoProgramadoViewSet(viewsets.ModelViewSet):
    queryset = models.MantenimientoProgramado.objects.select_related('dispositivo', 'sistema', 'creado_por').all().order_by('fecha_inicio')
    serializer_class = MantenimientoProgramadoSerializer
    permission_classes = [IsAuthenticated]


class UnidadAlmacenamientoViewSet(viewsets.ModelViewSet):
    queryset = models.UnidadAlmacenamiento.objects.select_related('inventario', 'seccion', 'sistema', 'dispositivo_sensor').all().order_by('nombre')
    serializer_class = UnidadAlmacenamientoSerializer
    permission_classes = [AllowAny]

    def perform_destroy(self, instance):
        models.IngredienteAlmacenamiento.objects.filter(unidad_almacenamiento=instance).update(unidad_almacenamiento=None)
        instance.delete()


class HistorialProduccionViewSet(viewsets.ModelViewSet):
    queryset = models.HistorialProduccion.objects.all().order_by('-fecha_registro')
    serializer_class = HistorialProduccionSerializerBasic
    permission_classes = [IsAuthenticated]


class ComunicacionMQTTViewSet(viewsets.ModelViewSet):
    queryset = models.ComunicacionMQTT.objects.all().order_by('-timestamp')
    serializer_class = ComunicacionMQTTSerializer
    permission_classes = [AllowAny]

    def perform_create(self, serializer):
        config_default = models.ConfiguracionMQTT.objects.filter(activo=True).first() or models.ConfiguracionMQTT.objects.first()
        if config_default and ('configuracion' not in serializer.validated_data or not serializer.validated_data.get('configuracion')):
            instance = serializer.save(configuracion=config_default)
        else:
            instance = serializer.save()

        if instance.topic and instance.payload:
            _publish_mqtt_single(
                instance.topic,
                instance.payload,
                client_id_prefix=f"django-cmd-{instance.pk}"
            )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def api_root(request, format=None):
    """API root seguro.

    Por seguridad en entornos no confiables, este endpoint solo acepta GET
    y requiere autenticación. Para desarrollo local se puede relajar, pero
    no debe dejarse público en entornos accesibles.
    """
    # Construimos manualmente un índice enriquecido (nombre => {url, description})
    base = request.build_absolute_uri('/')
    return Response({
        'fabricas': {
            'url': base + 'api/v1/fabricas/',
            'description': 'CRUD de fábricas/plantas',
        },
        'secciones': {
            'url': base + 'api/v1/secciones/',
            'description': 'Secciones dentro de una fábrica',
        },
        'empleados': {
            'url': base + 'api/v1/empleados/',
            'description': 'Gestión de empleados',
        },
        'dispositivos': {
            'url': base + 'api/v1/dispositivos/',
            'description': 'Dispositivos SCADA registrados',
        },
        'lecturas': {
            'url': base + 'api/v1/lecturas/',
            'description': 'Lecturas de sensores (time series)',
        },
        'configuraciones_mqtt': {
            'url': base + 'api/v1/configuraciones-mqtt/',
            'description': 'Credenciales y prefijos MQTT',
        },
        'mqtt_topics': {
            'url': base + 'api/v1/mqtt-topics/',
            'description': 'Listado y reglas para topics MQTT',
        },
        'ordenes': {
            'url': base + 'api/v1/ordenes/',
            'description': 'Órdenes de producción (CRUD)',
        },
        'recetas': {
            'url': base + 'api/v1/recetas/',
            'description': 'Recetas y fórmulas de producción',
        },
        'producciones': {
            'url': base + 'api/v1/producciones/',
            'description': 'Registros de producción',
        },
        'inventarios': {
            'url': base + 'api/v1/inventarios/',
            'description': 'Inventarios por almacén',
        },
        'items_inventario': {
            'url': base + 'api/v1/items-inventario/',
            'description': 'Items individuales en inventario',
        },
        'movimientos': {
            'url': base + 'api/v1/movimientos/',
            'description': 'Movimientos de stock',
        },
        'cronogramas': {
            'url': base + 'api/v1/cronogramas/',
            'description': 'Cronogramas por sección',
        },
        'registros_mantenimiento': {
            'url': base + 'api/v1/registros-mantenimiento/',
            'description': 'Historial de mantenimiento',
        },
        'sistemas': {
            'url': base + 'api/v1/sistemas/',
            'description': 'Sistemas y subsistemas gestionados',
        },
        'plantillas': {
            'url': base + 'api/v1/plantillas/',
            'description': 'Plantillas de producción',
        },
        'ingredientes': {
            'url': base + 'api/v1/ingredientes/',
            'description': 'Ingredientes y materias primas',
        },
        'mantenimientos_programados': {
            'url': base + 'api/v1/mantenimientos-programados/',
            'description': 'Tareas de mantenimiento programadas',
        },
        'unidades_almacenamiento': {
            'url': base + 'api/v1/unidades-almacenamiento/',
            'description': 'Unidades físicas de almacenamiento',
        },
        'historial_produccion': {
            'url': base + 'api/v1/historial-produccion/',
            'description': 'Historial agregado de producción',
        },
        'comunicaciones_mqtt': {
            'url': base + 'api/v1/comunicaciones-mqtt/',
            'description': 'Mensajes y eventos MQTT registrados',
        },
        # Auth endpoints (dj-rest-auth / allauth)
        'auth_login': {
            'url': base + 'api/v1/auth/login/',
            'description': 'Inicio de sesión (email + password)',
        },
        'auth_logout': {
            'url': base + 'api/v1/auth/logout/',
            'description': 'Cerrar sesión (token/session)',
        },
        'auth_user': {
            'url': base + 'api/v1/auth/user/',
            'description': 'Detalle del usuario autenticado',
        },
        'auth_registration': {
            'url': base + 'api/v1/auth/registration/',
            'description': 'Registro de usuario y solicitud de verificación',
        },
        'auth_verify_email': {
            'url': base + 'api/v1/auth/registration/verify-email/',
            'description': 'Verificación de email (POST con key)',
        },
        'auth_password_reset': {
            'url': base + 'api/v1/auth/password/reset/',
            'description': 'Solicitud de reseteo de contraseña (envía email)',
        },
        'auth_password_reset_confirm': {
            'url': base + 'api/v1/auth/password/reset/confirm/',
            'description': 'Confirmación de reseteo (token + new password)',
        },
        'alarmas': {
            'url': base + 'api/v1/alarmas/',
            'description': 'Lista y gestión de alarmas industriales del SCADA',
        },
    })


class MapeoAccionMQTTViewSet(viewsets.ModelViewSet):
    queryset = models.MapeoAccionMQTT.objects.select_related('sistema').all().order_by('categoria_panel', 'nombre')
    serializer_class = serializers.MapeoAccionMQTTSerializer
    permission_classes = [AllowAny]
    filterset_fields = ['sistema', 'tipo_sistema', 'tipo_control', 'categoria_panel', 'activo']
    search_fields = ['nombre', 'nombre_accion', 'plantilla_topico']


class AlarmaViewSet(viewsets.ModelViewSet):
    queryset = models.Alarma.objects.all().order_by('-fecha_hora')
    serializer_class = serializers.AlarmaSerializer
    filterset_fields = ['planta', 'seccion', 'estado', 'severidad']
    search_fields = ['descripcion', 'sensor_maquina']


class RegistrationConfigViewSet(viewsets.ModelViewSet):
    """Gestión de claves de registro (solo para administradores)."""
    queryset = models.RegistrationConfig.objects.all().order_by('-actualizado_en')
    serializer_class = serializers.RegistrationConfigSerializer
    permission_classes = [CanAccessSystemConfig]

    def perform_destroy(self, instance):
        if instance.activo:
            active_count = models.RegistrationConfig.objects.filter(activo=True).count()
            if active_count <= 1:
                raise serializers.ValidationError({"detail": "No se puede eliminar la única clave de registro activa del sistema."})
        instance.delete()


class MqttUserViewSet(viewsets.ViewSet):
    """Gestión administrativa de usuarios/credenciales del broker Mosquitto."""
    permission_classes = [CanAccessSystemConfig]
    PASSWD_FILE = "/mosquitto/config/passwd"

    def _get_passwd_file_path(self):
        if os.path.exists(self.PASSWD_FILE):
            return self.PASSWD_FILE
        base_dir = getattr(settings, 'BASE_DIR', None)
        if base_dir:
            local_path = os.path.join(os.path.dirname(base_dir), 'mosquitto', 'config', 'passwd')
            if os.path.exists(local_path):
                return local_path
        return self.PASSWD_FILE

    def list(self, request):
        path = self._get_passwd_file_path()
        users = []
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and ':' in line:
                            username = line.split(':')[0]
                            users.append({'username': username})
            except Exception as e:
                return Response({'detail': f'Error leyendo usuarios Mosquitto: {e}'}, status=500)
        return Response(users)

    def create(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '').strip()
        if not username or not password:
            return Response({'detail': 'Usuario y contraseña son requeridos.'}, status=400)
        
        path = self._get_passwd_file_path()
        try:
            res = subprocess.run(
                ["docker", "exec", "scada_mqtt_broker", "mosquitto_passwd", "-b", "/mosquitto/config/passwd", username, password],
                capture_output=True, text=True
            )
            if res.returncode != 0:
                res_alt = subprocess.run(["mosquitto_passwd", "-b", path, username, password], capture_output=True, text=True)
                if res_alt.returncode != 0:
                    return Response({'detail': f'Error ejecutando mosquitto_passwd: {res.stderr or res_alt.stderr}'}, status=500)
            
            subprocess.run(["docker", "exec", "scada_mqtt_broker", "pkill", "-HUP", "mosquitto"], capture_output=True)
            return Response({'detail': f'Usuario {username} guardado exitosamente en Mosquitto.', 'username': username}, status=201)
        except Exception as e:
            return Response({'detail': f'Error al guardar usuario Mosquitto: {e}'}, status=500)

    def destroy(self, request, pk=None):
        username = pk
        if not username:
            return Response({'detail': 'Se requiere nombre de usuario.'}, status=400)
        
        path = self._get_passwd_file_path()
        try:
            res = subprocess.run(
                ["docker", "exec", "scada_mqtt_broker", "mosquitto_passwd", "-D", "/mosquitto/config/passwd", username],
                capture_output=True, text=True
            )
            if res.returncode != 0:
                res_alt = subprocess.run(["mosquitto_passwd", "-D", path, username], capture_output=True, text=True)
                if res_alt.returncode != 0:
                    return Response({'detail': f'Error eliminando usuario de Mosquitto: {res.stderr or res_alt.stderr}'}, status=500)
            
            subprocess.run(["docker", "exec", "scada_mqtt_broker", "pkill", "-HUP", "mosquitto"], capture_output=True)
            return Response({'detail': f'Usuario {username} eliminado de Mosquitto.'}, status=200)
        except Exception as e:
            return Response({'detail': f'Error eliminando usuario: {e}'}, status=500)
