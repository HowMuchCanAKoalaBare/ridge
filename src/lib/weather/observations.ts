import { dirText, sydneyStamp } from "./interpret"
import { BEROWRA, SYDNEY, type Place } from "./places"

export type StationObs = {
  role: string
  name: string
  id: string
  elevation: number | null
  distanceKm: number | null
  temp: number | null
  change: number | null
  windText: string | null
  when: string
}

export type StationPack = {
  cards: StationObs[]
  note: string
  score: { id: string; name: string; distanceKm: number; byHour: Record<string, number> } | null
}

type Report = {
  id: string
  name: string
  lat: number
  lon: number
  elev: number | null
  temp: number | null
  wdir: number | null
  wspdKt: number | null
  time: number
}

const COAST = "YSSY"
const PLAIN = "YSRI"

function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLon = ((bLon - aLon) * Math.PI) / 180
  const la1 = (aLat * Math.PI) / 180
  const la2 = (bLat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)))
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function parseReports(body: unknown): Report[] {
  if (!Array.isArray(body)) return []
  const out: Report[] = []
  for (const row of body) {
    if (!row || typeof row !== "object") continue
    const o = row as Record<string, unknown>
    const id = String(o.icaoId ?? "")
    const lat = num(o.lat)
    const lon = num(o.lon)
    const time = Date.parse(String(o.reportTime ?? ""))
    if (!id || lat == null || lon == null || !Number.isFinite(time)) continue
    out.push({
      id,
      name: String(o.name ?? id),
      lat,
      lon,
      elev: num(o.elev),
      temp: num(o.temp),
      wdir: num(o.wdir),
      wspdKt: num(o.wspd),
      time,
    })
  }
  return out
}

async function pull(url: string): Promise<Report[]> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { Accept: "application/json", "User-Agent": "Ridge/1.0 (Berowra Heights forecast)" },
  })
  if (!res.ok) return []
  return parseReports(await res.json())
}

function latest(reports: Report[]): Report[] {
  const grouped = new Map<string, Report[]>()
  for (const report of reports) {
    const list = grouped.get(report.id) ?? []
    list.push(report)
    grouped.set(report.id, list)
  }
  const out: Report[] = []
  for (const list of grouped.values()) {
    list.sort((a, b) => b.time - a.time)
    const top = list[0]
    if (top) out.push(top)
  }
  return out
}

function hourChange(reports: Report[], id: string): number | null {
  const mine = reports.filter((r) => r.id === id && r.temp != null).sort((a, b) => b.time - a.time)
  const now = mine[0]
  if (!now || now.temp == null) return null
  const prior = mine.find((r) => {
    const age = (now.time - r.time) / 60000
    return age >= 40 && age <= 100
  })
  if (!prior || prior.temp == null) return null
  return now.temp - prior.temp
}

function windText(report: Report): string | null {
  if (report.wspdKt == null) return null
  const kmh = Math.round(report.wspdKt * 1.852)
  const dir = dirText(report.wdir)
  if (kmh < 2) return "Calm"
  return dir ? `${dir} ${kmh} km/h` : `${kmh} km/h`
}

function whenLabel(time: number): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(time))
}

function card(report: Report, place: Place, role: string, name: string, reports: Report[]): StationObs {
  return {
    role,
    name,
    id: report.id,
    elevation: report.elev,
    distanceKm: Math.round(km(place.latitude, place.longitude, report.lat, report.lon)),
    temp: report.temp,
    change: hourChange(reports, report.id),
    windText: windText(report),
    when: whenLabel(report.time),
  }
}

function byHour(reports: Report[], id: string): Record<string, number> {
  const out: Record<string, number> = {}
  const mine = reports.filter((r) => r.id === id && r.temp != null).sort((a, b) => a.time - b.time)
  for (const report of mine) {
    if (report.temp == null) continue
    out[sydneyStamp(new Date(report.time)).hourKey] = report.temp
  }
  return out
}

export async function loadStations(place: Place): Promise<StationPack> {
  const empty = "Station reports did not load."
  try {
    const pad = 0.9
    const bbox = [
      (place.latitude - pad).toFixed(2),
      (place.longitude - pad).toFixed(2),
      (place.latitude + pad).toFixed(2),
      (place.longitude + pad).toFixed(2),
    ].join(",")
    const named = await pull(
      `https://aviationweather.gov/api/data/metar?ids=${COAST},${PLAIN}&format=json&hours=24`,
    )
    const around = await pull(
      `https://aviationweather.gov/api/data/metar?bbox=${bbox}&format=json&hours=6`,
    )
    const reports = [...named, ...around]
    const current = latest(reports)
    if (!current.length) return { cards: [], note: empty, score: null }

    const basin =
      km(place.latitude, place.longitude, BEROWRA.latitude, BEROWRA.longitude) < 90 ||
      km(place.latitude, place.longitude, SYDNEY.latitude, SYDNEY.longitude) < 90
    const byId = new Map(current.map((r) => [r.id, r]))
    const cards: StationObs[] = []
    const used = new Set<string>()

    if (basin) {
      const coast = byId.get(COAST)
      const plain = byId.get(PLAIN)
      if (coast) {
        cards.push(card(coast, place, "Coast", "Sydney Airport", reports))
        used.add(COAST)
      }
      if (plain) {
        cards.push(card(plain, place, "Plain", "Richmond", reports))
        used.add(PLAIN)
      }
    }

    const nearest = [...current].sort(
      (a, b) =>
        km(place.latitude, place.longitude, a.lat, a.lon) - km(place.latitude, place.longitude, b.lat, b.lon),
    )
    const extra = nearest.find((r) => !used.has(r.id)) ?? null
    if (extra && cards.length < 3) {
      const role = basin ? "Nearest other" : "Nearest"
      cards.push(card(extra, place, role, extra.name.replace(/,.*/, ""), reports))
    } else if (!basin) {
      for (const report of nearest.slice(0, 2)) {
        cards.push(card(report, place, cards.length ? "Next" : "Nearest", report.name.replace(/,.*/, ""), reports))
      }
    }

    const closest = nearest.find((r) => r.temp != null) ?? null
    const ridge =
      km(place.latitude, place.longitude, BEROWRA.latitude, BEROWRA.longitude) < 25
    const note = ridge
      ? "METAR reports, not the model. No station in this set sits on the Berowra ridge."
      : "METAR reports, not the model median."

    return {
      cards,
      note,
      score: closest
        ? {
            id: closest.id,
            name: closest.id === COAST ? "Sydney Airport" : closest.id === PLAIN ? "Richmond" : closest.name.replace(/,.*/, ""),
            distanceKm: Math.round(km(place.latitude, place.longitude, closest.lat, closest.lon)),
            byHour: byHour(reports, closest.id),
          }
        : null,
    }
  } catch {
    return { cards: [], note: empty, score: null }
  }
}
