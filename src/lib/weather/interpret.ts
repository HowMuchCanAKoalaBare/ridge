import type { DayModel } from "./types"

export type Num = number | null

export function finite(values: Num[]): number[] {
  return values.filter((v): v is number => v != null && Number.isFinite(v))
}

export function quantile(values: number[], p: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo] ?? null
  const a = sorted[lo] ?? 0
  const b = sorted[hi] ?? a
  return a * (hi - idx) + b * (idx - lo)
}

export function average(values: number[]): number | null {
  if (!values.length) return null
  let sum = 0
  for (const value of values) sum += value
  return sum / values.length
}

export function median(values: Num[]): number | null {
  return quantile(finite(values), 0.5)
}

/** Median of each centre, then the median of those. Empty centres are skipped. */
export function centreMedian(groups: number[][]): number | null {
  const centres = groups.map((group) => median(group)).filter((v): v is number => v != null)
  return median(centres)
}

/** Open-Meteo ensemble keys: field, field_member01, or field_member01_system. */
export function ensembleSystemId(field: string, key: string): string | null {
  if (key !== field && !key.startsWith(`${field}_`)) return null
  if (key === field) return "primary"
  const rest = key.slice(field.length + 1)
  const prefixed = /^member\d+_(.+)$/.exec(rest)
  if (prefixed?.[1]) return prefixed[1]
  if (/^member\d+$/.test(rest)) return "primary"
  return rest
}

export function spreadOf(values: number[]): number | null {
  if (values.length < 2) return null
  return Math.max(...values) - Math.min(...values)
}

/** Meteorological direction: average the vectors so 350° and 10° stay northerly. */
export function circMean(pairs: Array<{ w: number; d: Num }>): number | null {
  let x = 0
  let y = 0
  let w = 0
  for (const p of pairs) {
    if (p.d == null || !Number.isFinite(p.d)) continue
    const r = (p.d * Math.PI) / 180
    x += p.w * Math.cos(r)
    y += p.w * Math.sin(r)
    w += p.w
  }
  if (w === 0 || (Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6)) return null
  let deg = (Math.atan2(y, x) * 180) / Math.PI
  if (deg < 0) deg += 360
  return deg
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]

export function dirText(deg: number | null): string | null {
  if (deg == null || !Number.isFinite(deg)) return null
  return COMPASS[Math.round(deg / 22.5) % 16] ?? null
}

export function onshore(deg: number | null): boolean {
  return deg != null && deg >= 40 && deg <= 160
}

export function offshore(deg: number | null): boolean {
  if (deg == null) return false
  return deg >= 250 || deg <= 20
}

export function fraction(values: number[], test: (v: number) => boolean): number | null {
  if (!values.length) return null
  return values.filter(test).length / values.length
}

export function conditionLabel(code: number | null): string {
  if (code == null) return "Forecast"
  if (code === 0) return "Clear"
  if (code <= 2) return "Mostly fine"
  if (code === 3) return "Cloudy"
  if (code === 45 || code === 48) return "Fog"
  if (code <= 57) return "Drizzle"
  if (code <= 67) return "Rain"
  if (code <= 77) return "Snow"
  if (code <= 82) return "Showers"
  if (code <= 86) return "Snow showers"
  if (code >= 95) return "Thunderstorms"
  return "Unsettled"
}

export function summaryFor(pop: number | null, rain: number | null, code: number | null, cape: number | null): string {
  if (code != null && code >= 95) return "Thunderstorms"
  if ((cape ?? 0) >= 1000 && (pop ?? 0) >= 0.3) return "Storm ingredients"
  if ((pop != null && pop >= 0.6) || (rain != null && rain >= 8)) return "Rain likely"
  if ((pop != null && pop >= 0.3) || (rain != null && rain >= 1)) return "Shower risk"
  if (code != null && code >= 45 && code < 51) return "Fog"
  if (code != null && code >= 3) return "Cloudy spells"
  return "Mostly fine"
}

