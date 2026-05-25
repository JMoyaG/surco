type Props = {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone:
  | "blue"
  | "purple"
  | "green"
  | "cyan"
  | "orange"
  | "pink";
};

export default function KpiCard({
  title,
  value,
  detail,
  icon,
  tone,
}: Props) {
  return (
    <div className={`kpi-card ${tone}`}>
      <div className="kpi-icon">{icon}</div>

      <div>
        <span>{title}</span>
        <h2>{value}</h2>
        <p>{detail}</p>
      </div>
    </div>
  );
}