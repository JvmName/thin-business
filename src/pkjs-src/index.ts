// ─── Types ────────────────────────────────────────────────────────────────────

const enum WeatherCondition {
  Clear           = 0,
  FewClouds       = 1,
  ScatteredClouds = 2,
  BrokenClouds    = 3,
  ShowerRain      = 4,
  Rain            = 5,
  Thunderstorm    = 6,
  Snow            = 7,
  Mist            = 8,
  Unknown         = 255,
}

interface WeatherData {
  tempF: number;
  condition: WeatherCondition;
  isDay: number;
}

interface WeatherProvider {
  fetch(lat: number, lon: number): Promise<WeatherData>;
}

interface WeatherCache {
  tempF: number;
  condition: WeatherCondition;
  isDay: number;
  cityName: string;
  fetchedAt: number;
}


// ─── WMO code → condition enum ────────────────────────────────────────────────

function wmoToCondition(wmo: number): WeatherCondition {
  if (wmo === 0) return WeatherCondition.Clear;
  if (wmo === 1) return WeatherCondition.FewClouds;
  if (wmo === 2) return WeatherCondition.ScatteredClouds;
  if (wmo === 3) return WeatherCondition.BrokenClouds;
  if (wmo === 45 || wmo === 48) return WeatherCondition.Mist;
  if (wmo >= 51 && wmo <= 57) return WeatherCondition.ShowerRain;
  if (wmo >= 61 && wmo <= 67) return WeatherCondition.Rain;
  if ((wmo >= 71 && wmo <= 77) || (wmo >= 85 && wmo <= 86)) return WeatherCondition.Snow;
  if (wmo >= 80 && wmo <= 82) return WeatherCondition.ShowerRain;
  if (wmo === 95 || wmo === 96 || wmo === 99) return WeatherCondition.Thunderstorm;
  return WeatherCondition.Unknown;
}

// ─── Open-Meteo provider ──────────────────────────────────────────────────────

const OpenMeteoProvider: WeatherProvider = {
  async fetch(lat: number, lon: number): Promise<WeatherData> {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: "temperature_2m,weather_code,is_day",
    }).toString();

    const response = await fetch(url.toString());
    const data = await response.json();
    const current = data.current;
    const tempC: number = current.temperature_2m;
    return {
      tempF: Math.round(tempC * 9 / 5 + 32),
      condition: wmoToCondition(current.weather_code),
      isDay: current.is_day,
    };
  },
};

// ─── Provider swap point ──────────────────────────────────────────────────────

const activeProvider: WeatherProvider = OpenMeteoProvider;

// ─── Nominatim reverse geocoding ──────────────────────────────────────────────

async function fetchCityName(lat: number, lon: number): Promise<string> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.search = new URLSearchParams({ format: "json", lat: String(lat), lon: String(lon) }).toString();

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "thin-business-watchface" },
  });
  const data = await response.json();
  const addr = data.address || {};
  const city: string = addr.city || addr.town || addr.village || addr.county || "Unknown";
  return city.substring(0, 32);
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

function loadCache(): WeatherCache | null {
  try {
    const raw = localStorage.getItem("weather-cache");
    if (!raw) return null;
    return JSON.parse(raw) as WeatherCache;
  } catch (_e) {
    return null;
  }
}

function saveCache(cache: WeatherCache): void {
  try {
    localStorage.setItem("weather-cache", JSON.stringify(cache));
  } catch (_e) {
    // storage unavailable — non-fatal
  }
}

// ─── sendAppMessage wrapper ───────────────────────────────────────────────────
function sendWeather(
  tempF: number,
  condition: WeatherCondition,
  isDay: number,
  cityName: string
): void {
  Pebble.sendAppMessage(
    {
      WEATHER_TEMP_F: tempF,
      WEATHER_CONDITION: condition,
      WEATHER_IS_DAY: isDay,
      CITY_NAME: cityName,
    },
    (_e) => {
      console.log("sendAppMessage success");
    },
    (e) => {
      console.error("sendAppMessage error: " + JSON.stringify(e));
    }
  );
}

// ─── Fresh fetch ──────────────────────────────────────────────────────────────

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 15000,
      maximumAge: 300000,
      enableHighAccuracy: false,
    });
  });
}

async function doFetch(): Promise<void> {
  let pos: GeolocationPosition;
  try {
    pos = await getPosition();
  } catch (err: any) {
    console.error("GPS error: " + err.message);
    const cached = loadCache();
    if (cached) {
      sendWeather(cached.tempF, cached.condition, cached.isDay, "No GPS");
    } else {
      sendWeather(0, WeatherCondition.Unknown, 1, "No GPS");
    }
    return;
  }

  const { latitude: lat, longitude: lon } = pos.coords;
  try {
    const [weather, cityName] = await Promise.all([
      activeProvider.fetch(lat, lon),
      fetchCityName(lat, lon),
    ]);
    sendWeather(weather.tempF, weather.condition, weather.isDay, cityName);
    saveCache({ tempF: weather.tempF, condition: weather.condition, isDay: weather.isDay, cityName, fetchedAt: Date.now() });
  } catch (err) {
    console.error("Weather fetch failed: " + err);
  }
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

Pebble.addEventListener("ready", (_e) => {
  console.log("PebbleKit JS ready.");

  // Push cached data immediately while fresh fetch is in flight
  const cached = loadCache();
  if (cached) {
    sendWeather(cached.tempF, cached.condition, cached.isDay, cached.cityName);
  }

  doFetch();
});

Pebble.addEventListener("appmessage", (e) => {
  // Key 10000 = WEATHER_REQUEST; watch sends 1 to request a refresh
  if (e.payload["WEATHER_REQUEST"] === 1) {
    doFetch();
  }
});
