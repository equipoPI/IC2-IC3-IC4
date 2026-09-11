export const machineDefinitions: Record<string, { label: string; connectedNodes?: string[] }> = {
  'tank-1': { label: 'Tanque A', connectedNodes: ['electrovalvula-1', 'pump-1'] },
  'tank-2': { label: 'Tanque B', connectedNodes: ['electrovalvula-2', 'pump-2'] },
  'electrovalvula-1': { label: 'Válvula Rep. A', connectedNodes: ['bomba_reposicion', 'tank-1'] },
  'electrovalvula-2': { label: 'Válvula Rep. B', connectedNodes: ['bomba_reposicion', 'tank-2'] },
  'bomba_reposicion': { label: 'Bomba Reposición', connectedNodes: ['electrovalvula-1', 'electrovalvula-2'] },
  'pump-1': { label: 'Bomba A', connectedNodes: ['tank-1', 'sensor-3'] },
  'pump-2': { label: 'Bomba B', connectedNodes: ['tank-2', 'sensor_caudal_02'] },
  'sensor-3': { label: 'Caudalímetro 1', connectedNodes: ['pump-1', 'mixer-1'] },
  'sensor_caudal_02': { label: 'Caudalímetro 2', connectedNodes: ['pump-2', 'mixer-1'] },
  'mixer-1': { label: 'Mezclador M1', connectedNodes: ['sensor-3', 'sensor_caudal_02', 'bomba_mezcla'] },
  'bomba_mezcla': { label: 'Bomba de Mezcla', connectedNodes: ['mixer-1', 'tank-3'] },
  'tank-3': { label: 'Tanque Salida', connectedNodes: ['bomba_mezcla'] },
};

export const getCanonicalNodeId = (item: any): string => {
  const s = String(item.node_id || item.numero_serie || item.nombre || item.id || '').toLowerCase();
  if (s.includes('reposicion')) return 'bomba_reposicion';
  if (s.includes('valvula-1') || s.includes('valvula_1') || s.includes('valvula 1') || s.includes('electrovalvula-1') || s.includes('electrovalvula1') || s.includes('rep. a')) return 'electrovalvula-1';
  if (s.includes('valvula-2') || s.includes('valvula_2') || s.includes('valvula 2') || s.includes('electrovalvula-2') || s.includes('electrovalvula2') || s.includes('rep. b')) return 'electrovalvula-2';
  if (s.includes('bomba_mezcla') || (s.includes('mezcla') && (item.categoria === 'BOMBA' || s.includes('bomba')))) return 'bomba_mezcla';
  if (s === 'bomba1' || s === 'pump-1' || s.includes('bomba p1') || s.includes('bomba a')) return 'pump-1';
  if (s === 'bomba2' || s === 'pump-2' || s.includes('bomba p2') || s.includes('bomba b')) return 'pump-2';
  if (s === 'mixer-1' || s.includes('mezclador') || s.includes('mixer')) return 'mixer-1';
  if (s === 'sensor-3' || s.includes('caudal_01') || s.includes('caudal 1') || s.includes('flujo tubería a') || s.includes('flujo a')) return 'sensor-3';
  if (s === 'sensor_caudal_02' || s.includes('caudal_02') || s.includes('caudal 2') || s.includes('flujo tubería b') || s.includes('flujo b')) return 'sensor_caudal_02';
  if (s.includes('sensor_nivel_bombo1') || s.includes('sensor nivel bombo 1')) return 'sensor_nivel_bombo1';
  if (s.includes('sensor_nivel_bombo2') || s.includes('sensor nivel bombo 2')) return 'sensor_nivel_bombo2';
  if (s.includes('sensor_nivel_mezcla') || s.includes('sensor nivel mezcla')) return 'sensor_nivel_mezcla';
  if (s === 'tank-1' || s.includes('tanque a') || s.includes('bombo 1') || s === 'bombo1') return 'tank-1';
  if (s === 'tank-2' || s.includes('tanque b') || s.includes('bombo 2') || s === 'bombo2') return 'tank-2';
  if (s === 'tank-3' || s.includes('tanque salida') || s.includes('tanque mezcla') || s === 'mezcla') return 'tank-3';
  return item.node_id || item.numero_serie || `dev_${item.id}`;
};
