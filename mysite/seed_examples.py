import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mysite.settings')
django.setup()

from polls.models import MapeoAccionMQTT, Sistema

sistema = Sistema.objects.filter(nombre__icontains='Mezclado').first() or Sistema.objects.first()
print('Sistema asociado:', sistema)

# 1. Reposición de Bombos
m1, created1 = MapeoAccionMQTT.objects.update_or_create(
    nombre_accion='reposicion',
    sistema=sistema,
    defaults={
        'nombre': 'Control de Reposición de Bombos',
        'tipo_sistema': 'FLUIDOS',
        'tipo_control': 'PARAMETRIZADO',
        'categoria_panel': 'Control de Reposición',
        'plantilla_topico': '{tenant}/{gateway}/{seccion}/{sistema}/{accion}',
        'plantilla_payload_json': '{\n  "bombo": {bombo},\n  "limite_porcentaje": {limite_porcentaje}\n}',
        'min_val': 0,
        'max_val': 100,
        'unidad': '%',
        'activo': True,
    }
)
print(f'Mapeo Reposición: ID {m1.id}, Creado: {created1}')

# 2. Receta de Mezclado
m2, created2 = MapeoAccionMQTT.objects.update_or_create(
    nombre_accion='receta_liquidos',
    sistema=sistema,
    defaults={
        'nombre': 'Panel de Dosificación de Receta',
        'tipo_sistema': 'FLUIDOS',
        'tipo_control': 'RECETA',
        'categoria_panel': 'Receta Líquidos',
        'plantilla_topico': '{tenant}/{gateway}/{seccion}/{sistema}/{accion}',
        'plantilla_payload_json': '{\n  "ingrediente_a_lts": {ingrediente_a},\n  "ingrediente_b_lts": {ingrediente_b},\n  "tiempo_mezcla_min": {tiempo_mezcla}\n}',
        'min_val': 0,
        'max_val': 500,
        'unidad': 'L',
        'activo': True,
    }
)
print(f'Mapeo Receta: ID {m2.id}, Creado: {created2}')
