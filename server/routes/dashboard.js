import express from "express";
import XLSX from "xlsx";
import { getConnection, sql } from "../db/sql.js";

const router = express.Router();

const EXCEL_PATH =
  process.env.EXCEL_PATH || "C:\\Surco\\Executive\\Presupuesto sin Saran y Fragaria.xlsx";

const MESES = {
  ENE: 1,
  FEB: 2,
  MAR: 3,
  ABR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DIC: 12,
};

const MESES_NOMBRE = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

const EXCLUSIONES_PRESUPUESTO = ["FRAGARIA", "EQUIPO SARAN", "SARAN"];

let presupuestoCache = null;
let presupuestoCacheTime = 0;
const CACHE_MS = 60_000;

function getMonthName(monthNumber) {
  return MESES_NOMBRE[Number(monthNumber) - 1] || String(monthNumber);
}

function mesNumeroToCodigo(monthNumber) {
  return MESES_NOMBRE[Number(monthNumber) - 1]?.toUpperCase() || "MAY";
}

function getText(value) {
  return String(value || "").trim();
}

function getMonthValue(req) {
  const now = new Date();
  const mesRaw = String(req.query.mes || "").toUpperCase().trim();

  let mes;
  if (MESES[mesRaw]) {
    mes = MESES[mesRaw];
  } else {
    mes = Number(req.query.mes || now.getMonth() + 1);
  }

  if (!Number.isFinite(mes) || mes < 1 || mes > 12) {
    mes = now.getMonth() + 1;
  }

  return mes;
}

function parseFilters(req) {
  const now = new Date();
  const mes = getMonthValue(req);
  const anio = Number(req.query.anio || now.getFullYear());

  return {
    mes,
    mesCodigo: mesNumeroToCodigo(mes),
    anio: Number.isFinite(anio) ? anio : now.getFullYear(),
    proveedor: getText(req.query.proveedor),
    familia: getText(req.query.familia),
    bodega: getText(req.query.bodega),
    producto: getText(req.query.producto),
    q: getText(req.query.q),
  };
}

function buildParams(filters) {
  const params = {
    mes: filters.mes,
    anio: filters.anio,
  };

  if (filters.proveedor) params.proveedor = filters.proveedor;
  if (filters.familia) params.familia = filters.familia;
  if (filters.bodega) params.bodega = filters.bodega;
  if (filters.producto) params.producto = filters.producto;
  if (filters.q) params.qLike = `%${filters.q}%`;

  return params;
}

function buildVentasWhere(filters, options = {}) {
  const { includeMonth = true, includeSearch = false } = options;
  const where = [];

  if (includeMonth) where.push("MONTH(FechaVenta) = @mes");
  where.push("YEAR(FechaVenta) = @anio");

  if (filters.proveedor) {
    where.push("ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR') = @proveedor");
  }

  if (filters.familia) {
    where.push("ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA') = @familia");
  }

  if (filters.bodega) {
    where.push("ISNULL(NULLIF(LTRIM(RTRIM(Bodega)), ''), 'SIN SUCURSAL') = @bodega");
  }

  if (filters.producto) {
    where.push("ISNULL(NULLIF(LTRIM(RTRIM(Producto)), ''), 'SIN PRODUCTO') = @producto");
  }

  if (includeSearch && filters.q) {
    where.push(`(
      ISNULL(Producto, '') LIKE @qLike OR
      ISNULL(Proveedor, '') LIKE @qLike OR
      ISNULL(Familia, '') LIKE @qLike OR
      ISNULL(Bodega, '') LIKE @qLike OR
      CONVERT(varchar(30), FechaVenta, 120) LIKE @qLike
    )`);
  }

  return where.join("\n        AND ");
}

