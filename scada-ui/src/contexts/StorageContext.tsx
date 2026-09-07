import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiFetch from '@/lib/api';

export interface StorageUnit {
  id: string;
  nodeId: string; // Links to SCADA diagram node
  name: string;
  type: 'tank' | 'silo' | 'deposit';
  content: string;
  currentVolume: number;
  capacity: number;
  unit: string;
  temperature?: number;
  status: 'active' | 'inactive' | 'warning' | 'error';
  seccion?: number | string;
  seccion_nombre?: string;
  sistema?: number | string;
  sistema_nombre?: string;
  inventario?: number | string;
  creado_el?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  category: 'raw_material' | 'additive' | 'catalyst' | 'base';
  unit: string;
  availableInStorage?: string; // Storage unit ID if available
}

interface StorageContextType {
  storageUnits: StorageUnit[];
  ingredients: Ingredient[];
  updateStorageUnit: (unit: StorageUnit) => Promise<{ success: boolean; error?: string }>;
  addStorageUnit: (unit: Omit<StorageUnit, 'id'>) => Promise<{ success: boolean; error?: string }>;
  deleteStorageUnit: (id: string) => Promise<{ success: boolean; error?: string }>;
  getStorageUnitByNodeId: (nodeId: string) => StorageUnit | undefined;
}

const defaultIngredients: Ingredient[] = [
  { id: 'ing-1', name: 'Aceite de Oliva', category: 'raw_material', unit: 'L', availableInStorage: 'storage-1' },
  { id: 'ing-2', name: 'Agua Destilada', category: 'raw_material', unit: 'L', availableInStorage: 'storage-2' },
  { id: 'ing-3', name: 'Glicerina', category: 'raw_material', unit: 'L' },
  { id: 'ing-4', name: 'Sosa Cáustica', category: 'catalyst', unit: 'kg' },
  { id: 'ing-5', name: 'Colorante Industrial', category: 'additive', unit: 'g' },
  { id: 'ing-6', name: 'Fragancia Natural', category: 'additive', unit: 'ml' },
  { id: 'ing-7', name: 'Polímero Base', category: 'base', unit: 'kg' },
  { id: 'ing-8', name: 'Estabilizador UV', category: 'additive', unit: 'g' },
  { id: 'ing-9', name: 'Catalizador A', category: 'catalyst', unit: 'g' },
  { id: 'ing-10', name: 'Resina Epóxica', category: 'base', unit: 'L' },
];

const StorageContext = createContext<StorageContextType | undefined>(undefined);

