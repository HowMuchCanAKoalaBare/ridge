export type ModelDef = {
  id: string
  label: string
  short: string
  kind: "physics" | "ai"
  role: string
}

/**
 * One raw global dataset per modelling system. No hand weights.
 * Seamless blends and best-match are left out — those are already someone else's merge.
 * A model that returns nothing is skipped for that run, not replaced by a cousin.
 */
export const MODELS: ModelDef[] = [
  { id: "ecmwf_ifs", label: "ECMWF IFS", short: "IFS", kind: "physics", role: "ECMWF · physics · 9 km" },
  { id: "ecmwf_aifs025_single", label: "ECMWF AIFS", short: "AIFS", kind: "ai", role: "ECMWF · AI · 0.25°" },
  { id: "ncep_aigfs025", label: "NOAA AIGFS", short: "AIGFS", kind: "ai", role: "NOAA · AI · 0.25°" },
  { id: "gfs_graphcast025", label: "GraphCast", short: "GC", kind: "ai", role: "GraphCast · AI · 0.25°" },
  { id: "gfs_global", label: "GFS", short: "GFS", kind: "physics", role: "NOAA · physics · 0.25°" },
  { id: "icon_global", label: "ICON", short: "ICON", kind: "physics", role: "DWD · physics · 11 km" },
  { id: "ukmo_global_deterministic_10km", label: "UKMO", short: "UKMO", kind: "physics", role: "Met Office · physics · 10 km" },
  { id: "gem_global", label: "GEM", short: "GEM", kind: "physics", role: "Canada · physics · 15 km" },
  { id: "meteofrance_arpege_world", label: "ARPEGE", short: "ARP", kind: "physics", role: "Météo-France · physics · 25 km" },
  { id: "jma_gsm", label: "JMA", short: "JMA", kind: "physics", role: "Japan · physics · 20 km" },
  { id: "bom_access_global", label: "ACCESS-G", short: "ACC", kind: "physics", role: "Bureau · physics · 15 km" },
  { id: "cma_grapes_global", label: "GRAPES", short: "CMA", kind: "physics", role: "China · physics · 15 km" },
  { id: "kma_gdps", label: "KMA GDPS", short: "KMA", kind: "physics", role: "Korea · physics · 12 km" },
]

export const MODEL_PARAM = MODELS.map((m) => m.id).join(",")

/** Global ensembles. Each system later gets one vote, regardless of member count. */
export const ENSEMBLE_PARAM = [
  "ecmwf_ifs025",
  "ecmwf_aifs025",
  "gfs025",
  "icon_global",
  "gem_global",
  "bom_access_global_ensemble",
].join(",")

export const ENSEMBLE_LABEL: Record<string, string> = {
  ecmwf_ifs025_ensemble: "IFS",
  ecmwf_aifs025_ensemble: "AIFS",
  ncep_gefs025: "GEFS",
  icon_global_eps: "ICON",
  gem_global_ensemble: "GEM",
  bom_access_global_ensemble: "ACCESS-GE",
  primary: "Ensemble",
}
