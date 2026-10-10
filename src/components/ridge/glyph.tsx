import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Moon,
  Snowflake,
  Sun,
} from "lucide-react"

export function WeatherGlyph({
  code,
  time,
  className = "size-5",
}: {
  code: number | null
  time?: string
  className?: string
}) {
  const hour = time ? Number(time.slice(11, 13)) : 12
  const night = hour < 6 || hour >= 19
  if (code == null) return <CloudSun className={className} aria-hidden="true" />
  if (code === 0) {
    return night ? (
      <Moon className={className} aria-hidden="true" />
    ) : (
      <Sun className={className} aria-hidden="true" />
    )
  }
  if (code <= 2) return <CloudSun className={className} aria-hidden="true" />
  if (code === 3) return <Cloud className={className} aria-hidden="true" />
  if (code === 45 || code === 48) return <CloudFog className={className} aria-hidden="true" />
  if (code <= 57) return <CloudDrizzle className={className} aria-hidden="true" />
  if (code <= 67) return <CloudRain className={className} aria-hidden="true" />
  if (code <= 77 || (code >= 85 && code <= 86)) return <Snowflake className={className} aria-hidden="true" />
  if (code <= 82) return <CloudRain className={className} aria-hidden="true" />
  if (code >= 95) return <CloudLightning className={className} aria-hidden="true" />
  return <Cloud className={className} aria-hidden="true" />
}
