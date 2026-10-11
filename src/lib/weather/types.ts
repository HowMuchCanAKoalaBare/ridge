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
  cape: number | null
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
  src: string
}

export type RadarRange = {
  km: number
  code: string
  pinLeft: number | null
  pinTop: number | null
  map: string
  rings: string
  loop: string
  frames: RadarFrame[]
}

export type RadarView = {
  site: string
  clutter: boolean
  ranges: RadarRange[]
}

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

export type ModelRun = {
  name: string
  label: string
  ageHours: number
}

export type ScoreRow = {
  hourKey: string
  label: string
  median: number | null
  obs: number | null
  error: number | null
}

export type Scorecard = {
  station: string
  stationId: string
  distanceKm: number | null
  mae: number | null
  count: number
  rows: ScoreRow[]
  note: string
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
  centreTemp: number | null
  centreCount: number
  runs: ModelRun[]
  hourlyFrom: "ensemble" | "models"
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
  observations: StationObs[]
  obsNote: string | null
  scorecard: Scorecard | null
  storm: {
    day: string
    cape: number | null
    pop: number | null
    gust: number | null
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
  radar: RadarView
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
