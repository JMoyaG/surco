import { useEffect, useMemo, useState } from "react";
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
  FaHome,
  FaMapMarkerAlt,
  FaMedal,
  FaStore,
  FaTimes,
  FaSyncAlt,
  FaUsers,
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
import type { DashboardPayload } from "../api/dashboardApi";
import { obtenerDashboard } from "../api/dashboardApi";
import "./dashboard.css";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
type Props = { onLogout: () => void };
type SyncStatus = "loading" | "real" | "demo" | "error";
type VistaGrafico = "mensual" | "cuatrimestre";
type Seccion =
  | "resumen"
  | "ventas"
  | "presupuesto"
  | "proveedores"
  | "sucursales"
  | "productos"
  | "alertas"
  | "configuracion";

const demoData: DashboardPayload = {
  ok: true,
  fechaActualizacion: "Datos demo",
  presupuesto: 707_170_000,
  ventaReal: 554_220_000,
  kiloLitro: 1_110_000,
  meses: [],
  familias: [],
  proveedores: [],
  sucursales: [],
};

const productosDemo = [
  { Producto: "Fertilizante Premium", Familia: "Fertilizantes", VentaNeta: 82_450_000, KiloLitro: 126_500 },
  { Producto: "Foliares Especializados", Familia: "Foliares", VentaNeta: 54_110_000, KiloLitro: 43_200 },
  { Producto: "Herbicida Selectivo", Familia: "Herbicidas", VentaNeta: 47_900_000, KiloLitro: 31_870 },
  { Producto: "Semilla Maíz", Familia: "Semillas", VentaNeta: 36_720_000, KiloLitro: 18_430 },
  { Producto: "Insecticida Técnico", Familia: "Insecticidas", VentaNeta: 25_300_000, KiloLitro: 12_950 },
];

