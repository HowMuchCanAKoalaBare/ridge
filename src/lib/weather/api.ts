import { createServerFn } from "@tanstack/react-start"
import { ENSEMBLE_LABEL, ENSEMBLE_PARAM, MODELS, MODEL_PARAM } from "./models"
import { BEROWRA, near, onTheRidge, RICHMOND, SYDNEY, trioFor, type Place } from "./places"
import {
  aqiLabel,
  average,
  circMean,
  clock,
  conditionLabel,
  dirText,
  droughtFromRain,
  ensembleSystemId,
  ffdi,
  ffdiCategory,
  finite,
  fraction,
  hourLabel,
  indexAt,
  median,
  mm,
  onshore,
  outlierNote,
  prettyUpdated,
  quantile,
  spreadOf,
  stormLabel,
  stormScore,
  summaryFor,
  sydneyStamp,
  weekdayOf,
  writeBrief,
  type Num,
} from "./interpret"
import type {
  AnchorCard,
  DayModel,
  DayPoint,
  FanPoint,
  Forecast,
  ForecastResult,
  HourPoint,
  ModelNow,
  RadarFrame,
  SearchHit,
} from "./types"

type Cell = number | string | null
type Block = { time: string[] } & Record<string, Cell[]>
type Loc = { hourly?: Block; daily?: Block }

const cache = new Map<string, { at: number; value: ForecastResult }>()
const inflight = new Map<string, Promise<ForecastResult>>()
const TTL = 8 * 60 * 1000

const HOURLY = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "relative_humidity_2m",
  "cloud_cover",
  "cape",
  "uv_index",
  "dew_point_2m",
  "pressure_msl",
].join(",")

const DAILY = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
  "uv_index_max",
  "sunrise",
  "sunset",
].join(",")

function nums(block: Block | undefined, key: string): Num[] | null {
  if (!block) return null
  const raw = block[key]
  if (!Array.isArray(raw)) return null
  return raw.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null))
}

function at(series: Num[] | null, i: number): Num {
  if (!series || i < 0 || i >= series.length) return null
  return series[i] ?? null
}

async function fetchJson(url: string): Promise<unknown> {
  let last = "Weather service did not respond"
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(40000),
      headers: { Accept: "application/json", "User-Agent": "Ridge/1.0 (Berowra Heights forecast)" },
    })
    if (res.status === 429 || res.status === 503) {
      await res.arrayBuffer().catch(() => undefined)
      last = "Weather service is busy"
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)))
      continue
    }
    if (!res.ok) throw new Error(`Weather service responded ${res.status}`)
    const body: unknown = await res.json()
    if (body && typeof body === "object" && "error" in body && (body as { error?: boolean }).error) {
      const reason = (body as { reason?: string }).reason ?? ""
      if (/concurrent|too many/i.test(reason) && attempt < 3) {
        last = reason
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)))
        continue
      }
      throw new Error(reason || "Weather service rejected the request")
    }
    return body
  }
  throw new Error(last)
}

function asLocs(body: unknown): Loc[] {
  if (Array.isArray(body)) return body as Loc[]
  if (body && typeof body === "object") return [body as Loc]
  return []
}

function cleanPlace(input: unknown): Place | null {
  if (!input || typeof input !== "object") return null
  const o = input as Record<string, unknown>
  const name = String(o.name ?? "").trim().slice(0, 80)
  const latitude = Number(o.latitude)
  const longitude = Number(o.longitude)
  const elevation = Number(o.elevation)
  if (!name) return null
  if (!Number.isFinite(latitude) || latitude < -44 || latitude > -10) return null
  if (!Number.isFinite(longitude) || longitude < 112 || longitude > 154) return null
  if (!Number.isFinite(elevation) || elevation < -5 || elevation > 2500) return null
  const admin = typeof o.admin === "string" ? o.admin.slice(0, 48) : undefined
  return { name, latitude, longitude, elevation, admin }
}

