import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"

const CHART_COLORS = {
  primary: "#00d4ff",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  purple: "#a855f7",
  pink: "#ec4899",
  orange: "#f97316",
  cyan: "#06b6d4",
  slate: "#64748b",
}

const SERIES_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.purple,
  CHART_COLORS.pink,
  CHART_COLORS.orange,
  CHART_COLORS.cyan,
]

const FALLBACK_WIDTH = 720

/**
 * MySQL SUM() columns arrive as JSON numbers now, but be defensive:
 * never let a string or null reach an SVG coordinate.
 */
function toNum(value) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function niceMax(value) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

function titleCase(label) {
  return String(label ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
}

/** Measure the container so the SVG viewBox is always a real pixel size. */
function useMeasuredWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(FALLBACK_WIDTH)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return

    const update = () => setWidth(node.clientWidth || FALLBACK_WIDTH)
    update()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update)
      return () => window.removeEventListener("resize", update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

function ChartEmpty({ message, hint }) {
  return (
    <div className="chart-empty">
      <div className="chart-empty-icon" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3v18h18" />
          <path d="M7 15l3.5-4 3 2.5L20 7" />
        </svg>
      </div>
      <p className="chart-empty-title">{message}</p>
      {hint && <p className="chart-empty-hint">{hint}</p>}
    </div>
  )
}

function ChartTooltip({ x, y, width, title, rows }) {
  if (!rows.length) return null
  const tooltipWidth = 176
  const left = clamp(x + 12, 4, Math.max(width - tooltipWidth - 4, 4))
  return (
    <div className="chart-tooltip" style={{ left, top: Math.max(y - 12, 4) }} role="presentation">
      <span className="chart-tooltip-title">{title}</span>
      {rows.map((row) => (
        <span key={row.label} className="chart-tooltip-row">
          <span className="chart-tooltip-label">
            <span className="chart-tooltip-dot" style={{ backgroundColor: row.color }} />
            {row.label}
          </span>
          <strong>{row.value}</strong>
        </span>
      ))}
    </div>
  )
}

function useHoverIndex(length, plotLeft, plotWidth) {
  const [hover, setHover] = useState(null)

  const onMouseMove = useCallback(
    (event) => {
      if (length === 0 || plotWidth <= 0) return
      const bounds = event.currentTarget.getBoundingClientRect()
      const offset = event.clientX - bounds.left
      const step = length > 1 ? plotWidth / (length - 1) : plotWidth
      const index = clamp(Math.round(offset / Math.max(step, 1)), 0, length - 1)
      setHover(index)
    },
    [length, plotWidth]
  )

  const onMouseLeave = useCallback(() => setHover(null), [])
  return [hover, onMouseMove, onMouseLeave]
}

function ChartFrame({ width, height, children }) {
  return (
    <div className="chart-canvas" style={{ height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height={height}
        role="img"
      >
        {children}
      </svg>
    </div>
  )
}

function GridLines({ padding, plotWidth, plotHeight, ticks, max, width }) {
  return (
    <g>
      {ticks.map((tick, index) => {
        const y = padding.top + plotHeight - (tick / max) * plotHeight
        return (
          <g key={`grid-${index}`}>
            <line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="var(--surface-border)"
              strokeWidth="1"
              strokeDasharray="3 4"
              opacity="0.6"
            />
            <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="var(--text-tertiary)">
              {tick}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function XLabels({ data, xKey, padding, plotWidth, height, band }) {
  const count = data.length
  if (count === 0) return null
  const step = band ? plotWidth / count : plotWidth / Math.max(count - 1, 1)
  const everyNth = count > 16 ? Math.ceil(count / 10) : 1
  const rotate = count > 7

  return (
    <g>
      {data.map((point, index) => {
        if (index % everyNth !== 0) return null
        const x = padding.left + (band ? index * step + step / 2 : index * step)
        const label = String(point[xKey] ?? "")
        return (
          <text
            key={`${xKey}-${index}`}
            x={x}
            y={height - padding.bottom + (rotate ? 16 : 18)}
            textAnchor={rotate ? "end" : "middle"}
            fontSize="10"
            fill="var(--text-tertiary)"
            transform={rotate ? `rotate(-40, ${x}, ${height - padding.bottom + 16})` : undefined}
          >
            {label.length > 10 ? `${label.slice(0, 10)}…` : label}
          </text>
        )
      })}
    </g>
  )
}

function Legend({ items }) {
  if (items.length < 2) return null
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <span key={item.label} className="chart-legend-item">
          <span className="chart-legend-swatch" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  )
}

function LineChart({
  data = [],
  xKey = "label",
  yKeys = [],
  colors = SERIES_COLORS,
  height = 300,
  emptyMessage = "No task data yet",
  emptyHint,
  area = true,
}) {
  const [ref, width] = useMeasuredWidth()
  const padding = { top: 16, right: 18, bottom: 56, left: 46 }
  const plotWidth = Math.max(width - padding.left - padding.right, 10)
  const plotHeight = Math.max(height - padding.top - padding.bottom, 10)

  const series = useMemo(
    () => yKeys.map((key, index) => ({ key, color: colors[index % colors.length] })),
    [yKeys, colors]
  )

  const max = useMemo(
    () => niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => toNum(d[s.key]))))),
    [data, series]
  )

  const hasData = data.length > 0 && data.some((d) => series.some((s) => toNum(d[s.key]) > 0))
  const [hover, onMouseMove, onMouseLeave] = useHoverIndex(data.length, padding.left, plotWidth)

  if (!hasData) {
    return (
      <div ref={ref} className="chart-frame">
        <ChartEmpty message={emptyMessage} hint={emptyHint} />
      </div>
    )
  }

  const xAt = (index) =>
    padding.left + (data.length > 1 ? (index / (data.length - 1)) * plotWidth : plotWidth / 2)
  const yAt = (value) => padding.top + plotHeight - (toNum(value) / max) * plotHeight
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((max / 4) * i))

  return (
    <div className="chart-frame" ref={ref}>
      <ChartFrame width={width} height={height}>
        <GridLines padding={padding} plotWidth={plotWidth} plotHeight={plotHeight} ticks={ticks} max={max} width={width} />

        {series.map((serie, index) => {
          const points = data.map((d, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(d[serie.key])}`).join(" ")
          const areaPath = `${points} L ${xAt(data.length - 1)} ${padding.top + plotHeight} L ${xAt(0)} ${padding.top + plotHeight} Z`
          const gradientId = `line-area-${index}-${serie.key}`
          return (
            <g key={serie.key}>
              {area && (
                <>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={serie.color} stopOpacity="0.28" />
                      <stop offset="100%" stopColor={serie.color} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={areaPath} fill={`url(#${gradientId})`} />
                </>
              )}
              <path d={points} fill="none" stroke={serie.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {data.map((d, i) => (
                <circle
                  key={`${serie.key}-${i}`}
                  cx={xAt(i)}
                  cy={yAt(d[serie.key])}
                  r={hover === i ? 5 : 3}
                  fill={serie.color}
                  stroke="var(--bg-tertiary)"
                  strokeWidth="2"
                />
              ))}
            </g>
          )
        })}

        <line
          x1={padding.left}
          y1={padding.top + plotHeight}
          x2={padding.left + plotWidth}
          y2={padding.top + plotHeight}
          stroke="var(--surface-border)"
          strokeWidth="1"
        />

        {hover !== null && (
          <line
            x1={xAt(hover)}
            y1={padding.top}
            x2={xAt(hover)}
            y2={padding.top + plotHeight}
            stroke="var(--accent-primary)"
            strokeWidth="1"
            strokeDasharray="4 3"
            opacity="0.7"
          />
        )}

        <XLabels data={data} xKey={xKey} padding={padding} plotWidth={plotWidth} height={height} />
      </ChartFrame>

      <div className="chart-interactive" onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
        {hover !== null && (
          <ChartTooltip
            x={xAt(hover)}
            y={padding.top}
            width={width}
            title={String(data[hover]?.[xKey] ?? "")}
            rows={series.map((serie) => ({
              label: titleCase(serie.key),
              value: toNum(data[hover][serie.key]),
              color: serie.color,
            }))}
          />
        )}
      </div>

      <Legend items={series.map((s) => ({ label: titleCase(s.key), color: s.color }))} />
    </div>
  )
}

function BarChart({
  data = [],
  xKey = "label",
  yKeys = [],
  colors = SERIES_COLORS,
  height = 300,
  stacked = false,
  emptyMessage = "No task data yet",
  emptyHint,
}) {
  const [ref, width] = useMeasuredWidth()
  const padding = { top: 16, right: 18, bottom: 56, left: 46 }
  const plotWidth = Math.max(width - padding.left - padding.right, 10)
  const plotHeight = Math.max(height - padding.top - padding.bottom, 10)

  const series = useMemo(
    () => yKeys.map((key, index) => ({ key, color: colors[index % colors.length] })),
    [yKeys, colors]
  )

  const max = useMemo(() => {
    if (stacked) {
      const totals = data.map((d) => series.reduce((sum, s) => sum + toNum(d[s.key]), 0))
      return niceMax(Math.max(0, ...totals))
    }
    return niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => toNum(d[s.key])))))
  }, [data, series, stacked])

  const hasData = data.length > 0 && data.some((d) => series.some((s) => toNum(d[s.key]) > 0))
  const [hover, onMouseMove, onMouseLeave] = useHoverIndex(data.length, padding.left, plotWidth)

  if (!hasData) {
    return (
      <div ref={ref} className="chart-frame">
        <ChartEmpty message={emptyMessage} hint={emptyHint} />
      </div>
    )
  }

  const band = plotWidth / data.length
  const groupPadding = 0.22
  const groupWidth = band * (1 - groupPadding)
  const barWidth = stacked ? groupWidth : Math.max(groupWidth / series.length, 3)
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((max / 4) * i))

  const barX = (index, seriesIndex) =>
    stacked
      ? padding.left + index * band + band * groupPadding * 0.5
      : padding.left + index * band + band * groupPadding * 0.5 + seriesIndex * barWidth

  const baseY = padding.top + plotHeight

  return (
    <div className="chart-frame" ref={ref}>
      <ChartFrame width={width} height={height}>
        <GridLines padding={padding} plotWidth={plotWidth} plotHeight={plotHeight} ticks={ticks} max={max} width={width} />

        {hover !== null && (
          <rect
            x={padding.left + hover * band}
            y={padding.top}
            width={band}
            height={plotHeight}
            fill="var(--accent-glow)"
            rx="4"
          />
        )}

        {data.map((point, index) => {
          let stackOffset = 0
          return (
            <g key={`${xKey}-${index}`}>
              {series.map((serie, seriesIndex) => {
                const value = toNum(point[serie.key])
                const rawHeight = (value / max) * plotHeight
                const heightPx = rawHeight > 0 ? Math.max(rawHeight, 2) : 0
                const y = stacked ? baseY - stackOffset - heightPx : baseY - heightPx
                if (stacked) stackOffset += heightPx
                if (heightPx <= 0) return null
                return (
                  <rect
                    key={serie.key}
                    x={barX(index, seriesIndex)}
                    y={y}
                    width={barWidth}
                    height={heightPx}
                    rx={Math.min(3, barWidth / 2)}
                    fill={serie.color}
                    opacity={hover === null || hover === index ? 1 : 0.45}
                  />
                )
              })}
            </g>
          )
        })}

        <line
          x1={padding.left}
          y1={baseY}
          x2={padding.left + plotWidth}
          y2={baseY}
          stroke="var(--surface-border)"
          strokeWidth="1"
        />

        <XLabels data={data} xKey={xKey} padding={padding} plotWidth={plotWidth} height={height} band />
      </ChartFrame>

      <div className="chart-interactive" onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
        {hover !== null && (
          <ChartTooltip
            x={padding.left + hover * band + band / 2}
            y={padding.top}
            width={width}
            title={String(data[hover]?.[xKey] ?? "")}
            rows={series.map((serie) => ({
              label: titleCase(serie.key),
              value: toNum(data[hover][serie.key]),
              color: serie.color,
            }))}
          />
        )}
      </div>

      <Legend items={series.map((s) => ({ label: titleCase(s.key), color: s.color }))} />
    </div>
  )
}

