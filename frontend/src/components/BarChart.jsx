import { useState } from "react";
import { compactMoney, money } from "../utils";

/**
 * Lightweight grouped bar chart (SVG, no dependencies).
 * data: [{ label, values: { key: number } }], series: [{ key, label, className }]
 */
export default function BarChart({ data, series, height = 220, format = compactMoney }) {
  const [hover, setHover] = useState(null);
  if (!data?.length) return <div className="empty">No data for this period.</div>;

  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d.values[s.key] || 0))));
  const niceMax = niceCeil(max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * niceMax);
  const padL = 64;
  const padB = 28;
  const padT = 8;
  const width = 640;
  const plotW = width - padL - 8;
  const plotH = height - padB - padT;
  const groupW = plotW / data.length;
  const barW = Math.min(28, (groupW * 0.7) / series.length);

  return (
    <div className="chart">
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.key} className="legend-item">
            <span className={`legend-swatch ${s.className}`} /> {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bar chart">
        {ticks.map((t) => {
          const y = padT + plotH - (t / niceMax) * plotH;
          return (
            <g key={t}>
              <line x1={padL} x2={width - 8} y1={y} y2={y} className="chart-grid" />
              <text x={padL - 8} y={y + 4} textAnchor="end" className="chart-axis">
                {format(t)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const gx = padL + i * groupW + (groupW - barW * series.length - 4 * (series.length - 1)) / 2;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * groupW} y={padT} width={groupW} height={plotH} className={hover === i ? "chart-hover" : "chart-hit"} />
              {series.map((s, j) => {
                const v = Number(d.values[s.key] || 0);
                const h = (v / niceMax) * plotH;
                return (
                  <rect
                    key={s.key}
                    x={gx + j * (barW + 4)}
                    y={padT + plotH - h}
                    width={barW}
                    height={Math.max(h, v > 0 ? 1 : 0)}
                    rx="3"
                    className={`chart-bar ${s.className}`}
                  />
                );
              })}
              <text x={padL + i * groupW + groupW / 2} y={height - 8} textAnchor="middle" className="chart-axis">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tooltip">
          <strong>{data[hover].label}</strong>
          {series.map((s) => (
            <span key={s.key}>
              <span className={`legend-swatch ${s.className}`} /> {s.label}: {money(data[hover].values[s.key])}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function niceCeil(v) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}
