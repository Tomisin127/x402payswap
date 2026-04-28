import { NextResponse } from "next/server"
import { recordPaymentOnce, sha256Hex } from "@/lib/redis"

/**
 * Paid Route — $0.001
 * Live weather for a given city. Uses Open-Meteo (free, no API key) for both
 * geocoding and forecast so the response reflects real conditions at request time.
 */

type GeoResult = {
  results?: Array<{
    name: string
    country: string
    latitude: number
    longitude: number
    timezone: string
    admin1?: string
  }>
}

type ForecastResult = {
  current?: {
    time: string
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    wind_speed_10m: number
    wind_direction_10m: number
    weather_code: number
    is_day: number
  }
}

const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Heavy rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe thunderstorm with hail",
}

export async function GET(request: Request) {
  const paymentHeader = request.headers.get("x-payment") || request.headers.get("x-payment-sw")
  if (paymentHeader) {
    const key = await sha256Hex(paymentHeader)
    const firstUse = await recordPaymentOnce(key)
    if (!firstUse) {
      return NextResponse.json(
        { error: "Replay detected", message: "This payment proof was already used." },
        { status: 409 },
      )
    }
  }

  const url = new URL(request.url)
  const city = (url.searchParams.get("city") || "").trim().slice(0, 80)
  if (!city) {
    return NextResponse.json(
      { error: "Missing city", message: "Pass ?city=Tokyo to fetch live weather." },
      { status: 400 },
    )
  }

  try {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search")
    geoUrl.searchParams.set("name", city)
    geoUrl.searchParams.set("count", "1")
    geoUrl.searchParams.set("language", "en")
    geoUrl.searchParams.set("format", "json")

    const geoRes = await fetch(geoUrl, { cache: "no-store" })
    if (!geoRes.ok) throw new Error(`Geocoder error ${geoRes.status}`)
    const geo = (await geoRes.json()) as GeoResult
    const place = geo.results?.[0]
    if (!place) {
      return NextResponse.json(
        { error: "Location not found", message: `Couldn't locate "${city}".` },
        { status: 404 },
      )
    }

    const fxUrl = new URL("https://api.open-meteo.com/v1/forecast")
    fxUrl.searchParams.set("latitude", String(place.latitude))
    fxUrl.searchParams.set("longitude", String(place.longitude))
    fxUrl.searchParams.set("timezone", place.timezone || "auto")
    fxUrl.searchParams.set(
      "current",
      "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day",
    )

    const fxRes = await fetch(fxUrl, { cache: "no-store" })
    if (!fxRes.ok) throw new Error(`Forecast error ${fxRes.status}`)
    const fx = (await fxRes.json()) as ForecastResult
    const c = fx.current
    if (!c) throw new Error("Forecast missing current block")

    const conditions = WEATHER_CODES[c.weather_code] ?? "Unknown"
    const headline = `${conditions}, ${Math.round(c.temperature_2m)}°C in ${place.name}`

    const response = NextResponse.json({
      unlockedAt: new Date().toISOString(),
      location: {
        city: place.name,
        region: place.admin1 ?? null,
        country: place.country,
        latitude: place.latitude,
        longitude: place.longitude,
        timezone: place.timezone,
      },
      headline,
      current: {
        observedAt: c.time,
        temperatureC: c.temperature_2m,
        feelsLikeC: c.apparent_temperature,
        humidityPct: c.relative_humidity_2m,
        windSpeedKmh: c.wind_speed_10m,
        windDirectionDeg: c.wind_direction_10m,
        conditions,
        weatherCode: c.weather_code,
        isDay: !!c.is_day,
      },
      provider: "open-meteo.com",
      note: "Live weather, settled on Base for 0.001 USDC.",
    })

    const settlementResponse = request.headers.get("x-payment-response")
    if (settlementResponse) response.headers.set("x-payment-response", settlementResponse)
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Weather lookup failed"
    return NextResponse.json({ error: "Upstream failure", message }, { status: 502 })
  }
}
