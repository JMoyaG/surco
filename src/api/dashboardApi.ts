export type ProveedorResumen = {
  Proveedor: string;
  VentaNeta: number;
  KiloLitro: number;
  CantidadTotal?: number;
  LineasDetalle?: number;
  Participacion?: number;
  Cumplimiento?: number;
};

export type FamiliaResumen = {
  Familia: string;
  VentaNeta: number;
  CantidadTotal?: number;
  LineasDetalle?: number;
  Participacion?: number;
};

export type SucursalResumen = {
  Sucursal: string;
  VentaNeta: number;
  CantidadTotal?: number;
  LineasDetalle?: number;
  Cumplimiento: number;
};

export type MesResumen = {
  mes: string;
  presupuesto: number;
  real: number;
};

export type ProductoResumen = {
  Producto: string;
  Familia: string;
  Proveedor: string;
  Sucursal?: string;
  VentaNeta: number;
  KiloLitro: number;
  CantidadTotal?: number;
  LineasDetalle?: number;
};


export type VentaDetalleResumen = {
  Bodega: string;
  FechaVenta?: string;
  idFactura?: string;
  Codigo: string;
  Cliente: string;
  Proveedor: string;
  Familia: string;
  Producto: string;
  UnidadFinal: string;
  Vendido: number;
  CantidadFinal: number;
  KiloLitro: number;
  Precio: number;
  Descuento: number;
  VentaNeta: number;
  MargenPorcentaje: number;
  LineasDetalle: number;
};

export type Cliente80Resumen = {
  Cliente: string;
  VentaNeta: number;
  CantidadTotal: number;
  KiloLitro: number;
  LineasDetalle: number;
};

export type PresupuestoFamiliaResumen = {
  Familia: string;
  Presupuesto: number;
  Real: number;
  Diferencia: number;
  Cumplimiento: number;
  PresupuestoKiloLitro: number;
  KiloLitroReal: number;
  LineasDetalle: number;
};

export type DetalleVenta = Record<string, any> & {
  RowNum: number;
  DetalleFechaVenta?: string;
  DetalleSucursal?: string;
  DetalleProveedor?: string;
  DetalleFamilia?: string;
  DetalleProducto?: string;
  DetalleCantidadFinal?: number;
  DetalleUnidadFinal?: string;
  DetalleVentaNeta?: number;
};

export type DetalleVentasPayload = {
  ok: boolean;
  fechaActualizacion: string;
  page: number;
  pageSize: number;
  totalRegistros: number;
  totalPaginas: number;
  ventaNeta: number;
  cantidadTotal: number;
  kiloLitro: number;
  rows: DetalleVenta[];
};

export type DashboardPayload = {
  ok: boolean;
  fechaActualizacion: string;

  presupuesto: number;
  ventaReal: number;
  kiloLitro: number;
  cantidadTotal?: number;
  lineasDetalle?: number;

  proveedores: ProveedorResumen[];
  familias: FamiliaResumen[];
  sucursales: SucursalResumen[];
  meses: MesResumen[];
  productos: ProductoResumen[];
  ventasDetalle?: VentaDetalleResumen[];
  clientes80?: Cliente80Resumen[];
  presupuestoFamilias?: PresupuestoFamiliaResumen[];
  opciones?: {
    proveedores: string[];
    familias: string[];
    bodegas: string[];
    productos: string[];
  };
};

export type DashboardFiltros = {
  mes?: string;
  anio?: string | number;
  proveedor?: string | string[];
  familia?: string | string[];
  bodega?: string | string[];
  producto?: string | string[];
  q?: string;
};

const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ||
  "http://172.22.1.7:3005";

function appendParam(params: URLSearchParams, key: string, value?: string | string[] | number) {
  if (value === undefined || value === null || value === "") return;

  if (Array.isArray(value)) {
    value
      .filter((item) => String(item || "").trim() !== "")
      .forEach((item) => params.append(key, String(item)));
    return;
  }

  params.append(key, String(value));
}

function buildParams(filtros?: DashboardFiltros & { page?: number; pageSize?: number }) {
  const params = new URLSearchParams();

  appendParam(params, "mes", filtros?.mes);
  appendParam(params, "anio", filtros?.anio);
  appendParam(params, "proveedor", filtros?.proveedor);
  appendParam(params, "familia", filtros?.familia);
  appendParam(params, "bodega", filtros?.bodega);
  appendParam(params, "producto", filtros?.producto);
  appendParam(params, "q", filtros?.q);
  appendParam(params, "page", filtros?.page);
  appendParam(params, "pageSize", filtros?.pageSize);

  return params;
}

export async function obtenerDashboard(filtros?: DashboardFiltros): Promise<DashboardPayload> {
  const params = buildParams(filtros);

  const response = await fetch(`${API_BASE_URL}/api/dashboard?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Error consultando servidor: ${response.status}`);
  }

  return response.json();
}

export async function obtenerDetalleVentas(
  filtros?: DashboardFiltros & { page?: number; pageSize?: number }
): Promise<DetalleVentasPayload> {
  const params = buildParams(filtros);

  const response = await fetch(`${API_BASE_URL}/api/dashboard/detalle?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Error consultando detalle: ${response.status}`);
  }

  return response.json();
}