function normalizarTexto(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function debeExcluirPresupuesto(row) {
  const campos = [
    row.PRODUCTO,
    row["CÓD PRODUCTO"],
    row["COD PRODUCTO"],
    row.FAMILIA,
    row["SUB FAMILIA"],
    row.TIPO_PPTO,
    row.PROVEEDOR,
  ]
    .map(normalizarTexto)
    .join(" | ");

  return EXCLUSIONES_PRESUPUESTO.some((exclusion) =>
    campos.includes(normalizarTexto(exclusion))
  );
}

function obtenerPresupuestoExcel() {
  const ahora = Date.now();

  if (presupuestoCache && ahora - presupuestoCacheTime < CACHE_MS) {
    return presupuestoCache;
  }

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  presupuestoCache = XLSX.utils.sheet_to_json(sheet, { defval: null });
  presupuestoCacheTime = ahora;

  return presupuestoCache;
}

function filtrarPresupuestoPorMes(presupuesto, mesCodigo, anio) {
  return presupuesto.filter((row) => {
    const mesOk = normalizarTexto(row.MES) === normalizarTexto(mesCodigo);
    const anioExcel = Number(row["AÑO"] || row.ANIO || row.YEAR || anio);
    const anioOk = anioExcel === Number(anio);

    return mesOk && anioOk && !debeExcluirPresupuesto(row);
  });
}

function sumarColones(rows) {
  return rows.reduce((acc, item) => acc + Number(item.COLONES || 0), 0);
}

function getNumberFromRow(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      const value = Number(row[key]);
      if (Number.isFinite(value)) return value;
    }
  }

  return 0;
}

function getPresupuestoFamilia(row) {
  return (
    getText(row.FAMILIA) ||
    getText(row.Familia) ||
    getText(row["SUB FAMILIA"]) ||
    getText(row.SUB_FAMILIA) ||
    "SIN FAMILIA"
  );
}

function buildPresupuestoFamilias(presupuestoRows, realRows) {
  const presupuestoMap = new Map();

  presupuestoRows.forEach((row) => {
    const familia = getPresupuestoFamilia(row);
    const key = normalizarTexto(familia);
    const actual = presupuestoMap.get(key) || {
      Familia: familia,
      Presupuesto: 0,
      PresupuestoKiloLitro: 0,
    };

    actual.Presupuesto += Number(row.COLONES || 0);
    actual.PresupuestoKiloLitro += getNumberFromRow(row, [
      "KILO-LITRO",
      "K-L",
      "KILOLITRO",
      "KILO_LITRO",
      "KILO LITRO",
      "KILOS_LITROS",
    ]);

    presupuestoMap.set(key, actual);
  });

  const realMap = new Map(
    realRows.map((row) => [normalizarTexto(row.Familia), row])
  );

  const keys = new Set([...presupuestoMap.keys(), ...realMap.keys()]);

  return Array.from(keys)
    .map((key) => {
      const presupuesto = presupuestoMap.get(key) || {
        Familia: realMap.get(key)?.Familia || "SIN FAMILIA",
        Presupuesto: 0,
        PresupuestoKiloLitro: 0,
      };
      const real = realMap.get(key) || {};
      const ventaReal = Number(real.Real || 0);
      const presupuestoColones = Number(presupuesto.Presupuesto || 0);

      return {
        Familia: presupuesto.Familia,
        Presupuesto: presupuestoColones,
        Real: ventaReal,
        Diferencia: ventaReal - presupuestoColones,
        Cumplimiento: presupuestoColones > 0 ? (ventaReal / presupuestoColones) * 100 : 0,
        PresupuestoKiloLitro: Number(presupuesto.PresupuestoKiloLitro || 0),
        KiloLitroReal: Number(real.KiloLitroReal || 0),
        LineasDetalle: Number(real.LineasDetalle || 0),
      };
    })
    .sort((a, b) => Math.max(b.Presupuesto, b.Real) - Math.max(a.Presupuesto, a.Real));
}

async function queryRecordset(pool, query, params = {}) {
  const request = pool.request();

  Object.entries(params).forEach(([key, value]) => {
    request.input(key, typeof value === "number" ? sql.Int : sql.VarChar, value);
  });

  const result = await request.query(query);
  return result.recordset || [];
}

function mapNumberFields(rows, fields) {
  return rows.map((row) => {
    const copy = { ...row };
    fields.forEach((field) => {
      copy[field] = Number(copy[field] || 0);
    });
    return copy;
  });
}

