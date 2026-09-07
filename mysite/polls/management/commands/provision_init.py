from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils.timezone import now
from polls.models import RegistrationConfig, Profile, Fabrica, Seccion, Empleado, PlantillaProduccion, OrdenProduccion, MantenimientoProgramado, Sistema
from allauth.account.models import EmailAddress
import os
from datetime import timedelta


class Command(BaseCommand):
    help = 'Provision initial data: create superuser, default Fabrica/Seccion, linked Empleado and RegistrationConfig, and initial SCADA data'

    def handle(self, *args, **options):
        User = get_user_model()
        username = os.environ.get('DJANGO_SUPERUSER_USERNAME', 'admin')
        email = os.environ.get('DJANGO_SUPERUSER_EMAIL', 'admin@example.com')
        password = os.environ.get('DJANGO_SUPERUSER_PASSWORD', 'admin')

        # 1. Crear o recuperar Fabrica y Seccion por defecto
        fab, _ = Fabrica.objects.get_or_create(
            nombre='Planta Principal',
            defaults={'pais': 'Argentina', 'ubicacion': 'Sede Central', 'estado': 'OPERATIVO'}
        )
        sec, _ = Seccion.objects.get_or_create(
            nombre='Administración',
            fabrica=fab,
            defaults={'capacidad_trabajadores': 10, 'tamano_seccion': 100.0}
        )
        sec_mezcla, _ = Seccion.objects.get_or_create(
            nombre='Área de Mezclado',
            fabrica=fab,
            defaults={'capacidad_trabajadores': 15, 'tamano_seccion': 250.0}
        )
        sistema_mezcla, _ = Sistema.objects.get_or_create(
            nombre='Sistema de Mezcla A1',
            fabrica=fab,
            defaults={'descripcion': 'Sistema automatizado de mezclado industrial'}
        )
        self.stdout.write(self.style.SUCCESS(f'Default Fabrica ("{fab.nombre}") and Secciones ensured'))

        # 2. Crear o recuperar Superusuario
        user, created = User.objects.get_or_create(username=username, defaults={'email': email})
        if created:
            user.set_password(password)
            user.is_staff = True
            user.is_superuser = True
            user.save()
            self.stdout.write(self.style.SUCCESS(f'Superuser "{username}" created'))
        else:
            if email and user.email != email:
                user.email = email
                user.save()
            self.stdout.write(f'Superuser "{username}" already exists')

        # 3. Asegurar cuenta de correo en allauth y verificarla
        try:
            ea, ea_created = EmailAddress.objects.get_or_create(user=user, email=user.email, defaults={'verified': True, 'primary': True})
            if not ea_created:
                changed = False
                if not ea.verified:
                    ea.verified = True
                    changed = True
                if not ea.primary:
                    ea.primary = True
                    changed = True
                if changed:
                    ea.save()

            profile, _ = Profile.objects.get_or_create(user=user)
            if not profile.email_confirmed:
                profile.email_confirmed = True
                profile.save()

            self.stdout.write(self.style.SUCCESS(f'EmailAddress for "{username}" ensured and verified'))
        except Exception as e:
            self.stdout.write(f'Could not ensure EmailAddress/profile for superuser: {e}')

        # 4. Crear o asociar registro Empleado para el superusuario
        try:
            emp = Empleado.objects.filter(user=user).first()
            if not emp:
                emp = Empleado.objects.filter(documento=username).first()
                if emp:
                    emp.user = user
                    emp.email = user.email
                    emp.rango = '8'
                    emp.save()
                else:
                    emp = Empleado.objects.create(
                        user=user,
                        nombre=user.first_name or 'Admin',
                        apellido=user.last_name or 'Sistema',
                        documento=username,
                        fabrica=fab,
                        seccion=sec,
                        rango='8',  # Administrador
                        fecha_contratacion=now().date(),
                        contacto='',
                        direccion='',
                        email=user.email,
                        estado='ACTIVO'
                    )
                self.stdout.write(self.style.SUCCESS(f'Empleado record linked for superuser "{username}"'))
            else:
                if emp.email != user.email:
                    emp.email = user.email
                    emp.save()
                self.stdout.write(f'Empleado record for "{username}" already exists')
        except Exception as e:
            self.stdout.write(f'Could not ensure Empleado record for superuser: {e}')

        # 5. RegistrationConfig
        rk = os.environ.get('REGISTRATION_KEY')
        if rk:
            obj = RegistrationConfig.objects.filter(clave=rk, activo=True).first()
            if not obj:
                RegistrationConfig.objects.create(clave=rk, activo=True)
                self.stdout.write(self.style.SUCCESS('RegistrationConfig created from REGISTRATION_KEY'))
            else:
                self.stdout.write('Active RegistrationConfig for env key already exists')

        # 6. Seed PlantillasProduccion iniciales
        if PlantillaProduccion.objects.count() == 0:
            PlantillaProduccion.objects.create(
                nombre="Mezcla Estándar A",
                tipo="PRODUCCION",
                descripcion="Fórmula estándar de mezclado con bomba 1 y bomba 2",
                tiempo_horas=2,
                tiempo_minutos=30,
                ingredientes_json="Componente A (45%), Componente B (30%), Aditivo X (25%)"
            )
            PlantillaProduccion.objects.create(
                nombre="Fórmula Premium B",
                tipo="ESPECIALIDAD",
                descripcion="Mezclado de alta densidad con catalizadores",
                tiempo_horas=3,
                tiempo_minutos=45,
                ingredientes_json="Base Premium (60%), Catalizador Y (20%), Estabilizador Z (20%)"
            )
            PlantillaProduccion.objects.create(
                nombre="Receta Industrial C",
                tipo="PRODUCCION",
                descripcion="Proceso rápido de procesamiento continuo",
                tiempo_horas=1,
                tiempo_minutos=15,
                ingredientes_json="Material Base (70%), Refuerzo R (15%), Aditivo Final (15%)"
            )
            PlantillaProduccion.objects.create(
                nombre="Compuesto Especial D",
                tipo="ESPECIALIDAD",
                descripcion="Mezcla especial de alta fricción",
                tiempo_horas=4,
                tiempo_minutos=0,
                ingredientes_json="Polímero P (50%), Agente A (25%), Modificador M (25%)"
            )
            self.stdout.write(self.style.SUCCESS('Initial PlantillasProduccion seeded'))

        # 7. Seed Ordenes de Producción iniciales
        if OrdenProduccion.objects.count() == 0:
            today = now().date()
            OrdenProduccion.objects.create(
                producto="Producto A-100",
                cantidad=5000,
                unidad="L",
                fecha_inicio=today,
                hora_inicio="08:00",
                fecha_fin=today,
                hora_fin="14:00",
                fabrica=fab,
                sistema=sistema_mezcla,
                estado="EN_PROCESO",
                progreso=65,
                creado_por=user
            )
            OrdenProduccion.objects.create(
                producto="Producto B-200",
                cantidad=3000,
                unidad="L",
                fecha_inicio=today + timedelta(days=1),
                hora_inicio="09:30",
                fecha_fin=today + timedelta(days=1),
                hora_fin="15:30",
                fabrica=fab,
                sistema=sistema_mezcla,
                estado="PENDIENTE",
                progreso=0,
                creado_por=user
            )
            OrdenProduccion.objects.create(
                producto="Producto C-300",
                cantidad=8000,
                unidad="L",
                fecha_inicio=today - timedelta(days=1),
                hora_inicio="07:00",
                fecha_fin=today - timedelta(days=1),
                hora_fin="19:00",
                fabrica=fab,
                sistema=sistema_mezcla,
                estado="COMPLETADA",
                progreso=100,
                creado_por=user
            )
            self.stdout.write(self.style.SUCCESS('Initial OrdenesProduccion seeded'))

        # 8. Seed MantenimientoProgramado iniciales
        if MantenimientoProgramado.objects.count() == 0:
            today = now().date()
            MantenimientoProgramado.objects.create(
                nombre="Mantenimiento preventivo M-001",
                descripcion="Revisión programada de bombas de mezclado",
                fecha_inicio=today,
                hora_inicio="14:30",
                fecha_fin=today,
                hora_fin="16:00",
                fabrica=fab,
                sistema=sistema_mezcla,
                estado="PROGRAMADO"
            )
            self.stdout.write(self.style.SUCCESS('Initial MantenimientoProgramado seeded'))

        # 9. Seed MapeoAccionMQTT iniciales
        from polls.models import MapeoAccionMQTT
        if MapeoAccionMQTT.objects.count() == 0:
            MapeoAccionMQTT.objects.create(
                nombre="Control de Reposición de Materia Prima",
                tipo_sistema="FLUIDOS",
                nombre_accion="reposicion",
                plantilla_topico="{planta}/{gateway}/{seccion}/{sistema}/accion",
                plantilla_payload_json='{"accion": "REPOSICION", "bombo": "{bombo}", "limite_porcentaje": "{limite}"}'
            )
            MapeoAccionMQTT.objects.create(
                nombre="Carga y Mezcla de Receta de Líquidos",
                tipo_sistema="FLUIDOS",
                nombre_accion="mezcla",
                plantilla_topico="{planta}/{gateway}/{seccion}/{sistema}/mezcla",
                plantilla_payload_json='{"liquido_1": "{liquido_1}", "liquido_2": "{liquido_2}", "hora": "{hora}", "minuto": "{minuto}"}'
            )
            MapeoAccionMQTT.objects.create(
                nombre="Freno de Emergencia de Reposición",
                tipo_sistema="FLUIDOS",
                nombre_accion="freno_reposicion",
                plantilla_topico="{planta}/{gateway}/{seccion}/{sistema}/accion",
                plantilla_payload_json='{"accion": "FRENO_REPOSICION"}'
            )
            MapeoAccionMQTT.objects.create(
                nombre="Mezcla y Receta de Sólidos / Gránulos",
                tipo_sistema="SOLIDOS",
                nombre_accion="receta_solidos",
                plantilla_topico="{planta}/{gateway}/{seccion}/{sistema}/accion",
                plantilla_payload_json='{"accion": "RECETA_SOLIDOS", "tolva": "{tolva}", "peso_kg": "{peso}"}'
            )
            MapeoAccionMQTT.objects.create(
                nombre="Ajuste de Temperatura de Calentador/Enfriador",
                tipo_sistema="TEMPERATURA",
                nombre_accion="setpoint_temperatura",
                plantilla_topico="{planta}/{gateway}/{seccion}/{sistema}/temperatura/setpoint",
                plantilla_payload_json='{"setpoint_celsius": "{temp}", "modo": "{modo}"}'
            )
            MapeoAccionMQTT.objects.create(
                nombre="Operación de Sellado de Empaquetadora",
                tipo_sistema="EMPAQUE",
                nombre_accion="sellar",
                plantilla_topico="{planta}/{gateway}/{seccion}/{sistema}/sellar",
                plantilla_payload_json='{"accion": "SELLAR", "temperatura_sellado_c": "{temperatura}", "presion_bar": "{presion}"}'
            )
            MapeoAccionMQTT.objects.create(
                nombre="Inicio de Ciclo de Empaquetado",
                tipo_sistema="EMPAQUE",
                nombre_accion="empaquetar",
                plantilla_topico="{planta}/{gateway}/{seccion}/{sistema}/empaquetar",
                plantilla_payload_json='{"accion": "EMPAQUETAR", "unidades_por_caja": "{unidades}", "velocidad_cinta_hz": "{velocidad}"}'
            )
            MapeoAccionMQTT.objects.create(
                nombre="Parada / Pausa de Cinta Transportadora",
                tipo_sistema="EMPAQUE",
                nombre_accion="pausar_cinta",
                plantilla_topico="{planta}/{gateway}/{seccion}/{sistema}/pausa",
                plantilla_payload_json='{"accion": "PAUSAR_CINTA"}'
            )
            MapeoAccionMQTT.objects.create(
                nombre="Detener / Pausar Preparado de Mezcla",
                tipo_sistema="FLUIDOS",
                nombre_accion="detener_mezcla",
                plantilla_topico="{planta}/{gateway}/{seccion}/{sistema}/accion",
                plantilla_payload_json='{"accion": "DETENER_MEZCLA"}'
            )
            MapeoAccionMQTT.objects.create(
                nombre="Reanudar / Continuar Preparado de Mezcla",
                tipo_sistema="FLUIDOS",
                nombre_accion="reanudar_mezcla",
                plantilla_topico="{planta}/{gateway}/{seccion}/{sistema}/accion",
                plantilla_payload_json='{"accion": "REANUDAR_MEZCLA"}'
            )
            MapeoAccionMQTT.objects.create(
                nombre="Vaciar Bombo de Mezcla",
                tipo_sistema="FLUIDOS",
                nombre_accion="vaciar_mezcla",
                plantilla_topico="{planta}/{gateway}/{seccion}/{sistema}/accion",
                plantilla_payload_json='{"accion": "VACIAR_MEZCLA"}'
            )
            MapeoAccionMQTT.objects.create(
                nombre="Desechar Mezcla / Producción Defectuosa",
                tipo_sistema="FLUIDOS",
                nombre_accion="desechar_mezcla",
                plantilla_topico="{planta}/{gateway}/{seccion}/{sistema}/accion",
                plantilla_payload_json='{"accion": "DESECHAR_MEZCLA"}'
            )
            self.stdout.write(self.style.SUCCESS('Initial MapeoAccionMQTT seeded'))

        # 10. Normalizar plantillas de tópicos existentes removiendo prefijo legado 'scada/'
        for m in MapeoAccionMQTT.objects.filter(plantilla_topico__startswith='scada/'):
            m.plantilla_topico = m.plantilla_topico.replace('scada/', '', 1)
            m.save(update_fields=['plantilla_topico'])


