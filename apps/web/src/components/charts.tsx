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

const AXIS = { fontSize: 11, fill: 'var(--chart-axis)', fontFamily: 'inherit' } as const;
const GRID = 'var(--chart-grid)';

export const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

export type LegendItem = { name: string; color: string; value?: string | number };

export function ChartCard({ title, sub, action, height = 220, className = '', legend, children }: {
  title: string; sub?: string; action?: ReactNode; height?: number;
  className?: string; legend?: LegendItem[]; children: ReactNode;
}) {
  // A one-item legend only restates the title, so it is dropped —
  // unless it carries values, in which case it is doing real work.
  const legendItems =
    legend && (legend.length > 1 || legend.some((l) => l.value !== undefined)) ? legend : null;
  return (
    <Card className={className}>
      <CardHead title={title} sub={sub} action={action} />
      <CardBody>
        <div className="chart-body" style={{ height }}>
          {/* initialDimension keeps the first paint from being 0-sized
              inside containers that report late (tabs, fresh grids). */}
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height }}>
            {children as never}
          </ResponsiveContainer>
        </div>
        {legendItems && (
          <div className="chart-legend">
            {legendItems.map((l) => (
              <span key={l.name}>
                <i style={{ background: l.color }} />{l.name}
                {l.value !== undefined && (
                  <strong className="t-num" style={{ marginLeft: 5, fontWeight: 600 }}>{l.value}</strong>
                )}
              </span>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** A chart on the page — no card. Used under a section title. */
export function ChartFrame({ height = 260, legend, children, className = '' }: {
  height?: number; legend?: LegendItem[]; children: ReactNode; className?: string;
}) {
  const legendItems =
    legend && (legend.length > 1 || legend.some((l) => l.value !== undefined)) ? legend : null;
  return (
    <div className={`chart-frame ${className}`.trim()}>
      <div className="chart-body" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height }}>
          {children as never}
        </ResponsiveContainer>
      </div>
      {legendItems && (
        <div className="chart-legend">
          {legendItems.map((l) => (
            <span key={l.name}>
              <i style={{ background: l.color }} />{l.name}
              {l.value !== undefined && (
                <strong className="t-num" style={{ marginLeft: 5, fontWeight: 600 }}>{l.value}</strong>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
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

type Series = { key: string; name: string; color?: string; axis?: 'left' | 'right' };

/**
 * True when rows exist but no series holds a single plottable value —
 * the case that would otherwise render bare axes around nothing.
 * A zero is a value; only null/undefined count as missing.
 */
function allSeriesEmpty(data: any[], keys: string[]): boolean {
  return data.length > 0 && data.every((row) => keys.every((k) => row?.[k] == null));
}

export function TrendArea({ data, x, series, unit = '', emptyLabel = 'No data recorded yet' }: {
  data: any[]; x: string; series: Series[]; unit?: string; emptyLabel?: string;
}) {
  if (allSeriesEmpty(data, series.map((s) => s.key))) return <EmptyChart label={emptyLabel} />;
  return (
    <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
      <defs>
        {series.map((s, i) => (
          <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color ?? SERIES[i % SERIES.length]} stopOpacity={0.28} />
            <stop offset="100%" stopColor={s.color ?? SERIES[i % SERIES.length]} stopOpacity={0.02} />
          </linearGradient>
        ))}
      </defs>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickMargin={8} />
      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
      <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: GRID }} />
      {series.map((s, i) => (
        <Area
          key={s.key} type="monotone" dataKey={s.key} name={s.name}
          stroke={s.color ?? SERIES[i % SERIES.length]} strokeWidth={2.25}
          fill={`url(#fill-${s.key})`}
          dot={data.length <= 24 ? { r: 3, strokeWidth: 2, stroke: 'var(--surface)', fill: s.color ?? SERIES[i % SERIES.length] } : false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }}
          isAnimationActive={false}
        />
      ))}
    </AreaChart>
  );
}

export function TrendLine({ data, x, series, unit = '', emptyLabel = 'No data recorded yet' }: {
  data: any[]; x: string; series: Series[]; unit?: string; emptyLabel?: string;
}) {
  if (allSeriesEmpty(data, series.map((s) => s.key))) return <EmptyChart label={emptyLabel} />;
  const hasRight = series.some((s) => s.axis === 'right');
  return (
    <LineChart data={data} margin={{ top: 8, right: hasRight ? -14 : 8, left: -20, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickMargin={8} />
      <YAxis yAxisId="left" tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
      {hasRight && (
        <YAxis yAxisId="right" orientation="right" tick={AXIS} tickLine={false} axisLine={false} width={44} />
      )}
      <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: GRID }} />
      {series.map((s, i) => (
        <Line
          key={s.key} type="monotone" dataKey={s.key} name={s.name}
          yAxisId={s.axis === 'right' ? 'right' : 'left'}
          stroke={s.color ?? SERIES[i % SERIES.length]} strokeWidth={2.25}
          dot={data.length <= 24 ? { r: 3, strokeWidth: 2, stroke: 'var(--surface)', fill: s.color ?? SERIES[i % SERIES.length] } : false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
  );
}

export function Bars({ data, x, series, unit = '', horizontal = false, colorBy, emptyLabel = 'No data recorded yet' }: {
  data: any[]; x: string; series: Series[]; unit?: string; horizontal?: boolean;
  /** Colours each bar from its own value — used for question difficulty. */
  colorBy?: (row: any) => string;
  emptyLabel?: string;
}) {
  if (allSeriesEmpty(data, series.map((s) => s.key))) return <EmptyChart label={emptyLabel} />;
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
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey={x} tick={AXIS} tickLine={false} axisLine={false} width={70} />
        </>
      ) : (
        <>
          <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickMargin={8} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
        </>
      )}
      <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: 'var(--surface-2)' }} />
      {series.map((s, i) => (
        <Bar
          key={s.key} dataKey={s.key} name={s.name}
          radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          maxBarSize={32}
          fill={s.color ?? SERIES[i % SERIES.length]}
          isAnimationActive={false}
        >
          {colorBy && data.map((row, idx) => <Cell key={idx} fill={colorBy(row)} />)}
        </Bar>
      ))}
    </BarChart>
  );
}

export function Donut({ data, colors = SERIES, unit = '', emptyLabel = 'No data recorded yet' }: {
  data: { name: string; value: number }[]; colors?: string[]; unit?: string; emptyLabel?: string;
}) {
  // All-zero slices draw nothing; say so instead of showing a blank ring.
  if (!data.length || data.every((d) => !d.value)) return <EmptyChart label={emptyLabel} />;
  return (
    <PieChart>
      <Tooltip content={<ChartTooltip unit={unit} />} />
      <Pie
        data={data} dataKey="value" nameKey="name"
        innerRadius="62%" outerRadius="86%" paddingAngle={2}
        stroke="var(--surface)" strokeWidth={2}
        isAnimationActive={false}
      >
        {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
      </Pie>
    </PieChart>
  );
}

/** Legend rendered as markup, not by Recharts, so it uses our type scale. */
export function legendFor(series: Series[]): LegendItem[] {
  return series.map((s, i) => ({ name: s.name, color: s.color ?? SERIES[i % SERIES.length] }));
}

/**
 * Donut legend built from the actual slices, values included, so each
 * segment is identifiable without hovering it.
 */
export function donutLegend(data: { name: string; value: number }[], colors = SERIES): LegendItem[] {
  return data.map((d, i) => ({ name: d.name, color: colors[i % colors.length], value: d.value }));
}
