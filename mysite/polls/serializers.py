from django.conf import settings
import time
from dj_rest_auth.registration.serializers import RegisterSerializer as DefaultRegisterSerializer
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import RegistrationConfig
from django.utils import timezone


class CustomRegisterSerializer(DefaultRegisterSerializer):
    registration_key = serializers.CharField(write_only=True, required=True)
    documento = serializers.CharField(write_only=True, required=True)
    first_name = serializers.CharField(write_only=True, required=True)
    last_name = serializers.CharField(write_only=True, required=True)

    def to_internal_value(self, data):
        # Si se provee documento pero no username, asignarlo automáticamente
        if data and 'documento' in data and 'username' not in data:
            data = data.copy()
            data['username'] = data['documento']
        return super().to_internal_value(data)

    def validate_registration_key(self, value):
        # Primero, intentar obtener la clave activa desde la base de datos (editable por admin)
        db_key = RegistrationConfig.get_current_key()
        if db_key:
            expected = db_key
        else:
            expected = getattr(settings, 'REGISTRATION_KEY', None)

        if expected is None:
            raise serializers.ValidationError('El sistema no permite registros en este momento.')

        if value != expected:
            raise serializers.ValidationError('Clave de registro incorrecta.')
        return value

    def validate_email(self, value):
        # Mensaje claro en español si el correo ya está registrado
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Correo ya existente.')
        return value

    def validate_documento(self, value):
        if not value:
            raise serializers.ValidationError('El documento es obligatorio.')
        doc = str(value).strip()
        if not doc.isdigit():
            raise serializers.ValidationError('El documento debe contener solo números.')
        
        # Validar si ya existe en Empleado
        from .models import Empleado
        if Empleado.objects.filter(documento=doc).exists():
            raise serializers.ValidationError('Este documento ya está registrado.')
        
        # Validar si ya existe en User
        if User.objects.filter(username=doc).exists():
            raise serializers.ValidationError('Este documento ya está registrado como usuario.')
        return doc

    def get_cleaned_data(self):
        data = super().get_cleaned_data()
        data.pop('registration_key', None)
        # Asegurar que se incluyan nombres y apellidos en los datos limpios
        data['first_name'] = self.validated_data.get('first_name', '')
        data['last_name'] = self.validated_data.get('last_name', '')
        # Usar siempre el documento como username para normalizar
        documento = self.validated_data.get('documento', '').strip()
        data['username'] = documento
        return data

    def save(self, request):
        user = super().save(request)
        # La señal post_save ya creó el Empleado básico con documento = instance.username
        # Ahora actualizamos los campos opcionales del Empleado desde initial_data
        try:
            documento = self.validated_data.get('documento', '').strip()
            if documento:
                from .models import Empleado, Fabrica, Seccion
                from django.utils import timezone
                import random, string

                emp = Empleado.objects.filter(user=user).first()
                is_new = False
                if not emp:
                    # En caso de que la señal no lo haya creado por falta de fábricas u otro error
                    emp = Empleado(user=user, documento=documento)
                    is_new = True

                emp.nombre = user.first_name or self.validated_data.get('first_name', '')
                emp.apellido = user.last_name or self.validated_data.get('last_name', '')
                emp.email = user.email or ''

                # Campos opcionales / Valores por defecto
                direccion = self.initial_data.get('direccion')
                if direccion:
                    emp.direccion = direccion
                elif is_new:
                    emp.direccion = ''

                fecha_contratacion = self.initial_data.get('fecha_contratacion')
                if fecha_contratacion:
                    emp.fecha_contratacion = fecha_contratacion
                elif is_new or not emp.fecha_contratacion:
                    emp.fecha_contratacion = timezone.now().date()

                if is_new or not emp.rango:
                    emp.rango = '6'  # Operador por defecto en registro público

                # Generar clave única si es nuevo o no tiene
                if not emp.clave:
                    chars = string.ascii_uppercase + string.digits
                    clave = ''.join(random.choices(chars, k=8))
                    while Empleado.objects.filter(clave=clave).exists():
                        clave = ''.join(random.choices(chars, k=8))
                    emp.clave = clave

                # Fábrica y Sección
                fabrica_id = self.initial_data.get('fabrica')
                if fabrica_id:
                    try:
                        emp.fabrica = Fabrica.objects.get(id=fabrica_id)
                    except Fabrica.DoesNotExist:
                        pass
                elif is_new or not getattr(emp, 'fabrica', None):
                    # Asignar la primera fábrica por defecto
                    emp.fabrica = Fabrica.objects.first()

                seccion_id = self.initial_data.get('seccion')
                if seccion_id:
                    try:
                        emp.seccion = Seccion.objects.get(id=seccion_id)
                    except Seccion.DoesNotExist:
                        pass
                elif is_new or not getattr(emp, 'seccion', None):
                    # Asignar la primera sección de la fábrica por defecto
                    if emp.fabrica:
                        emp.seccion = Seccion.objects.filter(fabrica=emp.fabrica).first()

                # Guardar el registro de empleado (solo si se pudieron resolver fábrica y sección requeridas)
                if getattr(emp, 'fabrica', None) and getattr(emp, 'seccion', None):
                    emp.save()
        except Exception:
            pass
        return user


