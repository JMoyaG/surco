export type ProveedorResumen = {
  Proveedor: string;
  VentaNeta: number;
  KiloLitro: number;
  Participacion?: number;
  Cumplimiento?: number;
};

export type FamiliaResumen = {
  Familia: string;
  VentaNeta: number;
  Participacion?: number;
};

export type SucursalResumen = {
  Sucursal: string;
  VentaNeta: number;
  Cumplimiento: number;
};

export type MesResumen = {
  mes: string;
  presupuesto: number;
  real: number;
};

export type DashboardPayload = {
  ok: boolean;
  fechaActualizacion: string;

  presupuesto: number;
  ventaReal: number;
  kiloLitro: number;

  proveedores: ProveedorResumen[];
  familias: FamiliaResumen[];
  sucursales: SucursalResumen[];
  meses: MesResumen[];

  opciones?: {
    proveedores: string[];
    familias: string[];
    bodegas: string[];
    productos: string[];
  };
};

const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ||
  "http://172.22.1.7:3005";

export async function obtenerDashboard(
  filtros?: {
    mes?: string;
    proveedor?: string;
    familia?: string;
    bodega?: string;
    producto?: string;
  }
): Promise<DashboardPayload> {

  const params = new URLSearchParams();

  if (filtros?.mes) params.append("mes", filtros.mes);
  if (filtros?.proveedor) params.append("proveedor", filtros.proveedor);
  if (filtros?.familia) params.append("familia", filtros.familia);
  if (filtros?.bodega) params.append("bodega", filtros.bodega);
  if (filtros?.producto) params.append("producto", filtros.producto);

  const response = await fetch(
    `${API_BASE_URL}/api/dashboard?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`Error consultando servidor: ${response.status}`);
  }

  return response.json();
}