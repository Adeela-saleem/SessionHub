import type { ReactNode } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardBody, CardHead } from './ui';

/* ============================================================
   Charts
   Themed from the same tokens as the rest of the product, so
   they follow light and dark automatically. Recharts defaults
   — rainbow categoricals, heavy grids, drop shadows — are
   never used. A chart earns its place by answering a question
   faster than a number could.
   ============================================================ */

const AXIS = { fontSize: 11, fill: 'var(--chart-axis)' } as const;
const GRID = 'var(--chart-grid)';

export const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

export function ChartCard({ title, sub, action, height = 260, className = '', legend, children }: {
  title: string; sub?: string; action?: ReactNode; height?: number;
  className?: string; legend?: { name: string; color: string }[]; children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHead title={title} sub={sub} action={action} />
      <CardBody>
        <div className="chart-body" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {children as never}
          </ResponsiveContainer>
        </div>
        {legend && (
          <div className="chart-legend">
            {legend.map((l) => (
              <span key={l.name}><i style={{ background: l.color }} />{l.name}</span>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Reads as part of the surface system rather than a browser tooltip. */
function ChartTooltip({ active, payload, label, unit = '' }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      {label !== undefined && <div className="chart-tip-label">{label}</div>}
      {payload.map((p: any) => (
        <div className="chart-tip-row" key={p.dataKey ?? p.name}>
          <span className="chart-tip-dot" style={{ background: p.color ?? p.fill }} />
          <span className="chart-tip-name">{p.name}</span>
          <span className="chart-tip-val">{p.value}{unit}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyChart({ label }: { label: string }) {
  return <div className="chart-empty">{label}</div>;
}

type Series = { key: string; name: string; color?: string };

export function TrendArea({ data, x, series, unit = '' }: {
  data: any[]; x: string; series: Series[]; unit?: string;
}) {
  return (
    <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
      <defs>
        {series.map((s, i) => (
          <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color ?? SERIES[i % SERIES.length]} stopOpacity={0.22} />
            <stop offset="100%" stopColor={s.color ?? SERIES[i % SERIES.length]} stopOpacity={0.01} />
          </linearGradient>
        ))}
      </defs>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickMargin={8} />
      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
      <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: GRID }} />
      {series.map((s, i) => (
        <Area
          key={s.key} type="monotone" dataKey={s.key} name={s.name}
          stroke={s.color ?? SERIES[i % SERIES.length]} strokeWidth={2}
          fill={`url(#fill-${s.key})`} dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
          animationDuration={320}
        />
      ))}
    </AreaChart>
  );
}

export function TrendLine({ data, x, series, unit = '' }: {
  data: any[]; x: string; series: Series[]; unit?: string;
}) {
  return (
    <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickMargin={8} />
      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
      <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: GRID }} />
      {series.map((s, i) => (
        <Line
          key={s.key} type="monotone" dataKey={s.key} name={s.name}
          stroke={s.color ?? SERIES[i % SERIES.length]} strokeWidth={2}
          dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
          animationDuration={320}
        />
      ))}
    </LineChart>
  );
}

export function Bars({ data, x, series, unit = '', horizontal = false, colorBy }: {
  data: any[]; x: string; series: Series[]; unit?: string; horizontal?: boolean;
  /** Colours each bar from its own value — used for question difficulty. */
  colorBy?: (row: any) => string;
}) {
  return (
    <BarChart
      data={data}
      layout={horizontal ? 'vertical' : 'horizontal'}
      margin={{ top: 8, right: 8, left: horizontal ? 8 : -20, bottom: 0 }}
      barCategoryGap={horizontal ? 8 : '28%'}
    >
      <CartesianGrid stroke={GRID} vertical={horizontal} horizontal={!horizontal} />
      {horizontal ? (
        <>
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey={x} tick={AXIS} tickLine={false} axisLine={false} width={70} />
        </>
      ) : (
        <>
          <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickMargin={8} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
        </>
      )}
      <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: 'var(--surface-2)' }} />
      {series.map((s, i) => (
        <Bar
          key={s.key} dataKey={s.key} name={s.name}
          radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          fill={s.color ?? SERIES[i % SERIES.length]}
          animationDuration={320}
        >
          {colorBy && data.map((row, idx) => <Cell key={idx} fill={colorBy(row)} />)}
        </Bar>
      ))}
    </BarChart>
  );
}

export function Donut({ data, colors = SERIES, unit = '' }: {
  data: { name: string; value: number }[]; colors?: string[]; unit?: string;
}) {
  return (
    <PieChart>
      <Tooltip content={<ChartTooltip unit={unit} />} />
      <Pie
        data={data} dataKey="value" nameKey="name"
        innerRadius="62%" outerRadius="86%" paddingAngle={2}
        stroke="var(--surface)" strokeWidth={2}
        animationDuration={320}
      >
        {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
      </Pie>
    </PieChart>
  );
}

/** Legend rendered as markup, not by Recharts, so it uses our type scale. */
export function legendFor(series: Series[]) {
  return series.map((s, i) => ({ name: s.name, color: s.color ?? SERIES[i % SERIES.length] }));
}
