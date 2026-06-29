const express = require("express");
const cors = require("cors");
const sql = require("mssql");
const XLSX = require("xlsx");
const fs = require("fs");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const sqlConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  port: parseInt(process.env.SQL_PORT),
  database: process.env.SQL_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

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

function normalizarTexto(valor) {
  return String(valor || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}


function normalizarLista(valor) {
  const raw = Array.isArray(valor) ? valor : [valor];

  return [
    ...new Set(
      raw
        .flatMap((item) => String(item || "").split(","))
        .map((item) => normalizarTexto(item))
        .filter(Boolean)
    ),
  ];
}

function coincideLista(valor, lista) {
  if (!lista || lista.length === 0) return true;
  return lista.includes(normalizarTexto(valor));
}

function texto(valor, fallback = "") {
  const value = String(valor ?? "").trim();
  return value || fallback;
}

function numero(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

  return (
    Number(
      String(valor)
        .replace(/¢/g, "")
        .replace(/₡/g, "")
        .replace(/\s/g, "")
        .replace(/,/g, "")
    ) || 0
  );
}

function obtenerValor(row, nombres) {
  for (const nombre of nombres) {
    if (row[nombre] !== undefined) return row[nombre];
  }

  const keys = Object.keys(row);
  for (const key of keys) {
    const keyNormalizada = normalizarTexto(key);
    for (const nombre of nombres) {
      if (keyNormalizada === normalizarTexto(nombre)) {
        return row[key];
      }
    }
  }

  return "";
}

function obtenerPresupuesto() {
  const workbook = XLSX.readFile(process.env.EXCEL_PATH);
  const nombreHoja = workbook.SheetNames[0];
  const hoja = workbook.Sheets[nombreHoja];
  return XLSX.utils.sheet_to_json(hoja, { defval: null });
}

function obtenerVentasEnero() {
  const eneroPath = process.env.ENERO_PATH;

  if (!eneroPath || !fs.existsSync(eneroPath)) {
    return [];
  }

  const workbook = XLSX.readFile(eneroPath);
  const nombreHoja = workbook.SheetNames[0];
  const hoja = workbook.Sheets[nombreHoja];
  const data = XLSX.utils.sheet_to_json(hoja, { defval: null });

  return data.map((row) => {
    const litros = numero(obtenerValor(row, ["Litros", "LITROS", "CantidadFinal", "KILO-LITRO"]));
    const kilos = numero(obtenerValor(row, ["Kilos", "KILOS"]));

    return {
      FechaVenta: "2026-01-01",
      idFactura: obtenerValor(row, ["Factura", "idFactura", "IDFACTURA"]) || "ENERO",
      Proveedor: obtenerValor(row, ["Proveedor", "PROVEEDOR"]) || "SIN PROVEEDOR",
      Familia: obtenerValor(row, ["Familia", "FAMILIA"]) || "SIN FAMILIA",
      Producto: String(obtenerValor(row, ["Producto", "PRODUCTO"]) || "SIN PRODUCTO"),
      Bodega: obtenerValor(row, ["bodega", "Bodega", "BODEGA"]) || "SIN BODEGA",
      Codigo: obtenerValor(row, ["Codigo", "Código", "CODIGO", "CÓDIGO"]) || "SIN CODIGO",
      Cliente: obtenerValor(row, ["Cliente", "CLIENTE"]) || "SIN CLIENTE",
      UnidadFinal: obtenerValor(row, ["UnidadFinal", "UNIDAD", "Unidad"]) || "UND",
      Vendido: numero(obtenerValor(row, ["Vendido", "Cantidad", "UNIDADES"])),
      Precio: numero(obtenerValor(row, ["Precio", "PRECIO"])),
      Descuento: numero(obtenerValor(row, ["Descuento", "DESCUENTO"])),
      Venta_Neta2: numero(obtenerValor(row, ["Neto", "NETO", "Venta_Neta2", "VentaNeta"])),
      CantidadFinal: litros + kilos,
      MargenPorcentaje: numero(obtenerValor(row, ["MargenPorcentaje", "MARGEN"])),
    };
  });
}

async function obtenerVentas() {
  const pool = await sql.connect(sqlConfig);

  const result = await pool.request().query(`
    SELECT *
    FROM surco_tiendas
  `);

  const ventasSql = result.recordset || [];
  const ventasEnero = obtenerVentasEnero();

  return [...ventasSql, ...ventasEnero];
}

function obtenerNumeroMes(mesRaw) {
  const mesNormalizado = normalizarTexto(mesRaw || "MAY");

  if (MESES[mesNormalizado]) return MESES[mesNormalizado];

  const numeroMes = Number(mesRaw);
  if (Number.isFinite(numeroMes) && numeroMes >= 1 && numeroMes <= 12) {
    return numeroMes;
  }

  return MESES.MAY;
}

function codigoMesDesdeNumero(numeroMes) {
  const entrada = Object.entries(MESES).find(([, value]) => value === Number(numeroMes));
  return entrada ? entrada[0] : "MAY";
}

function esMesTodos(valor) {
  const mes = normalizarTexto(valor);
  return ["TODO", "TODOS", "ALL", "ANUAL", "GENERAL", "COMPANIA", "COMPAÑIA"].includes(mes);
}

function obtenerMesPresupuesto(row) {
  const mes = obtenerValor(row, ["MES", "Mes"]);
  if (mes !== "" && mes !== null && mes !== undefined) {
    const mesTexto = normalizarTexto(mes);
    if (MESES[mesTexto]) return MESES[mesTexto];
    const mesNum = Number(mes);
    if (Number.isFinite(mesNum)) return mesNum;
  }

  const mesNum = Number(obtenerValor(row, ["MES_NUM", "MES NUM", "Mes_Num", "MesNum"]));
  return Number.isFinite(mesNum) ? mesNum : 0;
}

function obtenerAnioPresupuesto(row, anioDefault) {
  const anio = Number(obtenerValor(row, ["AÑO", "ANIO", "YEAR", "Año"]));
  return Number.isFinite(anio) && anio > 0 ? anio : anioDefault;
}

function getFecha(row) {
  const fecha = new Date(row.FechaVenta);
  return fecha;
}

function getYear(row) {
  const fecha = getFecha(row);
  return Number.isNaN(fecha.getTime()) ? 0 : fecha.getUTCFullYear();
}

function getMonth(row) {
  const fecha = getFecha(row);
  return Number.isNaN(fecha.getTime()) ? 0 : fecha.getUTCMonth() + 1;
}

function fechaCorta(valor) {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor || "");
  return fecha.toISOString().slice(0, 10);
}

