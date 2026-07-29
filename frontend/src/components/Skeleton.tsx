import "./Skeleton.css";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  style?: React.CSSProperties;
}

/** Bloque con shimmer para estados de carga (reemplaza spinners). */
export function Skeleton({ width = "100%", height = 16, radius = 8, style }: SkeletonProps) {
  return (
    <span
      className="skeleton"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}