export function mm(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "–"
  if (v < 0.05) return "0 mm"
  if (v < 10) return `${v.toFixed(1)} mm`
  return `${Math.round(v)} mm`
}

export function pct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "–"
  return `${Math.round(v * 100)}%`
}

export function outlierNote(models: DayModel[]): string | null {
  const wet = models.filter((m): m is DayModel & { rain: number } => m.rain != null && m.rain >= 0)
  if (wet.length < 4) return null
  const sorted = [...wet].sort((a, b) => a.rain - b.rain)
  const mid = sorted[Math.floor(sorted.length / 2)]
  const top = sorted[sorted.length - 1]
  if (!mid || !top) return null
  if (top.rain >= mid.rain + 8 && top.rain >= Math.max(3, mid.rain * 3)) {
    return `${top.short} is much wetter than the pack at ${mm(top.rain)}.`
  }
  const dry = sorted[0]
  if (dry && mid.rain >= 8 && dry.rain <= 1) {
    return `${dry.short} is the dry dissenter at ${mm(dry.rain)}.`
  }
  return null
}

export function ffdi(temp: number, rh: number, windKmh: number, drought: number): number {
  const df = Math.min(10, Math.max(1, drought))
  const rhC = Math.min(100, Math.max(1, rh))
  const v = Math.max(0, windKmh)
  const raw = 2 * Math.exp(-0.45 + 0.987 * Math.log(df) - 0.0345 * rhC + 0.0338 * temp + 0.0234 * v)
  return Math.max(0, Math.round(raw))
}

export function droughtFromRain(rain14: number | null): { df: number; known: boolean } {
  if (rain14 == null) return { df: 6, known: false }
  const df = 10 * Math.exp(-Math.max(0, rain14) / 22)
  return { df: Math.min(10, Math.max(1, df)), known: true }
}

export function ffdiCategory(v: number): string {
  if (v < 12) return "Low"
  if (v < 25) return "Moderate"
  if (v < 50) return "High"
  if (v < 75) return "Very high"
  if (v < 100) return "Severe"
  return "Extreme"
}

export function aqiLabel(aqi: number | null): string {
  if (aqi == null) return "Unknown"
  if (aqi <= 50) return "Good"
  if (aqi <= 100) return "Moderate"
  if (aqi <= 150) return "Sensitive groups"
  if (aqi <= 200) return "Poor"
  return "Very poor"
}

export function hourLabel(isoLocal: string): string {
  const hour = Number(isoLocal.slice(11, 13))
  if (!Number.isFinite(hour)) return ""
  if (hour === 0) return "12am"
  if (hour === 12) return "12pm"
  if (hour < 12) return `${hour}am`
  return `${hour - 12}pm`
}

export function sydneyStamp(date = new Date()): { hourKey: string; dateKey: string } {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const g = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  let hour = g("hour")
  if (hour === "24") hour = "00"
  const year = g("year")
  const month = g("month").padStart(2, "0")
  const day = g("day").padStart(2, "0")
  return {
    hourKey: `${year}-${month}-${day}T${hour.padStart(2, "0")}:00`,
    dateKey: `${year}-${month}-${day}`,
  }
}

export function prettyUpdated(date = new Date()): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date)
}

export function weekdayOf(dateKey: string): { weekday: string; dayNum: string; long: string } {
  const dt = new Date(`${dateKey}T12:00:00Z`)
  const weekday = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
  }).format(dt)
  const long = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "long",
  }).format(dt)
  return { weekday, dayNum: dateKey.slice(8, 10).replace(/^0/, ""), long }
}

