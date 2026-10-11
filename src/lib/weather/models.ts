export type ModelDef = {
  id: string
  label: string
  short: string
  centre: string
  kind: "physics" | "ai"
  role: string
}

/**
 * One raw global dataset per modelling system. No hand weights.
 * Seamless blends and best-match are left out — those are already someone else's merge.
 * A model that returns nothing is skipped for that run, not replaced by a cousin.
 * `centre` groups runs that are not independent. The all-model median stays one vote
 * per run. A second number is one vote per centre.
 */
export const MODELS: ModelDef[] = [
  { id: "ecmwf_ifs", label: "ECMWF IFS", short: "IFS", centre: "ECMWF", kind: "physics", role: "ECMWF · physics · 9 km" },
  { id: "ecmwf_aifs025_single", label: "ECMWF AIFS", short: "AIFS", centre: "ECMWF", kind: "ai", role: "ECMWF · AI · 0.25°" },
  { id: "ncep_aigfs025", label: "NOAA AIGFS", short: "AIGFS", centre: "NOAA", kind: "ai", role: "NOAA · AI · 0.25°" },
  { id: "gfs_graphcast025", label: "GraphCast", short: "GC", centre: "NOAA", kind: "ai", role: "GraphCast · AI · 0.25°" },
  { id: "gfs_global", label: "GFS", short: "GFS", centre: "NOAA", kind: "physics", role: "NOAA · physics · 0.25°" },
  { id: "icon_global", label: "ICON", short: "ICON", centre: "DWD", kind: "physics", role: "DWD · physics · 11 km" },
  { id: "ukmo_global_deterministic_10km", label: "UKMO", short: "UKMO", centre: "UKMO", kind: "physics", role: "Met Office · physics · 10 km" },
  { id: "gem_global", label: "GEM", short: "GEM", centre: "ECCC", kind: "physics", role: "Canada · physics · 15 km" },
  { id: "meteofrance_arpege_world", label: "ARPEGE", short: "ARP", centre: "Météo-France", kind: "physics", role: "Météo-France · physics · 25 km" },
  { id: "jma_gsm", label: "JMA", short: "JMA", centre: "JMA", kind: "physics", role: "Japan · physics · 20 km" },
  { id: "bom_access_global", label: "ACCESS-G", short: "ACC", centre: "Bureau", kind: "physics", role: "Bureau · physics · 15 km" },
  { id: "cma_grapes_global", label: "GRAPES", short: "CMA", centre: "CMA", kind: "physics", role: "China · physics · 15 km" },
  { id: "kma_gdps", label: "KMA GDPS", short: "KMA", centre: "KMA", kind: "physics", role: "Korea · physics · 12 km" },
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