"""
Serializers para Django REST Framework - Sistema SCADA
"""
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    # Modelos base
    Fabrica,
    OrdenProduccion, 
    Receta, 
    DetalleReceta, 
    EjecucionReceta, 
    HistorialProduccion
    #, Seccion, Empleado, TipoTarifa,
    
    # Inventario
    #Inventario, ItemInventario, Proveedor,
    
    # SCADA
    #Sistema, DispositivoSCADA, Alarma, LecturaSensor,
    #OrdenProduccion, PlantillaProduccion, ConfiguracionMQTT,
    #RegistroAuditoria, IngredienteAlmacenamiento,
    
    # Producción
    #Receta, DetalleReceta, EjecucionReceta, Produccion,
)
from .models import ConfiguracionMQTT, DispositivoSCADA, LecturaSensor
from . import models
from allauth.account.models import EmailAddress


# =========================
# Serializers para usuarios
# =========================


class ProfileSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source='user.username', read_only=True)
    role = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Profile
        fields = ['id', 'user', 'user_username', 'role', 'telefono', 'email_confirmed', 'last_seen', 'created_at']
        read_only_fields = ['created_at', 'last_seen']

    def get_role(self, obj):
        try:
            return getattr(obj, 'role', 'operator')
        except Exception:
            return 'operator'


class UserSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer(read_only=True)
    empleado = serializers.SerializerMethodField(read_only=True)
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'password', 'is_active', 'is_staff', 'is_superuser', 'profile', 'empleado']
        extra_kwargs = {'is_active': {'read_only': True}}

    def get_empleado(self, obj):
        try:
            emp = getattr(obj, 'empleado', None)
            if emp:
                doc = str(getattr(emp, 'documento', ''))
                return {
                    'id': doc,
                    'documento': doc,
                    'rango': str(getattr(emp, 'rango', '1')),
                    'fabrica': emp.fabrica_id if getattr(emp, 'fabrica_id', None) else (emp.fabrica.id if getattr(emp, 'fabrica', None) else None),
                    'seccion': emp.seccion_id if getattr(emp, 'seccion_id', None) else (emp.seccion.id if getattr(emp, 'seccion', None) else None),
                }
        except Exception:
            pass
        return None

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        username = validated_data.get('username')
        email = validated_data.get('email')
        # Crear usuario inactivo por defecto; se activará tras confirmación por email
        user = User(**validated_data)
        user.username = username
        user.email = email
        user.is_active = False
        if password:
            user.set_password(password)
        user.save()
        return user



# =============================================================================
# Serializers Básicos
# =============================================================================

class MetricaConfiguracionSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MetricaConfiguracion
        fields = '__all__'


class VariableVinculadaSerializer(serializers.ModelSerializer):
    metrica_nombre = serializers.CharField(source='metrica_config.nombre', read_only=True)
    metrica_unidad = serializers.CharField(source='metrica_config.unidad_medida', read_only=True)
    metrica_icono = serializers.CharField(source='metrica_config.icono', read_only=True)
    sensor_nombre = serializers.CharField(source='sensor.nombre', read_only=True)
    valor_lectura = serializers.SerializerMethodField(read_only=True)
    unidad_lectura = serializers.SerializerMethodField(read_only=True)
    estado_alerta = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.VariableVinculada
        fields = '__all__'

    def get_valor_lectura(self, obj):
        if obj.sensor:
            lectura = obj.sensor.lecturas.first()
            return lectura.valor if lectura else None
        return None

    def get_unidad_lectura(self, obj):
        if obj.sensor:
            lectura = obj.sensor.lecturas.first()
            return lectura.unidad if lectura else "N/A"
        return "N/A"

    def get_estado_alerta(self, obj):
        if not obj.sensor:
            return "normal"
        lectura = obj.sensor.lecturas.first()
        if not lectura:
            return "normal"
        val = lectura.valor
        
        if obj.umbral_critico is not None and val >= obj.umbral_critico:
            return "critico"
        if obj.umbral_advertencia is not None and val >= obj.umbral_advertencia:
            return "advertencia"
        return "normal"


