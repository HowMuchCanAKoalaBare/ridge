import { useEffect, useState } from "react"
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { FanPoint } from "@/lib/weather/types"
import { hourLabel } from "@/lib/weather/interpret"

export function FanChart({ points }: { points: FanPoint[] }) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  if (!ready) return <div className="h-56 rounded-xl bg-surface" />
  const ticks = points.filter((_, i) => i % 6 === 0).map((p) => p.time)
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="time"
            ticks={ticks}
            tickFormatter={(value: string) => hourLabel(value)}
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--color-line)" }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            width={32}
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            domain={["dataMin - 1", "dataMax + 1"]}
            tickFormatter={(v: number) => `${Math.round(v)}°`}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0]?.payload as FanPoint | undefined
              if (!row) return null
              return (
                <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg">
                  <p className="text-muted">{row.label}</p>
                  <p className="mt-1">Median {Math.round(row.median)}°</p>
                  <p>Mean {Math.round(row.mean)}°</p>
                  <p>
                    Every model {Math.round(row.min)}–{Math.round(row.max)}°
                  </p>
                </div>
              )
            }}
          />
          <Area dataKey="max" stroke="none" fill="var(--color-line)" baseValue="dataMin" activeDot={false} />
          <Area dataKey="min" stroke="none" fill="var(--color-surface)" baseValue="dataMin" activeDot={false} />
          <Line
            dataKey="mean"
            stroke="var(--color-fg)"
            strokeWidth={1.25}
            dot={false}
            connectNulls
            name="Mean"
          />
          <Line
            dataKey="median"
            stroke="var(--color-accent)"
            strokeWidth={2.25}
            dot={false}
            name="Median"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
