import { createFileRoute } from "@tanstack/react-router"
import { getForecast } from "@/lib/weather/api"
import { BEROWRA } from "@/lib/weather/places"

const headers = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=120",
}

function round1(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value * 10) / 10
}

export const Route = createFileRoute("/outlook")({
  server: {
    handlers: {
      GET: async () => {
        const result = await getForecast({ data: BEROWRA })
        if (!result.ok) {
          return Response.json({ ok: false, error: result.error }, { status: 503, headers })
        }
        const days = result.forecast.days.slice(0, 6).map((day) => ({
          date: day.date,
          code: day.code,
          tMax: round1(day.tMax),
          tMin: round1(day.tMin),
          rain: round1(day.rain),
          pop: day.pop == null ? null : Math.round(day.pop * 1000) / 1000,
          summary: day.summary,
        }))
        return Response.json(
          {
            ok: true,
            source: "ridge",
            place: result.forecast.placeName,
            updated: result.forecast.updatedLabel,
            days,
          },
          { headers },
        )
      },
    },
  },
})