export const StorageProvider = ({ children }: { children: ReactNode }) => {
  const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);
  const [ingredients] = useState<Ingredient[]>(defaultIngredients);
  const [defaultInventarioId, setDefaultInventarioId] = useState<number | null>(null);

  // Mapear unidad de almacenamiento de backend a frontend
  const mapToFrontend = (item: any): StorageUnit => ({
    id: String(item.id),
    nodeId: item.node_id || "",
    name: item.nombre,
    type: (item.tipo || "TANK").toLowerCase() as 'tank' | 'silo' | 'deposit',
    content: item.contenido || "",
    currentVolume: item.volumen_actual || 0,
    capacity: item.capacidad || 1000,
    unit: item.unidad || "L",
    temperature: item.temperatura || undefined,
    status: (item.estado || "ACTIVE").toLowerCase() as 'active' | 'inactive' | 'warning' | 'error',
    seccion: item.seccion || undefined,
    seccion_nombre: item.seccion_nombre || "",
    sistema: item.sistema || undefined,
    sistema_nombre: item.sistema_nombre || "",
    inventario: item.inventario || undefined,
    creado_el: item.created_at || "",
  });

  // Mapear unidad de almacenamiento de frontend a backend
  const mapToBackend = (unit: Omit<StorageUnit, 'id'> | StorageUnit, fallbackInventarioId: number) => {
    const secStr = unit.seccion && unit.seccion !== "ninguna" && unit.seccion !== "none" ? String(unit.seccion) : "";
    const sysStr = unit.sistema && unit.sistema !== "ninguno" && unit.sistema !== "none" ? String(unit.sistema) : "";
    const targetInv = unit.inventario ? Number(unit.inventario) : (fallbackInventarioId || 1);
    
    const payload: any = {
      nombre: unit.name,
      tipo: (unit.type || 'tank').toUpperCase(),
      contenido: unit.content,
      volumen_actual: Number(unit.currentVolume) || 0,
      capacidad: Number(unit.capacity) || 1000,
      unidad: unit.unit || 'L',
      temperatura: unit.temperature !== undefined && unit.temperature !== null && !isNaN(Number(unit.temperature)) ? Number(unit.temperature) : null,
      estado: (unit.status || 'active').toUpperCase(),
      node_id: unit.nodeId && unit.nodeId.trim() !== "" ? unit.nodeId : null,
      seccion: secStr && !isNaN(Number(secStr)) ? Number(secStr) : null,
      sistema: sysStr && !isNaN(Number(sysStr)) ? Number(sysStr) : null,
    };
    if (targetInv && !isNaN(targetInv)) {
      payload.inventario = targetInv;
    }
    return payload;
  };

  // Cargar datos al montar
  const loadData = async () => {
    try {
      // Traer primer inventario para usar de default en creaciones
      const invResp = await apiFetch('/api/v1/inventarios/');
      let invId = 1;
      if (invResp.ok) {
        const invs = await invResp.json();
        const list = Array.isArray(invs) ? invs : invs.results || [];
        if (list.length > 0) {
          invId = list[0].id;
          setDefaultInventarioId(invId);
        }
      }

      // Traer unidades de almacenamiento
      const resp = await apiFetch('/api/v1/unidades-almacenamiento/');
      if (resp.ok) {
        const items = await resp.json();
        const list = Array.isArray(items) ? items : items.results || [];
        setStorageUnits(list.map(mapToFrontend));
      }
    } catch (err) {
      console.error("Error al cargar unidades de almacenamiento", err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const updateStorageUnit = async (updatedUnit: StorageUnit): Promise<{ success: boolean; error?: string }> => {
    try {
      const invId = defaultInventarioId || 1;
      const payload = mapToBackend(updatedUnit, invId);
      const resp = await apiFetch(`/api/v1/unidades-almacenamiento/${updatedUnit.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const data = await resp.json();
        const frontendUnit = mapToFrontend(data);
        setStorageUnits((prev) =>
          prev.map((unit) => (unit.id === updatedUnit.id ? frontendUnit : unit))
        );
        return { success: true };
      } else {
        const errData = await resp.json().catch(() => ({}));
        const detail = errData.detail || Object.entries(errData).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" | ") || `HTTP ${resp.status}`;
        return { success: false, error: detail };
      }
    } catch (err) {
      return { success: false, error: "Error de comunicación con el servidor" };
    }
  };

  const addStorageUnit = async (unitData: Omit<StorageUnit, 'id'>): Promise<{ success: boolean; error?: string }> => {
    try {
      const invId = defaultInventarioId || 1;
      const resp = await apiFetch('/api/v1/unidades-almacenamiento/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapToBackend(unitData, invId)),
      });
      if (resp.ok) {
        const data = await resp.json();
        const newUnit = mapToFrontend(data);
        setStorageUnits((prev) => [...prev, newUnit]);
        return { success: true };
      } else {
        const errData = await resp.json().catch(() => ({}));
        const detail = errData.detail || Object.entries(errData).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" | ") || `HTTP ${resp.status}`;
        return { success: false, error: detail };
      }
    } catch (err) {
      return { success: false, error: "Error al crear unidad de almacenamiento" };
    }
  };

  const deleteStorageUnit = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const resp = await apiFetch(`/api/v1/unidades-almacenamiento/${id}/`, {
        method: 'DELETE',
      });
      if (resp.ok || resp.status === 204) {
        setStorageUnits((prev) => prev.filter((unit) => unit.id !== id));
        return { success: true };
      } else {
        return { success: false, error: `Error HTTP ${resp.status}` };
      }
    } catch (err) {
      return { success: false, error: "Error al eliminar unidad de almacenamiento" };
    }
  };

  const getStorageUnitByNodeId = (nodeId: string) => {
    return storageUnits.find((unit) => unit.nodeId === nodeId);
  };

  return (
    <StorageContext.Provider
      value={{
        storageUnits,
        ingredients,
        updateStorageUnit,
        addStorageUnit,
        deleteStorageUnit,
        getStorageUnitByNodeId,
      }}
    >
      {children}
    </StorageContext.Provider>
  );
};

export const useStorage = () => {
  const context = useContext(StorageContext);
  if (context === undefined) {
    throw new Error('useStorage must be used within a StorageProvider');
  }
  return context;
};
