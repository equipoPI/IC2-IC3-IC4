from rest_framework import permissions

def get_user_rango(user):
    if not user or not user.is_authenticated:
        return 0
    if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
        return 8
    try:
        emp = getattr(user, 'empleado', None)
        if emp and getattr(emp, 'rango', None):
            return int(emp.rango)
    except Exception:
        pass
    try:
        profile = getattr(user, 'profile', None)
        if profile:
            if hasattr(profile, 'empleado') and profile.empleado and getattr(profile.empleado, 'rango', None):
                return int(profile.empleado.rango)
            if getattr(profile, 'role', '') == 'admin':
                return 8
    except Exception:
        pass
    return 1


class IsAdminUserOrReadOnly(permissions.BasePermission):
    """
    Permite lectura a usuarios autenticados autorizados.
    Mutaciones (POST, PUT, PATCH, DELETE) requieren Rango 8 (Administrador) o superusuario.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        rango = get_user_rango(request.user)
        return rango == 8


class CanManageEmployees(permissions.BasePermission):
    """
    Lectura permitida para Rangos directivos y jefatura (1, 2, 3, 4, 8).
    Modificación (POST, PUT, PATCH, DELETE) restringida exclusivamente a Rango 8 (Administrador).
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        rango = get_user_rango(request.user)
        if request.method in permissions.SAFE_METHODS:
            return rango in [1, 2, 3, 4, 8]
        return rango == 8


class CanAccessSystemConfig(permissions.BasePermission):
    """
    Acceso completo (Lectura y Escritura) restringido exclusivamente a Rango 8 (Administrador).
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        rango = get_user_rango(request.user)
        return rango == 8


class CanViewAudit(permissions.BasePermission):
    """
    Permite lectura de registros de auditoría a usuarios con rangos autorizados (1, 2, 3, 4, 8)
    o superusuario/staff. Creación permitida para cualquier usuario autenticado.
    Mutaciones/eliminaciones restringidas a Rango 8.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if getattr(view, 'action', None) == 'create':
            return True
        rango = get_user_rango(request.user)
        if request.method in permissions.SAFE_METHODS:
            return rango in [1, 2, 3, 4, 8]
        return rango == 8

