import express from "express";
import XLSX from "xlsx";
import { getConnection, sql } from "../db/sql.js";

const router = express.Router();

const EXCEL_PATH =
  process.env.EXCEL_PATH || "C:\\Surco\\Executive\\PRESUPUESTO 2026.xlsx";

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

const MESES_NOMBRE = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

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

  const anio = Number(req.query.anio || now.getFullYear());

  return {
    mes,
    mesCodigo: mesNumeroToCodigo(mes),
    anio,
  };
}

function debeExcluirPresupuesto(p) {
  const producto = String(p.PRODUCTO || "").toUpperCase().trim();
  const codigo = String(p["CÓD PRODUCTO"] || "").toUpperCase().trim();
  const familia = String(p.FAMILIA || "").toUpperCase().trim();
  const subFamilia = String(p["SUB FAMILIA"] || "").toUpperCase().trim();

  return (
    producto.includes("FRAGARIA") ||
    producto.includes("EQUIPO SARAN") ||
    producto.includes("SARAN") ||
    codigo.includes("FRAGARIA") ||
    familia.includes("FRAGARIA") ||
    familia.includes("EQUIPO SARAN") ||
    familia.includes("SARAN") ||
    subFamilia.includes("FRAGARIA") ||
    subFamilia.includes("EQUIPO SARAN") ||
    subFamilia.includes("SARAN")
  );
}

function obtenerPresupuestoExcel() {
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  return XLSX.utils.sheet_to_json(sheet);
}

function filtrarPresupuestoPorMes(presupuesto, mesCodigo, anio) {
  return presupuesto.filter((p) => {
    const mesOk = String(p.MES || "").toUpperCase().trim() === mesCodigo;
    const anioOk = Number(p["AÑO"] || p.ANIO || anio) === Number(anio);

    return mesOk && anioOk && !debeExcluirPresupuesto(p);
  });
}

async function queryRecordset(pool, query, params = {}) {
  const request = pool.request();

  Object.entries(params).forEach(([key, value]) => {
    request.input(key, typeof value === "number" ? sql.Int : sql.VarChar, value);
  });

  const result = await request.query(query);
  return result.recordset || [];
}

router.get("/resumen", async (req, res) => {
  try {
    const { mes, mesCodigo, anio } = parseFilters(req);
    const pool = await getConnection();

    const presupuestoExcel = obtenerPresupuestoExcel();
    const presupuestoMes = filtrarPresupuestoPorMes(presupuestoExcel, mesCodigo, anio);

    const presupuestoTotal = presupuestoMes.reduce(
      (acc, item) => acc + Number(item.COLONES || 0),
      0
    );

    const params = { mes, anio };

    const proveedores = await queryRecordset(pool, `
      WITH base AS (
        SELECT
          Proveedor,
          SUM(Venta_Neta2) AS VentaNeta,
          SUM(CantidadFinal) AS KiloLitro
        FROM surco_tiendas
        WHERE MONTH(FechaVenta) = @mes
          AND YEAR(FechaVenta) = @anio
        GROUP BY Proveedor
      ), total AS (
        SELECT SUM(VentaNeta) AS TotalVenta FROM base
      )
      SELECT TOP 5
        b.Proveedor,
        CAST(b.VentaNeta AS decimal(18,2)) AS VentaNeta,
        CAST(b.KiloLitro AS decimal(18,2)) AS KiloLitro,
        CAST(CASE WHEN ${presupuestoTotal} = 0 THEN 0 ELSE (b.VentaNeta / ${presupuestoTotal}) * 100 END AS decimal(18,2)) AS Cumplimiento,
        CAST(CASE WHEN t.TotalVenta = 0 THEN 0 ELSE (b.VentaNeta / t.TotalVenta) * 100 END AS decimal(18,2)) AS Participacion
      FROM base b
      CROSS JOIN total t
      ORDER BY b.VentaNeta DESC;
    `, params);

    const familias = await queryRecordset(pool, `
      WITH base AS (
        SELECT
          Familia,
          SUM(Venta_Neta2) AS VentaNeta
        FROM surco_tiendas
        WHERE MONTH(FechaVenta) = @mes
          AND YEAR(FechaVenta) = @anio
        GROUP BY Familia
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
    `, params);

    const sucursales = await queryRecordset(pool, `
      SELECT TOP 5
        Bodega AS Sucursal,
        CAST(SUM(Venta_Neta2) AS decimal(18,2)) AS VentaNeta,
        CAST(CASE WHEN ${presupuestoTotal} = 0 THEN 0 ELSE (SUM(Venta_Neta2) / ${presupuestoTotal}) * 100 END AS decimal(18,2)) AS Cumplimiento
      FROM surco_tiendas
      WHERE MONTH(FechaVenta) = @mes
        AND YEAR(FechaVenta) = @anio
      GROUP BY Bodega
      ORDER BY SUM(Venta_Neta2) DESC;
    `, params);

    const mesesRaw = await queryRecordset(pool, `
      SELECT
        MONTH(FechaVenta) AS MesNum,
        CAST(SUM(Venta_Neta2) AS decimal(18,2)) AS Real
      FROM surco_tiendas
      WHERE YEAR(FechaVenta) = @anio
      GROUP BY MONTH(FechaVenta)
      ORDER BY MONTH(FechaVenta);
    `, { anio });

    const meses = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const mesLoopCodigo = mesNumeroToCodigo(month);

      const ventasRow = mesesRaw.find((item) => Number(item.MesNum) === month);

      const presupuestoLoop = filtrarPresupuestoPorMes(
        presupuestoExcel,
        mesLoopCodigo,
        anio
      );

      const presupuestoLoopTotal = presupuestoLoop.reduce(
        (acc, item) => acc + Number(item.COLONES || 0),
        0
      );

      return {
        mes: getMonthName(month),
        presupuesto: Number(presupuestoLoopTotal || 0),
        real: Number(ventasRow?.Real || 0),
      };
    });

    const ventaReal = proveedores.reduce(
      (acc, item) => acc + Number(item.VentaNeta || 0),
      0
    );

    const kiloLitro = proveedores.reduce(
      (acc, item) => acc + Number(item.KiloLitro || 0),
      0
    );

    res.json({
      ok: true,
      fechaActualizacion: new Date().toLocaleString("es-CR"),
      presupuesto: presupuestoTotal,
      ventaReal,
      kiloLitro,
      proveedores,
      familias,
      sucursales,
      meses,
      debug: {
        mes,
        mesCodigo,
        anio,
        presupuestoLineas: presupuestoMes.length,
      },
    });
  } catch (error) {
    console.error("Error en /api/dashboard/resumen", error);
    res.status(500).json({
      ok: false,
      error: "Error consultando dashboard",
      detail: error.message,
    });
  }
});

router.get("/proveedores", async (req, res) => {
  try {
    const { mes, anio } = parseFilters(req);
    const pool = await getConnection();

    const proveedores = await queryRecordset(pool, `
      SELECT TOP 10
        Proveedor,
        CAST(SUM(Venta_Neta2) AS decimal(18,2)) AS VentaNeta,
        CAST(SUM(CantidadFinal) AS decimal(18,2)) AS KiloLitro
      FROM surco_tiendas
      WHERE MONTH(FechaVenta) = @mes
        AND YEAR(FechaVenta) = @anio
      GROUP BY Proveedor
      ORDER BY SUM(Venta_Neta2) DESC;
    `, { mes, anio });

    res.json({ ok: true, proveedores });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;