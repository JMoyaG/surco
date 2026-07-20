import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaBars,
  FaBell,
  FaBoxOpen,
  FaBullseye,
  FaChartLine,
  FaCog,
  FaDollarSign,
  FaExclamationTriangle,
  FaFilter,
  FaGripVertical,
  FaHome,
  FaMapMarkerAlt,
  FaMedal,
  FaPlus,
  FaStore,
  FaThLarge,
  FaTimes,
  FaTrashAlt,
  FaSyncAlt,
  FaUsers,
  FaSearch,
  FaChevronDown,
  FaChevronUp,
} from "react-icons/fa";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardPayload, DetalleVentasPayload, DetalleVenta, VentaDetalleResumen, PresupuestoFamiliaResumen } from "../api/dashboardApi";
import { obtenerDashboard, obtenerDetalleVentas } from "../api/dashboardApi";
import "./dashboard.css";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
type Props = { onLogout: () => void };
type SyncStatus = "loading" | "real" | "demo" | "error";
type VistaGrafico = "mensual" | "cuatrimestre";
type Seccion =
  | "resumen"
  | "consulta"
  | "ventas"
  | "detalle"
  | "presupuesto"
  | "proveedores"
  | "sucursales"
  | "productos"
  | "alertas"
  | "configuracion";


type DrillLevel = {
  field: keyof VentaDetalleResumen;
  label: string;
};

type DrillTotals = {
  precio: number;
  descuento: number;
  ventaNeta: number;
  kiloLitro: number;
  cantidad: number;
  vendido: number;
  lineas: number;
};

type VisualWidgetId =
  | "clientes80"
  | "clientesVenta"
  | "presupuestoReal"
  | "tiendas"
  | "proveedores"
  | "familias"
  | "avance";

type VisualWidgetDefinition = {
  id: VisualWidgetId;
  title: string;
  description: string;
  size: "half" | "full";
};

const VISUAL_WIDGETS: VisualWidgetDefinition[] = [
  {
    id: "clientes80",
    title: "80/20 de clientes",
    description: "Clientes que concentran aproximadamente el 80% de la venta neta.",
    size: "full",
  },
  {
    id: "clientesVenta",
    title: "Clientes y venta neta",
    description: "Cuadro limpio con cliente y venta neta.",
    size: "half",
  },
  {
    id: "presupuestoReal",
    title: "Presupuesto contra real",
    description: "Comparación mensual o por cuatrimestre.",
    size: "half",
  },
  {
    id: "tiendas",
    title: "Venta por tienda",
    description: "Venta y cumplimiento de cada sucursal.",
    size: "half",
  },
  {
    id: "proveedores",
    title: "Top proveedores",
    description: "Ranking de proveedores por venta neta.",
    size: "half",
  },
  {
    id: "familias",
    title: "Venta por familia",
    description: "Participación de las principales familias.",
    size: "half",
  },
  {
    id: "avance",
    title: "Avance del presupuesto",
    description: "Cumplimiento, venta real y faltante.",
    size: "half",
  },
];


type ConsultaVisualModo = "dinamica" | "cuadros";
type PivotDimensionField =
  | "Bodega"
  | "Proveedor"
  | "Familia"
  | "Codigo"
  | "Producto"
  | "Cliente"
  | "idFactura"
  | "FechaVenta"
  | "UnidadFinal";
type PivotMetricField =
  | "VentaNeta"
  | "Presupuesto"
  | "DiferenciaPresupuesto"
  | "CumplimientoPresupuesto"
  | "Precio"
  | "Descuento"
  | "KiloLitro"
  | "CantidadFinal"
  | "Vendido"
  | "MargenPorcentaje"
  | "LineasDetalle";
type PivotAggregation = "sum" | "average" | "count" | "max" | "min";
type PivotParetoMode = "off" | "show" | "only80";
type PivotDropZone = "rows" | "columns" | "values" | null;
type PivotMetricFormat = "money" | "number" | "percent";

type PivotDimensionDefinition = {
  field: PivotDimensionField;
  label: string;
  description: string;
};

type PivotMetricDefinition = {
  field: PivotMetricField;
  label: string;
  description: string;
  format: PivotMetricFormat;
  defaultAggregation: PivotAggregation;
  calculated?: boolean;
};

type PivotValueConfig = {
  field: PivotMetricField;
  aggregation: PivotAggregation;
};

type PivotConfig = {
  rows: PivotDimensionField[];
  column: PivotDimensionField | null;
  values: PivotValueConfig[];
  paretoMode: PivotParetoMode;
  limit: number;
  sortDirection: "asc" | "desc";
};

type PivotResultGroup = {
  key: string;
  labels: string[];
  rows: VentaDetalleResumen[];
  cells: Map<string, VentaDetalleResumen[]>;
  participation: number;
  cumulative: number;
  paretoIncluded: boolean;
};

type PivotResult = {
  filteredRows: VentaDetalleResumen[];
  allGroups: PivotResultGroup[];
  visibleGroups: PivotResultGroup[];
  columnValues: string[];
  columnTotals: Map<string, VentaDetalleResumen[]>;
  totalColumnValues: number;
  truncatedColumns: boolean;
  totalPrimaryValue: number;
};

type PivotValueResolver = (
  rows: VentaDetalleResumen[],
  value: PivotValueConfig,
  universeRows: VentaDetalleResumen[]
) => number;

const PIVOT_DIMENSIONS: PivotDimensionDefinition[] = [
  { field: "Bodega", label: "Tienda / Bodega", description: "Sucursal o centro de distribución." },
  { field: "Proveedor", label: "Proveedor", description: "Proveedor asociado al producto." },
  { field: "Familia", label: "Familia", description: "Familia comercial del producto." },
  { field: "Codigo", label: "Código", description: "Código interno del producto." },
  { field: "Producto", label: "Producto", description: "Descripción del producto." },
  { field: "Cliente", label: "Cliente", description: "Cliente facturado." },
  { field: "idFactura", label: "Factura", description: "Número de factura." },
  { field: "FechaVenta", label: "Fecha", description: "Fecha de venta." },
  { field: "UnidadFinal", label: "Unidad", description: "Unidad final de venta." },
];

const PIVOT_METRICS: PivotMetricDefinition[] = [
  { field: "VentaNeta", label: "Venta neta", description: "Venta después del descuento.", format: "money", defaultAggregation: "sum" },
  { field: "Presupuesto", label: "Presupuesto", description: "Presupuesto filtrado. Por familia usa el presupuesto real; en otros niveles se distribuye proporcionalmente.", format: "money", defaultAggregation: "sum", calculated: true },
  { field: "DiferenciaPresupuesto", label: "Diferencia vs presupuesto", description: "Venta neta menos presupuesto.", format: "money", defaultAggregation: "sum", calculated: true },
  { field: "CumplimientoPresupuesto", label: "Cumplimiento %", description: "Venta neta dividida entre presupuesto.", format: "percent", defaultAggregation: "average", calculated: true },
  { field: "Precio", label: "Precio", description: "Monto bruto antes del descuento.", format: "money", defaultAggregation: "sum" },
  { field: "Descuento", label: "Descuento", description: "Descuento aplicado.", format: "money", defaultAggregation: "sum" },
  { field: "KiloLitro", label: "Kilos / litros", description: "Volumen vendido.", format: "number", defaultAggregation: "sum" },
  { field: "CantidadFinal", label: "Cantidad", description: "Cantidad final facturada.", format: "number", defaultAggregation: "sum" },
  { field: "Vendido", label: "Vendido", description: "Cantidad base vendida.", format: "number", defaultAggregation: "sum" },
  { field: "MargenPorcentaje", label: "Margen %", description: "Porcentaje de margen promedio.", format: "percent", defaultAggregation: "average" },
  { field: "LineasDetalle", label: "Líneas", description: "Cantidad de líneas de detalle.", format: "number", defaultAggregation: "sum" },
];

const PIVOT_AGGREGATIONS: Array<{ id: PivotAggregation; label: string }> = [
  { id: "sum", label: "Suma" },
  { id: "average", label: "Promedio" },
  { id: "count", label: "Conteo" },
  { id: "max", label: "Máximo" },
  { id: "min", label: "Mínimo" },
];

const DEFAULT_PIVOT_CONFIG: PivotConfig = {
  rows: ["Cliente"],
  column: null,
  values: [{ field: "VentaNeta", aggregation: "sum" }],
  paretoMode: "only80",
  limit: 100,
  sortDirection: "desc",
};

const MAX_PIVOT_COLUMNS = 30;

const demoData: DashboardPayload = {
  ok: true,
  fechaActualizacion: "Datos demo",
  presupuesto: 707_170_000,
  ventaReal: 554_220_000,
  kiloLitro: 1_110_000,
  productos: [],
  meses: [],
  familias: [],
  proveedores: [],
  sucursales: [],
};

const detalleVacio: DetalleVentasPayload = {
  ok: true,
  fechaActualizacion: "",
  page: 1,
  pageSize: 100,
  totalRegistros: 0,
  totalPaginas: 0,
  ventaNeta: 0,
  cantidadTotal: 0,
  kiloLitro: 0,
  rows: [],
};



const menuItems: Array<{ id: Seccion; label: string; icon: ReactNode; badge?: number }> = [
  { id: "resumen", label: "Resumen Ejecutivo", icon: <FaHome /> },
  { id: "consulta", label: "Consulta Visual", icon: <FaThLarge /> },
  { id: "ventas", label: "Ventas", icon: <FaChartLine /> },
  { id: "presupuesto", label: "Presupuesto", icon: <FaBullseye /> },
  { id: "proveedores", label: "Proveedores", icon: <FaUsers /> },
  { id: "sucursales", label: "Sucursales", icon: <FaMapMarkerAlt /> },
  { id: "productos", label: "Productos", icon: <FaBoxOpen /> },
  { id: "alertas", label: "Alertas", icon: <FaBell />, badge: 3 },
  { id: "configuracion", label: "Configuración", icon: <FaCog /> },
];

function formatMoney(value: number, decimals = 2) {
  return `₡${(Number(value || 0) / 1_000_000).toFixed(decimals)} M`;
}