class FabricaSerializer(serializers.ModelSerializer):
    """Serializer para Plantas/Fábricas con métricas SCADA"""
    from datetime import datetime as _datetime
    fecha_creacion = serializers.SerializerMethodField(read_only=True)
    variables_vinculadas = serializers.SerializerMethodField(read_only=True)
    alarmas_activas = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Fabrica
        fields = '__all__'

    def get_alarmas_activas(self, obj):
        try:
            return obj.alarmas_sistema.filter(estado='abierta').count()
        except Exception:
            return 0

    def get_variables_vinculadas(self, obj):
        vins = obj.variables_vinculadas.filter(activo=True)
        return VariableVinculadaSerializer(vins, many=True).data

    def get_fecha_creacion(self, obj):
        val = getattr(obj, 'fecha_creacion', None)
        if val is None:
            return None
        # Aceptar date o datetime
        try:
            if isinstance(val, self._meta.model._meta.get_field('fecha_creacion').__class__):
                # fallback
                return str(val)
        except Exception:
            pass
        # Si es datetime, devolver la parte date formateada
        import datetime as _dt
        if isinstance(val, _dt.datetime):
            return val.date().isoformat()
        return val.isoformat() if hasattr(val, 'isoformat') else str(val)


# class SeccionSerializer(serializers.ModelSerializer):
#     """Serializer para Secciones"""
#     fabrica_nombre = serializers.CharField(source='fabrica.nombre', read_only=True)
    
#     class Meta:
#         model = Seccion
#         fields = '__all__'


# class EmpleadoSerializer(serializers.ModelSerializer):
#     """Serializer para Empleados"""
#     fabrica_nombre = serializers.CharField(source='fabrica.nombre', read_only=True)
#     seccion_nombre = serializers.CharField(source='seccion.nombre', read_only=True)
    
#     class Meta:
#         model = Empleado
#         fields = '__all__'


# class EmpleadoListSerializer(serializers.ModelSerializer):
#     """Serializer reducido para listado de empleados"""
#     fabrica_nombre = serializers.CharField(source='fabrica.nombre', read_only=True)
#     seccion_nombre = serializers.CharField(source='seccion.nombre', read_only=True)
    
#     class Meta:
#         model = Empleado
#         fields = ['documento', 'nombre', 'apellido', 'rango', 'email', 
#                   'fabrica_nombre', 'seccion_nombre', 'estado']


# # =============================================================================
# # Serializers SCADA
# # =============================================================================

# class SistemaSerializer(serializers.ModelSerializer):
#     """Serializer para Sistemas de Producción"""
#     fabrica_nombre = serializers.CharField(source='fabrica.nombre', read_only=True)
    
#     class Meta:
#         model = Sistema
#         fields = '__all__'


class DispositivoSCADASerializer(serializers.ModelSerializer):
    """Serializer para Dispositivos SCADA (sensores, actuadores, máquinas)"""
    id = serializers.CharField(source='numero_serie', read_only=True)
    sistema_nombre = serializers.CharField(source='sistema.nombre', read_only=True)
    seccion_nombre = serializers.CharField(source='seccion.nombre', read_only=True)
    inventario_nombre = serializers.CharField(source='inventario.nombre', read_only=True)
    valor_lectura = serializers.SerializerMethodField(read_only=True)
    unidad_lectura = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.DispositivoSCADA
        fields = '__all__'

    def get_valor_lectura(self, obj):
        lectura = obj.lecturas.first()
        return lectura.valor if lectura else None

    def get_unidad_lectura(self, obj):
        lectura = obj.lecturas.first()
        return lectura.unidad if lectura else "N/A"

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        from django.utils import timezone
        if instance.estado == 'OFFLINE':
            ret['estado'] = 'OFFLINE'
        elif instance.ultima_lectura:
            delta = (timezone.now() - instance.ultima_lectura).total_seconds()
            ret['estado'] = "ONLINE" if delta < 60 else "OFFLINE"
        else:
            ret['estado'] = instance.estado or "OFFLINE"
        return ret


class DispositivoSCADAListSerializer(serializers.ModelSerializer):
    """Serializer reducido para listado de dispositivos"""
    class Meta:
        model = models.DispositivoSCADA
        fields = ['numero_serie', 'nombre', 'categoria', 'estado', 'ultima_lectura']


class LecturaSensorSerializer(serializers.ModelSerializer):
    """Serializer para lecturas de sensores"""
    dispositivo_nombre = serializers.CharField(source='dispositivo.nombre', read_only=True)

    class Meta:
        model = models.LecturaSensor
        fields = '__all__'


class LecturaSensorCreateSerializer(serializers.ModelSerializer):
    """Serializer para crear lecturas (simplificado)"""
    class Meta:
        model = models.LecturaSensor
        fields = ['dispositivo', 'valor', 'unidad', 'calidad']


