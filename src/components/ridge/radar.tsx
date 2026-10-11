import { useEffect, useState } from "react"
import { Pause, Play } from "lucide-react"
import { RADAR_COAST, RADAR_PLACES, radarPin } from "@/lib/weather/radar-coast"
import type { RadarView } from "@/lib/weather/types"

function startRange(radar: RadarView): number {
  const tight = radar.ranges.findIndex((range) => range.km === 64 && range.pinLeft != null)
  if (tight >= 0) return tight
  const holding = radar.ranges.findIndex((range) => range.pinLeft != null)
  return holding >= 0 ? holding : 0
}

export function RadarPanel({ radar, placeName }: { radar: RadarView; placeName: string }) {
  const [which, setWhich] = useState(() => startRange(radar))
  const range = radar.ranges[which] ?? radar.ranges[0]
  const [index, setIndex] = useState(Math.max(0, (range?.frames.length ?? 1) - 1))
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setWhich(startRange(radar))
  }, [radar])

  useEffect(() => {
    setIndex(Math.max(0, (range?.frames.length ?? 1) - 1))
    setPlaying(false)
  }, [which, range?.frames.length])

  useEffect(() => {
    if (!playing || !range || range.frames.length < 2) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce) return
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % range.frames.length)
    }, 700)
    return () => window.clearInterval(id)
  }, [playing, range])

  if (!range) {
    return (
      <div>
        <p className="rounded-xl bg-surface px-4 py-6 text-sm text-muted">
          The Sydney radar loop is out of reach right now.
        </p>
        <a
          className="mt-2 inline-flex min-h-11 items-center text-sm text-accent"
          href="https://reg.bom.gov.au/products/IDR714.loop.shtml"
          target="_blank"
          rel="noreferrer"
        >
          Bureau 64 km loop
        </a>
      </div>
    )
  }

  const frame = range.frames[index] ?? range.frames[range.frames.length - 1]
  const pixel = range.km === 64 ? "a quarter of a kilometre" : "half a kilometre"
  const coast = RADAR_COAST[range.code]
  const places = RADAR_PLACES.flatMap((place) => {
    const pin = radarPin(place.lat, place.lon, range.km)
    if (!pin) return []
    if (place.name === placeName) return []
    if (range.pinLeft != null && range.pinTop != null) {
      const near = Math.hypot(pin.left - range.pinLeft, pin.top - range.pinTop)
      if (near < 7) return []
    }
    return [{ ...place, ...pin }]
  })

  return (
    <div>
      <div className="flex gap-2">
        {radar.ranges.map((item, itemIndex) => (
          <button
            key={item.code}
            type="button"
            className={`h-11 rounded-full border px-4 text-sm ${
              itemIndex === which ? "border-accent bg-surface text-fg" : "border-line bg-surface text-muted"
            }`}
            onClick={() => setWhich(itemIndex)}
            aria-pressed={itemIndex === which}
          >
            {item.km} km
          </button>
        ))}
      </div>
      <div className="relative mt-3 aspect-square overflow-hidden rounded-xl bg-surface">
        {coast ? (
          <svg
            viewBox="0 0 512 512"
            className="absolute inset-0 h-full w-full text-muted"
            aria-hidden="true"
          >
            <path
              d={coast}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        ) : null}
        <img src={range.rings} alt="" className="absolute inset-0 h-full w-full" />
        {range.frames.map((item, itemIndex) => (
          <img
            key={item.src}
            src={item.src}
            alt={itemIndex === index ? `Sydney radar, ${item.label}` : ""}
            aria-hidden={itemIndex === index ? undefined : true}
            className={`absolute inset-0 h-full w-full ${itemIndex === index ? "" : "invisible"}`}
          />
        ))}
        {places.map((place) => (
          <span
            key={place.name}
            className="pointer-events-none absolute z-10"
            style={{ left: `${place.left}%`, top: `${place.top}%` }}
          >
            <span className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted" />
            <span
              className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] leading-none text-muted [text-shadow:0_0_4px_#10140f,0_1px_2px_#10140f] ${
                place.left > 72 ? "right-2 text-right" : "left-2"
              }`}
            >
              {place.name}
            </span>
          </span>
        ))}
        {range.pinLeft != null && range.pinTop != null ? (
          <span
            className="pointer-events-none absolute z-20"
            style={{ left: `${range.pinLeft}%`, top: `${range.pinTop}%` }}
          >
            <span className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-accent" />
            <span
              className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] leading-none text-fg [text-shadow:0_0_4px_#10140f,0_1px_2px_#10140f] ${
                range.pinTop > 88 ? "bottom-3" : "top-3"
              }`}
            >
              {placeName}
            </span>
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          className="flex size-11 items-center justify-center rounded-full border border-line bg-surface text-fg"
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? "Pause radar" : "Play radar"}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <label className="block min-w-0 flex-1 text-xs text-muted">
          {frame?.label ?? "Radar"}
          <input
            className="mt-1 block w-full accent-accent"
            type="range"
            min={0}
            max={Math.max(0, range.frames.length - 1)}
            value={Math.min(index, Math.max(0, range.frames.length - 1))}
            onChange={(event) => {
              setPlaying(false)
              setIndex(Number(event.target.value))
            }}
          />
        </label>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Bureau of Meteorology, {radar.site}. Native {range.km} km picture, {pixel} per pixel.
        {range.pinLeft == null
          ? " This place is outside the ring."
          : " The dot is this place, on the Bureau shoreline."}
        {radar.clutter ? " This close to the dish, the beam is low and the ridge can clutter the echo." : ""}{" "}
        Echoes are rain, not cloud.
      </p>
      <a
        className="mt-2 inline-flex min-h-11 items-center text-sm text-accent"
        href={range.loop}
        target="_blank"
        rel="noreferrer"
      >
        Bureau {range.km} km loop
      </a>
    </div>
  )
}
