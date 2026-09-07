import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mysite.settings')
django.setup()

from polls.models import MapeoAccionMQTT

actions = [
    {
        'nombre_accion': 'detener_mezcla',
        'nombre': 'Detener / Pausar Preparado de Mezcla',
        'tipo_sistema': 'FLUIDOS',
        'plantilla_topico': '{planta}/{gateway}/{seccion}/{sistema}/accion',
        'plantilla_payload_json': '{"accion": "DETENER_MEZCLA"}'
    },
    {
        'nombre_accion': 'reanudar_mezcla',
        'nombre': 'Reanudar / Continuar Preparado de Mezcla',
        'tipo_sistema': 'FLUIDOS',
        'plantilla_topico': '{planta}/{gateway}/{seccion}/{sistema}/accion',
        'plantilla_payload_json': '{"accion": "REANUDAR_MEZCLA"}'
    },
    {
        'nombre_accion': 'vaciar_mezcla',
        'nombre': 'Vaciar Bombo de Mezcla',
        'tipo_sistema': 'FLUIDOS',
        'plantilla_topico': '{planta}/{gateway}/{seccion}/{sistema}/accion',
        'plantilla_payload_json': '{"accion": "VACIAR_MEZCLA"}'
    },
    {
        'nombre_accion': 'desechar_mezcla',
        'nombre': 'Desechar Mezcla / Producción Defectuosa',
        'tipo_sistema': 'FLUIDOS',
        'plantilla_topico': '{planta}/{gateway}/{seccion}/{sistema}/accion',
        'plantilla_payload_json': '{"accion": "DESECHAR_MEZCLA"}'
    }
]

for act in actions:
    obj, created = MapeoAccionMQTT.objects.get_or_create(
        nombre_accion=act['nombre_accion'],
        defaults=act
    )
    if created:
        print(f"Creada accion: {act['nombre_accion']}")
    else:
        print(f"Existia accion: {act['nombre_accion']}")

print("Total acciones en DB:", MapeoAccionMQTT.objects.count())
