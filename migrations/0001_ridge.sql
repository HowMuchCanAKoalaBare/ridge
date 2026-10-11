-- Forecast memory for Ridge. The cache survives a cold start. The score
-- table keeps the first median issued for each hour and the station temperature
-- once that hour has been observed.

create table if not exists ridge_cache (
  cache_key text primary key,
  payload text not null,
  stored_at timestamptz not null default now()
);

create table if not exists ridge_score (
  place_key text not null,
  hour_key text not null,
  median_c double precision,
  centre_c double precision,
  issued_at timestamptz not null default now(),
  obs_c double precision,
  obs_station text,
  obs_at timestamptz,
  primary key (place_key, hour_key)
);
