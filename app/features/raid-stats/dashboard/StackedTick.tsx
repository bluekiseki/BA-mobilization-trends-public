interface StackedTickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value: string | number };
  getLines: (value: string) => string[];
}

// X axis tick drawn as horizontal, centered text lines (one <tspan> per line).
export default function StackedTick({ x: rawX = 0, y: rawY = 0, payload, getLines }: StackedTickProps) {
  const x = Number(rawX);
  const y = Number(rawY);
  const lines = payload ? getLines(String(payload.value)) : [];
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={11} fill="#a3a3a3">
      {lines.map((line, index) => (
        <tspan key={index} x={x} dy={index === 0 ? 14 : 13}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
