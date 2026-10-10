export type Place = {
  name: string
  latitude: number
  longitude: number
  elevation: number
  admin?: string
}

export const BEROWRA: Place = {
  name: "Berowra Heights",
  latitude: -33.61211,
  longitude: 151.13754,
  elevation: 218,
  admin: "Hornsby · 2082",
}

export const RICHMOND: Place = {
  name: "Richmond",
  latitude: -33.5985,
  longitude: 150.7514,
  elevation: 19,
  admin: "Cumberland plain",
}

export const SYDNEY: Place = {
  name: "Sydney",
  latitude: -33.8688,
  longitude: 151.2093,
  elevation: 42,
  admin: "Harbour",
}

export const PRESETS: Place[] = [
  BEROWRA,
  { name: "Hornsby", latitude: -33.7046, longitude: 151.0986, elevation: 187, admin: "North shore" },
  { name: "Brooklyn", latitude: -33.547, longitude: 151.226, elevation: 6, admin: "Hawkesbury" },
  { name: "Galston", latitude: -33.652, longitude: 151.047, elevation: 176, admin: "Hills" },
  RICHMOND,
  SYDNEY,
  { name: "Gosford", latitude: -33.425, longitude: 151.342, elevation: 20, admin: "Central Coast" },
  { name: "Newcastle", latitude: -32.9283, longitude: 151.7817, elevation: 12, admin: "Hunter" },
  { name: "Wollongong", latitude: -34.4278, longitude: 150.8931, elevation: 20, admin: "Illawarra" },
  { name: "Katoomba", latitude: -33.7139, longitude: 150.3114, elevation: 1017, admin: "Blue Mountains" },
]

export function near(a: Place, b: Place, km = 12): boolean {
  const r = 6371
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180
  const la1 = (a.latitude * Math.PI) / 180
  const la2 = (b.latitude * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h))) < km
}

export function trioFor(selected: Place): Place[] {
  const extras = [BEROWRA, RICHMOND, SYDNEY].filter((p) => !near(p, selected))
  return [selected, ...extras].slice(0, 3)
}

export function onTheRidge(place: Place): boolean {
  return near(place, BEROWRA, 18)
}