# class AlarmaSerializer(serializers.ModelSerializer):
#     """Serializer para Alarmas SCADA"""
#     fabrica_nombre = serializers.CharField(source='fabrica.nombre', read_only=True)
#     dispositivo_nombre = serializers.CharField(source='dispositivo.nombre', read_only=True)
#     usuario_cierre_nombre = serializers.CharField(source='usuario_cierre.username', read_only=True)
    
#     class Meta:
#         model = Alarma
#         fields = '__all__'


# class AlarmaCreateSerializer(serializers.ModelSerializer):
#     """Serializer para crear alarmas"""
#     class Meta:
#         model = Alarma
#         fields = ['fabrica', 'dispositivo', 'descripcion', 'severidad']


# class AlarmaUpdateSerializer(serializers.ModelSerializer):
#     """Serializer para cerrar/actualizar alarmas"""
#     class Meta:
#         model = Alarma
#         fields = ['estado', 'notas_resolucion']


# # =============================================================================
# # Serializers de Producción
# # =============================================================================

class RecetaSerializer(serializers.ModelSerializer):
     """Serializer para Recetas"""
     class Meta:
         model = Receta
         fields = '__all__'


class DetalleRecetaSerializer(serializers.ModelSerializer):
     """Serializer para ingredientes de recetas"""
     ingrediente_nombre = serializers.CharField(source='ingrediente.nombre', read_only=True)
    
     class Meta:
         model = DetalleReceta
         fields = '__all__'


class HistorialProduccionSerializer(serializers.ModelSerializer):
    """Serializer para los registros históricos al finalizar"""
    producto_nombre = serializers.CharField(source='orden_produccion.producto', read_only=True)

    class Meta:
        model = HistorialProduccion
        fields = '__all__'


class OrdenProduccionSerializer(serializers.ModelSerializer):
     """Serializer para Órdenes de Producción"""
     fabrica_nombre = serializers.CharField(source='fabrica.nombre', read_only=True)
     sistema_nombre = serializers.CharField(source='sistema.nombre', read_only=True)
     dispositivo_nombre = serializers.CharField(source='dispositivo.nombre', read_only=True)
     receta_nombre = serializers.CharField(source='receta.nombre', read_only=True)
     creado_por_nombre = serializers.CharField(source='creado_por.username', read_only=True)
    
     class Meta:
        model = OrdenProduccion
        fields = '__all__'


class OrdenProduccionListSerializer(serializers.ModelSerializer):
     """Serializer completo para listado de órdenes"""
     fabrica_nombre = serializers.CharField(source='fabrica.nombre', read_only=True)
     sistema_nombre = serializers.CharField(source='sistema.nombre', read_only=True)
     dispositivo_nombre = serializers.CharField(source='dispositivo.nombre', read_only=True)
     receta_nombre = serializers.CharField(source='receta.nombre', read_only=True)
    
     class Meta:
         model = OrdenProduccion
         fields = ['id', 'codigo', 'producto', 'cantidad', 'unidad', 'estado', 'progreso',
                   'fecha_inicio', 'hora_inicio', 'fecha_fin', 'hora_fin',
                   'fabrica', 'fabrica_nombre', 'sistema', 'sistema_nombre',
                   'dispositivo', 'dispositivo_nombre', 'receta', 'receta_nombre']


# -----------------------------------------------------------------------------
# Serializers adicionales (exponer manualmente modelos restantes)
# Comentarios: mantener explícito y sencillo para facilitar pruebas desde el
# frontend; marcamos campos sensibles como `write_only` cuando corresponda.
# -----------------------------------------------------------------------------


class SeccionSerializer(serializers.ModelSerializer):
    """Serializer para `Seccion` con nombre de fábrica incluido"""
    fabrica_nombre = serializers.CharField(source='fabrica.nombre', read_only=True)

    class Meta:
        model = models.Seccion
        fields = '__all__'