async function obtenerOpciones(pool, filters) {
  const where = buildVentasWhere(filters, { includeMonth: true, includeSearch: false });
  const params = buildParams({ ...filters, proveedor: "", familia: "", bodega: "", producto: "", q: "" });

  const [proveedores, familias, bodegas, productos] = await Promise.all([
    queryRecordset(
      pool,
      `
      SELECT DISTINCT TOP 500
        ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR') AS value
      FROM surco_tiendas
      WHERE ${where
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR') = @proveedor", "1 = 1")
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA') = @familia", "1 = 1")
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Bodega)), ''), 'SIN SUCURSAL') = @bodega", "1 = 1")
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Producto)), ''), 'SIN PRODUCTO') = @producto", "1 = 1")}
      ORDER BY value;
    `,
      params
    ),
    queryRecordset(
      pool,
      `
      SELECT DISTINCT TOP 500
        ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA') AS value
      FROM surco_tiendas
      WHERE ${where
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR') = @proveedor", "1 = 1")
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA') = @familia", "1 = 1")
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Bodega)), ''), 'SIN SUCURSAL') = @bodega", "1 = 1")
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Producto)), ''), 'SIN PRODUCTO') = @producto", "1 = 1")}
      ORDER BY value;
    `,
      params
    ),
    queryRecordset(
      pool,
      `
      SELECT DISTINCT TOP 500
        ISNULL(NULLIF(LTRIM(RTRIM(Bodega)), ''), 'SIN SUCURSAL') AS value
      FROM surco_tiendas
      WHERE ${where
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR') = @proveedor", "1 = 1")
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA') = @familia", "1 = 1")
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Bodega)), ''), 'SIN SUCURSAL') = @bodega", "1 = 1")
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Producto)), ''), 'SIN PRODUCTO') = @producto", "1 = 1")}
      ORDER BY value;
    `,
      params
    ),
    queryRecordset(
      pool,
      `
      SELECT DISTINCT TOP 1000
        ISNULL(NULLIF(LTRIM(RTRIM(Producto)), ''), 'SIN PRODUCTO') AS value
      FROM surco_tiendas
      WHERE ${where
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR') = @proveedor", "1 = 1")
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA') = @familia", "1 = 1")
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Bodega)), ''), 'SIN SUCURSAL') = @bodega", "1 = 1")
        .replace("ISNULL(NULLIF(LTRIM(RTRIM(Producto)), ''), 'SIN PRODUCTO') = @producto", "1 = 1")}
      ORDER BY value;
    `,
      params
    ),
  ]);

  return {
    proveedores: proveedores.map((item) => item.value).filter(Boolean),
    familias: familias.map((item) => item.value).filter(Boolean),
    bodegas: bodegas.map((item) => item.value).filter(Boolean),
    productos: productos.map((item) => item.value).filter(Boolean),
  };
}