function formatMoneyExact(value: number) {
  return `₡${Number(value || 0).toLocaleString("es-CR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("es-CR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value: any) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("es-CR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDetalleValue(row: DetalleVenta, fields: string[], fallback: any = "-") {
  for (const field of fields) {
    const value = row[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return fallback;
}

function formatKiloLitro(value: number) {
  const numero = Number(value || 0);

  if (Math.abs(numero) >= 1_000) {
    return `${(numero / 1_000).toLocaleString("es-CR", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    })} mil`;
  }

  return numero.toLocaleString("es-CR", { maximumFractionDigits: 0 });
}

function getChartMoneyTick(value: number) {
  return `₡${(Number(value || 0) / 1_000_000).toLocaleString("es-CR", { maximumFractionDigits: 0 })}M`;
}

function getStatusClass(cumplimiento: number) {
  if (cumplimiento >= 110) return "good";
  if (cumplimiento >= 90) return "ok";
  if (cumplimiento >= 70) return "warn";
  return "bad";
}

function normalizarMapa(valor: string) {
  return String(valor || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}


function getPivotDimensionDefinition(field: PivotDimensionField) {
  return PIVOT_DIMENSIONS.find((item) => item.field === field)!;
}

function getPivotMetricDefinition(field: PivotMetricField) {
  return PIVOT_METRICS.find((item) => item.field === field)!;
}

function getPivotAggregationLabel(aggregation: PivotAggregation) {
  return PIVOT_AGGREGATIONS.find((item) => item.id === aggregation)?.label || aggregation;
}

function isCalculatedPivotMetric(field: PivotMetricField) {
  return Boolean(getPivotMetricDefinition(field).calculated);
}

function getPivotValueHeader(value: PivotValueConfig) {
  const definition = getPivotMetricDefinition(value.field);
  return definition.calculated
    ? definition.label
    : `${getPivotAggregationLabel(value.aggregation)} de ${definition.label}`;
}

function normalizePivotKey(value: unknown) {
  return String(value ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isPivotDimensionField(value: unknown): value is PivotDimensionField {
  return PIVOT_DIMENSIONS.some((item) => item.field === value);
}

function isPivotMetricField(value: unknown): value is PivotMetricField {
  return PIVOT_METRICS.some((item) => item.field === value);
}

function isPivotAggregation(value: unknown): value is PivotAggregation {
  return PIVOT_AGGREGATIONS.some((item) => item.id === value);
}

function loadPivotConfig(): PivotConfig {
  try {
    const saved = JSON.parse(localStorage.getItem("surco_tabla_dinamica") || "null");
    if (!saved || typeof saved !== "object") return DEFAULT_PIVOT_CONFIG;

    const rows: PivotDimensionField[] = Array.isArray(saved.rows)
      ? saved.rows.filter((field: unknown): field is PivotDimensionField => isPivotDimensionField(field))
      : DEFAULT_PIVOT_CONFIG.rows;
    const column = isPivotDimensionField(saved.column) ? saved.column : null;
    const values: PivotValueConfig[] = Array.isArray(saved.values)
      ? saved.values
          .filter((item: any) => isPivotMetricField(item?.field))
          .map((item: any) => ({
            field: item.field as PivotMetricField,
            aggregation: isPivotAggregation(item.aggregation)
              ? item.aggregation
              : getPivotMetricDefinition(item.field as PivotMetricField).defaultAggregation,
          }))
      : DEFAULT_PIVOT_CONFIG.values;
    const paretoMode: PivotParetoMode = ["off", "show", "only80"].includes(saved.paretoMode)
      ? saved.paretoMode
      : DEFAULT_PIVOT_CONFIG.paretoMode;
    const limit = [25, 50, 100, 250, 1000].includes(Number(saved.limit))
      ? Number(saved.limit)
      : DEFAULT_PIVOT_CONFIG.limit;
    const sortDirection = saved.sortDirection === "asc" ? "asc" : "desc";

    return {
      rows: rows.filter((field) => field !== column),
      column,
      values: values.length > 0 ? values : DEFAULT_PIVOT_CONFIG.values,
      paretoMode,
      limit,
      sortDirection,
    };
  } catch {
    return DEFAULT_PIVOT_CONFIG;
  }
}

function formatPivotDimensionValue(row: VentaDetalleResumen, field: PivotDimensionField) {
  const rawValue = row[field];

  if (field === "FechaVenta") {
    if (!rawValue) return "SIN FECHA";
    const date = new Date(String(rawValue));
    if (Number.isNaN(date.getTime())) return String(rawValue);
    return date.toLocaleDateString("es-CR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  if (field === "idFactura") {
    return rawValue ? String(rawValue) : "SIN FACTURA";
  }

  return String(rawValue ?? "").trim() || "SIN DATO";
}

function aggregatePivotValue(rows: VentaDetalleResumen[], value: PivotValueConfig) {
  if (rows.length === 0 || isCalculatedPivotMetric(value.field)) return 0;

  if (value.aggregation === "count") {
    if (value.field === "LineasDetalle") {
      return rows.reduce((acc, row) => acc + Number(row.LineasDetalle || 0), 0);
    }
    return rows.filter((row) => {
      const rawValue = (row as unknown as Record<string, unknown>)[value.field];
      return rawValue !== null && rawValue !== undefined;
    }).length;
  }

  const numbers = rows.map((row) =>
    Number((row as unknown as Record<string, unknown>)[value.field] || 0)
  );

  switch (value.aggregation) {
    case "average":
      return numbers.reduce((acc, number) => acc + number, 0) / numbers.length;
    case "max":
      return Math.max(...numbers);
    case "min":
      return Math.min(...numbers);
    case "sum":
    default:
      return numbers.reduce((acc, number) => acc + number, 0);
  }
}

function calculateAllocatedBudget(
  rows: VentaDetalleResumen[],
  universeRows: VentaDetalleResumen[],
  totalBudget: number,
  familyBudgetMap: Map<string, number>
) {
  const budget = Number(totalBudget || 0);
  if (budget <= 0 || rows.length === 0 || universeRows.length === 0) return 0;
  if (rows === universeRows) return budget;

  const universeSalesByFamily = new Map<string, number>();
  const subsetSalesByFamily = new Map<string, number>();

  universeRows.forEach((row) => {
    const key = normalizePivotKey(row.Familia || "SIN FAMILIA");
    universeSalesByFamily.set(key, (universeSalesByFamily.get(key) || 0) + Number(row.VentaNeta || 0));
  });

  rows.forEach((row) => {
    const key = normalizePivotKey(row.Familia || "SIN FAMILIA");
    subsetSalesByFamily.set(key, (subsetSalesByFamily.get(key) || 0) + Number(row.VentaNeta || 0));
  });

  const familiesWithSales = Array.from(universeSalesByFamily.entries())
    .filter(([, sales]) => sales !== 0);
  const sourceFamilyBudgetTotal = familiesWithSales.reduce(
    (acc, [key]) => acc + Number(familyBudgetMap.get(key) || 0),
    0
  );
  const totalUniverseSales = familiesWithSales.reduce((acc, [, sales]) => acc + sales, 0);

  return Array.from(subsetSalesByFamily.entries()).reduce((acc, [key, subsetSales]) => {
    const universeSales = Number(universeSalesByFamily.get(key) || 0);
    if (universeSales === 0) return acc;

    const rawFamilyBudget = Number(familyBudgetMap.get(key) || 0);
    const adjustedFamilyBudget = sourceFamilyBudgetTotal > 0
      ? rawFamilyBudget * (budget / sourceFamilyBudgetTotal)
      : totalUniverseSales !== 0
        ? budget * (universeSales / totalUniverseSales)
        : 0;

    return acc + adjustedFamilyBudget * (subsetSales / universeSales);
  }, 0);
}

function formatPivotMetricValue(value: number, field: PivotMetricField) {
  const definition = getPivotMetricDefinition(field);
  if (definition.format === "money") return formatMoneyExact(value);
  if (definition.format === "percent") return `${Number(value || 0).toFixed(1)}%`;
  return formatNumber(value);
}

function buildPivotResult(
  sourceRows: VentaDetalleResumen[],
  config: PivotConfig,
  search: string,
  resolveValue: PivotValueResolver
): PivotResult {
  const query = search.trim().toUpperCase();
  const filteredRows = query
    ? sourceRows.filter((row) =>
        Object.values(row).some((value) => String(value ?? "").toUpperCase().includes(query))
      )
    : sourceRows;

  const groupsMap = new Map<
    string,
    { key: string; labels: string[]; rows: VentaDetalleResumen[]; cells: Map<string, VentaDetalleResumen[]> }
  >();
  const allColumnRows = new Map<string, VentaDetalleResumen[]>();

  filteredRows.forEach((row) => {
    const labels = config.rows.length > 0
      ? config.rows.map((field) => formatPivotDimensionValue(row, field))
      : ["Total general"];
    const key = JSON.stringify(labels);
    const current = groupsMap.get(key) || { key, labels, rows: [], cells: new Map<string, VentaDetalleResumen[]>() };
    current.rows.push(row);

    const columnLabel = config.column ? formatPivotDimensionValue(row, config.column) : "__TOTAL__";
    const cellRows = current.cells.get(columnLabel) || [];
    cellRows.push(row);
    current.cells.set(columnLabel, cellRows);

    const totalColumnRows = allColumnRows.get(columnLabel) || [];
    totalColumnRows.push(row);
    allColumnRows.set(columnLabel, totalColumnRows);
    groupsMap.set(key, current);
  });

  const firstValue = config.values[0];
  const allColumnValues = config.column
    ? Array.from(allColumnRows.keys()).sort((a, b) => {
        if (!firstValue) return a.localeCompare(b, "es");
        const difference = resolveValue(allColumnRows.get(b) || [], firstValue, filteredRows) -
          resolveValue(allColumnRows.get(a) || [], firstValue, filteredRows);
        return difference || a.localeCompare(b, "es");
      })
    : [];
  const columnValues = allColumnValues.slice(0, MAX_PIVOT_COLUMNS);

  const groupedRows = Array.from(groupsMap.values()).sort((a, b) => {
    if (!firstValue) return a.labels.join(" ").localeCompare(b.labels.join(" "), "es");
    const difference = resolveValue(b.rows, firstValue, filteredRows) - resolveValue(a.rows, firstValue, filteredRows);
    const normalized = difference || a.labels.join(" ").localeCompare(b.labels.join(" "), "es");
    return config.sortDirection === "asc" ? -normalized : normalized;
  });

  const totalPrimaryValue = firstValue
    ? groupedRows.reduce((acc, group) => acc + resolveValue(group.rows, firstValue, filteredRows), 0)
    : 0;
  let cumulative = 0;

  const allGroups: PivotResultGroup[] = groupedRows.map((group) => {
    const primaryValue = firstValue ? resolveValue(group.rows, firstValue, filteredRows) : 0;
    const participation = totalPrimaryValue > 0 ? (primaryValue / totalPrimaryValue) * 100 : 0;
    const previousCumulative = cumulative;
    cumulative += participation;

    return {
      ...group,
      participation,
      cumulative,
      paretoIncluded: previousCumulative < 80,
    };
  });

  const selectedGroups = config.paretoMode === "only80"
    ? allGroups.filter((group) => group.paretoIncluded)
    : allGroups;

  return {
    filteredRows,
    allGroups,
    visibleGroups: selectedGroups.slice(0, config.limit),
    columnValues,
    columnTotals: allColumnRows,
    totalColumnValues: allColumnValues.length,
    truncatedColumns: allColumnValues.length > MAX_PIVOT_COLUMNS,
    totalPrimaryValue,
  };
}

const COORDENADAS_SUCURSALES: Record<string, { lat: number; lng: number }> = {
  [normalizarMapa("CAPELLADES")]: { lat: 9.929, lng: -83.786 },
  [normalizarMapa("TIERRA BLANCA")]: { lat: 9.918, lng: -83.892 },
  [normalizarMapa("CEDI GRUPO SURCO")]: { lat: 9.870, lng: -83.910 },
  [normalizarMapa("CIPRESES")]: { lat: 9.892, lng: -83.807 },
  [normalizarMapa("LLANO GRANDE")]: { lat: 9.899, lng: -83.927 },
  [normalizarMapa("PACAYAS")]: { lat: 9.915, lng: -83.811 },
  [normalizarMapa("SAN RAFAEL IRAZU")]: { lat: 9.977, lng: -83.852 },
  [normalizarMapa("SAN RAFAEL IRAZÚ")]: { lat: 9.977, lng: -83.852 },
  [normalizarMapa("IRAZU")]: { lat: 9.977, lng: -83.852 },
  [normalizarMapa("SAN GERARDO")]: { lat: 9.913, lng: -83.846 },
  [normalizarMapa("COT")]: { lat: 9.895, lng: -83.874 },
  [normalizarMapa("EL GUARCO")]: { lat: 9.838, lng: -83.945 },
  [normalizarMapa("GUARCO")]: { lat: 9.838, lng: -83.945 },
  [normalizarMapa("EL CRISTO")]: { lat: 9.868, lng: -83.918 },
};


type MultiSelectFilterProps = {
  label: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
  allLabel: string;
  searchPlaceholder?: string;
  specialOptions?: Array<{
    label: string;
    active: boolean;
    onSelect: () => void;
  }>;
};

function MultiSelectFilter({
  label,
  options,
  values,
  onChange,
  allLabel,
  searchPlaceholder = "Buscar...",
  specialOptions = [],
}: MultiSelectFilterProps) {
  const [filtro, setFiltro] = useState("");
  const selected = useMemo(() => new Set(values), [values]);
  const opcionesFiltradas = useMemo(() => {
    const q = filtro.trim().toUpperCase();
    if (!q) return options;
    return options.filter((option) => option.toUpperCase().includes(q));
  }, [options, filtro]);

  const resumen =
    values.length === 0
      ? allLabel
      : values.length === 1
        ? values[0]
        : `${values.length} seleccionados`;

  function toggleValue(value: string) {
    if (selected.has(value)) {
      onChange(values.filter((item) => item !== value));
    } else {
      onChange([...values, value]);
    }
  }

  return (
    <div className="multi-filter-label">
      <span className="multi-filter-title">{label}</span>
      <details className="multi-select-filter">
        <summary title={resumen}>
          <span>{resumen}</span>
          <FaChevronDown />
        </summary>
        <div className="multi-select-menu">
          <div className="multi-search-box">
            <FaSearch />
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>

          <div className="multi-actions-row">
            <button type="button" onClick={() => onChange([])}>
              Todos
            </button>
            <button type="button" onClick={() => onChange(opcionesFiltradas)} disabled={opcionesFiltradas.length === 0}>
              Marcar visibles
            </button>
          </div>

          {specialOptions.length > 0 ? (
            <div className="multi-special-options">
              {specialOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className={option.active ? "active" : ""}
                  onClick={option.onSelect}
                >
                  <FaStore />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="multi-options-list">
            {opcionesFiltradas.length === 0 ? (
              <div className="multi-empty">Sin coincidencias</div>
            ) : (
              opcionesFiltradas.map((option) => (
                <label key={option} className="multi-option-row">
                  <input
                    type="checkbox"
                    checked={selected.has(option)}
                    onChange={() => toggleValue(option)}
                  />
                  <span>{option}</span>
                </label>
              ))
            )}
          </div>
        </div>
      </details>
      {values.length > 0 ? <small className="filter-count">{values.length} activo(s)</small> : null}
    </div>
  );
}

export default function Dashboard({ onLogout }: Props) {
  const [data, setData] = useState<DashboardPayload>(demoData);
  const [cargando, setCargando] = useState(false);
  const [estadoSync, setEstadoSync] = useState("Datos demo cargados");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("demo");
  const [seccionActiva, setSeccionActiva] = useState<Seccion>("resumen");
  const [mesSeleccionado, setMesSeleccionado] = useState("MAY");
  const [proveedoresSeleccionados, setProveedoresSeleccionados] = useState<string[]>([]);
  const [familiasSeleccionadas, setFamiliasSeleccionadas] = useState<string[]>([]);
  const [bodegasSeleccionadas, setBodegasSeleccionadas] = useState<string[]>([]);
  const [productosSeleccionados, setProductosSeleccionados] = useState<string[]>([]);
  const [busquedaGeneral, setBusquedaGeneral] = useState("");
  const [vistaGrafico, setVistaGrafico] = useState<VistaGrafico>("mensual");
  const [menuMobileAbierto, setMenuMobileAbierto] = useState(false);
  const [filtrosMobileAbiertos, setFiltrosMobileAbiertos] = useState(false);
  const [detalle, setDetalle] = useState<DetalleVentasPayload>(detalleVacio);
  const [detalleCargando, setDetalleCargando] = useState(false);
  const [busquedaDetalle, setBusquedaDetalle] = useState("");
  const [paginaDetalle, setPaginaDetalle] = useState(1);
  const [tamanoDetalle, setTamanoDetalle] = useState(100);
  const [filaDetalleAbierta, setFilaDetalleAbierta] = useState<number | null>(null);
  const [drillAbierto, setDrillAbierto] = useState<Record<string, boolean>>({});
  const [consultaVisualModo, setConsultaVisualModo] = useState<ConsultaVisualModo>("dinamica");
  const [pivotConfig, setPivotConfig] = useState<PivotConfig>(() => loadPivotConfig());
  const [pivotFieldSearch, setPivotFieldSearch] = useState("");
  const [pivotResultSearch, setPivotResultSearch] = useState("");
  const [pivotDropZone, setPivotDropZone] = useState<PivotDropZone>(null);
  const [visualWidgets, setVisualWidgets] = useState<VisualWidgetId[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("surco_consulta_visual") || "[]");
      const validIds = new Set(VISUAL_WIDGETS.map((widget) => widget.id));
      const validSaved = Array.isArray(saved)
        ? saved.filter((id): id is VisualWidgetId => validIds.has(id))
        : [];

      return validSaved.length > 0 ? validSaved : ["clientes80"];
    } catch {
      return ["clientes80"];
    }
  });
  const [visualDropActivo, setVisualDropActivo] = useState(false);

  const actualizarDatos = async () => {
    try {
      setCargando(true);
      setEstadoSync("Sincronizando con servidor...");
      setSyncStatus("loading");

      const respuesta = await obtenerDashboard({
        mes: mesSeleccionado,
        proveedor: proveedoresSeleccionados,
        familia: familiasSeleccionadas,
        bodega: bodegasSeleccionadas,
        producto: productosSeleccionados,
        q: busquedaGeneral,
      });

      setData({
        ...demoData,
        ...respuesta,
        proveedores: respuesta.proveedores?.length ? respuesta.proveedores : [],
        familias: respuesta.familias?.length ? respuesta.familias : [],
        sucursales: respuesta.sucursales?.length ? respuesta.sucursales : [],
        meses: respuesta.meses?.length ? respuesta.meses : [],
        productos: respuesta.productos?.length ? respuesta.productos : [],
        opciones: respuesta.opciones,
      });

      setEstadoSync("Datos reales actualizados");
      setSyncStatus("real");
      console.log("Datos recibidos:", respuesta);
    } catch (error) {
      console.error(error);
      setData(demoData);
      setEstadoSync("Servidor no disponible · usando demo");
      setSyncStatus("error");
    } finally {
      setCargando(false);
    }
  };

  const actualizarDetalle = async () => {
    try {
      setDetalleCargando(true);

      const respuesta = await obtenerDetalleVentas({
        mes: mesSeleccionado,
        proveedor: proveedoresSeleccionados,
        familia: familiasSeleccionadas,
        bodega: bodegasSeleccionadas,
        producto: productosSeleccionados,
        q: [busquedaGeneral, busquedaDetalle].filter(Boolean).join(" "),
        page: paginaDetalle,
        pageSize: tamanoDetalle,
      });

      setDetalle(respuesta);
      setFilaDetalleAbierta(null);
    } catch (error) {
      console.error(error);
      setDetalle({ ...detalleVacio, page: paginaDetalle, pageSize: tamanoDetalle });
    } finally {
      setDetalleCargando(false);
    }
  };

  useEffect(() => {
    actualizarDatos();

    const interval = window.setInterval(actualizarDatos, 300000);

    return () => window.clearInterval(interval);
  }, [
    mesSeleccionado,
    proveedoresSeleccionados,
    familiasSeleccionadas,
    bodegasSeleccionadas,
    productosSeleccionados,
    busquedaGeneral,
  ]);

  useEffect(() => {
    localStorage.setItem("surco_consulta_visual", JSON.stringify(visualWidgets));
  }, [visualWidgets]);

  useEffect(() => {
    localStorage.setItem("surco_tabla_dinamica", JSON.stringify(pivotConfig));
  }, [pivotConfig]);

  useEffect(() => {
    setPaginaDetalle(1);
  }, [
    mesSeleccionado,
    proveedoresSeleccionados,
    familiasSeleccionadas,
    bodegasSeleccionadas,
    productosSeleccionados,
    busquedaGeneral,
    busquedaDetalle,
    tamanoDetalle,
  ]);

  useEffect(() => {
    if (seccionActiva === "detalle") {
      actualizarDetalle();
    }
  }, [
    seccionActiva,
    mesSeleccionado,
    proveedoresSeleccionados,
    familiasSeleccionadas,
    bodegasSeleccionadas,
    productosSeleccionados,
    busquedaGeneral,
    busquedaDetalle,
    paginaDetalle,
    tamanoDetalle,
  ]);

  const ventaReal =
    Number(data.ventaReal || 0) ||
    data.proveedores.reduce((acc: number, p) => acc + Number(p.VentaNeta || 0), 0);

  const kiloLitro =
    Number(data.kiloLitro || 0) ||
    data.proveedores.reduce((acc: number, p) => acc + Number(p.KiloLitro || 0), 0);

  const presupuesto = Number(data.presupuesto || 0) || demoData.presupuesto;
  const cumplimiento = presupuesto > 0 ? (ventaReal / presupuesto) * 100 : 0;
  const faltante = Math.max(presupuesto - ventaReal, 0);

  const proveedores = data.proveedores.slice(0, 10);
  const familias = data.familias.slice(0, 10);
  const sucursales = data.sucursales;
  const meses = data.meses;
  const datosGrafico = useMemo(() => {
    if (vistaGrafico === "mensual") return meses;

    const grupos = [
      { mes: "C1 Ene-Abr", inicio: 0, fin: 4 },
      { mes: "C2 May-Ago", inicio: 4, fin: 8 },
      { mes: "C3 Sep-Dic", inicio: 8, fin: 12 },
    ];

    return grupos.map((grupo) => {
      const filas = meses.slice(grupo.inicio, grupo.fin);
      return {
        mes: grupo.mes,
        presupuesto: filas.reduce((acc, item) => acc + Number(item.presupuesto || 0), 0),
        real: filas.reduce((acc, item) => acc + Number(item.real || 0), 0),
      };
    });
  }, [meses, vistaGrafico]);

  const topProveedor = proveedores[0]?.Proveedor || "Sin datos";
  const topProveedorVenta = Number(proveedores[0]?.VentaNeta || 0);
  const topSucursal = sucursales[0]?.Sucursal || "Sin datos";
  const topSucursalVenta = Number(sucursales[0]?.VentaNeta || 0);
  const ventasDetalle = data.ventasDetalle || [];
  const presupuestoFamilias = data.presupuestoFamilias || [];
  const presupuestoFamiliaMap = useMemo(
    () => new Map(
      presupuestoFamilias.map((row) => [
        normalizePivotKey(row.Familia),
        Number(row.Presupuesto || 0),
      ])
    ),
    [presupuestoFamilias]
  );
  const resolvePivotValue = useMemo<PivotValueResolver>(() => {
    return (rows, value, universeRows) => {
      if (!isCalculatedPivotMetric(value.field)) {
        return aggregatePivotValue(rows, value);
      }

      const venta = aggregatePivotValue(rows, { field: "VentaNeta", aggregation: "sum" });
      const presupuestoCalculado = calculateAllocatedBudget(
        rows,
        universeRows,
        presupuesto,
        presupuestoFamiliaMap
      );

      if (value.field === "Presupuesto") return presupuestoCalculado;
      if (value.field === "DiferenciaPresupuesto") return venta - presupuestoCalculado;
      if (value.field === "CumplimientoPresupuesto") {
        return presupuestoCalculado > 0 ? (venta / presupuestoCalculado) * 100 : 0;
      }

      return 0;
    };
  }, [presupuesto, presupuestoFamiliaMap]);
  const pivotResult = useMemo(
    () => buildPivotResult(ventasDetalle, pivotConfig, pivotResultSearch, resolvePivotValue),
    [ventasDetalle, pivotConfig, pivotResultSearch, resolvePivotValue]
  );
  const ventasDetalleFiltradas = useMemo(() => {
    const q = busquedaDetalle.trim().toUpperCase();
    if (!q) return ventasDetalle;

    return ventasDetalle.filter((row) => {
      return Object.values(row).some((value) =>
        String(value ?? "").toUpperCase().includes(q)
      );
    });
  }, [ventasDetalle, busquedaDetalle]);
  const clientes80 = data.clientes80 || [];
  const bodegasDisponibles = data.opciones?.bodegas || [];
  const bodegasSoloTiendas = useMemo(
    () =>
      bodegasDisponibles.filter((bodega) => {
        const nombre = normalizarMapa(bodega);
        return !nombre.includes("CEDI") && !nombre.includes("CENTRODEDISTRIBUCION");
      }),
    [bodegasDisponibles]
  );
  const filtroSoloTiendasActivo = useMemo(() => {
    if (bodegasSoloTiendas.length === 0 || bodegasSeleccionadas.length !== bodegasSoloTiendas.length) {
      return false;
    }

    const seleccionadas = new Set(bodegasSeleccionadas);
    return bodegasSoloTiendas.every((bodega) => seleccionadas.has(bodega));
  }, [bodegasSeleccionadas, bodegasSoloTiendas]);

  const totalTop = proveedores.reduce(
    (acc: number, p) => acc + Number(p.VentaNeta || 0),
    0
  );

  const insights = useMemo(() => {
    const familiaTop = familias[0]?.Familia || "Sin familia";
    const sucursalBaja = [...sucursales].sort(
      (a, b) => Number(a.Cumplimiento || 0) - Number(b.Cumplimiento || 0)
    )[0];

    return [
      { icon: <FaArrowUp />, text: `${topProveedor} lidera las ventas del periodo.`, tone: "green" },
      { icon: <FaExclamationTriangle />, text: `La familia ${familiaTop} es una de las líneas más fuertes.`, tone: "yellow" },
      { icon: <FaArrowDown />, text: `${sucursalBaja?.Sucursal || "Una sucursal"} está en revisión por cumplimiento.`, tone: "red" },
      { icon: <FaChartLine />, text: `Cumplimiento general: ${cumplimiento.toFixed(1)}%.`, tone: "green" },
    ];
  }, [familias, sucursales, topProveedor, cumplimiento]);

  return (
    <div className="surco-bi">
      <div className="mobile-action-bar">
        <button type="button" onClick={() => setMenuMobileAbierto(true)}>
          <FaBars /> Menú
        </button>
        <button type="button" onClick={() => setFiltrosMobileAbiertos(true)}>
          <FaFilter /> Filtros
        </button>
      </div>

      <div
        className={`mobile-backdrop ${menuMobileAbierto || filtrosMobileAbiertos ? "show" : ""}`}
        onClick={() => {
          setMenuMobileAbierto(false);
          setFiltrosMobileAbiertos(false);
        }}
      />

      <aside
        className={`surco-sidebar ${
          menuMobileAbierto || filtrosMobileAbiertos ? "mobile-open" : ""
        } ${filtrosMobileAbiertos ? "filters-mode" : ""}`}
      >
        <button
          type="button"
          className="mobile-close"
          onClick={() => {
            setMenuMobileAbierto(false);
            setFiltrosMobileAbiertos(false);
          }}
        >
          <FaTimes />
        </button>
        <div className="surco-logo">SURCO</div>
        <span className="app-subtitle">Executive</span>

        <nav className="surco-menu">
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={seccionActiva === item.id ? "active" : ""}
              type="button"
              onClick={() => {
                setSeccionActiva(item.id);
                setMenuMobileAbierto(false);
              }}
            >
              {item.icon}
              {item.label}
              {item.badge ? <b>{item.badge}</b> : null}
            </button>
          ))}
        </nav>

        <div className={`filters-card ${filtrosMobileAbiertos ? "filters-open" : ""}`}>
          <div className="filters-header">
            <h3>FILTROS</h3>
            <button
              type="button"
              className="filters-close"
              onClick={() => setFiltrosMobileAbiertos(false)}
            >
              <FaTimes />
            </button>
          </div>

          <label>
            Mes
            <select
              value={mesSeleccionado}
              onChange={(e) => {
                setMesSeleccionado(e.target.value);
                setEstadoSync("Sincronizando con servidor...");
                setSyncStatus("loading");
              }}
            >
              <option value="TODO">Todo 2026 / Compañía general</option>
              <option value="ENE">Enero 2026</option>
              <option value="FEB">Febrero 2026</option>
              <option value="MAR">Marzo 2026</option>
              <option value="ABR">Abril 2026</option>
              <option value="MAY">Mayo 2026</option>
              <option value="JUN">Junio 2026</option>
              <option value="JUL">Julio 2026</option>
              <option value="AGO">Agosto 2026</option>
              <option value="SEP">Septiembre 2026</option>
              <option value="OCT">Octubre 2026</option>
              <option value="NOV">Noviembre 2026</option>
              <option value="DIC">Diciembre 2026</option>
            </select>
          </label>

          <label>
            Buscar
            <div className="filter-search-box">
              <FaSearch />
              <input
                value={busquedaGeneral}
                onChange={(e) => setBusquedaGeneral(e.target.value)}
                placeholder="Factura, cliente, producto, código..."
              />
            </div>
          </label>

          <MultiSelectFilter
            label="Proveedor"
            options={data.opciones?.proveedores || []}
            values={proveedoresSeleccionados}
            onChange={setProveedoresSeleccionados}
            allLabel="Todos"
            searchPlaceholder="Buscar proveedor..."
          />

          <MultiSelectFilter
            label="Familia"
            options={data.opciones?.familias || []}
            values={familiasSeleccionadas}
            onChange={setFamiliasSeleccionadas}
            allLabel="Todas"
            searchPlaceholder="Buscar familia..."
          />

          <MultiSelectFilter
            label="Bodega"
            options={bodegasDisponibles}
            values={bodegasSeleccionadas}
            onChange={setBodegasSeleccionadas}
            allLabel="Todas"
            searchPlaceholder="Buscar bodega..."
            specialOptions={bodegasSoloTiendas.length > 0 ? [
              {
                label: "Venta solo tiendas (sin CEDI)",
                active: filtroSoloTiendasActivo,
                onSelect: () => setBodegasSeleccionadas(bodegasSoloTiendas),
              },
            ] : []}
          />

          <MultiSelectFilter
            label="Producto"
            options={data.opciones?.productos || []}
            values={productosSeleccionados}
            onChange={setProductosSeleccionados}
            allLabel="Todos"
            searchPlaceholder="Buscar producto..."
          />

          <button
            type="button"
            onClick={() => {
              setBusquedaGeneral("");
              setBusquedaDetalle("");
              setProveedoresSeleccionados([]);
              setFamiliasSeleccionadas([]);
              setBodegasSeleccionadas([]);
              setProductosSeleccionados([]);
            }}
          >
            Limpiar filtros
          </button>
        </div>
      </aside>

      <main className="surco-main">
        <header className="surco-header">
          <div>
            <h1>SURCO EXECUTIVE</h1>
            <p>Dashboard Gerencial - Presupuesto y Ventas</p>
          </div>

          <div className="header-right">
            <div className="sync-info">
              <span>Última actualización:</span>
              <strong>{data.fechaActualizacion || "Pendiente"}</strong>
            </div>

            <div className={`auto-sync ${syncStatus}`}>
              <FaSyncAlt className={cargando ? "spin" : ""} />
              <div>
                <span>Sincronización automática</span>
                <strong>{estadoSync}</strong>
              </div>
            </div>

            <div className="user-box">
              <span>Bienvenido,</span>
              <strong>
  {JSON.parse(localStorage.getItem("surco_user") || "{}")?.nombre || "Gerente General"}
</strong>
            </div>

            <button className="logout-btn" onClick={onLogout}>Salir</button>
          </div>
        </header>

        {seccionActiva !== "configuracion" && seccionActiva !== "consulta" && (
          <section className="kpi-row">
            <Kpi icon={<FaDollarSign />} title="VENTA REAL" value={formatMoney(ventaReal)} detail="Ventas acumuladas" tone="blue" />
            <Kpi icon={<FaBullseye />} title="PRESUPUESTO" value={formatMoney(presupuesto)} detail="Presupuesto del mes" tone="purple" />
            <Kpi icon={<FaChartLine />} title="CUMPLIMIENTO" value={`${cumplimiento.toFixed(1)}%`} detail="Avance presupuestario" tone="green" />
            <Kpi icon={<FaBoxOpen />} title="K-L VENDIDOS" value={formatKiloLitro(kiloLitro)} detail="Kilos / litros" tone="cyan" />
            <Kpi icon={<FaMedal />} title="TOP PROVEEDOR" value={topProveedor} detail={formatMoney(topProveedorVenta)} tone="orange" />
            <Kpi icon={<FaStore />} title="TOP SUCURSAL" value={topSucursal} detail={formatMoney(topSucursalVenta)} tone="pink" />
          </section>
        )}

        {seccionActiva === "resumen" && renderResumen()}
        {seccionActiva === "consulta" && renderConsultaVisual()}
        {seccionActiva === "ventas" && renderVentas()}
        {seccionActiva === "detalle" && renderDetalle()}
        {seccionActiva === "presupuesto" && renderPresupuesto()}
        {seccionActiva === "proveedores" && renderProveedores()}
        {seccionActiva === "sucursales" && renderSucursales()}
        {seccionActiva === "productos" && renderProductos()}
        {seccionActiva === "alertas" && renderAlertas()}
        {seccionActiva === "configuracion" && renderConfiguracion()}
      </main>
    </div>
  );
  function renderResumen() {
  return (
    <section className="dashboard-grid">
      {renderGaugePanel()}
      {renderMesesPanel()}
      {renderFamiliasPanel()}
      {renderTopProveedoresPanel()}
      {renderSucursalesPanel()}
      {renderMapaPanel()}
      {renderInsightsPanel()}
      {renderResumenProveedorPanel()}
    </section>
  );
}

  function agregarVisualWidget(id: VisualWidgetId) {
    setVisualWidgets((actuales) => (actuales.includes(id) ? actuales : [...actuales, id]));
  }

  function quitarVisualWidget(id: VisualWidgetId) {
    setVisualWidgets((actuales) => actuales.filter((widgetId) => widgetId !== id));
  }

  function moverVisualWidget(desde: VisualWidgetId, hasta: VisualWidgetId) {
    if (desde === hasta) return;

    setVisualWidgets((actuales) => {
      const origen = actuales.indexOf(desde);
      const destino = actuales.indexOf(hasta);
      if (origen < 0 || destino < 0) return actuales;

      const copia = [...actuales];
      copia.splice(origen, 1);
      copia.splice(destino, 0, desde);
      return copia;
    });
  }

  function getVisualWidgetDefinition(id: VisualWidgetId) {
    return VISUAL_WIDGETS.find((widget) => widget.id === id)!;
  }

  function renderVisualWidget(id: VisualWidgetId) {
    switch (id) {
      case "clientes80":
        return renderClientes80Panel("80/20 DE CLIENTES", true);
      case "clientesVenta":
        return renderClientesVentaPanel();
      case "presupuestoReal":
        return renderMesesPanel("PRESUPUESTO CONTRA REAL");
      case "tiendas":
        return renderSucursalesPanel("VENTA POR TIENDA");
      case "proveedores":
        return renderTopProveedoresPanel("TOP PROVEEDORES");
      case "familias":
        return renderFamiliasPanel("VENTA POR FAMILIA");
      case "avance":
        return renderGaugePanel("AVANCE DEL PRESUPUESTO");
      default:
        return null;
    }
  }

  function renderConsultaVisual() {
    return consultaVisualModo === "dinamica" ? renderTablaDinamica() : renderCuadrosVisuales();
  }

  function renderConsultaModeTabs() {
    return (
      <div className="consulta-mode-tabs" role="tablist" aria-label="Tipo de consulta visual">
        <button
          type="button"
          className={consultaVisualModo === "dinamica" ? "active" : ""}
          onClick={() => setConsultaVisualModo("dinamica")}
        >
          <FaGripVertical />
          <span>
            <strong>Tabla dinámica</strong>
            <small>Armá filas, columnas y valores como en Excel.</small>
          </span>
        </button>
        <button
          type="button"
          className={consultaVisualModo === "cuadros" ? "active" : ""}
          onClick={() => setConsultaVisualModo("cuadros")}
        >
          <FaThLarge />
          <span>
            <strong>Cuadros prediseñados</strong>
            <small>Conservá la vista de gráficos y tarjetas arrastrables.</small>
          </span>
        </button>
      </div>
    );
  }

  function agregarDimensionPivot(field: PivotDimensionField, zone: "rows" | "columns") {
    setPivotConfig((current) => {
      const rowsWithoutField = current.rows.filter((item) => item !== field);

      if (zone === "columns") {
        return { ...current, rows: rowsWithoutField, column: field };
      }

      return {
        ...current,
        column: current.column === field ? null : current.column,
        rows: [...rowsWithoutField, field],
      };
    });
  }

  function quitarDimensionPivot(field: PivotDimensionField) {
    setPivotConfig((current) => ({
      ...current,
      rows: current.rows.filter((item) => item !== field),
      column: current.column === field ? null : current.column,
    }));
  }

  function moverDimensionPivot(field: PivotDimensionField, direction: -1 | 1) {
    setPivotConfig((current) => {
      const index = current.rows.indexOf(field);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.rows.length) return current;

      const rows = [...current.rows];
      [rows[index], rows[nextIndex]] = [rows[nextIndex], rows[index]];
      return { ...current, rows };
    });
  }

  function agregarMetricaPivot(field: PivotMetricField) {
    setPivotConfig((current) => {
      if (current.values.some((value) => value.field === field)) return current;
      const definition = getPivotMetricDefinition(field);
      return {
        ...current,
        values: [...current.values, { field, aggregation: definition.defaultAggregation }],
      };
    });
  }

  function quitarMetricaPivot(field: PivotMetricField) {
    setPivotConfig((current) => ({
      ...current,
      values: current.values.filter((value) => value.field !== field),
    }));
  }

  function cambiarAgregacionPivot(field: PivotMetricField, aggregation: PivotAggregation) {
    if (isCalculatedPivotMetric(field)) return;
    setPivotConfig((current) => ({
      ...current,
      values: current.values.map((value) =>
        value.field === field ? { ...value, aggregation } : value
      ),
    }));
  }

  function aplicarPlantillaPivot(template: "pareto" | "tiendas" | "presupuesto" | "productos" | "proveedores") {
    const templates: Record<typeof template, PivotConfig> = {
      pareto: {
        rows: ["Cliente"],
        column: null,
        values: [{ field: "VentaNeta", aggregation: "sum" }],
        paretoMode: "only80",
        limit: 100,
        sortDirection: "desc",
      },
      tiendas: {
        rows: ["Bodega"],
        column: null,
        values: [
          { field: "Presupuesto", aggregation: "sum" },
          { field: "VentaNeta", aggregation: "sum" },
          { field: "DiferenciaPresupuesto", aggregation: "sum" },
          { field: "CumplimientoPresupuesto", aggregation: "average" },
        ],
        paretoMode: "off",
        limit: 100,
        sortDirection: "desc",
      },
      presupuesto: {
        rows: ["Bodega"],
        column: null,
        values: [
          { field: "Presupuesto", aggregation: "sum" },
          { field: "VentaNeta", aggregation: "sum" },
          { field: "DiferenciaPresupuesto", aggregation: "sum" },
          { field: "CumplimientoPresupuesto", aggregation: "average" },
        ],
        paretoMode: "off",
        limit: 100,
        sortDirection: "desc",
      },
      productos: {
        rows: ["Familia", "Producto"],
        column: "Bodega",
        values: [{ field: "VentaNeta", aggregation: "sum" }],
        paretoMode: "off",
        limit: 250,
        sortDirection: "desc",
      },
      proveedores: {
        rows: ["Proveedor", "Familia"],
        column: null,
        values: [
          { field: "VentaNeta", aggregation: "sum" },
          { field: "CantidadFinal", aggregation: "sum" },
        ],
        paretoMode: "show",
        limit: 100,
        sortDirection: "desc",
      },
    };

    setPivotConfig(templates[template]);
    setPivotResultSearch("");
  }

  function leerCampoPivot(dataTransfer: DataTransfer) {
    try {
      const payload = JSON.parse(dataTransfer.getData("application/surco-pivot-field") || "null");
      if (payload?.kind === "dimension" && isPivotDimensionField(payload.field)) {
        return { kind: "dimension" as const, field: payload.field };
      }
      if (payload?.kind === "metric" && isPivotMetricField(payload.field)) {
        return { kind: "metric" as const, field: payload.field };
      }
    } catch {
      return null;
    }
    return null;
  }

  function soltarCampoPivot(dataTransfer: DataTransfer, zone: Exclude<PivotDropZone, null>) {
    const payload = leerCampoPivot(dataTransfer);
    setPivotDropZone(null);
    if (!payload) return;

    if (payload.kind === "dimension" && zone !== "values") {
      agregarDimensionPivot(payload.field, zone);
    }
    if (payload.kind === "metric" && zone === "values") {
      agregarMetricaPivot(payload.field);
    }
  }

  function exportarTablaDinamicaCsv() {
    if (pivotConfig.values.length === 0 || pivotResult.visibleGroups.length === 0) return;

    const headers = [
      ...(pivotConfig.rows.length > 0
        ? pivotConfig.rows.map((field) => getPivotDimensionDefinition(field).label)
        : ["Fila"]),
    ];

    if (pivotConfig.column) {
      pivotResult.columnValues.forEach((columnValue) => {
        pivotConfig.values.forEach((value) => {
          headers.push(`${columnValue} - ${getPivotValueHeader(value)}`);
        });
      });
    }

    pivotConfig.values.forEach((value) => {
      headers.push(`Total - ${getPivotValueHeader(value)}`);
    });

    if (pivotConfig.paretoMode !== "off") headers.push("Participación %", "Acumulado %");

    const rows = pivotResult.visibleGroups.map((group) => {
      const values: Array<string | number> = [...group.labels];

      if (pivotConfig.column) {
        pivotResult.columnValues.forEach((columnValue) => {
          pivotConfig.values.forEach((value) => {
            values.push(resolvePivotValue(group.cells.get(columnValue) || [], value, pivotResult.filteredRows));
          });
        });
      }

      pivotConfig.values.forEach((value) => values.push(resolvePivotValue(group.rows, value, pivotResult.filteredRows)));
      if (pivotConfig.paretoMode !== "off") values.push(group.participation, group.cumulative);
      return values;
    });

    const escapeCsv = (value: string | number) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCsv).join(";")).join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `consulta-dinamica-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function renderPivotDropZone(
    zone: Exclude<PivotDropZone, null>,
    title: string,
    subtitle: string,
    content: ReactNode
  ) {
    const accepts = zone === "values" ? "medidas" : "campos";
    return (
      <div
        className={`pivot-drop-zone ${pivotDropZone === zone ? "drop-active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setPivotDropZone(zone);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setPivotDropZone(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          soltarCampoPivot(event.dataTransfer, zone);
        }}
      >
        <div className="pivot-zone-heading">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className="pivot-zone-content">
          {content || <em>Arrastrá aquí los {accepts}</em>}
        </div>
      </div>
    );
  }

  function renderTablaDinamica() {
    const fieldQuery = pivotFieldSearch.trim().toUpperCase();
    const dimensions = PIVOT_DIMENSIONS.filter((field) =>
      `${field.label} ${field.description}`.toUpperCase().includes(fieldQuery)
    );
    const metrics = PIVOT_METRICS.filter((field) =>
      `${field.label} ${field.description}`.toUpperCase().includes(fieldQuery)
    );

    return (
      <section className="section-page visual-query-page pivot-query-page">
        <SectionHeader
          title="Consulta Visual"
          subtitle="Construí una tabla dinámica: elegí filas, una columna opcional y las medidas que querés calcular. Los filtros generales de la izquierda siguen aplicando."
        />

        {renderConsultaModeTabs()}

        <div className="pivot-presets">
          <span>Plantillas rápidas:</span>
          <button type="button" onClick={() => aplicarPlantillaPivot("pareto")}>80/20 clientes</button>
          <button type="button" onClick={() => aplicarPlantillaPivot("presupuesto")}>Presupuesto vs real</button>
          <button type="button" onClick={() => aplicarPlantillaPivot("tiendas")}>Venta por tienda</button>
          <button type="button" onClick={() => aplicarPlantillaPivot("productos")}>Productos por tienda</button>
          <button type="button" onClick={() => aplicarPlantillaPivot("proveedores")}>Proveedor y familia</button>
          <button
            type="button"
            className="danger"
            onClick={() => setPivotConfig({ ...DEFAULT_PIVOT_CONFIG, rows: [], column: null, values: [], paretoMode: "off" })}
          >
            <FaTrashAlt /> Limpiar consulta
          </button>
        </div>

        <div className="pivot-builder-layout">
          <aside className="pivot-fields-panel">
            <div className="pivot-panel-title">
              <div>
                <strong>Campos disponibles</strong>
                <span>Arrastrá o usá los botones.</span>
              </div>
              <FaGripVertical />
            </div>

            <div className="pivot-field-search">
              <FaSearch />
              <input
                value={pivotFieldSearch}
                onChange={(event) => setPivotFieldSearch(event.target.value)}
                placeholder="Buscar campo..."
              />
              {pivotFieldSearch ? (
                <button type="button" onClick={() => setPivotFieldSearch("")}><FaTimes /></button>
              ) : null}
            </div>

            <div className="pivot-field-scroll">
              <div className="pivot-field-section">
                <h4><FaStore /> Dimensiones</h4>
                {dimensions.map((field) => {
                  const inRows = pivotConfig.rows.includes(field.field);
                  const inColumn = pivotConfig.column === field.field;
                  return (
                    <article
                      key={field.field}
                      className={`pivot-field-item ${inRows || inColumn ? "selected" : ""}`}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          "application/surco-pivot-field",
                          JSON.stringify({ kind: "dimension", field: field.field })
                        );
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                    >
                      <FaGripVertical />
                      <div>
                        <strong>{field.label}</strong>
                        <span>{field.description}</span>
                      </div>
                      <div className="pivot-field-actions">
                        <button type="button" onClick={() => agregarDimensionPivot(field.field, "rows")} title="Agregar a filas">
                          + Filas
                        </button>
                        <button type="button" onClick={() => agregarDimensionPivot(field.field, "columns")} title="Usar como columna">
                          Col.
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="pivot-field-section metric-section">
                <h4><FaDollarSign /> Valores</h4>
                {metrics.map((field) => {
                  const selected = pivotConfig.values.some((value) => value.field === field.field);
                  return (
                    <article
                      key={field.field}
                      className={`pivot-field-item metric ${selected ? "selected" : ""}`}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          "application/surco-pivot-field",
                          JSON.stringify({ kind: "metric", field: field.field })
                        );
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                    >
                      <FaGripVertical />
                      <div>
                        <strong>{field.label}</strong>
                        <span>{field.description}</span>
                      </div>
                      <div className="pivot-field-actions single">
                        <button type="button" onClick={() => agregarMetricaPivot(field.field)} disabled={selected}>
                          {selected ? "Agregado" : "+ Valores"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </aside>

          <div className="pivot-main-panel">
            <div className="pivot-config-panel">
              <div className="pivot-panel-title">
                <div>
                  <strong>Diseño de la consulta</strong>
                  <span>El orden de las filas define la jerarquía.</span>
                </div>
                <span className="pivot-source-count">{formatNumber(ventasDetalle.length)} registros agrupados</span>
              </div>

              <div className="pivot-zones-grid">
                {renderPivotDropZone(
                  "rows",
                  "Filas",
                  "Podés usar varias dimensiones",
                  pivotConfig.rows.length > 0 ? (
                    <>
                      {pivotConfig.rows.map((field, index) => (
                        <div className="pivot-chip" key={field}>
                          <FaGripVertical />
                          <span>{getPivotDimensionDefinition(field).label}</span>
                          <div className="pivot-chip-order">
                            <button type="button" disabled={index === 0} onClick={() => moverDimensionPivot(field, -1)} title="Subir"><FaChevronUp /></button>
                            <button type="button" disabled={index === pivotConfig.rows.length - 1} onClick={() => moverDimensionPivot(field, 1)} title="Bajar"><FaChevronDown /></button>
                          </div>
                          <button type="button" onClick={() => quitarDimensionPivot(field)} title="Quitar"><FaTimes /></button>
                        </div>
                      ))}
                    </>
                  ) : null
                )}

                {renderPivotDropZone(
                  "columns",
                  "Columnas",
                  "Una dimensión opcional",
                  pivotConfig.column ? (
                    <div className="pivot-chip column-chip">
                      <FaGripVertical />
                      <span>{getPivotDimensionDefinition(pivotConfig.column).label}</span>
                      <button type="button" onClick={() => quitarDimensionPivot(pivotConfig.column!)} title="Quitar"><FaTimes /></button>
                    </div>
                  ) : null
                )}

                {renderPivotDropZone(
                  "values",
                  "Valores",
                  "Una o varias medidas",
                  pivotConfig.values.length > 0 ? (
                    <>
                      {pivotConfig.values.map((value) => (
                        <div className="pivot-value-chip" key={value.field}>
                          <div>
                            <FaDollarSign />
                            <span>{getPivotMetricDefinition(value.field).label}</span>
                          </div>
                          <select
                            value={value.aggregation}
                            disabled={isCalculatedPivotMetric(value.field)}
                            onChange={(event) => cambiarAgregacionPivot(value.field, event.target.value as PivotAggregation)}
                            aria-label={`Agregación de ${getPivotMetricDefinition(value.field).label}`}
                            title={isCalculatedPivotMetric(value.field) ? "Cálculo automático" : "Cambiar agregación"}
                          >
                            {isCalculatedPivotMetric(value.field) ? (
                              <option value={value.aggregation}>Cálculo</option>
                            ) : PIVOT_AGGREGATIONS.map((aggregation) => (
                              <option key={aggregation.id} value={aggregation.id}>{aggregation.label}</option>
                            ))}
                          </select>
                          <button type="button" onClick={() => quitarMetricaPivot(value.field)} title="Quitar"><FaTimes /></button>
                        </div>
                      ))}
                    </>
                  ) : null
                )}
              </div>

              {pivotConfig.values.some((value) => isCalculatedPivotMetric(value.field)) ? (
                <div className="pivot-budget-note">
                  <FaBullseye />
                  <span>
                    El total usa el presupuesto real filtrado. Por familia toma el presupuesto disponible y,
                    al bajar a tienda, producto, proveedor o cliente, lo distribuye proporcionalmente para que el total siempre cuadre.
                  </span>
                </div>
              ) : null}

              <div className="pivot-options-row">
                <label>
                  Análisis 80/20
                  <select
                    value={pivotConfig.paretoMode}
                    onChange={(event) => setPivotConfig((current) => ({ ...current, paretoMode: event.target.value as PivotParetoMode }))}
                  >
                    <option value="off">Desactivado</option>
                    <option value="show">Mostrar % y acumulado</option>
                    <option value="only80">Solo filas que forman el 80%</option>
                  </select>
                </label>
                <label>
                  Orden
                  <select
                    value={pivotConfig.sortDirection}
                    onChange={(event) => setPivotConfig((current) => ({ ...current, sortDirection: event.target.value as "asc" | "desc" }))}
                  >
                    <option value="desc">Mayor a menor</option>
                    <option value="asc">Menor a mayor</option>
                  </select>
                </label>
                <label>
                  Máximo de filas
                  <select
                    value={pivotConfig.limit}
                    onChange={(event) => setPivotConfig((current) => ({ ...current, limit: Number(event.target.value) }))}
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                    <option value={1000}>1.000</option>
                  </select>
                </label>
                <div className="pivot-result-search">
                  <FaSearch />
                  <input
                    value={pivotResultSearch}
                    onChange={(event) => setPivotResultSearch(event.target.value)}
                    placeholder="Buscar dentro del resultado..."
                  />
                  {pivotResultSearch ? <button type="button" onClick={() => setPivotResultSearch("")}><FaTimes /></button> : null}
                </div>
                <button
                  type="button"
                  className="pivot-export-btn"
                  onClick={exportarTablaDinamicaCsv}
                  disabled={pivotResult.visibleGroups.length === 0 || pivotConfig.values.length === 0}
                >
                  <FaArrowDown /> Exportar CSV
                </button>
              </div>
            </div>

            {renderPivotResultTable()}
          </div>
        </div>
      </section>
    );
  }

  function renderPivotResultTable() {
    const hasColumns = !!pivotConfig.column;
    const hasValues = pivotConfig.values.length > 0;
    const rowHeaders = pivotConfig.rows.length > 0
      ? pivotConfig.rows.map((field) => getPivotDimensionDefinition(field).label)
      : ["Fila"];

    return (
      <div className="pivot-result-card">
        <div className="pivot-result-header">
          <div>
            <strong>Resultado de la consulta</strong>
            <span>
              {formatNumber(pivotResult.visibleGroups.length)} filas visibles · {formatNumber(pivotResult.filteredRows.length)} registros procesados
            </span>
          </div>
          <div className="pivot-result-badges">
            {pivotConfig.paretoMode === "only80" ? <span className="pareto">80/20 activo</span> : null}
            {pivotConfig.column ? <span>Columnas: {getPivotDimensionDefinition(pivotConfig.column).label}</span> : null}
          </div>
        </div>

        {!hasValues ? (
          <div className="pivot-empty-result">
            <FaDollarSign />
            <strong>Agregá por lo menos un valor</strong>
            <span>Por ejemplo: Presupuesto, Venta neta, Cantidad o Kilos / litros.</span>
          </div>
        ) : pivotResult.filteredRows.length === 0 ? (
          <div className="pivot-empty-result">
            <FaSearch />
            <strong>No hay datos para esta consulta</strong>
            <span>Revisá los filtros generales o la búsqueda del resultado.</span>
          </div>
        ) : (
          <>
            {pivotResult.truncatedColumns ? (
              <div className="pivot-warning">
                La dimensión de columnas tiene {formatNumber(pivotResult.totalColumnValues)} valores. Se muestran los {MAX_PIVOT_COLUMNS} principales para mantener la tabla legible.
              </div>
            ) : null}

            <div className="pivot-table-wrap">
              <table className="pivot-table">
                <thead>
                  <tr>
                    {rowHeaders.map((header, index) => (
                      <th
                        key={header}
                        rowSpan={hasColumns ? 2 : 1}
                        className="pivot-row-header"
                        style={{ left: index * 155 }}
                      >
                        {header}
                      </th>
                    ))}
                    {hasColumns
                      ? pivotResult.columnValues.map((columnValue) => (
                          <th key={columnValue} colSpan={pivotConfig.values.length} className="pivot-column-group" title={columnValue}>
                            {columnValue}
                          </th>
                        ))
                      : pivotConfig.values.map((value) => (
                          <th key={value.field} className="pivot-value-header">
                            {getPivotValueHeader(value)}
                          </th>
                        ))}
                    {hasColumns ? (
                      <th colSpan={pivotConfig.values.length} className="pivot-total-group">Total general</th>
                    ) : null}
                    {pivotConfig.paretoMode !== "off" ? (
                      <>
                        <th rowSpan={hasColumns ? 2 : 1} className="pivot-percent-header">%</th>
                        <th rowSpan={hasColumns ? 2 : 1} className="pivot-percent-header">Acum.</th>
                      </>
                    ) : null}
                  </tr>
                  {hasColumns ? (
                    <tr>
                      {pivotResult.columnValues.flatMap((columnValue) =>
                        pivotConfig.values.map((value) => (
                          <th key={`${columnValue}-${value.field}`} className="pivot-subheader">
                            {getPivotMetricDefinition(value.field).label}
                          </th>
                        ))
                      )}
                      {pivotConfig.values.map((value) => (
                        <th key={`total-${value.field}`} className="pivot-subheader total">
                          {getPivotMetricDefinition(value.field).label}
                        </th>
                      ))}
                    </tr>
                  ) : null}
                </thead>
                <tbody>
                  {pivotResult.visibleGroups.map((group) => (
                    <tr key={group.key} className={group.paretoIncluded ? "pivot-pareto-row" : ""}>
                      {group.labels.map((label, index) => (
                        <td
                          key={`${group.key}-label-${index}`}
                          className={`pivot-label level-${index}`}
                          title={label}
                          style={{ left: index * 155 }}
                        >
                          {label}
                        </td>
                      ))}
                      {hasColumns
                        ? pivotResult.columnValues.flatMap((columnValue) =>
                            pivotConfig.values.map((value) => (
                              <td key={`${group.key}-${columnValue}-${value.field}`} className="pivot-number-cell">
                                {formatPivotMetricValue(resolvePivotValue(group.cells.get(columnValue) || [], value, pivotResult.filteredRows), value.field)}
                              </td>
                            ))
                          )
                        : pivotConfig.values.map((value) => (
                            <td key={`${group.key}-${value.field}`} className="pivot-number-cell">
                              {formatPivotMetricValue(resolvePivotValue(group.rows, value, pivotResult.filteredRows), value.field)}
                            </td>
                          ))}
                      {hasColumns
                        ? pivotConfig.values.map((value) => (
                            <td key={`${group.key}-total-${value.field}`} className="pivot-number-cell pivot-total-cell">
                              {formatPivotMetricValue(resolvePivotValue(group.rows, value, pivotResult.filteredRows), value.field)}
                            </td>
                          ))
                        : null}
                      {pivotConfig.paretoMode !== "off" ? (
                        <>
                          <td className="pivot-percent-cell">{group.participation.toFixed(1)}%</td>
                          <td className="pivot-percent-cell cumulative">{group.cumulative.toFixed(1)}%</td>
                        </>
                      ) : null}
                    </tr>
                  ))}

                  <tr className="pivot-grand-total-row">
                    <td colSpan={rowHeaders.length}>TOTAL GENERAL</td>
                    {hasColumns
                      ? pivotResult.columnValues.flatMap((columnValue) =>
                          pivotConfig.values.map((value) => (
                            <td key={`grand-${columnValue}-${value.field}`}>
                              {formatPivotMetricValue(
                                resolvePivotValue(pivotResult.columnTotals.get(columnValue) || [], value, pivotResult.filteredRows),
                                value.field
                              )}
                            </td>
                          ))
                        )
                      : pivotConfig.values.map((value) => (
                          <td key={`grand-${value.field}`}>
                            {formatPivotMetricValue(resolvePivotValue(pivotResult.filteredRows, value, pivotResult.filteredRows), value.field)}
                          </td>
                        ))}
                    {hasColumns
                      ? pivotConfig.values.map((value) => (
                          <td key={`grand-total-${value.field}`}>
                            {formatPivotMetricValue(resolvePivotValue(pivotResult.filteredRows, value, pivotResult.filteredRows), value.field)}
                          </td>
                        ))
                      : null}
                    {pivotConfig.paretoMode !== "off" ? <><td>100.0%</td><td>100.0%</td></> : null}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  function renderCuadrosVisuales() {
    return (
      <section className="section-page visual-query-page">
        <SectionHeader
          title="Consulta Visual"
          subtitle="Usá cuadros prediseñados o cambiá a Tabla dinámica para construir la consulta campo por campo."
        />

        {renderConsultaModeTabs()}

        <div className="visual-query-layout">
          <aside className="visual-palette">
            <div className="visual-palette-header">
              <div>
                <strong>Cuadros disponibles</strong>
                <span>Arrastrá o presioná agregar</span>
              </div>
              <FaThLarge />
            </div>

            <div className="visual-palette-list">
              {VISUAL_WIDGETS.map((widget) => {
                const agregado = visualWidgets.includes(widget.id);
                return (
                  <article
                    key={widget.id}
                    className={`visual-palette-item ${agregado ? "added" : ""}`}
                    draggable={!agregado}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/surco-widget", widget.id);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <FaGripVertical className="visual-grip" />
                    <div>
                      <strong>{widget.title}</strong>
                      <span>{widget.description}</span>
                    </div>
                    <button
                      type="button"
                      disabled={agregado}
                      onClick={() => agregarVisualWidget(widget.id)}
                      title={agregado ? "Ya está en la consulta" : "Agregar cuadro"}
                    >
                      {agregado ? "Agregado" : <><FaPlus /> Agregar</>}
                    </button>
                  </article>
                );
              })}
            </div>
          </aside>

          <div className="visual-workspace-wrap">
            <div className="visual-workspace-toolbar">
              <div>
                <strong>Zona de consulta</strong>
                <span>{visualWidgets.length} cuadro(s) visible(s)</span>
              </div>
              <button
                type="button"
                className="visual-clear-btn"
                onClick={() => setVisualWidgets([])}
                disabled={visualWidgets.length === 0}
              >
                <FaTrashAlt /> Limpiar zona
              </button>
            </div>

            <div
              className={`visual-workspace ${visualDropActivo ? "drop-active" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setVisualDropActivo(true);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget === event.target) setVisualDropActivo(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setVisualDropActivo(false);
                const id = event.dataTransfer.getData("application/surco-widget") as VisualWidgetId;
                if (VISUAL_WIDGETS.some((widget) => widget.id === id)) agregarVisualWidget(id);
              }}
            >
              {visualWidgets.length === 0 ? (
                <div className="visual-empty-state">
                  <FaThLarge />
                  <strong>La zona está limpia</strong>
                  <span>Arrastrá aquí los cuadros que querés consultar.</span>
                </div>
              ) : (
                <div className="visual-workspace-grid">
                  {visualWidgets.map((id) => {
                    const widget = getVisualWidgetDefinition(id);
                    return (
                      <article
                        key={id}
                        className={`visual-widget-card visual-widget-${widget.size}`}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("application/surco-reorder", id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const nuevo = event.dataTransfer.getData("application/surco-widget") as VisualWidgetId;
                          if (nuevo && VISUAL_WIDGETS.some((item) => item.id === nuevo)) {
                            agregarVisualWidget(nuevo);
                            return;
                          }
                          const desde = event.dataTransfer.getData("application/surco-reorder") as VisualWidgetId;
                          if (desde) moverVisualWidget(desde, id);
                        }}
                      >
                        <div className="visual-widget-header">
                          <div>
                            <FaGripVertical />
                            <span>{widget.title}</span>
                          </div>
                          <button type="button" onClick={() => quitarVisualWidget(id)} title="Quitar cuadro">
                            <FaTimes />
                          </button>
                        </div>
                        <div className="visual-widget-body">{renderVisualWidget(id)}</div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderMapaPanel(title = "MAPA DE SUCURSALES") {
    const sucursalesMapa = sucursales
      .map((sucursal) => {
        const nombre = sucursal.Sucursal || "SIN SUCURSAL";
        const coordenada = COORDENADAS_SUCURSALES[normalizarMapa(nombre)];
        if (!coordenada) return null;

        const cumplimientoSucursal = Number(sucursal.Cumplimiento || 0);

        return {
          nombre,
          lat: coordenada.lat,
          lng: coordenada.lng,
          ventaNeta: Number(sucursal.VentaNeta || 0),
          cumplimiento: cumplimientoSucursal,
          lineas: Number(sucursal.LineasDetalle || 0),
          radius: Math.max(7, Math.min(18, 7 + cumplimientoSucursal / 4)),
        };
      })
      .filter(Boolean) as Array<{
        nombre: string;
        lat: number;
        lng: number;
        ventaNeta: number;
        cumplimiento: number;
        lineas: number;
        radius: number;
      }>;

    return (
      <Panel className="map-panel google-real-panel" title={title}>
        <MapContainer
          center={{ lat: 9.91, lng: -83.87 }}
          zoom={11}
          scrollWheelZoom={false}
          className="real-leaflet-map"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {sucursalesMapa.map((sucursal) => (
            <CircleMarker
              key={sucursal.nombre}
              center={{ lat: sucursal.lat, lng: sucursal.lng }}
              radius={sucursal.radius}
              pathOptions={{
                color: "#70e000",
                fillColor: "#70e000",
                fillOpacity: 0.85,
              }}
            >
              <Popup>
                <div className="map-popup">
                  <strong>{sucursal.nombre}</strong>
                  <span>Venta neta: {formatMoney(sucursal.ventaNeta)}</span>
                  <span>Porcentaje lista: {sucursal.cumplimiento.toFixed(1)}%</span>
                  <span>Líneas: {formatNumber(sucursal.lineas)}</span>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        {sucursalesMapa.length === 0 ? (
          <p className="map-empty">No hay sucursales con coordenadas para estos filtros.</p>
        ) : null}
      </Panel>
    );
  }


  function toggleDrill(key: string) {
    setDrillAbierto((actual) => ({ ...actual, [key]: !actual[key] }));
  }

  function sumarDetalle(rows: VentaDetalleResumen[]): DrillTotals {
    return rows.reduce(
      (acc, row) => ({
        precio: acc.precio + Number(row.Precio || 0),
        descuento: acc.descuento + Number(row.Descuento || 0),
        ventaNeta: acc.ventaNeta + Number(row.VentaNeta || 0),
        kiloLitro: acc.kiloLitro + Number(row.KiloLitro || 0),
        cantidad: acc.cantidad + Number(row.CantidadFinal || 0),
        vendido: acc.vendido + Number(row.Vendido || 0),
        lineas: acc.lineas + Number(row.LineasDetalle || 0),
      }),
      { precio: 0, descuento: 0, ventaNeta: 0, kiloLitro: 0, cantidad: 0, vendido: 0, lineas: 0 }
    );
  }

  function unidadResumen(rows: VentaDetalleResumen[]) {
    const unidades = Array.from(new Set(rows.map((row) => row.UnidadFinal || "UND").filter(Boolean)));
    return unidades.length === 1 ? unidades[0] : "Mixto";
  }

  function labelDrill(row: VentaDetalleResumen, field: keyof VentaDetalleResumen) {
    const value = row[field];
    if (field === "idFactura") return `Factura ${value || "SIN FACTURA"}`;
    if (field === "FechaVenta") return formatDateTime(value);
    return String(value || "SIN DATO");
  }

  function renderDrillRows(
    rows: VentaDetalleResumen[],
    levels: DrillLevel[],
    depth = 0,
    parentKey = "root"
  ): ReactNode {
    const level = levels[depth];
    const groups = new Map<string, VentaDetalleResumen[]>();

    rows.forEach((row) => {
      const label = labelDrill(row, level.field);
      const current = groups.get(label) || [];
      current.push(row);
      groups.set(label, current);
    });

    return Array.from(groups.entries())
      .sort((a, b) => sumarDetalle(b[1]).ventaNeta - sumarDetalle(a[1]).ventaNeta)
      .map(([label, groupRows]) => {
        const key = `${parentKey}/${String(level.field)}:${label}`;
        const abierto = !!drillAbierto[key];
        const leaf = depth >= levels.length - 1;
        const totals = sumarDetalle(groupRows);

        return (
          <Fragment key={key}>
            <tr className={`drill-row depth-${Math.min(depth, 4)}`}>
              <td className="drill-label-cell">
                <span style={{ paddingLeft: depth * 18 }} className="drill-label-inner">
                  {!leaf ? (
                    <button type="button" className="drill-toggle" onClick={() => toggleDrill(key)}>
                      {abierto ? "−" : "+"}
                    </button>
                  ) : (
                    <i className="drill-leaf" />
                  )}
                  <small>{level.label}</small>
                  <strong>{label}</strong>
                </span>
              </td>
              <td>{formatMoneyExact(totals.precio)}</td>
              <td>{formatMoneyExact(totals.descuento)}</td>
              <td>{formatMoneyExact(totals.ventaNeta)}</td>
              <td>{formatKiloLitro(totals.kiloLitro)}</td>
              <td>{formatNumber(totals.cantidad)}</td>
              <td>{unidadResumen(groupRows)}</td>
              <td>{formatNumber(totals.lineas)}</td>
            </tr>
            {abierto && !leaf ? renderDrillRows(groupRows, levels, depth + 1, key) : null}
          </Fragment>
        );
      });
  }

  function renderDrillMatrix(title: string, subtitle: string, levels: DrillLevel[]) {
    const rowsMatrix = ventasDetalleFiltradas;
    const totals = sumarDetalle(rowsMatrix);

    return (
      <Panel className="drill-panel" title={title}>
        <div className="drill-subtitle">{subtitle}</div>

        <div className="drill-table-toolbar">
          <div className="drill-table-search">
            <FaSearch />
            <input
              value={busquedaDetalle}
              onChange={(e) => setBusquedaDetalle(e.target.value)}
              placeholder="Buscar dentro del detalle: código, producto, cliente, factura, proveedor..."
            />
            {busquedaDetalle ? (
              <button type="button" onClick={() => setBusquedaDetalle("")}>
                Limpiar
              </button>
            ) : null}
          </div>
          <span>
            Mostrando {formatNumber(rowsMatrix.length)} de {formatNumber(ventasDetalle.length)} líneas agrupadas
          </span>
        </div>

        <div className="detail-table-wrap drill-table-wrap">
          <table className="detail-table drill-table">
            <thead>
              <tr>
                <th>{levels.map((level) => level.label).join(" > ")}</th>
                <th>Precio</th>
                <th>Descuento</th>
                <th>Venta Neta</th>
                <th>K-L</th>
                <th>Cantidad</th>
                <th>Unidad</th>
                <th>Líneas</th>
              </tr>
            </thead>
            <tbody>
              <tr className="drill-total-row">
                <td>Total filtrado</td>
                <td>{formatMoneyExact(totals.precio)}</td>
                <td>{formatMoneyExact(totals.descuento)}</td>
                <td>{formatMoneyExact(totals.ventaNeta)}</td>
                <td>{formatKiloLitro(totals.kiloLitro)}</td>
                <td>{formatNumber(totals.cantidad)}</td>
                <td>{unidadResumen(rowsMatrix)}</td>
                <td>{formatNumber(totals.lineas)}</td>
              </tr>
              {rowsMatrix.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-detail">
                    No hay detalle para estos filtros o falta actualizar el backend del server.
                  </td>
                </tr>
              ) : (
                renderDrillRows(rowsMatrix, levels)
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  }

  function renderClientes80Panel(title = "80/20 CLIENTES", soloPareto = false) {
    const totalClientes = clientes80.reduce((acc, cliente) => acc + Number(cliente.VentaNeta || 0), 0);
    let acumulado = 0;
    const filasClientes = clientes80.map((cliente) => {
      const venta = Number(cliente.VentaNeta || 0);
      const participacion = totalClientes > 0 ? (venta / totalClientes) * 100 : 0;
      const acumuladoAnterior = acumulado;
      acumulado += participacion;

      return {
        ...cliente,
        venta,
        participacion,
        acumulado,
        esPareto: acumuladoAnterior < 80,
      };
    });
    const filasVisibles = soloPareto
      ? filasClientes.filter((cliente) => cliente.esPareto)
      : filasClientes.slice(0, 30);

    return (
      <Panel className="client-panel" title={title}>
        <div className="pareto-summary">
          <strong>{formatNumber(filasClientes.filter((cliente) => cliente.esPareto).length)} clientes</strong>
          <span>concentran cerca del 80% de la venta neta filtrada</span>
        </div>
        <table className="summary-table client-8020-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Venta Neta</th>
              <th>%</th>
              <th>Acum.</th>
              <th>Líneas</th>
            </tr>
          </thead>
          <tbody>
            {clientes80.length === 0 && (
              <tr><td colSpan={5}>Sin datos de clientes para estos filtros.</td></tr>
            )}
            {filasVisibles.map((cliente) => {
              return (
                <tr key={cliente.Cliente} className={cliente.esPareto ? "pareto-row" : ""}>
                  <td>{cliente.Cliente}</td>
                  <td>{formatMoneyExact(cliente.venta)}</td>
                  <td>{cliente.participacion.toFixed(1)}%</td>
                  <td>{cliente.acumulado.toFixed(1)}%</td>
                  <td>{formatNumber(cliente.LineasDetalle || 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    );
  }

  function renderClientesVentaPanel() {
    return (
      <Panel className="client-panel client-sales-panel" title="CLIENTES Y VENTA NETA">
        <div className="client-sales-list">
          {clientes80.length === 0 ? (
            <div className="visual-no-data">Sin datos de clientes para estos filtros.</div>
          ) : (
            clientes80.slice(0, 40).map((cliente) => (
              <div className="client-sales-row" key={cliente.Cliente}>
                <span>{cliente.Cliente}</span>
                <strong>{formatMoneyExact(Number(cliente.VentaNeta || 0))}</strong>
              </div>
            ))
          )}
        </div>
      </Panel>
    );
  }

  function renderPresupuestoDetallePanel() {
    return (
      <Panel className="budget-detail-panel" title="PRESUPUESTO DETALLADO POR FAMILIA">
        <div className="detail-table-wrap drill-table-wrap">
          <table className="detail-table budget-detail-table">
            <thead>
              <tr>
                <th>Familia</th>
                <th>Presupuesto 2026</th>
                <th>Real</th>
                <th>Diferencia</th>
                <th>Cumpl.</th>
                <th>Presupuesto K-L</th>
                <th>K-L Real</th>
                <th>Líneas</th>
              </tr>
            </thead>
            <tbody>
              {presupuestoFamilias.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-detail">Sin presupuesto detallado para estos filtros.</td>
                </tr>
              )}
              {presupuestoFamilias.map((row: PresupuestoFamiliaResumen) => (
                <tr key={row.Familia}>
                  <td className="detail-product-cell">{row.Familia}</td>
                  <td>{formatMoneyExact(row.Presupuesto)}</td>
                  <td>{formatMoneyExact(row.Real)}</td>
                  <td className={Number(row.Diferencia || 0) >= 0 ? "positive-money" : "negative-money"}>
                    {formatMoneyExact(row.Diferencia)}
                  </td>
                  <td>{Number(row.Cumplimiento || 0).toFixed(1)}%</td>
                  <td>{formatKiloLitro(Number(row.PresupuestoKiloLitro || 0))}</td>
                  <td>{formatKiloLitro(Number(row.KiloLitroReal || 0))}</td>
                  <td>{formatNumber(Number(row.LineasDetalle || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  }

  function renderVentas() {
    return (
      <section className="section-page">
        <SectionHeader title="Ventas" subtitle="Seguimiento comercial con desglose tipo Power BI: bodega, código, producto, cliente y factura." />
        <div className="section-grid">
          <div className="section-span-12">
            {renderDrillMatrix(
              "VENTAS DETALLADAS",
              "Abrí los + para bajar de Bodega > Código > Producto > Cliente > Factura, usando los mismos filtros de la izquierda.",
              [
                { field: "Bodega", label: "Bodega" },
                { field: "Codigo", label: "Código" },
                { field: "Producto", label: "Producto" },
                { field: "Cliente", label: "Cliente" },
                { field: "idFactura", label: "Factura" },
              ]
            )}
          </div>
          <div className="section-span-6">{renderClientes80Panel()}</div>
          <div className="section-span-6">{renderTopProveedoresPanel("TOP PROVEEDORES EN VENTAS")}</div>
          <div className="section-span-8">{renderMesesPanel("EVOLUCIÓN DE VENTAS Y PRESUPUESTO")}</div>
          <div className="section-span-4">{renderFamiliasPanel("VENTAS POR FAMILIA")}</div>
        </div>
      </section>
    );
  }

  function renderDetalle() {
    const rows = detalle.rows || [];
    const inicio = detalle.totalRegistros === 0 ? 0 : (detalle.page - 1) * detalle.pageSize + 1;
    const fin = Math.min(detalle.page * detalle.pageSize, detalle.totalRegistros);

    return (
      <section className="section-page">
        <SectionHeader
          title="Detalle Ultra"
          subtitle="Vista detalle a detalle: cada línea de venta con filtros, búsqueda y todos los campos crudos de SQL."
        />

        <div className="detail-kpi-grid">
          <ConfigCard title="Líneas" value={formatNumber(detalle.totalRegistros)} status="Detalle real" />
          <ConfigCard title="Venta neta" value={formatMoneyExact(detalle.ventaNeta)} status="Filtrado" />
          <ConfigCard title="Cantidad" value={formatNumber(detalle.cantidadTotal)} status="Unidades" />
          <ConfigCard title="K-L" value={formatKiloLitro(detalle.kiloLitro)} status="Kilos / litros" />
        </div>

        <Panel className="ultra-detail-panel" title="DETALLE LÍNEA POR LÍNEA">
          <div className="detail-toolbar">
            <label className="detail-search">
              <FaSearch />
              <input
                value={busquedaDetalle}
                onChange={(e) => setBusquedaDetalle(e.target.value)}
                placeholder="Buscar producto, proveedor, familia, sucursal o fecha..."
              />
            </label>

            <label>
              Filas
              <select
                value={tamanoDetalle}
                onChange={(e) => setTamanoDetalle(Number(e.target.value))}
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
              </select>
            </label>

            <button type="button" onClick={actualizarDetalle} disabled={detalleCargando}>
              <FaSyncAlt className={detalleCargando ? "spin" : ""} />
              {detalleCargando ? "Cargando..." : "Actualizar detalle"}
            </button>
          </div>

          <div className="detail-range">
            Mostrando <strong>{inicio}</strong> - <strong>{fin}</strong> de <strong>{formatNumber(detalle.totalRegistros)}</strong> líneas
          </div>

          <div className="detail-table-wrap">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha</th>
                  <th>Sucursal</th>
                  <th>Proveedor</th>
                  <th>Familia</th>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Unidad</th>
                  <th>Venta neta</th>
                  <th>Todo</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="empty-detail">
                      {detalleCargando ? "Cargando detalle..." : "No hay líneas para estos filtros."}
                    </td>
                  </tr>
                )}

                {rows.map((row) => {
                  const rowNum = Number(row.RowNum || 0);
                  const abierto = filaDetalleAbierta === rowNum;
                  const fecha = getDetalleValue(row, ["DetalleFechaVenta", "FechaVenta"]);
                  const sucursal = getDetalleValue(row, ["DetalleSucursal", "Sucursal", "Bodega"], "SIN SUCURSAL");
                  const proveedor = getDetalleValue(row, ["DetalleProveedor", "Proveedor"], "SIN PROVEEDOR");
                  const familia = getDetalleValue(row, ["DetalleFamilia", "Familia"], "SIN FAMILIA");
                  const producto = getDetalleValue(row, ["DetalleProducto", "Producto"], "SIN PRODUCTO");
                  const cantidad = Number(getDetalleValue(row, ["DetalleCantidadFinal", "CantidadFinal"], 0));
                  const unidad = getDetalleValue(row, ["DetalleUnidadFinal", "UnidadFinal"], "-");
                  const venta = Number(getDetalleValue(row, ["DetalleVentaNeta", "VentaNeta", "Venta_Neta2"], 0));

                  return (
                    <Fragment key={`detalle-grupo-${rowNum}`}>
                      <tr key={`detalle-${rowNum}`}>
                        <td>{rowNum}</td>
                        <td>{formatDateTime(fecha)}</td>
                        <td>{sucursal}</td>
                        <td>{proveedor}</td>
                        <td>{familia}</td>
                        <td className="detail-product-cell">{producto}</td>
                        <td>{formatNumber(cantidad)}</td>
                        <td>{unidad}</td>
                        <td>{formatMoneyExact(venta)}</td>
                        <td>
                          <button
                            type="button"
                            className="row-detail-btn"
                            onClick={() => setFilaDetalleAbierta(abierto ? null : rowNum)}
                          >
                            {abierto ? <FaChevronUp /> : <FaChevronDown />}
                          </button>
                        </td>
                      </tr>

                      {abierto && (
                        <tr className="raw-detail-row" key={`raw-${rowNum}`}>
                          <td colSpan={10}>
                            <div className="raw-grid">
                              {Object.entries(row)
                                .filter(([key, value]) => value !== null && value !== undefined && key !== "RowNum")
                                .map(([key, value]) => (
                                  <div key={`${rowNum}-${key}`}>
                                    <span>{key}</span>
                                    <strong>{String(value)}</strong>
                                  </div>
                                ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="detail-pagination">
            <button
              type="button"
              disabled={detalle.page <= 1 || detalleCargando}
              onClick={() => setPaginaDetalle((page) => Math.max(page - 1, 1))}
            >
              Anterior
            </button>
            <span>
              Página <strong>{detalle.page}</strong> de <strong>{Math.max(detalle.totalPaginas, 1)}</strong>
            </span>
            <button
              type="button"
              disabled={detalle.page >= detalle.totalPaginas || detalleCargando}
              onClick={() => setPaginaDetalle((page) => page + 1)}
            >
              Siguiente
            </button>
          </div>
        </Panel>
      </section>
    );
  }

  function renderPresupuesto() {
    return (
      <section className="section-page">
        <SectionHeader title="Presupuesto" subtitle="Avance contra meta del periodo, con tabla detallada por familia como en Power BI." />
        <div className="section-grid">
          <div className="section-span-12">{renderPresupuestoDetallePanel()}</div>
          <div className="section-span-5">{renderGaugePanel("AVANCE GENERAL")}</div>
          <div className="section-span-7">{renderMesesPanel("PRESUPUESTO VS REAL")}</div>
          <div className="section-span-6">{renderSucursalesPanel("CUMPLIMIENTO POR SUCURSAL")}</div>
          <div className="section-span-6">{renderInsightsPanel("ALERTAS DE PRESUPUESTO")}</div>
        </div>
      </section>
    );
  }

  function renderProveedores() {
    return (
      <section className="section-page">
        <SectionHeader title="Proveedores" subtitle="Ranking y desglose proveedor > familia > producto > cliente > factura." />
        <div className="section-grid">
          <div className="section-span-12">
            {renderDrillMatrix(
              "DETALLE POR PROVEEDOR",
              "Abrí cada proveedor para llegar hasta producto, cliente y factura.",
              [
                { field: "Proveedor", label: "Proveedor" },
                { field: "Familia", label: "Familia" },
                { field: "Producto", label: "Producto" },
                { field: "Cliente", label: "Cliente" },
                { field: "idFactura", label: "Factura" },
              ]
            )}
          </div>
          <div className="section-span-5">{renderTopProveedoresPanel("RANKING DE PROVEEDORES")}</div>
          <div className="section-span-7">{renderResumenProveedorPanel("RESUMEN DETALLADO")}</div>
        </div>
      </section>
    );
  }

  function renderSucursales() {
    return (
      <section className="section-page">
        <SectionHeader title="Sucursales" subtitle="Cumplimiento y detalle por sucursal, proveedor, producto, cliente y factura." />
        <div className="section-grid">
          <div className="section-span-12">
            {renderDrillMatrix(
              "DETALLE POR SUCURSAL",
              "Bajá de sucursal a proveedor, producto, cliente y factura.",
              [
                { field: "Bodega", label: "Sucursal" },
                { field: "Proveedor", label: "Proveedor" },
                { field: "Producto", label: "Producto" },
                { field: "Cliente", label: "Cliente" },
                { field: "idFactura", label: "Factura" },
              ]
            )}
          </div>
          <div className="section-span-5">{renderSucursalesPanel("VENTAS POR SUCURSAL")}</div>
          <div className="section-span-7">{renderMapaPanel("MAPA DE CUMPLIMIENTO")}</div>
          <div className="section-span-12">{renderInsightsPanel("INSIGHTS POR SUCURSAL")}</div>
        </div>
      </section>
    );
  }

 function renderProductos() {
  const productos = data.productos || [];

  return (
    <section className="section-page">
      <SectionHeader title="Productos" subtitle="Productos con desglose por familia, producto, cliente y factura." />
      <div className="section-grid">
        <div className="section-span-12">
          {renderDrillMatrix(
            "DETALLE POR PRODUCTO",
            "Abrí las familias para llegar al producto, cliente y factura.",
            [
              { field: "Familia", label: "Familia" },
              { field: "Producto", label: "Producto" },
              { field: "Cliente", label: "Cliente" },
              { field: "idFactura", label: "Factura" },
            ]
          )}
        </div>

        <div className="section-span-12">
          <Panel className="products-panel" title="TOP PRODUCTOS RESUMEN">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Familia</th>
                  <th>Proveedor</th>
                  <th>Sucursal</th>
                  <th>Cantidad</th>
                  <th>Líneas</th>
                  <th>Venta Neta</th>
                  <th>K-L</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={`${p.Producto}-${p.Proveedor}-${p.Sucursal}`}>
                    <td>{p.Producto}</td>
                    <td>{p.Familia}</td>
                    <td>{p.Proveedor}</td>
                    <td>{p.Sucursal || "-"}</td>
                    <td>{formatNumber(Number(p.CantidadTotal || 0))}</td>
                    <td>{formatNumber(Number(p.LineasDetalle || 0))}</td>
                    <td>{formatMoney(Number(p.VentaNeta || 0))}</td>
                    <td>{formatKiloLitro(Number(p.KiloLitro || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </section>
  );
}


  function renderAlertas() {
    return (
      <section className="section-page">
        <SectionHeader title="Alertas" subtitle="Señales ejecutivas para revisar desempeño." />
        <div className="section-grid">
          <div className="section-span-12">{renderInsightsPanel("ALERTAS AUTOMÁTICAS")}</div>
          <div className="section-span-6">
            <Panel title="RIESGOS">
              <div className="alert-list">
                <Insight icon={<FaArrowDown />} text="Sucursales con cumplimiento menor al 70% requieren revisión." tone="red" />
                <Insight icon={<FaExclamationTriangle />} text="Familias con baja participación deben compararse contra presupuesto." tone="yellow" />
              </div>
            </Panel>
          </div>
          <div className="section-span-6">
            <Panel title="OPORTUNIDADES">
              <div className="alert-list">
                <Insight icon={<FaArrowUp />} text="Proveedores líderes pueden impulsar campañas del mes." tone="green" />
                <Insight icon={<FaChartLine />} text="Cumplimiento positivo permite proyectar cierre mensual." tone="green" />
              </div>
            </Panel>
          </div>
        </div>
      </section>
    );
  }

  function renderConfiguracion() {
    return (
      <section className="section-page">
        <SectionHeader title="Configuración" subtitle="Estado de conexión y preparación para datos reales del servidor." />
        <div className="config-grid">
          <ConfigCard title="Frontend" value="Vercel / React" status="Activo" />
          <ConfigCard title="Servidor" value="Node / Express" status={syncStatus === "real" ? "Conectado" : "Pendiente"} />
          <ConfigCard title="SQL Server" value="CobsysSurco" status={syncStatus === "real" ? "Activo" : "Demo"} />
          <ConfigCard title="Auto-sync" value="Cada 5 minutos" status="Activo" />
        </div>
      </section>
    );
  }

  function renderGaugePanel(title = "AVANCE DEL PRESUPUESTO") {
    return (
      <Panel className="gauge-panel" title={title}>
        <div className="gauge-wrap">
          <div
            className="premium-gauge"
            style={{
              background: `conic-gradient(from 180deg, #1d8cf8 0deg, #70e000 ${Math.min(cumplimiento, 100) * 1.8}deg, rgba(255,255,255,.22) ${Math.min(cumplimiento, 100) * 1.8}deg 180deg)`,
            }}
          >
            <div className="gauge-hole">
              <strong>{cumplimiento.toFixed(1)}%</strong>
              <span>Cumplimiento</span>
            </div>
          </div>
          <div className="gauge-labels">
            <span>₡0.00 M<br />0%</span>
            <span>{formatMoney(presupuesto)}<br />100%</span>
          </div>
          <div className="gauge-footer">
            <div><strong>{formatMoney(ventaReal)}</strong><span>Venta Real</span></div>
            <div><strong>{formatMoney(faltante)}</strong><span>Faltante</span></div>
          </div>
        </div>
      </Panel>
    );
  }

  function renderMesesPanel(title = "PRESUPUESTO VS REAL") {
    return (
      <Panel className="month-panel" title={title}>
        <div className="chart-toolbar">
          <span>{vistaGrafico === "mensual" ? "Detalle mensual" : "Resumen por cuatrimestre"}</span>
          <select
            value={vistaGrafico}
            onChange={(e) => setVistaGrafico(e.target.value as VistaGrafico)}
          >
            <option value="mensual">Mensual</option>
            <option value="cuatrimestre">Cuatrimestre</option>
          </select>
        </div>
        <div className="chart-scroll">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={datosGrafico}
              margin={{ top: 10, right: 8, left: 12, bottom: 14 }}
              barCategoryGap={vistaGrafico === "mensual" ? "22%" : "38%"}
            >
              <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
              <XAxis
                dataKey="mes"
                stroke="#94a3b8"
                interval={0}
                tick={{ fontSize: 11 }}
                tickMargin={10}
              />
              <YAxis
                stroke="#94a3b8"
                width={58}
                tick={{ fontSize: 11 }}
                tickFormatter={getChartMoneyTick}
              />
              <Tooltip
                formatter={(value: any, name: any) => [
                  formatMoney(Number(value || 0)),
                  name === "presupuesto" ? "Presupuesto" : "Venta real",
                ]}
              />
              <Bar dataKey="presupuesto" fill="#1d8cf8" radius={[4, 4, 0, 0]} maxBarSize={38} />
              <Bar dataKey="real" fill="#70e000" radius={[4, 4, 0, 0]} maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    );
  }

  function renderFamiliasPanel(title = "VENTAS POR FAMILIA (TOP 10)") {
    return (
      <Panel className="family-panel" title={title}>
        <div className="family-list">
          {familias.map((familia) => (
            <div className="family-row" key={familia.Familia}>
              <span>{familia.Familia}</span>
              <div className="family-bar">
                <div style={{ width: `${Math.min(Number(familia.Participacion || 0) * 2.5, 100)}%` }} />
              </div>
              <strong>{formatMoney(Number(familia.VentaNeta || 0))}</strong>
              <em>{Number(familia.Participacion || 0).toFixed(1)}%</em>
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  function renderTopProveedoresPanel(title = "TOP 10 PROVEEDORES") {
    return (
      <Panel className="top-panel" title={title}>
        <div className="top-table">
          {proveedores.map((p, i) => {
            const venta = Number(p.VentaNeta || 0);
            const pct = totalTop ? (venta / totalTop) * 100 : 0;
            return (
              <div className="top-row" key={p.Proveedor}>
                <b>{i + 1}</b>
                <span>{p.Proveedor}</span>
                <strong>{formatMoney(venta)}</strong>
                <div><i style={{ width: `${pct}%` }} /></div>
                <em>{pct.toFixed(1)}%</em>
              </div>
            );
          })}
        </div>
      </Panel>
    );
  }

  function renderSucursalesPanel(title = "VENTAS POR SUCURSAL") {
    return (
      <Panel className="branch-panel" title={title}>
        <div className="branch-table">
          {sucursales.map((sucursal) => (
            <div className="branch-line" key={sucursal.Sucursal}>
              <span>{sucursal.Sucursal}</span>
              <strong>{formatMoney(Number(sucursal.VentaNeta || 0))}</strong>
              <em className={getStatusClass(Number(sucursal.Cumplimiento || 0))}>
                {Number(sucursal.Cumplimiento || 0).toFixed(1)}%
              </em>
            </div>
          ))}
        </div>
      </Panel>
    );
  }


    

  function renderInsightsPanel(title = "INSIGHTS AUTOMÁTICOS") {
    return (
      <Panel className="insights-panel" title={title}>
        <div className="insights">
          {insights.map((item, index) => (
            <Insight key={index} icon={item.icon} text={item.text} tone={item.tone} />
          ))}
        </div>
      </Panel>
    );
  }

  function renderResumenProveedorPanel(title = "RESUMEN POR PROVEEDOR") {
    return (
      <Panel className="summary-panel" title={title}>
        <table className="summary-table">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Venta Neta</th>
              <th>% Participación</th>
              <th>K-L Vendidos</th>
              <th>Cumplimiento</th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => {
              const venta = Number(p.VentaNeta || 0);
              const pct = totalTop ? (venta / totalTop) * 100 : 0;
              return (
                <tr key={p.Proveedor}>
                  <td>{p.Proveedor}</td>
                  <td>{formatMoney(venta)}</td>
                  <td>{pct.toFixed(1)}%</td>
                  <td>{formatKiloLitro(Number(p.KiloLitro || 0))}</td>
                  <td>{Number(p.Cumplimiento || 0).toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    );
  }
}

function Kpi({ icon, title, value, detail, tone }: any) {
  return (
    <div className={`premium-kpi ${tone}`}>
      <div className="premium-kpi-icon">{icon}</div>
      <div>
        <span>{title}</span>
        <h2>{value}</h2>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function Panel({ title, children, className = "" }: any) {
  return (
    <section className={`premium-panel ${className}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Insight({ icon, text, tone }: any) {
  return (
    <div className={`insight-card ${tone}`}>
      <div>{icon}</div>
      <p>{text}</p>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function ConfigCard({ title, value, status }: { title: string; value: string; status: string }) {
  return (
    <div className="config-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <em>{status}</em>
    </div>
  );
}