class EmpleadoSerializer(serializers.ModelSerializer):
    """Serializer para `Empleado` que admite creación/actualización parcial desde la SPA.

    - Usa `fabrica` y `seccion` como claves primarias (IDs).
    - `rol_actual` expone el rol lógico (Empleado/Jefe/Administrador) separado del campo interno `rango`.
    - Si faltan campos obligatorios en creación, intenta rellenar valores por defecto mínimos.
    """
    fabrica = serializers.PrimaryKeyRelatedField(queryset=models.Fabrica.objects.all(), required=False, allow_null=True)
    seccion = serializers.PrimaryKeyRelatedField(queryset=models.Seccion.objects.all(), required=False, allow_null=True)
    fabrica_nombre = serializers.CharField(source='fabrica.nombre', read_only=True)
    seccion_nombre = serializers.CharField(source='seccion.nombre', read_only=True)
    fecha_contratacion = serializers.DateField(required=False, allow_null=True)
    email = serializers.EmailField(required=False, allow_null=True)
    # Controla si el email debe marcarse como verificado al crear el empleado
    email_verified = serializers.BooleanField(write_only=True, required=False, default=False)

    # Campos calculados expuestos por la API
    ultimo_fichaje = serializers.SerializerMethodField(read_only=True)
    ultimo_inicio_sesion = serializers.SerializerMethodField(read_only=True)
    # Campo derivado: `rol` legible expuesto a la SPA (derivado desde `rango`; no escribir directamente)
    rol = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.Empleado
        # Excluir contacto del API: el sistema no debe depender del teléfono
        fields = [
            'documento', 'nombre', 'apellido', 'seccion', 'seccion_nombre', 'fabrica', 'fabrica_nombre',
            'rango', 'rol', 'fecha_contratacion', 'direccion', 'email', 'estado',
            'ultimo_fichaje', 'ultimo_inicio_sesion', 'email_verified'
        ]
        extra_kwargs = {
            'documento': {'required': False},
            'rango': {'required': False},
            'contacto': {'required': False},
            'direccion': {'required': False},
            'email': {'required': False},
        }

    def validate_email(self, value):
        # Permitir email opcional, pero validar unicidad si se provee
        if value:
            qs = models.Empleado.objects.filter(email__iexact=value)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError('Email ya registrado.')
        return value

    def create(self, validated_data):
        # Generar documento si falta
        if not validated_data.get('documento'):
            import time
            validated_data['documento'] = f'AUTO-{int(time.time())}'

        # Fecha de contratación por defecto hoy si no se envía
        from django.utils.timezone import now
        if not validated_data.get('fecha_contratacion'):
            validated_data['fecha_contratacion'] = now().date()

        # Asignar fábrica/ sección por defecto si faltan
        if not validated_data.get('fabrica'):
            fab = models.Fabrica.objects.first()
            if fab:
                validated_data['fabrica'] = fab

        if not validated_data.get('seccion') and validated_data.get('fabrica'):
            sec = models.Seccion.objects.filter(fabrica=validated_data['fabrica']).first()
            if sec:
                validated_data['seccion'] = sec

        # Asegurar clave única
        if not validated_data.get('clave'):
            import random, string
            chars = string.ascii_uppercase + string.digits
            clave = ''.join(random.choices(chars, k=8))
            while models.Empleado.objects.filter(clave=clave).exists():
                clave = ''.join(random.choices(chars, k=8))
            validated_data['clave'] = clave

        # Extraer flags auxiliares que no forman parte del modelo
        email_verified = bool(validated_data.pop('email_verified', False))

        # Validaciones mínimas y creación
        if not validated_data.get('fabrica'):
            raise serializers.ValidationError({'fabrica': 'No existe ninguna fábrica en el sistema. Crea una fábrica primero o proporciona el campo `fabrica`.'})
        if not validated_data.get('seccion'):
            raise serializers.ValidationError({'seccion': 'La sección es obligatoria. Proporciona `seccion` o crea al menos una sección en la fábrica seleccionada.'})

        empleado = models.Empleado.objects.create(**validated_data)

        # Intentar crear usuario y EmailAddress asociado sin bloquear el flujo
        try:
            email = (validated_data.get('email') or '').strip()
            username = str(validated_data.get('documento'))

            user = None
            if username:
                user = User.objects.filter(username=username).first()
            if not user and email:
                user = User.objects.filter(email__iexact=email).first()
            if not user:
                # Crear nuevo User preferiendo `documento` como username si está disponible.
                preferred_username = username or ''
                if not preferred_username and email:
                    preferred_username = email.split('@')[0]
                if not preferred_username:
                    preferred_username = f'user_{int(time.time())}'
                # No escribir en `profile.role`: el rol ahora se deriva desde Empleado.rango.

                # Evitar colisiones: si existe otro usuario con el username preferido, generar alternativo
                conflict = User.objects.filter(username=preferred_username).exclude(email__iexact=email).first()
                if conflict:
                    # preferimos usar el email-match user if exists, else append suffix
                    preferred_username = f"{preferred_username}_{int(time.time()) % 10000}"

                user = User.objects.create_user(username=preferred_username, email=email or '')
                user.set_unusable_password()
                user.is_active = True if email_verified else False
                # Rellenar nombre y apellido desde el empleado si están vacíos
                user.first_name = validated_data.get('nombre', '') or ''
                user.last_name = validated_data.get('apellido', '') or ''
                user.save()

            # Asociar user al empleado y normalizar username/atributos si es necesario
            try:
                # Si el usuario actual no coincide con el username esperado (documento), y no hay colisión, renombrarlo
                desired_username = str(validated_data.get('documento') or '')
                if desired_username:
                    existing_with_desired = User.objects.filter(username=desired_username).exclude(pk=user.pk).first()
                    if not existing_with_desired and user.username != desired_username:
                        user.username = desired_username
                        user.save()

                # Actualizar nombres si están vacíos
                if (not user.first_name) and validated_data.get('nombre'):
                    user.first_name = validated_data.get('nombre')
                if (not user.last_name) and validated_data.get('apellido'):
                    user.last_name = validated_data.get('apellido')
                user.save()

                if not getattr(empleado, 'user', None):
                    empleado.user = user
                    empleado.save()
            except Exception:
                pass

            if email:
                ea = EmailAddress.objects.filter(user=user, email__iexact=email).first()
                if not ea:
                    EmailAddress.objects.create(user=user, email=email, primary=True, verified=email_verified)
                else:
                    if ea.verified != email_verified:
                        ea.verified = email_verified
                        ea.primary = True
                        ea.save()

            try:
                if email_verified and not user.is_active:
                    user.is_active = True
                    user.save()
            except Exception:
                pass

            try:
                profile = getattr(user, 'profile', None)
                if profile and not getattr(profile, 'email_confirmed', False):
                    profile.email_confirmed = True
                    profile.save()
            except Exception:
                pass
        except Exception:
            pass

        return empleado

    def get_rol(self, obj):
        # Mapear código rango a etiqueta comprensible por la SPA
        try:
            code = str(obj.rango)
            if code == '8':
                return 'Administrador'
            if code in ['1', '2', '3']:
                return 'Jefe de Sector'
            return 'Operador'
        except Exception:
            # Fallback: valor por defecto
            return 'Operador'

    def update(self, instance, validated_data):
        # Comportamiento por defecto
        instance = super().update(instance, validated_data)
        # No sincronizamos ni escribimos en `Profile.role`; el rol se deriva.
        return instance

    def validate_rango(self, value):
        MAP = {
            'EMPLEADO': '6', 'JEFE': '3', 'ADMIN': '2', 'DIRECTOR': '1', 'GERENTE': '2',
            'JEFE DE SECCIÓN': '3', 'ADMINISTRADOR': '2',
        }
        if value is None:
            return value
        v = str(value).strip().upper()
        if v in MAP:
            return MAP[v]
        if v.isdigit() and v in {str(i) for i in range(1,9)}:
            return v
        for k in MAP:
            if k in v:
                return MAP[k]
        raise serializers.ValidationError('Rango inválido')

    def update(self, instance, validated_data):
        # Aplicar cambios al empleado
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Sincronizar cambios relevantes con el User y EmailAddress asociados
        try:
            email = (getattr(instance, 'email', '') or '').strip()
            documento = str(getattr(instance, 'documento', '') or '')

            user = None
            # Preferir relación directa
            if getattr(instance, 'user', None):
                user = instance.user

            # Buscar por username=documento
            if not user and documento:
                user = User.objects.filter(username=documento).first()

            # Buscar por email
            if not user and email:
                user = User.objects.filter(email__iexact=email).first()

            # Si no existe un usuario asociado, crear uno mínimo
            if not user:
                preferred_username = documento or (email.split('@')[0] if email else f'user_{int(time.time())}')
                conflict = User.objects.filter(username=preferred_username).first()
                if conflict:
                    preferred_username = f"{preferred_username}_{int(time.time()) % 10000}"
                user = User.objects.create_user(username=preferred_username, email=email or '')
                user.set_unusable_password()
                user.save()
                instance.user = user
                instance.save()

            # Actualizar nombre/apellido
            changed = False
            if instance.nombre and user.first_name != instance.nombre:
                user.first_name = instance.nombre
                changed = True
            if instance.apellido and user.last_name != instance.apellido:
                user.last_name = instance.apellido
                changed = True

            # Intentar normalizar username si documento cambió
            if documento and user.username != documento:
                existing = User.objects.filter(username=documento).exclude(pk=user.pk).first()
                if not existing:
                    user.username = documento
                    changed = True

            # Actualizar email si cambió
            if email and user.email != email:
                user.email = email
                changed = True

            if changed:
                user.save()

            # Asegurar EmailAddress sincronizada
            if email:
                ea = EmailAddress.objects.filter(user=user, email__iexact=email).first()
                if not ea:
                    EmailAddress.objects.create(user=user, email=email, primary=True, verified=False)
                else:
                    if not ea.primary:
                        ea.primary = True
                        ea.save()
        except Exception:
            # No bloquear la actualización del empleado por errores en sincronización
            pass

        return instance

    def get_ultimo_fichaje(self, obj):
        try:
            last = None
            try:
                last = obj.fichajes.order_by('-fecha', '-id').first()
            except Exception:
                last = None
            if last:
                fecha = getattr(last, 'fecha', None)
                hora = getattr(last, 'hora_entrada', None)
                if fecha and hora:
                    return f"{fecha.isoformat()} {hora.isoformat()}"
                if fecha:
                    return fecha.isoformat()
            try:
                inicio = self.get_ultimo_inicio_sesion(obj)
                if inicio:
                    return inicio
            except Exception:
                pass
            return ''
        except Exception:
            return ''

    def get_ultimo_inicio_sesion(self, obj):
        try:
            doc = getattr(obj, 'documento', None)
            if not doc:
                return ''
            from django.contrib.auth.models import User
            from django.db.models import Q
            # Buscar usuario por username igual al documento o por email del empleado
            user = None
            try:
                user = User.objects.filter(Q(username=doc)).first()
            except Exception:
                user = None
            if not user:
                emp_email = getattr(obj, 'email', None) or ''
                if emp_email:
                    try:
                        user = User.objects.filter(Q(email__iexact=emp_email)).first()
                    except Exception:
                        user = None
            # Si no hay user directo, intentar por EmailAddress que apunte al usuario
            if not user:
                try:
                    ea = EmailAddress.objects.filter(email__iexact=(getattr(obj, 'email', '') or '')).first()
                    if ea:
                        user = getattr(ea, 'user', None)
                except Exception:
                    user = None
            if user:
                if getattr(user, 'last_login', None):
                    return user.last_login.isoformat()
                profile = getattr(user, 'profile', None)
                if profile and getattr(profile, 'last_seen', None):
                    return profile.last_seen.isoformat()
            return ''
        except Exception:
            return ''