function roleFor(place: Place): string {
  if (near(place, RICHMOND)) return "The plain"
  if (near(place, SYDNEY)) return "The harbour"
  if (near(place, BEROWRA)) return "The ridge"
  return place.admin || "Selected"
}

type EnsSystem = { id: string; cols: number[][] }

function ensembleSystems(block: Block | undefined, field: string): { times: string[]; systems: EnsSystem[] } {
  if (!block) return { times: [], systems: [] }
  const groups = new Map<string, number[][]>()
  for (const key of Object.keys(block)) {
    const system = ensembleSystemId(field, key)
    if (!system) continue
    const series = nums(block, key)
    if (!series || !series.some((v) => v != null)) continue
    const col = series.map((v) => (v == null ? Number.NaN : v))
    const list = groups.get(system) ?? []
    list.push(col)
    groups.set(system, list)
  }
  return {
    times: block.time,
    systems: [...groups.entries()].map(([id, cols]) => ({ id, cols })),
  }
}

function column(cols: number[][], index: number): number[] {
  const out: number[] = []
  for (const col of cols) {
    const v = col[index]
    if (typeof v === "number" && Number.isFinite(v)) out.push(v)
  }
  return out
}

function hoursMatching(times: string[], date: string, from: number, to: number): number[] {
  const out: number[] = []
  times.forEach((t, i) => {
    if (!t.startsWith(date)) return
    const h = Number(t.slice(11, 13))
    if (h >= from && h <= to) out.push(i)
  })
  return out
}

function webMercator(lat: number, lon: number, zoom: number) {
  const n = 2 ** zoom
  const x = ((lon + 180) / 360) * n
  const rad = (lat * Math.PI) / 180
  const y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n
  return { x, y, cx: Math.floor(x), cy: Math.floor(y) }
}

async function radarFor(lat: number, lon: number): Promise<Forecast["radar"]> {
  const zoom = 10
  const pos = webMercator(lat, lon, zoom)
  const coords: Array<{ x: number; y: number }> = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) coords.push({ x: pos.cx + dx, y: pos.cy + dy })
  }
  const pinLeft = ((1 + (pos.x - pos.cx)) / 3) * 100
  const pinTop = ((1 + (pos.y - pos.cy)) / 3) * 100
  const base = coords.map((c) => `https://basemaps.cartocdn.com/dark_all/${zoom}/${c.x}/${c.y}.png`)
  try {
    const body = (await fetchJson("https://api.rainviewer.com/public/weather-maps.json")) as {
      host?: string
      radar?: { past?: Array<{ time: number; path: string }> }
    }
    const host = body.host ?? "https://tilecache.rainviewer.com"
    const past = body.radar?.past ?? []
    const frames: RadarFrame[] = past.slice(-8).map((frame) => ({
      label: new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Sydney",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(frame.time * 1000)),
      base,
      radar: coords.map((c) => `${host}${frame.path}/256/${zoom}/${c.x}/${c.y}/2/1_1.png`),
    }))
    return { frames, pinLeft, pinTop }
  } catch {
    return { frames: [], pinLeft, pinTop }
  }
}

function gradientText(placeName: string, ridge: boolean, cards: AnchorCard[]): string {
  const sel = cards[0]
  const plain = cards.find((c) => c.role === "The plain")
  const harbour = cards.find((c) => c.role === "The harbour")
  if (
    ridge &&
    sel?.role === "The ridge" &&
    sel.temp != null &&
    plain?.temp != null &&
    harbour?.temp != null
  ) {
    const gap = plain.temp - sel.temp
    const coast = sel.temp - harbour.temp
    const plainSide = `Richmond ${Math.round(plain.temp)}°, ridge ${Math.round(sel.temp)}°, harbour ${Math.round(harbour.temp)}°.`
    const shape = `Inland minus ridge is ${gap >= 0 ? "+" : "−"}${Math.abs(Math.round(gap))}°. Ridge minus harbour is ${coast >= 0 ? "+" : "−"}${Math.abs(Math.round(coast))}°. Those are medians, not a corrected story.`
    return `${plainSide} ${shape}`
  }
  if (sel?.temp == null) return ""
  const others = cards.filter((c) => c !== sel && c.temp != null)
  if (!others.length) return ""
  const list = others.map((c) => `${c.name} ${Math.round(c.temp as number)}°`).join(" and ")
  return `${placeName} is ${Math.round(sel.temp)}° this hour, beside ${list}.`
}

