import { createFileRoute } from "@tanstack/react-router"
import { Desk } from "@/components/ridge/desk"
import { getForecast } from "@/lib/weather/api"
import { BEROWRA } from "@/lib/weather/places"

export const Route = createFileRoute("/")({
  loader: () => getForecast({ data: BEROWRA }),
  staleTime: 8 * 60 * 1000,
  component: Home,
})

function Home() {
  const result = Route.useLoaderData()
  if (!result.ok) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4">
        <p className="text-xs tracking-widest text-accent">RIDGE</p>
        <h1 className="mt-2 font-serif text-4xl text-fg">Forecast unavailable</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{result.error}</p>
        <button
          type="button"
          className="mt-6 h-11 rounded-full bg-accent px-4 text-sm text-accent-ink"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </main>
    )
  }
  return <Desk initial={result.forecast} place={BEROWRA} />
}