class InventarioSerializer(serializers.ModelSerializer):
    fabrica_nombre = serializers.CharField(source='fabrica.nombre', read_only=True)

    class Meta:
        model = models.Inventario
        fields = '__all__'


class ItemInventarioSerializer(serializers.ModelSerializer):
    inventario_nombre = serializers.CharField(source='inventario.nombre', read_only=True)
    seccion_nombre = serializers.CharField(source='seccion.nombre', read_only=True)

    class Meta:
        model = models.ItemInventario
        fields = '__all__'


class HistorialMovimientosSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source='usuario.username', read_only=True)
    item_nombre = serializers.CharField(source='item.nombre', read_only=True)

    class Meta:
        model = models.HistorialMovimientos
        fields = '__all__'


class CronogramaSeccionSerializer(serializers.ModelSerializer):
    seccion_nombre = serializers.CharField(source='seccion.nombre', read_only=True)
    item_nombre = serializers.CharField(source='item.nombre', read_only=True)

    class Meta:
        model = models.CronogramaSeccion
        fields = '__all__'


class ProduccionSerializer(serializers.ModelSerializer):
    receta_nombre = serializers.CharField(source='receta.nombre', read_only=True)
    seccion_nombre = serializers.CharField(source='seccion.nombre', read_only=True)

    class Meta:
        model = models.Produccion
        fields = '__all__'


