import type { RadarRange, RadarView } from "./types"

const SITE = { name: "Sydney (Terrey Hills)", lat: -33.701, lon: 151.21 }
const KM_PER_DEG = 111.11
const LOOP_HOST = "https://reg.bom.gov.au"
const ASSET_HOST = "https://www.bom.gov.au"

const PRODUCTS = [
  { km: 64, code: "IDR714" },
  { km: 128, code: "IDR713" },
] as const

function kmBetween(lat: number, lon: number): number {
  const north = (lat - SITE.lat) * KM_PER_DEG
  const east = (lon - SITE.lon) * KM_PER_DEG * Math.cos((SITE.lat * Math.PI) / 180)
  return Math.hypot(north, east)
}

function pinFor(lat: number, lon: number, km: number): { left: number; top: number } | null {
  const north = (lat - SITE.lat) * KM_PER_DEG
  const east = (lon - SITE.lon) * KM_PER_DEG * Math.cos((SITE.lat * Math.PI) / 180)
  const scale = km / 256
  const x = 256 + east / scale
  const y = 256 - north / scale
  if ((x - 256) ** 2 + (y - 256) ** 2 > 256 ** 2) return null
  return { left: (x / 512) * 100, top: (y / 512) * 100 }
}

function frameLabel(path: string): string {
  const match = path.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\.png$/)
  if (!match) return "Radar"
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00Z`
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso))
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: {
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0",
    },
  })
  if (!res.ok) throw new Error(`radar ${res.status}`)
  return res.text()
}

async function loadRange(
  product: (typeof PRODUCTS)[number],
  lat: number,
  lon: number,
): Promise<RadarRange | null> {
  const html = await fetchText(`${LOOP_HOST}/products/${product.code}.loop.shtml`)
  const frames = [...html.matchAll(/theImageNames\[\d+\]\s*=\s*"(\/radar\/IDR\d+\.T\.\d{12}\.png)"/g)].map(
    (match) => ({
      label: frameLabel(match[1]),
      src: `${ASSET_HOST}${match[1]}`,
    }),
  )
  if (!frames.length) return null
  const pin = pinFor(lat, lon, product.km)
  return {
    km: product.km,
    code: product.code,
    pinLeft: pin?.left ?? null,
    pinTop: pin?.top ?? null,
    map: `${ASSET_HOST}/products/radar_transparencies/${product.code}.background.png`,
    rings: `${ASSET_HOST}/products/radar_transparencies/${product.code}.range.png`,
    loop: `${LOOP_HOST}/products/${product.code}.loop.shtml`,
    frames,
  }
}

export async function loadRadar(lat: number, lon: number): Promise<RadarView> {
  const loaded = await Promise.all(PRODUCTS.map((product) => loadRange(product, lat, lon).catch(() => null)))
  return {
    site: SITE.name,
    clutter: kmBetween(lat, lon) < 18,
    ranges: loaded.filter((range): range is RadarRange => range != null),
  }
}