async function construirDashboard(req, res) {
  try {
    const filters = parseFilters(req);
    const { mes, mesCodigo, anio } = filters;
    const pool = await getConnection();
    const params = buildParams(filters);
    const whereMes = buildVentasWhere(filters, { includeMonth: true });
    const whereAnio = buildVentasWhere(filters, { includeMonth: false });

    const presupuestoExcel = obtenerPresupuestoExcel();
    const presupuestoMes = filtrarPresupuestoPorMes(presupuestoExcel, mesCodigo, anio);
    const presupuestoTotal = sumarColones(presupuestoMes);

    const resumenSql = await queryRecordset(
      pool,
      `
      SELECT
        CAST(ISNULL(SUM(Venta_Neta2), 0) AS decimal(18,2)) AS VentaReal,
        CAST(ISNULL(SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(UnidadFinal, '')))) IN ('KG','KILO','KILOS','LTR','LITRO','LITROS') THEN CantidadFinal ELSE 0 END), 0) AS decimal(18,2)) AS KiloLitro,
        CAST(ISNULL(SUM(CantidadFinal), 0) AS decimal(18,2)) AS CantidadTotal,
        COUNT(1) AS LineasDetalle
      FROM surco_tiendas
      WHERE ${whereMes};
    `,
      params
    );

    const ventaRealTotal = Number(resumenSql[0]?.VentaReal || 0);
    const kiloLitroTotal = Number(resumenSql[0]?.KiloLitro || 0);
    const cantidadTotal = Number(resumenSql[0]?.CantidadTotal || 0);
    const lineasDetalle = Number(resumenSql[0]?.LineasDetalle || 0);

    const proveedoresRaw = await queryRecordset(
      pool,
      `
      SELECT TOP 10
        ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR') AS Proveedor,
        CAST(SUM(Venta_Neta2) AS decimal(18,2)) AS VentaNeta,
        CAST(SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(UnidadFinal, '')))) IN ('KG','KILO','KILOS','LTR','LITRO','LITROS') THEN CantidadFinal ELSE 0 END) AS decimal(18,2)) AS KiloLitro,
        CAST(SUM(CantidadFinal) AS decimal(18,2)) AS CantidadTotal,
        COUNT(1) AS LineasDetalle
      FROM surco_tiendas
      WHERE ${whereMes}
      GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR')
      ORDER BY SUM(Venta_Neta2) DESC;
    `,
      params
    );

    const proveedores = proveedoresRaw.map((item) => {
      const venta = Number(item.VentaNeta || 0);
      return {
        ...item,
        VentaNeta: venta,
        KiloLitro: Number(item.KiloLitro || 0),
        CantidadTotal: Number(item.CantidadTotal || 0),
        LineasDetalle: Number(item.LineasDetalle || 0),
        Participacion: ventaRealTotal > 0 ? (venta / ventaRealTotal) * 100 : 0,
        Cumplimiento: presupuestoTotal > 0 ? (venta / presupuestoTotal) * 100 : 0,
      };
    });

    const familias = mapNumberFields(
      await queryRecordset(
        pool,
        `
      WITH base AS (
        SELECT
          ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA') AS Familia,
          SUM(Venta_Neta2) AS VentaNeta,
          SUM(CantidadFinal) AS CantidadTotal,
          COUNT(1) AS LineasDetalle
        FROM surco_tiendas
        WHERE ${whereMes}
        GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA')
      ), total AS (
        SELECT SUM(VentaNeta) AS TotalVenta FROM base
      )
      SELECT TOP 15
        b.Familia,
        CAST(b.VentaNeta AS decimal(18,2)) AS VentaNeta,
        CAST(b.CantidadTotal AS decimal(18,2)) AS CantidadTotal,
        b.LineasDetalle,
        CAST(CASE WHEN t.TotalVenta = 0 THEN 0 ELSE (b.VentaNeta / t.TotalVenta) * 100 END AS decimal(18,2)) AS Participacion
      FROM base b
      CROSS JOIN total t
      ORDER BY b.VentaNeta DESC;
    `,
        params
      ),
      ["VentaNeta", "CantidadTotal", "LineasDetalle", "Participacion"]
    );

    const sucursalesRaw = await queryRecordset(
      pool,
      `
      SELECT TOP 15
        ISNULL(NULLIF(LTRIM(RTRIM(Bodega)), ''), 'SIN SUCURSAL') AS Sucursal,
        CAST(SUM(Venta_Neta2) AS decimal(18,2)) AS VentaNeta,
        CAST(SUM(CantidadFinal) AS decimal(18,2)) AS CantidadTotal,
        COUNT(1) AS LineasDetalle
      FROM surco_tiendas
      WHERE ${whereMes}
      GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(Bodega)), ''), 'SIN SUCURSAL')
      ORDER BY SUM(Venta_Neta2) DESC;
    `,
      params
    );

    const sucursales = sucursalesRaw.map((item) => {
      const venta = Number(item.VentaNeta || 0);
      return {
        ...item,
        VentaNeta: venta,
        CantidadTotal: Number(item.CantidadTotal || 0),
        LineasDetalle: Number(item.LineasDetalle || 0),
        Cumplimiento: presupuestoTotal > 0 ? (venta / presupuestoTotal) * 100 : 0,
      };
    });

    const mesesRaw = await queryRecordset(
      pool,
      `
      SELECT
        MONTH(FechaVenta) AS MesNum,
        CAST(SUM(Venta_Neta2) AS decimal(18,2)) AS Real
      FROM surco_tiendas
      WHERE ${whereAnio}
      GROUP BY MONTH(FechaVenta)
      ORDER BY MONTH(FechaVenta);
    `,
      params
    );

    const meses = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const mesLoopCodigo = mesNumeroToCodigo(month);
      const ventasRow = mesesRaw.find((item) => Number(item.MesNum) === month);
      const presupuestoLoop = filtrarPresupuestoPorMes(presupuestoExcel, mesLoopCodigo, anio);

      return {
        mes: getMonthName(month),
        presupuesto: sumarColones(presupuestoLoop),
        real: Number(ventasRow?.Real || 0),
      };
    });

    const productos = mapNumberFields(
      await queryRecordset(
        pool,
        `
      SELECT TOP 300
        ISNULL(NULLIF(LTRIM(RTRIM(Producto)), ''), 'SIN PRODUCTO') AS Producto,
        ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA') AS Familia,
        ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR') AS Proveedor,
        ISNULL(NULLIF(LTRIM(RTRIM(Bodega)), ''), 'SIN SUCURSAL') AS Sucursal,
        CAST(SUM(Venta_Neta2) AS decimal(18,2)) AS VentaNeta,
        CAST(SUM(CantidadFinal) AS decimal(18,2)) AS CantidadTotal,
        CAST(SUM(
          CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(UnidadFinal, ''))))
            IN ('KG','KILO','KILOS','LTR','LITRO','LITROS')
            THEN CantidadFinal
            ELSE 0
          END
        ) AS decimal(18,2)) AS KiloLitro,
        COUNT(1) AS LineasDetalle
      FROM surco_tiendas
      WHERE ${whereMes}
      GROUP BY
        ISNULL(NULLIF(LTRIM(RTRIM(Producto)), ''), 'SIN PRODUCTO'),
        ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA'),
        ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR'),
        ISNULL(NULLIF(LTRIM(RTRIM(Bodega)), ''), 'SIN SUCURSAL')
      ORDER BY SUM(Venta_Neta2) DESC;
      `,
        params
      ),
      ["VentaNeta", "KiloLitro", "CantidadTotal", "LineasDetalle"]
    );


    const ventasDetalle = mapNumberFields(
      await queryRecordset(
        pool,
        `
      SELECT TOP 5000
        ISNULL(NULLIF(LTRIM(RTRIM(Bodega)), ''), 'SIN SUCURSAL') AS Bodega,
        CONVERT(varchar(10), FechaVenta, 23) AS FechaVenta,
        CAST(idFactura AS varchar(80)) AS idFactura,
        ISNULL(NULLIF(LTRIM(RTRIM(Codigo)), ''), 'SIN CODIGO') AS Codigo,
        ISNULL(NULLIF(LTRIM(RTRIM(Cliente)), ''), 'SIN CLIENTE') AS Cliente,
        ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR') AS Proveedor,
        ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA') AS Familia,
        ISNULL(NULLIF(LTRIM(RTRIM(Producto)), ''), 'SIN PRODUCTO') AS Producto,
        ISNULL(NULLIF(LTRIM(RTRIM(UnidadFinal)), ''), 'UND') AS UnidadFinal,
        CAST(SUM(ISNULL(Vendido, 0)) AS decimal(18,2)) AS Vendido,
        CAST(SUM(ISNULL(CantidadFinal, 0)) AS decimal(18,2)) AS CantidadFinal,
        CAST(SUM(
          CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(UnidadFinal, ''))))
            IN ('KG','KILO','KILOS','LTR','LITRO','LITROS')
            THEN CantidadFinal
            ELSE 0
          END
        ) AS decimal(18,2)) AS KiloLitro,
        CAST(SUM(ISNULL(Precio, 0)) AS decimal(18,2)) AS Precio,
        CAST(SUM(ISNULL(Descuento, 0)) AS decimal(18,2)) AS Descuento,
        CAST(SUM(ISNULL(Venta_Neta2, 0)) AS decimal(18,2)) AS VentaNeta,
        CAST(AVG(ISNULL(MargenPorcentaje, 0)) AS decimal(18,4)) AS MargenPorcentaje,
        COUNT(1) AS LineasDetalle
      FROM surco_tiendas
      WHERE ${whereMes}
      GROUP BY
        ISNULL(NULLIF(LTRIM(RTRIM(Bodega)), ''), 'SIN SUCURSAL'),
        CONVERT(varchar(10), FechaVenta, 23),
        CAST(idFactura AS varchar(80)),
        ISNULL(NULLIF(LTRIM(RTRIM(Codigo)), ''), 'SIN CODIGO'),
        ISNULL(NULLIF(LTRIM(RTRIM(Cliente)), ''), 'SIN CLIENTE'),
        ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR'),
        ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA'),
        ISNULL(NULLIF(LTRIM(RTRIM(Producto)), ''), 'SIN PRODUCTO'),
        ISNULL(NULLIF(LTRIM(RTRIM(UnidadFinal)), ''), 'UND')
      ORDER BY SUM(ISNULL(Venta_Neta2, 0)) DESC;
      `,
        params
      ),
      [
        "Vendido",
        "CantidadFinal",
        "KiloLitro",
        "Precio",
        "Descuento",
        "VentaNeta",
        "MargenPorcentaje",
        "LineasDetalle",
      ]
    );

    const clientes80 = mapNumberFields(
      await queryRecordset(
        pool,
        `
      SELECT TOP 100
        ISNULL(NULLIF(LTRIM(RTRIM(Cliente)), ''), 'SIN CLIENTE') AS Cliente,
        CAST(SUM(ISNULL(Venta_Neta2, 0)) AS decimal(18,2)) AS VentaNeta,
        CAST(SUM(ISNULL(CantidadFinal, 0)) AS decimal(18,2)) AS CantidadTotal,
        CAST(SUM(
          CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(UnidadFinal, ''))))
            IN ('KG','KILO','KILOS','LTR','LITRO','LITROS')
            THEN CantidadFinal
            ELSE 0
          END
        ) AS decimal(18,2)) AS KiloLitro,
        COUNT(1) AS LineasDetalle
      FROM surco_tiendas
      WHERE ${whereMes}
      GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(Cliente)), ''), 'SIN CLIENTE')
      ORDER BY SUM(ISNULL(Venta_Neta2, 0)) DESC;
      `,
        params
      ),
      ["VentaNeta", "CantidadTotal", "KiloLitro", "LineasDetalle"]
    );

    const realPresupuestoFamilias = mapNumberFields(
      await queryRecordset(
        pool,
        `
      SELECT
        ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA') AS Familia,
        CAST(SUM(ISNULL(Venta_Neta2, 0)) AS decimal(18,2)) AS Real,
        CAST(SUM(
          CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(UnidadFinal, ''))))
            IN ('KG','KILO','KILOS','LTR','LITRO','LITROS')
            THEN CantidadFinal
            ELSE 0
          END
        ) AS decimal(18,2)) AS KiloLitroReal,
        COUNT(1) AS LineasDetalle
      FROM surco_tiendas
      WHERE ${whereMes}
      GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA');
      `,
        params
      ),
      ["Real", "KiloLitroReal", "LineasDetalle"]
    );

    const presupuestoFamilias = buildPresupuestoFamilias(
      presupuestoMes,
      realPresupuestoFamilias
    );

    const opciones = await obtenerOpciones(pool, filters);

    res.json({
      ok: true,
      fechaActualizacion: new Date().toLocaleString("es-CR"),
      presupuesto: presupuestoTotal,
      ventaReal: ventaRealTotal,
      kiloLitro: kiloLitroTotal,
      cantidadTotal,
      lineasDetalle,
      proveedores,
      familias,
      sucursales,
      meses,
      productos,
      ventasDetalle,
      clientes80,
      presupuestoFamilias,
      opciones,
      debug: {
        mes,
        mesCodigo,
        anio,
        filtros: {
          proveedor: filters.proveedor,
          familia: filters.familia,
          bodega: filters.bodega,
          producto: filters.producto,
        },
        excelPath: EXCEL_PATH,
        presupuestoLineas: presupuestoMes.length,
        exclusionesPresupuesto: EXCLUSIONES_PRESUPUESTO,
      },
    });
  } catch (error) {
    console.error("Error en /api/dashboard", error);
    res.status(500).json({
      ok: false,
      error: "Error consultando dashboard",
      detail: error.message,
    });
  }
}

