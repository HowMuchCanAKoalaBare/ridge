import { getSql } from "@/lib/db"
import type { ForecastResult } from "./types"

export type ScoreHit = {
  hourKey: string
  median: number | null
  obs: number | null
}

function num(value: unknown): number | null {
  if (value == null) return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export async function cachedForecast(
  key: string,
  ttlMs: number,
): Promise<{ value: ForecastResult; storedAt: number } | null> {
  try {
    const sql = await getSql()
    const rows = await sql<{ payload: string; stored_at: string | Date }>`
      select payload, stored_at from ridge_cache where cache_key = ${key}
    `
    const row = rows[0]
    if (!row) return null
    const at = new Date(row.stored_at).getTime()
    if (!Number.isFinite(at) || Date.now() - at > ttlMs) return null
    const parsed = JSON.parse(row.payload) as ForecastResult
    if (!parsed || parsed.ok !== true || !Array.isArray(parsed.forecast.observations)) return null
    if (!Array.isArray(parsed.forecast.radar?.ranges)) return null
    return { value: parsed, storedAt: at }
  } catch {
    return null
  }
}

export async function storeForecast(key: string, value: ForecastResult): Promise<void> {
  try {
    const sql = await getSql()
    const payload = JSON.stringify(value)
    await sql`
      insert into ridge_cache (cache_key, payload, stored_at)
      values (${key}, ${payload}, now())
      on conflict (cache_key) do update set payload = excluded.payload, stored_at = now()
    `
  } catch {
    // A cache miss next time is fine. The forecast itself already succeeded.
  }
}

export async function scoreHours(input: {
  placeKey: string
  nowHour: string
  station: string | null
  obs: Record<string, number> | null
  hours: Array<{ hourKey: string; median: number | null; centre: number | null }>
}): Promise<ScoreHit[] | null> {
  try {
    const sql = await getSql()
    for (const hour of input.hours) {
      if (hour.median == null || hour.hourKey < input.nowHour) continue
      await sql`
        insert into ridge_score (place_key, hour_key, median_c, centre_c)
        values (${input.placeKey}, ${hour.hourKey}, ${hour.median}, ${hour.centre})
        on conflict (place_key, hour_key) do nothing
      `
    }
    if (input.obs && input.station) {
      for (const [hourKey, temp] of Object.entries(input.obs)) {
        if (hourKey > input.nowHour) continue
        await sql`
          update ridge_score
          set obs_c = ${temp}, obs_station = ${input.station}, obs_at = now()
          where place_key = ${input.placeKey} and hour_key = ${hourKey} and obs_c is null
        `
      }
    }
    const cutoff = input.nowHour.slice(0, 10)
    const old = new Date(`${cutoff}T12:00:00Z`)
    old.setUTCDate(old.getUTCDate() - 14)
    const oldKey = old.toISOString().slice(0, 13) + ":00"
    await sql`delete from ridge_score where place_key = ${input.placeKey} and hour_key < ${oldKey}`
    const rows = await sql<{ hour_key: string; median_c: unknown; obs_c: unknown }>`
      select hour_key, median_c, obs_c
      from ridge_score
      where place_key = ${input.placeKey} and obs_c is not null and hour_key <= ${input.nowHour}
      order by hour_key desc
      limit 12
    `
    return rows.map((row) => ({
      hourKey: row.hour_key,
      median: num(row.median_c),
      obs: num(row.obs_c),
    }))
  } catch {
    return null
  }
}
