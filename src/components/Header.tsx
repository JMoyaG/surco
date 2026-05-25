import {
  FaSyncAlt,
  FaSignOutAlt,
} from "react-icons/fa";

type Props = {
  cargando: boolean;
  ultimaActualizacion: string;
  onRefresh: () => void;
  onLogout: () => void;
};

export default function Header({
  cargando,
  ultimaActualizacion,
  onRefresh,
  onLogout,
}: Props) {
  return (
    <header className="header">
      <div>
        <h1>SURCO Executive BI</h1>

        <p>
          Dashboard Gerencial ·
          Presupuesto y Ventas
        </p>

        {ultimaActualizacion && (
          <small>
            Última actualización:{" "}
            {ultimaActualizacion}
          </small>
        )}
      </div>

      <div className="header-actions">
        <button onClick={onRefresh}>
          <FaSyncAlt />

          {cargando
            ? "Actualizando..."
            : "Actualizar datos"}
        </button>

        <button
          className="logout"
          onClick={onLogout}
        >
          <FaSignOutAlt />
          Salir
        </button>
      </div>
    </header>
  );
}