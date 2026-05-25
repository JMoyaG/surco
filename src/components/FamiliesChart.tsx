import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Props = {
  proveedores: any[];
};

export default function FamiliesChart({
  proveedores,
}: Props) {
  const data = proveedores
    .slice(0, 8)
    .map((p) => ({
      name: p.Proveedor,
      venta:
        Number(p.VentaNeta || 0) /
        1000000,
    }));

  return (
    <section className="panel">
      <h3 className="panel-title">
        Top proveedores por venta
      </h3>

      <ResponsiveContainer
        width="100%"
        height={290}
      >
        <BarChart data={data}>
          <XAxis
            dataKey="name"
            hide
          />

          <YAxis />

          <Tooltip />

          <Bar
            dataKey="venta"
            fill="#70e000"
            radius={[10, 10, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}