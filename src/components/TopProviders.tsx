type Props = {
  proveedores: any[];
};

export default function TopProviders({ proveedores }: Props) {
  const total = proveedores.reduce(
    (acc, p) => acc + Number(p.VentaNeta || 0),
    0
  );

  return (
    <section className="panel">
      <h3 className="panel-title">
        Ranking proveedores
      </h3>

      <div className="ranking-list">
        {proveedores
          .slice(0, 8)
          .map((p, index) => {
            const venta = Number(
              p.VentaNeta || 0
            );

            const pct =
              total > 0
                ? (venta / total) * 100
                : 0;

            return (
              <div
                className="ranking-item"
                key={index}
              >
                <div>
                  <strong>
                    {index + 1}.{" "}
                    {p.Proveedor}
                  </strong>

                  <span>
                    ₡
                    {(
                      venta / 1000000
                    ).toFixed(2)}{" "}
                    M
                  </span>
                </div>

                <div className="progress">
                  <div
                    style={{
                      width: `${pct}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}