function assemble(
  place: Place,
  locs: Loc[],
  ensembleBody: unknown,
  pastBody: unknown,
  airBody: unknown,
  radar: Forecast["radar"],
): Forecast {
  const primary = locs[0]
  const hourly = primary?.hourly
  const daily = primary?.daily
  if (!hourly?.time?.length || !daily?.time?.length) {
    throw new Error("The models returned an empty forecast.")
  }
  const times = hourly.time
  const dates = daily.time
  const stamp = sydneyStamp()
  const nowI = indexAt(times, stamp.hourKey)

  const tempByModel = new Map<string, Num[]>()
  for (const model of MODELS) {
    const series = nums(hourly, `temperature_2m_${model.id}`)
    if (series && finite(series).length >= 24) tempByModel.set(model.id, series)
  }
  if (tempByModel.size < 2) throw new Error("Not enough models responded.")

  const available = new Set(tempByModel.keys())
  const active = MODELS.filter((m) => available.has(m.id))

  const field = (name: string, modelId: string, block: Block | undefined = hourly) =>
    nums(block, `${name}_${modelId}`)

  function valuesAt(name: string, index: number, block: Block | undefined = hourly): number[] {
    return finite(active.map((m) => at(field(name, m.id, block), index)))
  }
  function blend(name: string, index: number, block?: Block): number | null {
    return median(valuesAt(name, index, block))
  }
  function blendDir(index: number): number | null {
    return circMean(active.map((m) => ({ w: 1, d: at(field("wind_direction_10m", m.id), index) })))
  }
  function majorityCode(index: number, block: Block | undefined = hourly, name = "weather_code"): number | null {
    const votes = new Map<number, number>()
    for (const model of active) {
      const v = at(field(name, model.id, block), index)
      if (v == null) continue
      const code = Math.round(v)
      votes.set(code, (votes.get(code) ?? 0) + 1)
    }
    let best: number | null = null
    let count = 0
    for (const [code, n] of votes) {
      if (n > count) {
        best = code
        count = n
      }
    }
    return best
  }

  const ens = (ensembleBody ?? {}) as { daily?: Block }
  const ensDayRain = ensembleSystems(ens.daily, "precipitation_sum")
  const ensDayMax = ensembleSystems(ens.daily, "temperature_2m_max")
  const ensDayIndex = new Map(ensDayRain.times.map((t, i) => [t, i]))

  function systemsAt(pack: { systems: EnsSystem[] }, index: number | undefined): EnsSystem[] {
    if (index == null) return []
    return pack.systems.filter((sys) => column(sys.cols, index).length >= 3)
  }

  const hourlyOut: HourPoint[] = []
  const fan: FanPoint[] = []
  for (let i = nowI; i < Math.min(times.length, nowI + 36); i++) {
    const time = times[i] ?? ""
    const hour = Number(time.slice(11, 13))
    const temps = finite(active.map((m) => at(tempByModel.get(m.id) ?? null, i)))
    const mid = median(temps)
    const avg = average(temps)
    const rainVotes = valuesAt("precipitation", i)
    const { weekday } = weekdayOf(time.slice(0, 10))
    const showDay = i === nowI || hour === 0
    hourlyOut.push({
      time,
      label: showDay ? `${weekday} ${hourLabel(time)}` : hourLabel(time),
      showDay,
      temp: mid,
      apparent: blend("apparent_temperature", i),
      rain: median(rainVotes),
      pop: fraction(rainVotes, (v) => v >= 0.2),
      wind: blend("wind_speed_10m", i),
      gust: blend("wind_gusts_10m", i),
      dir: blendDir(i),
      dirText: dirText(blendDir(i)),
      rh: blend("relative_humidity_2m", i),
      cloud: blend("cloud_cover", i),
      cape: blend("cape", i),
      uv: blend("uv_index", i),
      code: majorityCode(i),
    })
    if (mid != null && avg != null && temps.length) {
      fan.push({
        time,
        label: hourLabel(time),
        median: mid,
        mean: avg,
        min: Math.min(...temps),
        max: Math.max(...temps),
      })
    }
  }

  const days: DayPoint[] = dates.map((date, d) => {
    const models: DayModel[] = active.map((m) => ({
      id: m.id,
      short: m.short,
      max: at(field("temperature_2m_max", m.id, daily), d),
      min: at(field("temperature_2m_min", m.id, daily), d),
      rain: at(field("precipitation_sum", m.id, daily), d),
    }))
    const maxes = finite(models.map((m) => m.max))
    const afternoon = hoursMatching(times, date, 12, 17)
    const stormWindow = hoursMatching(times, date, 12, 19)
    let seaHours = 0
    let peakCape: number | null = null
    let peakGust: number | null = null
    for (const i of afternoon) {
      const dir = blendDir(i)
      const wind = blend("wind_speed_10m", i)
      if (onshore(dir) && (wind ?? 0) >= 12) seaHours += 1
    }
    for (const i of stormWindow) {
      const cape = blend("cape", i)
      if (cape != null) peakCape = peakCape == null ? cape : Math.max(peakCape, cape)
      const gust = blend("wind_gusts_10m", i)
      if (gust != null) peakGust = peakGust == null ? gust : Math.max(peakGust, gust)
    }
    const seaBreeze = seaHours >= 3
    const ei = ensDayIndex.get(date)
    const rainSystems = systemsAt(ensDayRain, ei)
    const maxSystems = systemsAt(ensDayMax, ei)
    const popEach: number[] = []
    const pop5Each: number[] = []
    const rainMids: number[] = []
    const rainLo: number[] = []
    const rainHi: number[] = []
    for (const sys of rainSystems) {
      const vals = column(sys.cols, ei as number)
      const p1 = fraction(vals, (v) => v >= 1)
      const p5 = fraction(vals, (v) => v >= 5)
      const midRain = quantile(vals, 0.5)
      const lo = quantile(vals, 0.1)
      const hi = quantile(vals, 0.9)
      if (p1 != null) popEach.push(p1)
      if (p5 != null) pop5Each.push(p5)
      if (midRain != null) rainMids.push(midRain)
      if (lo != null) rainLo.push(lo)
      if (hi != null) rainHi.push(hi)
    }
    const maxLo: number[] = []
    const maxHi: number[] = []
    for (const sys of maxSystems) {
      const vals = column(sys.cols, ei as number)
      const lo = quantile(vals, 0.1)
      const hi = quantile(vals, 0.9)
      if (lo != null) maxLo.push(lo)
      if (hi != null) maxHi.push(hi)
    }
    const pop = average(popEach)
    const pop5 = average(pop5Each)
    const p50 = median(rainMids)
    const rainMean = median(models.map((m) => m.rain))
    const storm = stormScore({
      cape: peakCape,
      pop,
      gust: peakGust,
    })
    const code = majorityCode(d, daily)
    const { weekday, dayNum } = weekdayOf(date)
    const sunrise = clock(stringAt(daily, "sunrise", d, active))
    const sunset = clock(stringAt(daily, "sunset", d, active))
    return {
      date,
      weekday,
      dayNum,
      tMax: median(models.map((m) => m.max)),
      tMin: median(models.map((m) => m.min)),
      rain: p50 ?? rainMean,
      rainMean,
      pop,
      pop5,
      p10: rainLo.length ? Math.min(...rainLo) : null,
      p90: rainHi.length ? Math.max(...rainHi) : null,
      ensLo: maxLo.length ? Math.min(...maxLo) : null,
      ensHi: maxHi.length ? Math.max(...maxHi) : null,
      wind: blend("wind_speed_10m_max", d, daily),
      gust: blend("wind_gusts_10m_max", d, daily),
      uv: blend("uv_index_max", d, daily),
      sunrise,
      sunset,
      spread: spreadOf(maxes),
      code,
      summary: summaryFor(pop, p50 ?? rainMean, code, storm),
      outlier: outlierNote(models),
      models,
      storm,
      seaBreeze,
    }
  })

  const nowTemps = finite(active.map((m) => at(tempByModel.get(m.id) ?? null, nowI)))
  const nowTemp = median(nowTemps)
  const nowMean = average(nowTemps)
  const lo = nowTemps.length ? Math.min(...nowTemps) : null
  const hi = nowTemps.length ? Math.max(...nowTemps) : null
  const gap = lo != null && hi != null ? hi - lo : 0
  const dir = blendDir(nowI)
  const today = days[0]
  const hourNow = Number(stamp.hourKey.slice(11, 13))
  const spreadDay = hourNow >= 16 ? (days[1] ?? today) : today
  const spreadWhen =
    spreadDay?.date === stamp.dateKey
      ? "Today's maximum"
      : spreadDay?.date === dates[1]
        ? "Tomorrow's maximum"
        : "The next maximum"
  const peak = days.slice(0, 5).reduce<DayPoint | undefined>((best, day) => {
    if (!best || day.storm > best.storm) return day
    return best
  }, days[0])

  const modelsNow: ModelNow[] = active.map((m) => ({
    id: m.id,
    label: m.label,
    short: m.short,
    role: m.role,
    kind: m.kind,
    temp: at(tempByModel.get(m.id) ?? null, nowI),
    rainToday: at(field("precipitation_sum", m.id, daily), 0),
    maxToday: at(field("temperature_2m_max", m.id, daily), 0),
  }))

  const anchors: AnchorCard[] = trioFor(place).map((spot, idx) => {
    const loc = locs[idx]
    const h = loc?.hourly
    const dly = loc?.daily
    const tIndex = h?.time ? indexAt(h.time, stamp.hourKey) : nowI
    const date = dly?.time?.[0]
    const aft = h?.time && date ? hoursMatching(h.time, date, 12, 18) : []
    let cape: number | null = null
    for (const i of aft) {
      const c = median(active.map((m) => at(nums(h, `cape_${m.id}`), i)))
      if (c != null) cape = cape == null ? c : Math.max(cape, c)
    }
    const temp = median(active.map((m) => at(nums(h, `temperature_2m_${m.id}`), tIndex)))
    const wind = median(active.map((m) => at(nums(h, `wind_speed_10m_${m.id}`), tIndex)))
    const windDir = circMean(active.map((m) => ({ w: 1, d: at(nums(h, `wind_direction_10m_${m.id}`), tIndex) })))
    const tMax = median(active.map((m) => at(nums(dly, `temperature_2m_max_${m.id}`), 0)))
    const rain = median(active.map((m) => at(nums(dly, `precipitation_sum_${m.id}`), 0)))
    return {
      name: spot.name,
      role: roleFor(spot),
      temp,
      tMax,
      cape,
      rain,
      windText: wind != null && dirText(windDir) ? `${dirText(windDir)} ${Math.round(wind)}` : null,
    }
  })

  const past = pastBody as { daily?: Block } | null
  const pastTimes = past?.daily?.time ?? []
  const pastRain = nums(past?.daily, "precipitation_sum")
  let rain14 = 0
  let rainKnown = false
  pastTimes.forEach((date, i) => {
    if (date >= stamp.dateKey) return
    const v = pastRain?.[i]
    if (v == null) return
    rainKnown = true
    rain14 += v
  })
  const dry = droughtFromRain(rainKnown ? rain14 : null)
  const fireDay = hourNow >= 18 ? (days[1] ?? today) : today
  const fireHour = fireDay ? indexAt(times, `${fireDay.date}T15:00`) : nowI
  const fireTemp = blend("temperature_2m", fireHour)
  const fireRh = blend("relative_humidity_2m", fireHour)
  const fireWind = blend("wind_speed_10m", fireHour)
  const ffdiValue =
    fireTemp != null && fireRh != null && fireWind != null
      ? ffdi(fireTemp, fireRh, fireWind, dry.df)
      : null
  const fireCat = ffdiValue == null ? "Unknown" : ffdiCategory(ffdiValue)
  const fireDetail =
    ffdiValue == null
      ? "Not enough temperature, humidity and wind to score fire weather."
      : `${fireCat} on an unofficial McArthur index for ${fireDay?.weekday ?? "the afternoon"} 3pm — ${Math.round(fireTemp ?? 0)}°, humidity ${Math.round(fireRh ?? 0)}%, wind ${Math.round(fireWind ?? 0)} km/h. Dryness is ${dry.known ? `${mm(rain14)} over the last fortnight` : "a neutral guess, because recent rain was missing"}. This is not an AFDRS rating and not a permit to burn.`

  const airRaw = airBody as { current?: Record<string, number | null> } | null
  const air = airRaw?.current
    ? {
        pm25: typeof airRaw.current.pm2_5 === "number" ? airRaw.current.pm2_5 : null,
        pm10: typeof airRaw.current.pm10 === "number" ? airRaw.current.pm10 : null,
        aqi: typeof airRaw.current.us_aqi === "number" ? airRaw.current.us_aqi : null,
        label: aqiLabel(typeof airRaw.current.us_aqi === "number" ? airRaw.current.us_aqi : null),
      }
    : null

  const ridge = onTheRidge(place)
  const peakDay = peak ?? today
  const dayName =
    peakDay?.date === stamp.dateKey
      ? "Today"
      : peakDay?.date === dates[1]
        ? "Tomorrow"
        : (weekdayOf(peakDay?.date ?? stamp.dateKey).long)

  let ahead = 0
  for (const hour of hourlyOut) {
    if (!hour.time.startsWith(stamp.dateKey)) break
    if (hour.rain != null) ahead += hour.rain
  }

  const firstEns = ensDayIndex.get(dates[0] ?? "")
  const ensembleIds = systemsAt(ensDayRain, firstEns).map((sys) => ENSEMBLE_LABEL[sys.id] ?? sys.id)
  const ensembleNames = ensembleIds.join(", ")

  const brief = writeBrief({
    place: place.name,
    ridge,
    temp: nowTemp,
    mean: nowMean,
    lo,
    hi,
    live: active.length,
    dir,
    wind: blend("wind_speed_10m", nowI),
    pop: today?.pop ?? null,
    rain: today?.rain ?? null,
    p90: today?.p90 ?? null,
    ensembles: ensembleIds.length,
    ensembleNames,
    ahead,
    outlier: today?.outlier ?? null,
    stormLabel: stormLabel(peakDay?.storm ?? 0),
    stormScore: peakDay?.storm ?? 0,
    stormDay: dayName,
    seaBreeze: peakDay?.seaBreeze ?? false,
    cape: peakDay ? afternoonCape(times, peakDay.date, blend) : null,
    spread: spreadDay?.spread ?? null,
    spreadWhen,
  })

  const capeNow = peakDay ? afternoonCape(times, peakDay.date, blend) : null
  const stormDetail = peakDay
    ? `${dayName} has the highest storm score in the next five days (${stormLabel(peakDay.storm).toLowerCase()}, ${peakDay.storm}). The score is only median CAPE${capeNow != null ? ` near ${Math.round(capeNow)} J/kg` : ""}, the equal-vote rain chance, and median gusts. ${
        peakDay.seaBreeze
          ? "The afternoon wind is onshore. That fact is shown and is not applied as a penalty."
          : "The afternoon wind is not a sustained onshore breeze."
      }`
    : ""

  const uvLeft = hourlyOut.reduce<number | null>((best, hour) => {
    if (hour.uv == null) return best
    return best == null ? hour.uv : Math.max(best, hour.uv)
  }, null)

  return {
    placeName: place.name,
    admin: place.admin ?? "NSW",
    elevation: Math.round(place.elevation),
    updatedLabel: prettyUpdated(),
    brief,
    gradient: gradientText(place.name, ridge, anchors),
    condition: conditionLabel(majorityCode(nowI)),
    cluster: gap >= 4 ? "Wide split" : gap >= 2 ? "Some spread" : "Tight cluster",
    now: {
      temp: nowTemp,
      mean: nowMean,
      apparent: blend("apparent_temperature", nowI),
      rh: blend("relative_humidity_2m", nowI),
      dew: blend("dew_point_2m", nowI),
      wind: blend("wind_speed_10m", nowI),
      gust: blend("wind_gusts_10m", nowI),
      dirText: dirText(dir),
      pressure: blend("pressure_msl", nowI),
      cloud: blend("cloud_cover", nowI),
      code: majorityCode(nowI),
      lo,
      hi,
      uv: uvLeft,
    },
    modelsNow,
    hourly: hourlyOut,
    days,
    fan,
    anchors,
    storm: {
      score: peakDay?.storm ?? 0,
      label: stormLabel(peakDay?.storm ?? 0),
      day: dayName,
      cape: peakDay ? afternoonCape(times, peakDay.date, blend) : null,
      seaBreeze: peakDay?.seaBreeze ?? false,
      detail: stormDetail,
    },
    fire: { ffdi: ffdiValue, category: fireCat, detail: fireDetail },
    air,
    radar,
    accessNote: silentNote(MODELS.filter((m) => !available.has(m.id)).map((m) => m.label)),
    liveModels: available.size,
    askedModels: MODELS.length,
    ensembles: ensembleIds.length,
    ensembleNames,
  }
}

