type Props = {
  cumplimiento: number;
  ventaReal: number;
  presupuesto: number;
};

export default function GaugeCard({
  cumplimiento,
  ventaReal,
  presupuesto,
}: Props) {
  const grados = Math.min(cumplimiento, 100) * 1.8;

  return (
    <section className="panel">
      <h3 className="panel-title">Avance del presupuesto</h3>

      <div
        className="gauge"
        style={{
          background: `conic-gradient(from 180deg, #1d8cf8 0deg, #70e000 ${grados}deg, rgba(255,255,255,.12) ${grados}deg 180deg)`,
        }}
      >
        <div className="gauge-inner">
          <strong>{cumplimiento.toFixed(1)}%</strong>
          <span>Cumplimiento</span>
        </div>
      </div>

      <div className="gauge-numbers">
        <span>₡{(ventaReal / 1000000).toFixed(2)} M Real</span>
        <span>₡{(presupuesto / 1000000).toFixed(2)} M Meta</span>
      </div>
    </section>
  );
}