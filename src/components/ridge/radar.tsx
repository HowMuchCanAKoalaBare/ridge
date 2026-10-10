import { useEffect, useState } from "react"
import { Pause, Play } from "lucide-react"
import type { RadarFrame } from "@/lib/weather/types"

export function RadarPanel({
  frames,
  pinLeft,
  pinTop,
}: {
  frames: RadarFrame[]
  pinLeft: number
  pinTop: number
}) {
  const [index, setIndex] = useState(Math.max(0, frames.length - 1))
  const [playing, setPlaying] = useState(false)
  const frame = frames[index]

  useEffect(() => {
    if (!playing || frames.length < 2) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce) return
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % frames.length)
    }, 700)
    return () => window.clearInterval(id)
  }, [playing, frames.length])

  if (!frame) {
    return (
      <p className="rounded-xl bg-surface px-4 py-6 text-sm text-muted">
        Radar is quiet or out of reach right now. The Bureau’s Sydney loop is linked below.
      </p>
    )
  }

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-surface">
        <div className="grid h-full grid-cols-3 grid-rows-3">
          {frame.base.map((src) => (
            <img key={src} src={src} alt="" className="h-full w-full object-cover" />
          ))}
        </div>
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
          {frame.radar.map((src) => (
            <img key={src} src={src} alt="" className="h-full w-full object-cover" />
          ))}
        </div>
        <span
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-accent"
          style={{ left: `${pinLeft}%`, top: `${pinTop}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          className="flex size-11 items-center justify-center rounded-full border border-line bg-surface text-fg"
          onClick={() => setPlaying((v) => !v)}
          aria-label={playing ? "Pause radar" : "Play radar"}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <label className="block min-w-0 flex-1 text-xs text-muted">
          {frame.label}
          <input
            className="mt-1 block w-full accent-accent"
            type="range"
            min={0}
            max={frames.length - 1}
            value={index}
            onChange={(event) => {
              setPlaying(false)
              setIndex(Number(event.target.value))
            }}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">
        RainViewer composite over a dark map. The dot is this place. Echoes are rain, not cloud.
      </p>
    </div>
  )
}
