type Props = {
  topProveedor: string;
};

export default function BranchesStatus({ topProveedor }: Props) {
  const insights = [
    { label: "Proveedor líder", value: topProveedor, status: "green" },
    { label: "Familia fuerte", value: "Fertilizantes", status: "blue" },
    { label: "Sucursal destacada", value: "CEDI / Ureña", status: "green" },
    { label: "Alerta", value: "Revisar productos bajos", status: "yellow" },
  ];

  return (
    <section className="panel">
      <h3 className="panel-title">Insights ejecutivos</h3>

      <div className="insights-grid">
        {insights.map((item, index) => (
          <div className={`insight ${item.status}`} key={index}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}