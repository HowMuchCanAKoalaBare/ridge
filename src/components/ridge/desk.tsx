import { useState, type FormEvent, type ReactNode } from "react"
import { useServerFn } from "@tanstack/react-start"
import { RefreshCw, Search } from "lucide-react"
import { getForecast, searchPlaces } from "@/lib/weather/api"
import { PRESETS, type Place } from "@/lib/weather/places"
import type { DayPoint, Forecast, ModelNow, SearchHit } from "@/lib/weather/types"
import { FanChart } from "./fan"
import { WeatherGlyph } from "./glyph"
import { RadarPanel } from "./radar"

function round(v: number | null, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "–"
  return v.toFixed(digits)
}

function mm(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "–"
  if (v < 0.05) return "0 mm"
  if (v < 10) return `${v.toFixed(1)} mm`
  return `${Math.round(v)} mm`
}

function pct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "–"
  return `${Math.round(v * 100)}%`
}

function Section({ kicker, children }: { kicker: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xs font-medium tracking-widest text-muted uppercase">{kicker}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function ModelBars({ models, medianTemp }: { models: ModelNow[]; medianTemp: number | null }) {
  const temps = models.map((m) => m.temp).filter((v): v is number => v != null)
  if (!temps.length) return null
  const ordered = [...models].sort((a, b) => (a.temp ?? 0) - (b.temp ?? 0))
  const min = Math.min(...temps) - 0.4
  const max = Math.max(...temps) + 0.4
  const span = Math.max(0.5, max - min)
  const at = (v: number) => ((v - min) / span) * 100
  return (
    <ul className="space-y-3">
      {ordered.map((model) => (
        <li key={model.id}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-fg">
              {model.short}
              <span className="ml-2 text-xs text-muted">{model.kind === "ai" ? "AI" : "physics"}</span>
            </span>
            <span className="text-muted">{model.temp == null ? "–" : `${Math.round(model.temp)}°`}</span>
          </div>
          <div className="relative mt-1 h-2 rounded-full bg-surface-2">
            {model.temp != null ? (
              <span
                className="absolute top-0 h-2 rounded-full bg-muted"
                style={{ width: `${Math.max(6, at(model.temp))}%` }}
              />
            ) : null}
            {medianTemp != null ? (
              <span
                className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-accent"
                style={{ left: `${at(medianTemp)}%` }}
              />
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted">{model.role}</p>
        </li>
      ))}
    </ul>
  )
}

function DayRow({ day }: { day: DayPoint }) {
  return (
    <details className="border-b border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-3">
        <div className="w-14 shrink-0">
          <p className="text-sm text-fg">{day.weekday}</p>
          <p className="text-xs text-muted">{day.dayNum}</p>
        </div>
        <WeatherGlyph code={day.code} className="size-5 shrink-0 text-fg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-fg">{day.summary}</p>
          <p className="text-xs text-rain">
            {mm(day.rain)} · {pct(day.pop)}
          </p>
        </div>
        <p className="text-right text-sm text-fg">
          {round(day.tMax)}°
          <span className="text-muted"> {round(day.tMin)}°</span>
        </p>
      </summary>
      <div className="pb-4 pl-14 text-sm text-muted">
        <p>
          Wind {round(day.wind)} km/h, gusts {round(day.gust)}. UV {round(day.uv)}.
          {day.sunrise && day.sunset ? ` Sun ${day.sunrise}–${day.sunset}.` : ""}
        </p>
        {day.spread != null ? (
          <p className="mt-1">Model maxima span {day.spread.toFixed(1)}°.</p>
        ) : null}
        {day.ensLo != null && day.ensHi != null ? (
          <p className="mt-1">
            Ensemble maxima {Math.round(day.ensLo)}–{Math.round(day.ensHi)}°, outer edge of each ensemble. Rain band{" "}
            {mm(day.p10)} to {mm(day.p90)}. Chance of 5 mm {pct(day.pop5)}.
          </p>
        ) : null}
        {day.seaBreeze ? (
          <p className="mt-1">Afternoon wind is onshore. Reported, not a penalty.</p>
        ) : null}
        {day.cape != null ? <p className="mt-1">Afternoon CAPE {Math.round(day.cape)} J/kg.</p> : null}
        {day.outlier ? <p className="mt-1 text-fg">{day.outlier}</p> : null}
        <ul className="mt-3 space-y-1">
          {day.models.map((model) => (
            <li key={model.id} className="flex justify-between gap-3">
              <span>{model.short}</span>
              <span>
                {round(model.max)}° / {round(model.min)}° · {mm(model.rain)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

export function Desk({ initial, place }: { initial: Forecast; place: Place }) {
  const runForecast = useServerFn(getForecast)
  const runSearch = useServerFn(searchPlaces)
  const [forecast, setForecast] = useState(initial)
  const [current, setCurrent] = useState(place)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)

  async function load(next: Place) {
    setPending(true)
    setError(null)
    try {
      const result = await runForecast({ data: next })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setForecast(result.forecast)
      setCurrent(next)
      setHits([])
      setQuery("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh the forecast.")
    } finally {
      setPending(false)
    }
  }

  async function onSearch(event: FormEvent) {
    event.preventDefault()
    setSearching(true)
    try {
      const found = await runSearch({ data: query })
      setHits(found)
      if (!found.length) setError("No Australian match. Try a town name.")
      else setError(null)
    } catch {
      setError("Place search failed.")
    } finally {
      setSearching(false)
    }
  }

  const f = forecast
  const temps = f.modelsNow.map((m) => m.temp).filter((v): v is number => v != null)

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pt-0 pb-16">
      <div className="h-0.5 bg-accent" />
      <header className="sticky top-0 z-10 -mx-4 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-widest text-accent">RIDGE</p>
            <h1 className="font-serif text-3xl leading-none text-fg">{f.placeName}</h1>
            <p className="mt-1 text-xs text-muted">
              {f.elevation} m · {f.admin} · {f.liveModels} of {f.askedModels} models · {f.updatedLabel}
            </p>
            {f.runs.length ? (
              <p className="mt-1 text-xs text-muted">{f.runs.map((run) => run.label).join(" · ")}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-full border border-line bg-surface text-fg"
            onClick={() => load(current)}
            disabled={pending}
            aria-label="Refresh forecast"
          >
            <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
          </button>
        </div>
      </header>

      <form className="mt-4 flex gap-2" onSubmit={onSearch}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search an Australian place</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Another town, or 2082"
            className="h-11 w-full rounded-full border border-line bg-surface px-4 text-sm text-fg outline-none placeholder:text-muted"
          />
        </label>
        <button
          type="submit"
          className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-ink"
          aria-label="Search places"
          disabled={searching}
        >
          <Search className="size-4" />
        </button>
      </form>

      <div className="scroller mt-3 flex gap-2 overflow-x-auto pb-1">
        {PRESETS.map((preset) => {
          const on = preset.name === current.name
          return (
            <button
              key={preset.name}
              type="button"
              onClick={() => load(preset)}
              className={
                on
                  ? "h-11 shrink-0 rounded-full bg-accent px-3 text-sm text-accent-ink"
                  : "h-11 shrink-0 rounded-full border border-line bg-surface px-3 text-sm text-fg"
              }
            >
              {preset.name}
            </button>
          )
        })}
      </div>

      {hits.length ? (
        <ul className="mt-2 overflow-hidden rounded-xl border border-line">
          {hits.map((hit) => (
            <li key={`${hit.name}-${hit.latitude}`}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between px-3 text-left text-sm"
                onClick={() =>
                  load({
                    name: hit.name,
                    latitude: hit.latitude,
                    longitude: hit.longitude,
                    elevation: hit.elevation,
                    admin: hit.admin,
                  })
                }
              >
                <span>{hit.name}</span>
                <span className="text-muted">{hit.admin}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg" role="status">
          {error}
        </p>
      ) : null}

      <div className={pending ? "opacity-60" : undefined} aria-busy={pending}>
        <section className="mt-6">
          <p className="text-sm text-muted">{f.condition}</p>
          <div className="mt-1 flex items-end gap-3">
            <p className="font-serif text-7xl leading-none text-fg">
              {f.now.temp == null ? "–" : Math.round(f.now.temp)}
              <span className="text-4xl">°</span>
            </p>
            <div className="pb-1">
              <p className="text-sm text-accent">{f.cluster}</p>
              <p className="text-sm text-muted">
                Median of {temps.length}. Range{" "}
                {temps.length ? `${Math.round(Math.min(...temps))}–${Math.round(Math.max(...temps))}°` : "–"}
              </p>
              {f.now.mean != null && f.now.temp != null && Math.abs(f.now.mean - f.now.temp) >= 0.6 ? (
                <p className="text-sm text-muted">Mean {f.now.mean.toFixed(1)}°, pulled by the tail</p>
              ) : null}
              {f.centreTemp != null && f.centreCount > 1 ? (
                <p className="text-sm text-muted">
                  Centre median {Math.round(f.centreTemp)}°, one vote across {f.centreCount} centres
                </p>
              ) : null}
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Feels {round(f.now.apparent)}° · Dew {round(f.now.dew)}° · {f.now.dirText ?? "–"}{" "}
            {round(f.now.wind)} km/h · Gust {round(f.now.gust)} · {round(f.now.rh)}% ·{" "}
            {f.now.pressure == null ? "–" : `${Math.round(f.now.pressure)} hPa`}
            {f.now.uv != null ? ` · UV ${Math.round(f.now.uv)}` : ""}
          </p>
          <p className="mt-4 text-base leading-relaxed text-fg">{f.brief}</p>
          {f.gradient ? <p className="mt-3 text-sm leading-relaxed text-muted">{f.gradient}</p> : null}
        </section>

        <Section kicker="Coast to plain">
          <div className="grid grid-cols-3 gap-2">
            {f.anchors.map((card) => (
              <article key={card.name} className="rounded-xl bg-surface p-3">
                <p className="text-xs tracking-widest text-muted uppercase">{card.role}</p>
                <p className="mt-2 truncate font-serif text-2xl text-fg">
                  {card.temp == null ? "–" : Math.round(card.temp)}°
                </p>
                <p className="truncate text-xs text-fg">{card.name}</p>
                <p className="mt-2 text-xs text-muted">Max {round(card.tMax)}°</p>
                <p className="text-xs text-muted">CAPE {card.cape == null ? "–" : Math.round(card.cape)}</p>
                <p className="text-xs text-rain">{mm(card.rain)}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section kicker="Stations">
          {f.observations.length ? (
            <div className={f.observations.length > 2 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
              {f.observations.map((station) => (
                <article key={`${station.role}-${station.id}`} className="rounded-xl bg-surface p-3">
                  <p className="text-xs tracking-widest text-muted uppercase">{station.role}</p>
                  <p className="mt-2 font-serif text-2xl text-fg">
                    {station.temp == null ? "–" : Math.round(station.temp)}°
                  </p>
                  <p className="truncate text-xs text-fg">{station.name}</p>
                  <p className="mt-2 text-xs text-muted">{station.windText ?? "–"}</p>
                  <p className="text-xs text-muted">
                    {station.change == null
                      ? "No hour change"
                      : `${station.change > 0 ? "+" : ""}${station.change.toFixed(1)}° last hour`}
                  </p>
                  <p className="text-xs text-muted">
                    {station.when}
                    {station.distanceKm != null ? ` · ${station.distanceKm} km` : ""}
                    {station.elevation != null ? ` · ${Math.round(station.elevation)} m` : ""}
                  </p>
                </article>
              ))}
            </div>
          ) : null}
          {f.obsNote ? <p className="mt-2 text-xs text-muted">{f.obsNote}</p> : null}
        </Section>

        <Section kicker="Next 36 hours">
          <div className="scroller -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
            {f.hourly.map((hour) => (
              <article
                key={hour.time}
                className="min-w-16 shrink-0 rounded-xl bg-surface px-2 py-3 text-center"
              >
                <p className="text-xs whitespace-nowrap text-muted">{hour.label}</p>
                <div className="mt-2 flex justify-center text-fg">
                  <WeatherGlyph code={hour.code} time={hour.time} />
                </div>
                <p className="mt-2 text-sm text-fg">{round(hour.temp)}°</p>
                <p className="text-xs text-rain">{hour.pop != null && hour.pop >= 0.15 ? pct(hour.pop) : "·"}</p>
              </article>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {f.hourlyFrom === "ensemble"
              ? "A percent on an hour is the ensemble chance of at least 1 mm that hour, one vote per ensemble. Under 15% shows a dot. That is a heavier bar than a light shower."
              : "Hourly ensembles did not load. A percent is how many models reach at least 1 mm that hour. The day still uses ensembles when they answered."}
          </p>
        </Section>

        <Section kicker="Ten days">
          <div className="rounded-xl bg-surface px-3">
            {f.days.map((day) => (
              <DayRow key={day.date} day={day} />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Open a day for every model. None are dropped for disagreeing. The range includes the tails.
          </p>
        </Section>

        <Section kicker="Model desk">
          <p className="mb-3 text-sm text-muted">
            Sandstone line is the median, one vote per live model. White line is the mean, which shifts when a hot or
            cold run pulls. The band is every model, including the ones that disagree. The mark on each bar is that
            same median. Coldest at the top.
          </p>
          <div className="rounded-xl bg-surface p-3">
            <FanChart points={f.fan} />
          </div>
          <div className="mt-4">
            <ModelBars models={f.modelsNow} medianTemp={f.now.temp} />
          </div>
        </Section>

        <Section kicker="Ensemble rain">
          <ul className="space-y-3">
            {f.days.map((day) => {
              const width = day.p90 == null ? 0 : Math.min(100, (day.p90 / 25) * 100)
              const mark = day.rain == null ? 0 : Math.min(100, (day.rain / 25) * 100)
              return (
                <li key={day.date} className="grid grid-cols-5 items-center gap-2 text-sm">
                  <span className="text-muted">
                    {day.weekday} {day.dayNum}
                  </span>
                  <div className="col-span-3">
                    <div className="relative h-2 rounded-full bg-surface-2">
                      <span className="absolute top-0 h-2 rounded-full bg-rain-dim" style={{ width: `${width}%` }} />
                      <span
                        className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-rain"
                        style={{ left: `calc(${mark}% - 5px)` }}
                      />
                    </div>
                  </div>
                  <span className="text-right text-rain">{pct(day.pop)}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">
            {f.ensembles} ensembles ({f.ensembleNames || "none live"}), one vote each no matter how many members. Dot is
            the median of those medians. Bar runs to the wettest ensemble's 1-in-10 case. Percent is their average
            chance of at least 1 mm.
          </p>
        </Section>

        <Section kicker="Storm ingredients">
          <div className="rounded-xl bg-surface p-4">
            <p className="text-sm text-accent">{f.storm.day}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs tracking-widest text-muted uppercase">CAPE</p>
                <p className="mt-1 font-serif text-3xl text-fg">
                  {f.storm.cape == null ? "–" : Math.round(f.storm.cape)}
                </p>
                <p className="text-xs text-muted">J/kg</p>
              </div>
              <div>
                <p className="text-xs tracking-widest text-muted uppercase">1 mm</p>
                <p className="mt-1 font-serif text-3xl text-rain">{pct(f.storm.pop)}</p>
                <p className="text-xs text-muted">ensemble</p>
              </div>
              <div>
                <p className="text-xs tracking-widest text-muted uppercase">Gust</p>
                <p className="mt-1 font-serif text-3xl text-fg">
                  {f.storm.gust == null ? "–" : Math.round(f.storm.gust)}
                </p>
                <p className="text-xs text-muted">km/h</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">
              {f.storm.seaBreeze ? "Onshore afternoon" : "Not a sustained onshore wind"}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-fg">{f.storm.detail}</p>
          </div>
        </Section>

        <Section kicker="Radar">
          <RadarPanel radar={f.radar} placeName={f.placeName} />
        </Section>

        {f.scorecard ? (
          <Section kicker="Scorecard">
            <div className="rounded-xl bg-surface p-4">
              <p className="text-sm text-fg">
                {f.scorecard.mae == null ? "No closed hours yet" : `MAE ${f.scorecard.mae.toFixed(1)}°`}
                <span className="text-muted">
                  {" "}
                  · {f.scorecard.count} {f.scorecard.count === 1 ? "hour" : "hours"} · {f.scorecard.station}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">{f.scorecard.note}</p>
              {f.scorecard.rows.length ? (
                <ul className="mt-3 space-y-2">
                  {f.scorecard.rows.map((row) => (
                    <li key={row.hourKey} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-muted">{row.label}</span>
                      <span className="text-fg">
                        {round(row.median)}° vs {round(row.obs)}°
                        {row.error == null ? null : (
                          <span className="text-muted">
                            {" "}
                            {row.error > 0 ? "+" : ""}
                            {row.error.toFixed(1)}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted">
                  The first median for each hour is kept. It is scored after that hour, against the station.
                </p>
              )}
            </div>
          </Section>
        ) : null}

        <Section kicker="Fire and air">
          <div className="grid gap-2 sm:grid-cols-2">
            <article className="rounded-xl bg-surface p-4">
              <p className="text-xs tracking-widest text-muted uppercase">Unofficial FFDI</p>
              <p className="mt-2 font-serif text-4xl text-fg">{f.fire.ffdi ?? "–"}</p>
              <p className="text-sm text-accent">{f.fire.category}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.fire.detail}</p>
            </article>
            <article className="rounded-xl bg-surface p-4">
              <p className="text-xs tracking-widest text-muted uppercase">Air</p>
              {f.air ? (
                <>
                  <p className="mt-2 font-serif text-4xl text-fg">{f.air.label}</p>
                  <p className="mt-2 text-sm text-muted">
                    PM2.5 {f.air.pm25 == null ? "–" : f.air.pm25.toFixed(1)} µg/m³ · PM10{" "}
                    {f.air.pm10 == null ? "–" : Math.round(f.air.pm10)} · US AQI {f.air.aqi ?? "–"}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">Air quality did not load.</p>
              )}
            </article>
          </div>
        </Section>

        <Section kicker="How this desk works">
          <div className="space-y-3 text-sm leading-relaxed text-muted">
            <p>
              Thirteen global datasets are requested, and every one that answers gets the same vote: ECMWF IFS, AIFS,
              NOAA AIGFS, GraphCast, GFS, ICON, UKMO, GEM, ARPEGE, JMA, ACCESS-G, GRAPES and KMA. No hand weights. A
              model that disagrees stays in. The big number is the median of every live run. The centre median gives
              each modelling centre one vote, so three NOAA runs cannot outweigh the Bureau. The mean is there so you
              can see when a tail pulls it. Seamless blends and “best match” are not used — those are already someone
              else’s merge. Temperature uses the elevation of the place, not a nearby valley floor.
            </p>
            {f.accessNote ? <p className="text-fg">{f.accessNote}</p> : null}
            <p>
              Rain chance for a day is the average of each ensemble’s own probability of at least 1 mm — IFS, AIFS,
              GEFS, ICON, GEM and ACCESS-GE — so a 51-member set cannot outvote a smaller one. The same 1 mm line is
              used on each hour, one vote per ensemble. If the hourly ensemble is missing, the hour falls back to how
              many deterministic models reach 1 mm, and the caption says so. The wet tail is the wettest ensemble’s
              1-in-10, not an average that hides it.
            </p>
            <p>
              Storm weather is three ingredients on the day with the highest afternoon CAPE in the next five days:
              that CAPE, the ensemble chance of 1 mm, and the median gust. There is no 0–99 score. An onshore wind is
              shown. It is not a penalty.
            </p>
            <p>
              Station cards are public METARs. None of them sits on the Berowra ridge. The scorecard keeps the first
              hourly median this desk issued, then compares it with the nearest station once that hour has a
              temperature. The difference is the median minus the station.
            </p>
            <p>
              Fire dryness prefers ERA5 reanalysis and says so. It is not a raingauge. If reanalysis fails, IFS past
              days are used and labelled.
            </p>
            <p>
              This is not a Bureau of Meteorology warning service. If a warning is out, the warning wins.
            </p>
            <p className="flex flex-col gap-2">
              <a className="text-accent" href="https://www.bom.gov.au/nsw/warnings/" target="_blank" rel="noreferrer">
                NSW warnings
              </a>
              <a className="text-accent" href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                Model data via Open-Meteo
              </a>
            </p>
          </div>
        </Section>
      </div>
    </main>
  )
}