class RegistroMantenimientoSerializer(serializers.ModelSerializer):
    componente_nombre = serializers.CharField(source='componente.nombre', read_only=True)

    class Meta:
        model = models.RegistroMantenimiento
        fields = '__all__'


class RegistroAuditoriaSerializer(serializers.ModelSerializer):
    usuario_username = serializers.CharField(source='usuario.username', read_only=True)
    topico = serializers.SerializerMethodField(read_only=True)
    timestamp = serializers.DateTimeField(read_only=True)

    class Meta:
        model = models.RegistroAuditoria
        fields = ['id', 'usuario', 'usuario_username', 'accion', 'modulo', 'objeto', 'descripcion', 'datos', 'ip_origen', 'timestamp', 'topico']
        read_only_fields = ['timestamp', 'usuario_username', 'topico']

    def get_topico(self, obj):
        if obj.datos and isinstance(obj.datos, dict):
            if 'topico' in obj.datos:
                return obj.datos['topico']
            if 'topic' in obj.datos:
                return obj.datos['topic']
        if obj.descripcion:
            import re
            m = re.search(r'\(Topic:\s*([^\)]+)\)', obj.descripcion)
            if m:
                return m.group(1).strip()
            m2 = re.search(r'topic\s+([^\s,]+)', obj.descripcion, re.IGNORECASE)
            if m2:
                return m2.group(1).strip()
        return None


class SistemaSerializer(serializers.ModelSerializer):
    fabrica_nombre = serializers.CharField(source='fabrica.nombre', read_only=True)

    class Meta:
        model = models.Sistema
        fields = '__all__'


class PlantillaProduccionSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.PlantillaProduccion
        fields = '__all__'


class IngredienteAlmacenamientoSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.IngredienteAlmacenamiento
        fields = '__all__'


class MantenimientoProgramadoSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.MantenimientoProgramado
        fields = '__all__'