function aplicarFiltrosVentas(v, filtros) {
  return (
    coincideLista(v.Proveedor || "SIN PROVEEDOR", filtros.proveedor) &&
    coincideLista(v.Familia || "SIN FAMILIA", filtros.familia) &&
    coincideLista(v.Bodega || "SIN BODEGA", filtros.bodega) &&
    coincideLista(v.Producto || "SIN PRODUCTO", filtros.producto)
  );
}

function aplicarBusquedaDetalle(v, q) {
  const tokens = normalizarLista(q);
  if (tokens.length === 0) return true;

  const textoBusqueda = normalizarTexto([
    v.FechaVenta,
    v.Bodega,
    v.Proveedor,
    v.Familia,
    v.Producto,
    v.Codigo,
    v.Cliente,
    v.idFactura,
  ].join(" "));

  return tokens.every((token) => textoBusqueda.includes(token));
}

function sumar(rows, campo) {
  return rows.reduce((acc, row) => acc + numero(row[campo]), 0);
}

function getUnidad(row) {
  return texto(row.UnidadFinal, "UND");
}

function getKiloLitro(row) {
  // En el reporte actual K-L usa la CantidadFinal que ya viene convertida desde la vista SQL.
  return numero(row.CantidadFinal);
}

function crearOpciones(rows, campo) {
  return [...new Set(rows.map((row) => texto(row[campo]).trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es")
  );
}

function agrupar(rows, getKey, createItem, updateItem) {
  const map = new Map();

  rows.forEach((row) => {
    const key = getKey(row);
    if (!map.has(key)) map.set(key, createItem(row));
    updateItem(map.get(key), row);
  });

  return [...map.values()];
}

function construirVentasDetalle(rows) {
  const detalle = agrupar(
    rows,
    (v) =>
      [
        texto(v.Bodega, "SIN BODEGA"),
        fechaCorta(v.FechaVenta),
        texto(v.idFactura, "SIN FACTURA"),
        texto(v.Codigo, "SIN CODIGO"),
        texto(v.Cliente, "SIN CLIENTE"),
        texto(v.Proveedor, "SIN PROVEEDOR"),
        texto(v.Familia, "SIN FAMILIA"),
        texto(v.Producto, "SIN PRODUCTO"),
        getUnidad(v),
      ].join("|") ,
    (v) => ({
      Bodega: texto(v.Bodega, "SIN BODEGA"),
      FechaVenta: fechaCorta(v.FechaVenta),
      idFactura: String(texto(v.idFactura, "SIN FACTURA")),
      Codigo: texto(v.Codigo, "SIN CODIGO"),
      Cliente: texto(v.Cliente, "SIN CLIENTE"),
      Proveedor: texto(v.Proveedor, "SIN PROVEEDOR"),
      Familia: texto(v.Familia, "SIN FAMILIA"),
      Producto: texto(v.Producto, "SIN PRODUCTO"),
      UnidadFinal: getUnidad(v),
      Vendido: 0,
      CantidadFinal: 0,
      KiloLitro: 0,
      Precio: 0,
      Descuento: 0,
      VentaNeta: 0,
      MargenPorcentajeSuma: 0,
      MargenPorcentaje: 0,
      LineasDetalle: 0,
    }),
    (item, v) => {
      item.Vendido += numero(v.Vendido);
      item.CantidadFinal += numero(v.CantidadFinal);
      item.KiloLitro += getKiloLitro(v);
      item.Precio += numero(v.Precio);
      item.Descuento += numero(v.Descuento);
      item.VentaNeta += numero(v.Venta_Neta2);
      item.MargenPorcentajeSuma += numero(v.MargenPorcentaje);
      item.LineasDetalle += 1;
      item.MargenPorcentaje = item.LineasDetalle > 0 ? item.MargenPorcentajeSuma / item.LineasDetalle : 0;
    }
  );

  return detalle
    .map(({ MargenPorcentajeSuma, ...item }) => item)
    .sort((a, b) => b.VentaNeta - a.VentaNeta);
}

function construirClientes80(rows) {
  return agrupar(
    rows,
    (v) => texto(v.Cliente, "SIN CLIENTE"),
    (v) => ({
      Cliente: texto(v.Cliente, "SIN CLIENTE"),
      VentaNeta: 0,
      CantidadTotal: 0,
      KiloLitro: 0,
      LineasDetalle: 0,
    }),
    (item, v) => {
      item.VentaNeta += numero(v.Venta_Neta2);
      item.CantidadTotal += numero(v.CantidadFinal);
      item.KiloLitro += getKiloLitro(v);
      item.LineasDetalle += 1;
    }
  ).sort((a, b) => b.VentaNeta - a.VentaNeta);
}

function getPresupuestoFamilia(row) {
  return (
    texto(obtenerValor(row, ["FAMILIA", "Familia"])) ||
    texto(obtenerValor(row, ["SUB FAMILIA", "SUB_FAMILIA", "SubFamilia"])) ||
    "SIN FAMILIA"
  );
}

function getPresupuestoKiloLitro(row) {
  return numero(
    obtenerValor(row, [
      "KILO-LITRO",
      "K-L",
      "KILOLITRO",
      "KILO_LITRO",
      "KILO LITRO",
      "KILOS_LITROS",
    ])
  );
}

function construirPresupuestoFamilias(presupuestoMes, ventasMes) {
  const map = new Map();

  presupuestoMes.forEach((p) => {
    const familia = getPresupuestoFamilia(p);
    const key = normalizarTexto(familia);

    if (!map.has(key)) {
      map.set(key, {
        Familia: familia,
        Presupuesto: 0,
        Real: 0,
        Diferencia: 0,
        Cumplimiento: 0,
        PresupuestoKiloLitro: 0,
        KiloLitroReal: 0,
        LineasDetalle: 0,
      });
    }

    const item = map.get(key);
    item.Presupuesto += numero(obtenerValor(p, ["COLONES", "Presupuesto 2026", "PRESUPUESTO 2026"]));
    item.PresupuestoKiloLitro += getPresupuestoKiloLitro(p);
  });

  ventasMes.forEach((v) => {
    const familia = texto(v.Familia, "SIN FAMILIA");
    const key = normalizarTexto(familia);

    if (!map.has(key)) {
      map.set(key, {
        Familia: familia,
        Presupuesto: 0,
        Real: 0,
        Diferencia: 0,
        Cumplimiento: 0,
        PresupuestoKiloLitro: 0,
        KiloLitroReal: 0,
        LineasDetalle: 0,
      });
    }

    const item = map.get(key);
    item.Real += numero(v.Venta_Neta2);
    item.KiloLitroReal += getKiloLitro(v);
    item.LineasDetalle += 1;
  });

  return [...map.values()]
    .map((item) => ({
      ...item,
      Diferencia: item.Real - item.Presupuesto,
      Cumplimiento: item.Presupuesto > 0 ? (item.Real / item.Presupuesto) * 100 : 0,
    }))
    .sort((a, b) => Math.max(b.Presupuesto, b.Real) - Math.max(a.Presupuesto, a.Real));
}

function crearDetallePaginado(rows, page, pageSize) {
  const ordenadas = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const fechaA = new Date(a.row.FechaVenta).getTime() || 0;
      const fechaB = new Date(b.row.FechaVenta).getTime() || 0;
      if (fechaB !== fechaA) return fechaB - fechaA;
      return numero(b.row.Venta_Neta2) - numero(a.row.Venta_Neta2);
    });

  const totalRegistros = ordenadas.length;
  const desde = (page - 1) * pageSize;
  const seleccionadas = ordenadas.slice(desde, desde + pageSize);

  return {
    totalRegistros,
    rows: seleccionadas.map(({ row }, idx) => ({
      RowNum: desde + idx + 1,
      DetalleFechaVenta: fechaCorta(row.FechaVenta),
      DetalleSucursal: texto(row.Bodega, "SIN BODEGA"),
      DetalleProveedor: texto(row.Proveedor, "SIN PROVEEDOR"),
      DetalleFamilia: texto(row.Familia, "SIN FAMILIA"),
      DetalleProducto: texto(row.Producto, "SIN PRODUCTO"),
      DetalleCantidadFinal: numero(row.CantidadFinal),
      DetalleUnidadFinal: getUnidad(row),
      DetalleVentaNeta: numero(row.Venta_Neta2),
      ...row,
      FechaVenta: fechaCorta(row.FechaVenta),
      VentaNeta: numero(row.Venta_Neta2),
      CantidadFinal: numero(row.CantidadFinal),
      Vendido: numero(row.Vendido),
      Precio: numero(row.Precio),
      Descuento: numero(row.Descuento),
      MargenPorcentaje: numero(row.MargenPorcentaje),
    })),
  };
}