export function clock(iso: string | null): string | null {
  if (!iso) return null
  const match = iso.match(/T(\d{2}):(\d{2})/)
  if (!match) return null
  const h = Number(match[1])
  const m = match[2]
  const suffix = h >= 12 ? "pm" : "am"
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${m}${suffix}`
}

export function indexAt(times: string[], key: string): number {
  const exact = times.indexOf(key)
  if (exact >= 0) return exact
  const after = times.findIndex((t) => t >= key)
  if (after >= 0) return after
  return Math.max(0, times.length - 1)
}

export function writeBrief(input: {
  place: string
  ridge: boolean
  temp: number | null
  mean: number | null
  centre: number | null
  centres: number
  lo: number | null
  hi: number | null
  live: number
  dir: number | null
  wind: number | null
  pop: number | null
  rain: number | null
  p90: number | null
  ensembles: number
  ensembleNames: string
  ahead: number | null
  outlier: string | null
  stormDay: string
  stormPop: number | null
  seaBreeze: boolean
  cape: number | null
  gust: number | null
  spread: number | null
  spreadWhen: string
}): string {
  const bits: string[] = []
  if (input.temp != null && input.lo != null && input.hi != null) {
    const where = input.ridge ? "on the Berowra ridge" : `at ${input.place}`
    const pull =
      input.mean != null && Math.abs(input.mean - input.temp) >= 1
        ? ` Mean ${input.mean.toFixed(1)}° is pulled ${input.mean > input.temp ? "up" : "down"} by the tail.`
        : input.mean != null
          ? ` Mean ${input.mean.toFixed(1)}° sits on the median.`
          : ""
    const centre =
      input.centre != null && input.centres > 1 && Math.abs(input.centre - input.temp) >= 1
        ? ` Centre median ${Math.round(input.centre)}°, one vote for each of ${input.centres} centres.`
        : input.centre != null && input.centres > 1
          ? ` Centre median ${Math.round(input.centre)}° across ${input.centres} centres, within a degree of the all-model median.`
          : ""
    bits.push(
      `This hour ${where}, ${input.live} models each have one vote and none were dropped. Median ${Math.round(input.temp)}°, full range ${Math.round(input.lo)}–${Math.round(input.hi)}°.${pull}${centre}`,
    )
  }

  if (input.wind != null && input.dir != null) {
    const flow = onshore(input.dir)
      ? "onshore"
      : offshore(input.dir)
        ? "offshore"
        : "neither a clean sea breeze nor a westerly"
    bits.push(`Wind median is ${dirText(input.dir)} ${Math.round(input.wind)} km/h, ${flow}.`)
  }

  if (input.pop != null && input.rain != null) {
    const laterDry = input.ahead != null && input.ahead < 1.2 && input.rain >= 1
    const who = input.ensembleNames || `${input.ensembles} ensembles`
    if (laterDry) {
      bits.push(
        `Today's ensemble chance of 1 mm is ${pct(input.pop)} (typical ${mm(input.rain)}), but from this hour the models mostly dry out, about ${mm(input.ahead)} left.`,
      )
    } else {
      const wet = input.p90 != null ? ` The wettest ensemble's 1-in-10 case is ${mm(input.p90)}, left as is.` : ""
      bits.push(
        `Rain chance averages ${who} — ${input.ensembles} ensembles, one vote each, not one vote per member. Chance of 1 mm today ${pct(input.pop)}, typical fall ${mm(input.rain)}.${wet}`,
      )
    }
    if (input.outlier) bits.push(input.outlier)
  }

  if (input.cape != null) {
    const breeze = input.seaBreeze
      ? " Afternoon wind is onshore. That is reported, and it is not a penalty."
      : ""
    const rain = input.stormPop != null ? ` Ensemble chance of 1 mm that day is ${pct(input.stormPop)}.` : ""
    const gust = input.gust != null ? ` Median gust ${Math.round(input.gust)} km/h.` : ""
    bits.push(
      `${input.stormDay} has the highest afternoon CAPE in the next five days, near ${Math.round(input.cape)} J/kg.${rain}${gust}${breeze}`,
    )
  }

  if (input.spread != null) {
    bits.push(
      input.spread < 2
        ? `${input.spreadWhen} is tight, ${input.spread.toFixed(1)}° from coldest model to warmest.`
        : `${input.spreadWhen} disagrees by ${input.spread.toFixed(1)}°, and both ends stay in the median.`,
    )
  }

  return bits.join(" ")
}