function DonutChart({
  data = [],
  colors = SERIES_COLORS,
  height = 260,
  centerLabel = "Total",
  emptyMessage = "No task data yet",
  emptyHint,
}) {
  const [ref, width] = useMeasuredWidth()
  const slices = data.filter((d) => toNum(d.value) > 0)
  const total = slices.reduce((sum, d) => sum + toNum(d.value), 0)

  if (total <= 0) {
    return (
      <div ref={ref} className="chart-frame">
        <ChartEmpty message={emptyMessage} hint={emptyHint} />
      </div>
    )
  }

  const size = Math.min(width, height)
  const strokeWidth = 26
  const radius = size / 2 - strokeWidth / 2 - 6
  const center = size / 2
  let angle = -90

  const arcs = slices.map((slice, index) => {
    const share = toNum(slice.value) / total
    const sweep = share * 360
    const start = angle
    const end = angle + sweep
    angle = end

    const polar = (deg) => {
      const rad = (deg * Math.PI) / 180
      return [center + radius * Math.cos(rad), center + radius * Math.sin(rad)]
    }
    const [x1, y1] = polar(start)
    const [x2, y2] = polar(end)
    const largeArc = sweep > 180 ? 1 : 0
    return {
      ...slice,
      index,
      share,
      color: slice.color || colors[index % colors.length],
      path: sweep >= 359.9
        ? `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center - 0.01} ${center - radius}`
        : `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
    }
  })

  return (
    <div className="chart-frame chart-frame-donut" ref={ref}>
      <div className="donut-wrap">
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img">
          {arcs.map((arc) => (
            <path
              key={arc.label}
              d={arc.path}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
            >
              <title>{`${arc.label}: ${toNum(arc.value)}`}</title>
            </path>
          ))}
          <text x={center} y={center - 2} textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--text-primary)">
            {total}
          </text>
          <text x={center} y={center + 20} textAnchor="middle" fontSize="11" fill="var(--text-tertiary)">
            {centerLabel}
          </text>
        </svg>

        <ul className="donut-legend">
          {arcs.map((arc) => (
            <li key={arc.label} className="donut-legend-item">
              <span className="donut-legend-label">
                <span className="donut-legend-swatch" style={{ backgroundColor: arc.color }} />
                {arc.label}
              </span>
              <span className="donut-legend-value">
                {toNum(arc.value)}
                <small>{Math.round(arc.share * 100)}%</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function StatCard({ label, value, sublabel, icon, color = CHART_COLORS.primary }) {
  return (
    <div className="stat-card">
      {icon && (
        <div className="stat-icon" style={{ backgroundColor: `${color}1f`, color }}>
          <span aria-hidden="true">{icon}</span>
        </div>
      )}
      <div className="stat-content">
        <span className="stat-value" style={color ? { color } : undefined}>
          {value}
        </span>
        <span className="stat-label">{label}</span>
        {sublabel && <span className="stat-sublabel">{sublabel}</span>}
      </div>
    </div>
  )
}

/** Horizontal stacked bar used for the priority x status matrix. */
function StackedMatrix({ rows, keys, colors, emptyMessage = "No task data yet" }) {
  const hasData = rows.some((row) => keys.some((key) => toNum(row[key]) > 0))
  if (!hasData) {
    return (
      <div className="chart-frame">
        <ChartEmpty message={emptyMessage} />
      </div>
    )
  }

  return (
    <div className="matrix">
      <div className="matrix-head">
        <span className="matrix-head-cell" />
        {keys.map((key) => (
          <span key={key} className="matrix-head-cell">
            {key}
          </span>
        ))}
        <span className="matrix-head-cell matrix-total-head">Total</span>
      </div>
      {rows.map((row) => {
        const total = keys.reduce((sum, key) => sum + toNum(row[key]), 0)
        return (
          <div key={row.label} className="matrix-row">
            <span className="matrix-label">{row.label}</span>
            {keys.map((key, index) => {
              const value = toNum(row[key])
              const share = total > 0 ? (value / total) * 100 : 0
              return (
                <span key={key} className="matrix-cell">
                  <span className="matrix-bar-track">
                    <span
                      className="matrix-bar-fill"
                      style={{
                        width: `${share}%`,
                        backgroundColor: value > 0 ? colors[index % colors.length] : "transparent",
                      }}
                    />
                  </span>
                  <span className="matrix-value">{value}</span>
                </span>
              )
            })}
            <span className="matrix-total">{total}</span>
          </div>
        )
      })}
    </div>
  )
}

export { LineChart, BarChart, DonutChart, StackedMatrix, StatCard, CHART_COLORS, SERIES_COLORS }