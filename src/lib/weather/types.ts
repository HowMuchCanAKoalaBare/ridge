export type ModelNow = {
  id: string
  label: string
  short: string
  role: string
  kind: "physics" | "ai"
  temp: number | null
  rainToday: number | null
  maxToday: number | null
}

export type HourPoint = {
  time: string
  label: string
  showDay: boolean
  temp: number | null
  apparent: number | null
  rain: number | null
  pop: number | null
  wind: number | null
  gust: number | null
  dir: number | null
  dirText: string | null
  rh: number | null
  cloud: number | null
  cape: number | null
  uv: number | null
  code: number | null
}

export type DayModel = {
  id: string
  short: string
  max: number | null
  min: number | null
  rain: number | null
}

export type DayPoint = {
  date: string
  weekday: string
  dayNum: string
  tMax: number | null
  tMin: number | null
  rain: number | null
  rainMean: number | null
  pop: number | null
  pop5: number | null
  p10: number | null
  p90: number | null
  ensLo: number | null
  ensHi: number | null
  wind: number | null
  gust: number | null
  uv: number | null
  sunrise: string | null
  sunset: string | null
  spread: number | null
  code: number | null
  summary: string
  outlier: string | null
  models: DayModel[]
  storm: number
  seaBreeze: boolean
}

export type FanPoint = {
  time: string
  label: string
  median: number
  mean: number
  min: number
  max: number
}

export type AnchorCard = {
  name: string
  role: string
  temp: number | null
  tMax: number | null
  cape: number | null
  rain: number | null
  windText: string | null
}

export type RadarFrame = {
  label: string
  radar: string[]
  base: string[]
}

export type Forecast = {
  placeName: string
  admin: string
  elevation: number
  updatedLabel: string
  brief: string
  gradient: string
  condition: string
  cluster: string
  now: {
    temp: number | null
    mean: number | null
    apparent: number | null
    rh: number | null
    dew: number | null
    wind: number | null
    gust: number | null
    dirText: string | null
    pressure: number | null
    cloud: number | null
    code: number | null
    lo: number | null
    hi: number | null
    uv: number | null
  }
  modelsNow: ModelNow[]
  hourly: HourPoint[]
  days: DayPoint[]
  fan: FanPoint[]
  anchors: AnchorCard[]
  storm: {
    score: number
    label: string
    day: string
    cape: number | null
    seaBreeze: boolean
    detail: string
  }
  fire: {
    ffdi: number | null
    category: string
    detail: string
  }
  air: {
    pm25: number | null
    pm10: number | null
    aqi: number | null
    label: string
  } | null
  radar: {
    frames: RadarFrame[]
    pinLeft: number
    pinTop: number
  }
  accessNote: string | null
  liveModels: number
  askedModels: number
  ensembles: number
  ensembleNames: string
}

export type ForecastResult =
  | { ok: true; forecast: Forecast }
  | { ok: false; error: string }

export type SearchHit = {
  name: string
  latitude: number
  longitude: number
  elevation: number
  admin: string
}