async function construirDashboardPayload(req) {
  const mesRaw = req.query.mes || "MAY";
  const mesTodos = esMesTodos(mesRaw);
  const mes = mesTodos ? "TODO" : normalizarTexto(mesRaw);
  const numeroMes = mesTodos ? null : obtenerNumeroMes(mes);
  const mesCodigo = mesTodos ? "TODO" : codigoMesDesdeNumero(numeroMes);
  const anio = Number(req.query.anio || 2026);

  const filtros = {
    proveedor: normalizarLista(req.query.proveedor),
    familia: normalizarLista(req.query.familia),
    bodega: normalizarLista(req.query.bodega),
    producto: normalizarLista(req.query.producto),
  };
  const q = req.query.q || "";

  const ventas = await obtenerVentas();
  const presupuesto = obtenerPresupuesto();

  const ventasAnio = ventas.filter((v) => getYear(v) === anio);
  const ventasMesBase = mesTodos ? ventasAnio : ventasAnio.filter((v) => getMonth(v) === numeroMes);

  const proveedoresOpciones = crearOpciones(ventasMesBase, "Proveedor");
  const familiasOpciones = crearOpciones(ventasMesBase, "Familia");
  const bodegasOpciones = crearOpciones(ventasMesBase, "Bodega");
  const productosOpciones = crearOpciones(ventasMesBase, "Producto");

  const ventasMes = ventasMesBase
    .filter((v) => aplicarFiltrosVentas(v, filtros))
    .filter((v) => aplicarBusquedaDetalle(v, q));

  const presupuestoMes = presupuesto.filter((p) => {
    const mesOk = mesTodos || obtenerMesPresupuesto(p) === numeroMes;
    const anioOk = obtenerAnioPresupuesto(p, anio) === anio;

    const proveedor = normalizarTexto(obtenerValor(p, ["PROVEEDOR", "Proveedor"]));
    const familia = normalizarTexto(obtenerValor(p, ["FAMILIA", "Familia"]));
    const producto = normalizarTexto(obtenerValor(p, ["PRODUCTO", "Producto"]));

    return (
      mesOk &&
      anioOk &&
      coincideLista(proveedor, filtros.proveedor) &&
      coincideLista(familia, filtros.familia) &&
      coincideLista(producto, filtros.producto)
    );
  });

  const ventaReal = sumar(ventasMes, "Venta_Neta2");

  let presupuestoTotal = presupuestoMes.reduce(
    (acc, p) => acc + numero(obtenerValor(p, ["COLONES", "Presupuesto 2026", "PRESUPUESTO 2026"])),
    0
  );

  if (filtros.bodega.length > 0 && presupuestoTotal > 0) {
    const ventasSinFiltroBodega = ventasMesBase.filter((v) => {
      const filtrosSinBodega = { ...filtros, bodega: [] };
      return aplicarFiltrosVentas(v, filtrosSinBodega) && aplicarBusquedaDetalle(v, q);
    });

    const ventaTotalSinFiltroBodega = sumar(ventasSinFiltroBodega, "Venta_Neta2");
    const participacionBodega = ventaTotalSinFiltroBodega > 0 ? ventaReal / ventaTotalSinFiltroBodega : 0;
    presupuestoTotal = presupuestoTotal * participacionBodega;
  }

  const kiloLitro = ventasMes.reduce((acc, v) => acc + getKiloLitro(v), 0);
  const cantidadTotal = sumar(ventasMes, "CantidadFinal");
  const lineasDetalle = ventasMes.length;

  const proveedores = agrupar(
    ventasMes,
    (v) => texto(v.Proveedor, "SIN PROVEEDOR"),
    (v) => ({
      Proveedor: texto(v.Proveedor, "SIN PROVEEDOR"),
      VentaNeta: 0,
      KiloLitro: 0,
      CantidadTotal: 0,
      Participacion: 0,
      Cumplimiento: 0,
      LineasDetalle: 0,
    }),
    (item, v) => {
      item.VentaNeta += numero(v.Venta_Neta2);
      item.KiloLitro += getKiloLitro(v);
      item.CantidadTotal += numero(v.CantidadFinal);
      item.LineasDetalle += 1;
    }
  ).sort((a, b) => b.VentaNeta - a.VentaNeta);

  proveedores.forEach((p) => {
    p.Participacion = ventaReal > 0 ? (p.VentaNeta / ventaReal) * 100 : 0;
    p.Cumplimiento = presupuestoTotal > 0 ? (p.VentaNeta / presupuestoTotal) * 100 : 0;
  });

  const familias = agrupar(
    ventasMes,
    (v) => texto(v.Familia, "SIN FAMILIA"),
    (v) => ({
      Familia: texto(v.Familia, "SIN FAMILIA"),
      VentaNeta: 0,
      CantidadTotal: 0,
      Participacion: 0,
      LineasDetalle: 0,
    }),
    (item, v) => {
      item.VentaNeta += numero(v.Venta_Neta2);
      item.CantidadTotal += numero(v.CantidadFinal);
      item.LineasDetalle += 1;
    }
  ).sort((a, b) => b.VentaNeta - a.VentaNeta);

  familias.forEach((f) => {
    f.Participacion = ventaReal > 0 ? (f.VentaNeta / ventaReal) * 100 : 0;
  });

  const sucursales = agrupar(
    ventasMes,
    (v) => texto(v.Bodega, "SIN SUCURSAL"),
    (v) => ({
      Sucursal: texto(v.Bodega, "SIN SUCURSAL"),
      VentaNeta: 0,
      CantidadTotal: 0,
      Cumplimiento: 0,
      LineasDetalle: 0,
    }),
    (item, v) => {
      item.VentaNeta += numero(v.Venta_Neta2);
      item.CantidadTotal += numero(v.CantidadFinal);
      item.LineasDetalle += 1;
    }
  ).sort((a, b) => b.VentaNeta - a.VentaNeta);

  sucursales.forEach((s) => {
    s.Cumplimiento = presupuestoTotal > 0 ? (s.VentaNeta / presupuestoTotal) * 100 : 0;
  });

  const mesesResumen = Object.keys(MESES).map((nombreMes) => {
    const numeroMesLoop = MESES[nombreMes];
    const ventasMesLoop = ventasAnio
      .filter((v) => getMonth(v) === numeroMesLoop)
      .filter((v) => aplicarFiltrosVentas(v, filtros))
      .filter((v) => aplicarBusquedaDetalle(v, q));

    const presupuestoMesLoop = presupuesto.filter((p) => {
      return obtenerMesPresupuesto(p) === numeroMesLoop && obtenerAnioPresupuesto(p, anio) === anio;
    });

    return {
      mes: nombreMes,
      presupuesto: presupuestoMesLoop.reduce(
        (a, b) => a + numero(obtenerValor(b, ["COLONES", "Presupuesto 2026", "PRESUPUESTO 2026"])),
        0
      ),
      real: sumar(ventasMesLoop, "Venta_Neta2"),
    };
  });

  const productos = agrupar(
    ventasMes,
    (v) =>
      `${texto(v.Producto, "SIN PRODUCTO")}|${texto(v.Familia, "SIN FAMILIA")}|${texto(v.Proveedor, "SIN PROVEEDOR")}|${texto(v.Bodega, "SIN SUCURSAL")}`,
    (v) => ({
      Producto: texto(v.Producto, "SIN PRODUCTO"),
      Familia: texto(v.Familia, "SIN FAMILIA"),
      Proveedor: texto(v.Proveedor, "SIN PROVEEDOR"),
      Sucursal: texto(v.Bodega, "SIN SUCURSAL"),
      VentaNeta: 0,
      KiloLitro: 0,
      CantidadTotal: 0,
      LineasDetalle: 0,
    }),
    (item, v) => {
      item.VentaNeta += numero(v.Venta_Neta2);
      item.KiloLitro += getKiloLitro(v);
      item.CantidadTotal += numero(v.CantidadFinal);
      item.LineasDetalle += 1;
    }
  ).sort((a, b) => b.VentaNeta - a.VentaNeta);

  const ventasDetalle = construirVentasDetalle(ventasMes);
  const clientes80 = construirClientes80(ventasMes);
  const presupuestoFamilias = construirPresupuestoFamilias(presupuestoMes, ventasMes);

  return {
    ok: true,
    fechaActualizacion: new Date().toLocaleString("es-CR"),

    filtros: {
      mes: mesCodigo,
      anio,
      proveedor: filtros.proveedor,
      familia: filtros.familia,
      bodega: filtros.bodega,
      producto: filtros.producto,
    },

    opciones: {
      proveedores: proveedoresOpciones,
      familias: familiasOpciones,
      bodegas: bodegasOpciones,
      productos: productosOpciones,
    },

    presupuesto: presupuestoTotal,
    ventaReal,
    kiloLitro,
    cantidadTotal,
    lineasDetalle,
    proveedores,
    familias: familias.slice(0, 15),
    sucursales,
    meses: mesesResumen,
    productos,
    ventasDetalle,
    clientes80,
    presupuestoFamilias,
  };
}