router.get("/", construirDashboard);
router.get("/resumen", construirDashboard);

router.get("/detalle", async (req, res) => {
  try {
    const filters = parseFilters(req);
    const pool = await getConnection();

    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 100), 25), 500);
    const desde = (page - 1) * pageSize + 1;
    const hasta = page * pageSize;

    const params = {
      ...buildParams(filters),
      desde,
      hasta,
    };

    const where = buildVentasWhere(filters, { includeMonth: true, includeSearch: true });

    const totals = await queryRecordset(
      pool,
      `
      SELECT
        COUNT(1) AS totalRegistros,
        CAST(ISNULL(SUM(Venta_Neta2), 0) AS decimal(18,2)) AS ventaNeta,
        CAST(ISNULL(SUM(CantidadFinal), 0) AS decimal(18,2)) AS cantidadTotal,
        CAST(ISNULL(SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(UnidadFinal, '')))) IN ('KG','KILO','KILOS','LTR','LITRO','LITROS') THEN CantidadFinal ELSE 0 END), 0) AS decimal(18,2)) AS kiloLitro
      FROM surco_tiendas
      WHERE ${where};
    `,
      params
    );

    const rows = await queryRecordset(
      pool,
      `
      WITH detalle AS (
        SELECT
          ROW_NUMBER() OVER (ORDER BY FechaVenta DESC, Venta_Neta2 DESC) AS RowNum,
          FechaVenta AS DetalleFechaVenta,
          ISNULL(NULLIF(LTRIM(RTRIM(Bodega)), ''), 'SIN SUCURSAL') AS DetalleSucursal,
          ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR') AS DetalleProveedor,
          ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA') AS DetalleFamilia,
          ISNULL(NULLIF(LTRIM(RTRIM(Producto)), ''), 'SIN PRODUCTO') AS DetalleProducto,
          CAST(CantidadFinal AS decimal(18,2)) AS DetalleCantidadFinal,
          UnidadFinal AS DetalleUnidadFinal,
          CAST(Venta_Neta2 AS decimal(18,2)) AS DetalleVentaNeta,
          *
        FROM surco_tiendas
        WHERE ${where}
      )
      SELECT *
      FROM detalle
      WHERE RowNum BETWEEN @desde AND @hasta
      ORDER BY RowNum;
    `,
      params
    );

    res.json({
      ok: true,
      fechaActualizacion: new Date().toLocaleString("es-CR"),
      page,
      pageSize,
      totalRegistros: Number(totals[0]?.totalRegistros || 0),
      totalPaginas: Math.ceil(Number(totals[0]?.totalRegistros || 0) / pageSize),
      ventaNeta: Number(totals[0]?.ventaNeta || 0),
      cantidadTotal: Number(totals[0]?.cantidadTotal || 0),
      kiloLitro: Number(totals[0]?.kiloLitro || 0),
      rows: rows.map((row) => ({
        ...row,
        RowNum: Number(row.RowNum || 0),
        DetalleCantidadFinal: Number(row.DetalleCantidadFinal || row.CantidadFinal || 0),
        DetalleVentaNeta: Number(row.DetalleVentaNeta || row.Venta_Neta2 || 0),
      })),
    });
  } catch (error) {
    console.error("Error en /api/dashboard/detalle", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/proveedores", async (req, res) => {
  try {
    const filters = parseFilters(req);
    const pool = await getConnection();
    const where = buildVentasWhere(filters, { includeMonth: true });

    const proveedores = await queryRecordset(
      pool,
      `
      SELECT TOP 20
        ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR') AS Proveedor,
        CAST(SUM(Venta_Neta2) AS decimal(18,2)) AS VentaNeta,
        CAST(SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(UnidadFinal, '')))) IN ('KG','KILO','KILOS','LTR','LITRO','LITROS') THEN CantidadFinal ELSE 0 END) AS decimal(18,2)) AS KiloLitro,
        COUNT(1) AS LineasDetalle
      FROM surco_tiendas
      WHERE ${where}
      GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR')
      ORDER BY SUM(Venta_Neta2) DESC;
    `,
      buildParams(filters)
    );

    res.json({ ok: true, proveedores });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
