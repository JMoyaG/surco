import { FaChartPie, FaStore, FaBoxes, FaTruck, FaBell, FaCog } from "react-icons/fa";

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">SURCO</div>
        <span>Executive BI</span>
      </div>

      <nav>
        <a className="active"><FaChartPie /> Resumen</a>
        <a><FaBoxes /> Familias</a>
        <a><FaTruck /> Proveedores</a>
        <a><FaStore /> Sucursales</a>
        <a><FaBell /> Alertas</a>
        <a><FaCog /> Configuración</a>
      </nav>
    </aside>
  );
}