function silentNote(missing: string[]): string | null {
  if (!missing.length) return null
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`
  return `No usable grid this run from ${list}. A missing model is left missing. Nothing is copied in from a related model.`
}

function stringAt(
  block: Block | undefined,
  fieldName: string,
  index: number,
  active: Array<{ id: string }>,
): string | null {
  if (!block) return null
  for (const model of active) {
    const raw = block[`${fieldName}_${model.id}`]
    const v = raw?.[index]
    if (typeof v === "string") return v
  }
  return null
}

function afternoonCape(
  times: string[],
  date: string,
  blend: (name: string, index: number) => number | null,
): number | null {
  let peak: number | null = null
  for (const i of hoursMatching(times, date, 12, 19)) {
    const c = blend("cape", i)
    if (c != null) peak = peak == null ? c : Math.max(peak, c)
  }
  return peak
}

async function load(place: Place): Promise<ForecastResult> {
  const key = `v5:${place.latitude.toFixed(3)},${place.longitude.toFixed(3)},${Math.round(place.elevation)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.value
  const pending = inflight.get(key)
  if (pending) return pending
  const job = loadFresh(place, key).finally(() => inflight.delete(key))
  inflight.set(key, job)
  return job
}

async function loadFresh(place: Place, key: string): Promise<ForecastResult> {
  const spots = trioFor(place)
  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast")
  forecastUrl.searchParams.set("latitude", spots.map((s) => s.latitude).join(","))
  forecastUrl.searchParams.set("longitude", spots.map((s) => s.longitude).join(","))
  forecastUrl.searchParams.set("elevation", spots.map((s) => s.elevation).join(","))
  forecastUrl.searchParams.set("hourly", HOURLY)
  forecastUrl.searchParams.set("daily", DAILY)
  forecastUrl.searchParams.set("models", MODEL_PARAM)
  forecastUrl.searchParams.set("forecast_days", "10")
  forecastUrl.searchParams.set("timezone", "Australia/Sydney")
  forecastUrl.searchParams.set("wind_speed_unit", "kmh")

  const ensUrl = new URL("https://ensemble-api.open-meteo.com/v1/ensemble")
  ensUrl.searchParams.set("latitude", String(place.latitude))
  ensUrl.searchParams.set("longitude", String(place.longitude))
  ensUrl.searchParams.set("elevation", String(place.elevation))
  ensUrl.searchParams.set("hourly", "precipitation")
  ensUrl.searchParams.set("daily", "precipitation_sum,temperature_2m_max")
  ensUrl.searchParams.set("models", ENSEMBLE_PARAM)
  ensUrl.searchParams.set("forecast_days", "10")
  ensUrl.searchParams.set("timezone", "Australia/Sydney")

  const pastUrl = new URL("https://api.open-meteo.com/v1/forecast")
  pastUrl.searchParams.set("latitude", String(place.latitude))
  pastUrl.searchParams.set("longitude", String(place.longitude))
  pastUrl.searchParams.set("elevation", String(place.elevation))
  pastUrl.searchParams.set("daily", "precipitation_sum")
  pastUrl.searchParams.set("past_days", "14")
  pastUrl.searchParams.set("forecast_days", "1")
  pastUrl.searchParams.set("models", "ecmwf_ifs")
  pastUrl.searchParams.set("timezone", "Australia/Sydney")

  const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality")
  airUrl.searchParams.set("latitude", String(place.latitude))
  airUrl.searchParams.set("longitude", String(place.longitude))
  airUrl.searchParams.set("current", "pm2_5,pm10,us_aqi")
  airUrl.searchParams.set("timezone", "Australia/Sydney")

  try {
    const forecast = await fetchJson(forecastUrl.toString())
    const ensemble = await fetchJson(ensUrl.toString()).catch(() => null)
    const past = await fetchJson(pastUrl.toString()).catch(() => null)
    const air = await fetchJson(airUrl.toString()).catch(() => null)
    const radar = await radarFor(place.latitude, place.longitude)
    const value: ForecastResult = {
      ok: true,
      forecast: assemble(place, asLocs(forecast), ensemble, past, air, radar),
    }
    cache.set(key, { at: Date.now(), value })
    return value
  } catch (error) {
    const message = error instanceof Error ? error.message : "The forecast could not be loaded."
    return { ok: false, error: message }
  }
}

export const getForecast = createServerFn({ method: "GET" })
  .validator((input: Place) => input)
  .handler(async ({ data }): Promise<ForecastResult> => {
    const place = cleanPlace(data) ?? BEROWRA
    return load(place)
  })

export const searchPlaces = createServerFn({ method: "GET" })
  .validator((query: string) => query)
  .handler(async ({ data }): Promise<SearchHit[]> => {
    const q = String(data ?? "").trim()
    if (q.length < 2 || q.length > 60) return []
    if (q === "2082" || /berowra\s*heights/i.test(q)) {
      return [{ ...BEROWRA, admin: BEROWRA.admin ?? "NSW" }]
    }
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search")
    url.searchParams.set("name", q)
    url.searchParams.set("count", "8")
    url.searchParams.set("language", "en")
    url.searchParams.set("format", "json")
    url.searchParams.set("countryCode", "AU")
    try {
      const body = (await fetchJson(url.toString())) as {
        results?: Array<{
          name?: string
          latitude?: number
          longitude?: number
          elevation?: number
          admin1?: string
          country_code?: string
        }>
      }
      const hits = (body.results ?? [])
        .filter((r) => r.country_code === "AU" && r.name && r.latitude != null && r.longitude != null)
        .map((r) => ({
          name: r.name as string,
          latitude: r.latitude as number,
          longitude: r.longitude as number,
          elevation: typeof r.elevation === "number" ? r.elevation : 40,
          admin: r.admin1 ?? "Australia",
        }))
      hits.sort((a, b) => Number(b.admin === "New South Wales") - Number(a.admin === "New South Wales"))
      return hits.slice(0, 6)
    } catch {
      return []
    }
  })
