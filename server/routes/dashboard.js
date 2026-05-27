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

const EXCLUSIONES_PRESUPUESTO = [
  "FRAGARIA",
  "EQUIPO SARAN",
  "SARAN",
];

let presupuestoCache = null;
let presupuestoCacheTime = 0;
const CACHE_MS = 60_000;

function getMonthName(monthNumber) {
  return MESES_NOMBRE[Number(monthNumber) - 1] || String(monthNumber);
}

function mesNumeroToCodigo(monthNumber) {
  return MESES_NOMBRE[Number(monthNumber) - 1]?.toUpperCase() || "MAY";
}

function parseFilters(req) {
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

  const anio = Number(req.query.anio || now.getFullYear());

  return {
    mes,
    mesCodigo: mesNumeroToCodigo(mes),
    anio,
  };
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

async function queryRecordset(pool, query, params = {}) {
  const request = pool.request();

  Object.entries(params).forEach(([key, value]) => {
    request.input(key, typeof value === "number" ? sql.Int : sql.VarChar, value);
  });

  const result = await request.query(query);
  return result.recordset || [];
}

async function construirDashboard(req, res) {
  try {
    const { mes, mesCodigo, anio } = parseFilters(req);
    const pool = await getConnection();
    const params = { mes, anio };

    const presupuestoExcel = obtenerPresupuestoExcel();
    const presupuestoMes = filtrarPresupuestoPorMes(presupuestoExcel, mesCodigo, anio);
    const presupuestoTotal = sumarColones(presupuestoMes);

    const resumenSql = await queryRecordset(
      pool,
      `
      SELECT
        CAST(SUM(Venta_Neta2) AS decimal(18,2)) AS VentaReal,
        CAST(SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(UnidadFinal, '')))) IN ('KG','KILO','KILOS','LTR','LITRO','LITROS') THEN CantidadFinal ELSE 0 END) AS decimal(18,2)) AS KiloLitro
      FROM surco_tiendas
      WHERE MONTH(FechaVenta) = @mes
        AND YEAR(FechaVenta) = @anio;
    `,
      params
    );

    const ventaRealTotal = Number(resumenSql[0]?.VentaReal || 0);
    const kiloLitroTotal = Number(resumenSql[0]?.KiloLitro || 0);

    const proveedoresRaw = await queryRecordset(
      pool,
      `
      SELECT TOP 5
        ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR') AS Proveedor,
        CAST(SUM(Venta_Neta2) AS decimal(18,2)) AS VentaNeta,
        CAST(SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(UnidadFinal, '')))) IN ('KG','KILO','KILOS','LTR','LITRO','LITROS') THEN CantidadFinal ELSE 0 END) AS decimal(18,2)) AS KiloLitro
      FROM surco_tiendas
      WHERE MONTH(FechaVenta) = @mes
        AND YEAR(FechaVenta) = @anio
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
        Participacion: ventaRealTotal > 0 ? (venta / ventaRealTotal) * 100 : 0,
        Cumplimiento: presupuestoTotal > 0 ? (venta / presupuestoTotal) * 100 : 0,
      };
    });

    const familias = await queryRecordset(
      pool,
      `
      WITH base AS (
        SELECT
          ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA') AS Familia,
          SUM(Venta_Neta2) AS VentaNeta
        FROM surco_tiendas
        WHERE MONTH(FechaVenta) = @mes
          AND YEAR(FechaVenta) = @anio
        GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(Familia)), ''), 'SIN FAMILIA')
      ), total AS (
        SELECT SUM(VentaNeta) AS TotalVenta FROM base
      )
      SELECT TOP 10
        b.Familia,
        CAST(b.VentaNeta AS decimal(18,2)) AS VentaNeta,
        CAST(CASE WHEN t.TotalVenta = 0 THEN 0 ELSE (b.VentaNeta / t.TotalVenta) * 100 END AS decimal(18,2)) AS Participacion
      FROM base b
      CROSS JOIN total t
      ORDER BY b.VentaNeta DESC;
    `,
      params
    );

    const sucursalesRaw = await queryRecordset(
      pool,
      `
      SELECT TOP 5
        ISNULL(NULLIF(LTRIM(RTRIM(Bodega)), ''), 'SIN SUCURSAL') AS Sucursal,
        CAST(SUM(Venta_Neta2) AS decimal(18,2)) AS VentaNeta
      FROM surco_tiendas
      WHERE MONTH(FechaVenta) = @mes
        AND YEAR(FechaVenta) = @anio
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
      WHERE YEAR(FechaVenta) = @anio
      GROUP BY MONTH(FechaVenta)
      ORDER BY MONTH(FechaVenta);
    `,
      { anio }
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

    res.json({
      ok: true,
      fechaActualizacion: new Date().toLocaleString("es-CR"),
      presupuesto: presupuestoTotal,
      ventaReal: ventaRealTotal,
      kiloLitro: kiloLitroTotal,
      proveedores,
      familias,
      sucursales,
      meses,
      debug: {
        mes,
        mesCodigo,
        anio,
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

router.get("/proveedores", async (req, res) => {
  try {
    const { mes, anio } = parseFilters(req);
    const pool = await getConnection();

    const proveedores = await queryRecordset(
      pool,
      `
      SELECT TOP 10
        ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR') AS Proveedor,
        CAST(SUM(Venta_Neta2) AS decimal(18,2)) AS VentaNeta,
        CAST(SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(UnidadFinal, '')))) IN ('KG','KILO','KILOS','LTR','LITRO','LITROS') THEN CantidadFinal ELSE 0 END) AS decimal(18,2)) AS KiloLitro
      FROM surco_tiendas
      WHERE MONTH(FechaVenta) = @mes
        AND YEAR(FechaVenta) = @anio
      GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(Proveedor)), ''), 'SIN PROVEEDOR')
      ORDER BY SUM(Venta_Neta2) DESC;
    `,
      { mes, anio }
    );

    res.json({ ok: true, proveedores });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
