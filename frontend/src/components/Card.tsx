import "./Card.css";

type CardVariant = "default" | "accent" | "positive" | "negative" | "warning";
type ValueColor = "default" | "positive" | "negative" | "warning" | "accent";

interface CardProps {
  variant?: CardVariant;
  className?: string;
  children: React.ReactNode;
}

export function Card({ variant = "default", className = "", children }: CardProps) {
  const cls = [
    "card",
    variant !== "default" ? `card--${variant}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={cls}>{children}</div>;
}

interface MetricCardProps {
  label: string;
  value: string;
  valueColor?: ValueColor;
  icon: React.ReactNode;
  footer?: string;
  badge?: { text: string; type: "positive" | "negative" | "warning" };
  variant?: CardVariant;
}

export function MetricCard({
  label,
  value,
  valueColor = "default",
  icon,
  footer,
  badge,
  variant = "default",
}: MetricCardProps) {
  return (
    <Card variant={variant}>
      <div className="metric-card">
        <div className="metric-card__header">
          <span className="metric-card__label">{label}</span>
          <span className="metric-card__icon">{icon}</span>
        </div>

        <span
          className={[
            "metric-card__value",
            valueColor !== "default" ? `metric-card__value--${valueColor}` : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {value}
        </span>

        {(footer || badge) && (
          <div className="metric-card__footer">
            {badge && (
              <span className={`metric-card__badge metric-card__badge--${badge.type}`}>
                {badge.text}
              </span>
            )}
            {footer && <span>{footer}</span>}
          </div>
        )}
      </div>
    </Card>
  );
}