class UnidadAlmacenamientoSerializer(serializers.ModelSerializer):
    seccion_nombre = serializers.CharField(source='seccion.nombre', read_only=True)
    sistema_nombre = serializers.CharField(source='sistema.nombre', read_only=True)

    class Meta:
        model = models.UnidadAlmacenamiento
        fields = '__all__'


class HistorialProduccionSerializerBasic(serializers.ModelSerializer):
    class Meta:
        model = models.HistorialProduccion
        fields = '__all__'


class ComunicacionMQTTSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.ComunicacionMQTT
        fields = '__all__'


class EjecucionRecetaSerializer(serializers.ModelSerializer):
    """Serializer para el seguimiento de la ejecución en tiempo real"""
    receta_nombre = serializers.CharField(source='receta.nombre', read_only=True)
    seccion_nombre = serializers.CharField(source='seccion.nombre', read_only=True)

    class Meta:
        model = EjecucionReceta
        fields = '__all__'


# class IngredienteAlmacenamientoSerializer(serializers.ModelSerializer):
#     """Serializer para Ingredientes"""
#     bombo_nombre = serializers.CharField(source='bombo.nombre', read_only=True)
    
#     class Meta:
#         model = IngredienteAlmacenamiento
#         fields = '__all__'


# # =============================================================================
# # Serializers de Configuración
# # =============================================================================

# class ConfiguracionMQTTSerializer(serializers.ModelSerializer):
#     """Serializer para configuración MQTT"""
#     class Meta:
#         model = ConfiguracionMQTT
#         fields = '__all__'
#         extra_kwargs = {
#             'password': {'write_only': True}  # No exponer password en lectura
#         }


class ConfiguracionMQTTSerializer(serializers.ModelSerializer):
    """Serializer para configuración MQTT"""
    class Meta:
        model = ConfiguracionMQTT
        fields = '__all__'
        extra_kwargs = {
            'password': {'write_only': True}
        }


class TopicMQTTSerializer(serializers.ModelSerializer):
    """Serializer para Topics MQTT vinculados a una configuración"""
    configuracion_nombre = serializers.CharField(source='configuracion.nombre', read_only=True)

    class Meta:
        model = models.TopicMQTT
        fields = ['id', 'configuracion', 'configuracion_nombre', 'topic', 'tipo', 'tipo_dato', 'descripcion', 'activo']


# # =============================================================================
# # Serializers de Auditoría
# # =============================================================================

# class RegistroAuditoriaSerializer(serializers.ModelSerializer):
#     """Serializer para registros de auditoría"""
#     usuario_nombre = serializers.CharField(source='usuario.username', read_only=True)
    
#     class Meta:
#         model = RegistroAuditoria
#         fields = '__all__'


# # =============================================================================
# # Serializers de Dashboard/Estadísticas
# # =============================================================================

# class FabricaEstadisticasSerializer(serializers.ModelSerializer):
#     """Serializer con estadísticas ampliadas para dashboard"""
#     total_dispositivos = serializers.IntegerField(read_only=True)
#     dispositivos_online = serializers.IntegerField(read_only=True)
#     total_empleados = serializers.IntegerField(read_only=True)
#     ordenes_activas = serializers.IntegerField(read_only=True)
    
#     class Meta:
#         model = Fabrica
#         fields = '__all__'


# class EstadisticasGeneralesSerializer(serializers.Serializer):
#     """Serializer para estadísticas generales del sistema"""
#     plantas_activas = serializers.IntegerField()
#     plantas_total = serializers.IntegerField()
#     empleados_en_turno = serializers.IntegerField()
#     sensores_online = serializers.IntegerField()
#     sensores_total = serializers.IntegerField()
#     alarmas_activas = serializers.IntegerField()
#     ordenes_pendientes = serializers.IntegerField()
#     ordenes_en_proceso = serializers.IntegerField()


class AlarmaSerializer(serializers.ModelSerializer):
    planta_nombre = serializers.ReadOnlyField(source='planta.nombre')
    seccion_nombre = serializers.ReadOnlyField(source='seccion.nombre')
    fecha_hora = serializers.DateTimeField(format="%Y-%m-%d %H:%M:%S", read_only=True)

    class Meta:
        model = models.Alarma
        fields = '__all__'


class MapeoAccionMQTTSerializer(serializers.ModelSerializer):
    tipo_sistema_display = serializers.CharField(source='get_tipo_sistema_display', read_only=True)
    sistema_nombre = serializers.CharField(source='sistema.nombre', read_only=True)

    class Meta:
        model = models.MapeoAccionMQTT
        fields = '__all__'


class RegistrationConfigSerializer(serializers.ModelSerializer):
    actualizado_en = serializers.DateTimeField(format="%Y-%m-%d %H:%M:%S", read_only=True)

    class Meta:
        model = models.RegistrationConfig
        fields = ['id', 'clave', 'activo', 'actualizado_en']