app.get("/api/dashboard", async (req, res) => {
  try {
    const payload = await construirDashboardPayload(req);
    res.json(payload);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get("/api/dashboard/resumen", async (req, res) => {
  try {
    const payload = await construirDashboardPayload(req);
    res.json(payload);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get("/api/dashboard/detalle", async (req, res) => {
  try {
    const mesRaw = req.query.mes || "MAY";
    const mesTodos = esMesTodos(mesRaw);
    const mes = mesTodos ? "TODO" : normalizarTexto(mesRaw);
    const numeroMes = mesTodos ? null : obtenerNumeroMes(mes);
    const anio = Number(req.query.anio || 2026);
    const page = Math.max(Number(req.query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || 100), 25), 500);
    const q = req.query.q || "";

    const filtros = {
      proveedor: normalizarLista(req.query.proveedor),
      familia: normalizarLista(req.query.familia),
      bodega: normalizarLista(req.query.bodega),
      producto: normalizarLista(req.query.producto),
    };

    const ventas = await obtenerVentas();
    const ventasFiltradas = ventas
      .filter((v) => getYear(v) === anio)
      .filter((v) => mesTodos || getMonth(v) === numeroMes)
      .filter((v) => aplicarFiltrosVentas(v, filtros))
      .filter((v) => aplicarBusquedaDetalle(v, q));

    const detalle = crearDetallePaginado(ventasFiltradas, page, pageSize);
    const ventaNeta = sumar(ventasFiltradas, "Venta_Neta2");
    const cantidadTotal = sumar(ventasFiltradas, "CantidadFinal");
    const kiloLitro = ventasFiltradas.reduce((acc, v) => acc + getKiloLitro(v), 0);

    res.json({
      ok: true,
      fechaActualizacion: new Date().toLocaleString("es-CR"),
      page,
      pageSize,
      totalRegistros: detalle.totalRegistros,
      totalPaginas: Math.ceil(detalle.totalRegistros / pageSize),
      ventaNeta,
      cantidadTotal,
      kiloLitro,
      rows: detalle.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 3005;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