const menuItems: Array<{ id: Seccion; label: string; icon: ReactNode; badge?: number }> = [
  { id: "resumen", label: "Resumen Ejecutivo", icon: <FaHome /> },
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

export default function Dashboard({ onLogout }: Props) {
  const [data, setData] = useState<DashboardPayload>(demoData);
  const [cargando, setCargando] = useState(false);
  const [estadoSync, setEstadoSync] = useState("Datos demo cargados");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("demo");
  const [seccionActiva, setSeccionActiva] = useState<Seccion>("resumen");
  const [mesSeleccionado, setMesSeleccionado] = useState("MAY");
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState("");
  const [familiaSeleccionada, setFamiliaSeleccionada] = useState("");
  const [bodegaSeleccionada, setBodegaSeleccionada] = useState("");
  const [productoSeleccionado, setProductoSeleccionado] = useState("");
  const [vistaGrafico, setVistaGrafico] = useState<VistaGrafico>("mensual");
  const [menuMobileAbierto, setMenuMobileAbierto] = useState(false);
  const [filtrosMobileAbiertos, setFiltrosMobileAbiertos] = useState(false);

  const actualizarDatos = async () => {
    try {
      setCargando(true);
      setEstadoSync("Sincronizando con servidor...");
      setSyncStatus("loading");

      const respuesta = await obtenerDashboard({
        mes: mesSeleccionado,
        proveedor: proveedorSeleccionado,
        familia: familiaSeleccionada,
        bodega: bodegaSeleccionada,
        producto: productoSeleccionado,
      });

      setData({
        ...demoData,
        ...respuesta,
        proveedores: respuesta.proveedores?.length ? respuesta.proveedores : [],
        familias: respuesta.familias?.length ? respuesta.familias : [],
        sucursales: respuesta.sucursales?.length ? respuesta.sucursales : [],
        meses: respuesta.meses?.length ? respuesta.meses : [],
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

  useEffect(() => {
    actualizarDatos();

    const interval = window.setInterval(actualizarDatos, 300000);

    return () => window.clearInterval(interval);
  }, [
    mesSeleccionado,
    proveedorSeleccionado,
    familiaSeleccionada,
    bodegaSeleccionada,
    productoSeleccionado,
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

  const proveedores = data.proveedores.slice(0, 5);
  const familias = data.familias.slice(0, 10);
  const sucursales = data.sucursales.slice(0, 5);
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
      onChange={(e) => setMesSeleccionado(e.target.value)}
    >
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
    Proveedor
    <select
      value={proveedorSeleccionado}
      onChange={(e) => setProveedorSeleccionado(e.target.value)}
    >
      <option value="">Todos</option>
      {data.opciones?.proveedores?.map((proveedor) => (
        <option key={proveedor} value={proveedor}>
          {proveedor}
        </option>
      ))}
    </select>
  </label>

  <label>
    Familia
    <select
      value={familiaSeleccionada}
      onChange={(e) => setFamiliaSeleccionada(e.target.value)}
    >
      <option value="">Todas</option>
      {data.opciones?.familias?.map((familia) => (
        <option key={familia} value={familia}>
          {familia}
        </option>
      ))}
    </select>
  </label>

  <label>
    Bodega
    <select
      value={bodegaSeleccionada}
      onChange={(e) => setBodegaSeleccionada(e.target.value)}
    >
      <option value="">Todas</option>
      {data.opciones?.bodegas?.map((bodega) => (
        <option key={bodega} value={bodega}>
          {bodega}
        </option>
      ))}
    </select>
  </label>

  <label>
    Producto
    <select
      value={productoSeleccionado}
      onChange={(e) => setProductoSeleccionado(e.target.value)}
    >
      <option value="">Todos</option>
      {data.opciones?.productos?.map((producto) => (
        <option key={producto} value={producto}>
          {producto}
        </option>
      ))}
    </select>
  </label>

  <button
    type="button"
    onClick={() => {
      setProveedorSeleccionado("");
      setFamiliaSeleccionada("");
      setBodegaSeleccionada("");
      setProductoSeleccionado("");
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

        {seccionActiva !== "configuracion" && (
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
        {seccionActiva === "ventas" && renderVentas()}
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

  function renderMapaPanel(title = "MAPA DE SUCURSALES") {
  const sucursalesMapa = [
  { nombre: "GUARCO", lat: 9.838, lng: -83.945, cumplimiento: 0 },
  { nombre: "COT", lat: 9.895, lng: -83.874, cumplimiento: 0 },
  { nombre: "CEDI GRUPO SURCO", lat: 9.870, lng: -83.910, cumplimiento: 7.9 },
  { nombre: "CIPRESES", lat: 9.892, lng: -83.807, cumplimiento: 6.5 },
  { nombre: "PACAYAS", lat: 9.915, lng: -83.811, cumplimiento: 0 },
  { nombre: "CAPELLADES", lat: 9.929, lng: -83.786, cumplimiento: 13.5 },
  { nombre: "SAN GERARDO", lat: 9.913, lng: -83.846, cumplimiento: 0 },
  { nombre: "LLANO GRANDE", lat: 9.899, lng: -83.927, cumplimiento: 5.2 },
  { nombre: "TIERRA BLANCA", lat: 9.918, lng: -83.892, cumplimiento: 12.0 },
  { nombre: "IRAZÚ", lat: 9.977, lng: -83.852, cumplimiento: 0 },
];

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
  radius={8}
  pathOptions={{
    color: "#70e000",
    fillColor: "#70e000",
    fillOpacity: 0.85,
  }}
>
  <Popup>
  <div className="map-popup">
    <strong>{sucursal.nombre}</strong>
    <span>Cumplimiento: {sucursal.cumplimiento.toFixed(1)}%</span>
  </div>
</Popup>
</CircleMarker>
        ))}
      </MapContainer>
    </Panel>
  );
}

  function renderVentas() {
    return (
      <section className="section-page">
        <SectionHeader title="Ventas" subtitle="Seguimiento comercial por mes, familia y proveedor." />
        <div className="section-grid">
          <div className="section-span-8">{renderMesesPanel("EVOLUCIÓN DE VENTAS Y PRESUPUESTO")}</div>
          <div className="section-span-4">{renderFamiliasPanel("VENTAS POR FAMILIA")}</div>
          <div className="section-span-6">{renderTopProveedoresPanel("TOP PROVEEDORES EN VENTAS")}</div>
          <div className="section-span-6">{renderResumenProveedorPanel("DETALLE DE VENTAS POR PROVEEDOR")}</div>
        </div>
      </section>
    );
  }

  function renderPresupuesto() {
    return (
      <section className="section-page">
        <SectionHeader title="Presupuesto" subtitle="Avance contra meta del periodo y brecha pendiente." />
        <div className="section-grid">
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
        <SectionHeader title="Proveedores" subtitle="Ranking, participación y desempeño de proveedores." />
        <div className="section-grid">
          <div className="section-span-5">{renderTopProveedoresPanel("RANKING DE PROVEEDORES")}</div>
          <div className="section-span-7">{renderResumenProveedorPanel("RESUMEN DETALLADO")}</div>
          <div className="section-span-12">{renderFamiliasPanel("FAMILIAS ASOCIADAS A LA VENTA")}</div>
        </div>
      </section>
    );
  }

  function renderSucursales() {
    return (
      <section className="section-page">
        <SectionHeader title="Sucursales" subtitle="Cumplimiento y ventas por punto de operación." />
        <div className="section-grid">
          <div className="section-span-5">{renderSucursalesPanel("VENTAS POR SUCURSAL")}</div>
          <div className="section-span-7">{renderMapaPanel("MAPA DE CUMPLIMIENTO")}</div>
          <div className="section-span-12">{renderInsightsPanel("INSIGHTS POR SUCURSAL")}</div>
        </div>
      </section>
    );
  }

  function renderProductos() {
    return (
      <section className="section-page">
        <SectionHeader title="Productos" subtitle="Top productos por venta, familia y kilo/litro." />
        <Panel className="products-panel" title="TOP PRODUCTOS">
          <table className="summary-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Familia</th>
                <th>Venta Neta</th>
                <th>K-L</th>
              </tr>
            </thead>
            <tbody>
              {productosDemo.map((p) => (
                <tr key={p.Producto}>
                  <td>{p.Producto}</td>
                  <td>{p.Familia}</td>
                  <td>{formatMoney(p.VentaNeta)}</td>
                  <td>{formatKiloLitro(p.KiloLitro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
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

  function renderTopProveedoresPanel(title = "TOP 5 PROVEEDORES") {
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