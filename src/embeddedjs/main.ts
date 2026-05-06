import Poco from "commodetto/Poco";
import Battery from "embedded:sensor/Battery";
import Message from "pebble/message";

// ── Renderer ─────────────────────────────────────────────────────────────────

const render = new Poco(screen);

// ── Colors ───────────────────────────────────────────────────────────────────

const Colors = {
  black:  render.makeColor(0,   0,   0),
  white:  render.makeColor(255, 255, 255),
  gray:   render.makeColor(160, 160, 160),
  yellow: render.makeColor(255, 220, 0),
  blue:   render.makeColor(100, 149, 237),
  red:    render.makeColor(220, 60,  60),
} as const;

// ── Fonts ────────────────────────────────────────────────────────────────────

const Fonts = {
  time:    new render.Font("Roboto-Bold",    49),
  date:    new render.Font("Gothic-Bold",    18),
  city:    new render.Font("Gothic-Regular", 18),
  weather: new render.Font("Gothic-Bold",    24),
  small:   new render.Font("Gothic-Regular", 14),
} as const;

// ── Layout (emery 200×228) ────────────────────────────────────────────────────

const Layout = {
  W:          200,
  H:          228,
  MARGIN:     4,
  ROW_STATUS:  4,   // height ~18, y-center at 13
  ROW_TIME:    28,  // height ~52
  ROW_DATE:    84,  // height ~22
  ROW_CITY:    110, // height ~20
  ROW_WEATHER: 134, // height ~24
  ROW_STEPS:   162, // height ~20, bottom at 182
  ROW_HR:      182, // height ~20, bottom at 202
} as const;

// ── Condition enum ────────────────────────────────────────────────────────────

const enum WeatherCondition {
  Clear          = 0,
  FewClouds      = 1,
  ScatteredClouds = 2,
  BrokenClouds   = 3,
  ShowerRain     = 4,
  Rain           = 5,
  Thunderstorm   = 6,
  Snow           = 7,
  Mist           = 8,
  Unknown        = 255,
}

// ── State ────────────────────────────────────────────────────────────────────

const state = {
  date:               new Date(),
  tempF:              null as number | null,
  condition:          WeatherCondition.Unknown,
  isDay:              1,
  cityName:           "",
  battery:            null as { percent: number; charging: boolean; plugged: boolean } | null,
  bluetoothConnected: watch.connected.app,
  steps:              null as number | null,
  distanceTenthsMiles: null as number | null,
  heartRateBpm:       null as number | null,
};

// ── AppMessage ────────────────────────────────────────────────────────────────

let weatherRequested = false;

// Declared as let so closures can reference it after creation.
// eslint-disable-next-line prefer-const
let appMsg: Message;
appMsg = new Message({
  keys: ["WEATHER_REQUEST", "WEATHER_TEMP_F", "WEATHER_CONDITION", "WEATHER_IS_DAY", "CITY_NAME", "HEALTH_STEPS", "HEALTH_DISTANCE_M", "HEALTH_HR_BPM"],
  onReadable() {
    const map = appMsg.read();
    if (map.has("WEATHER_TEMP_F"))    state.tempF     = map.get("WEATHER_TEMP_F")    as number;
    if (map.has("WEATHER_CONDITION")) state.condition = map.get("WEATHER_CONDITION") as WeatherCondition;
    if (map.has("WEATHER_IS_DAY"))    state.isDay     = map.get("WEATHER_IS_DAY")    as number;
    if (map.has("CITY_NAME"))         state.cityName  = map.get("CITY_NAME")         as string;
    if (map.has("HEALTH_STEPS"))      state.steps     = map.get("HEALTH_STEPS")      as number;
    if (map.has("HEALTH_DISTANCE_M")) {
      const meters = map.get("HEALTH_DISTANCE_M") as number;
      state.distanceTenthsMiles = Math.floor(meters * 10 / 1609);
    }
    if (map.has("HEALTH_HR_BPM"))    state.heartRateBpm = map.get("HEALTH_HR_BPM") as number;
    draw();
  },
  onWritable() {
    if (weatherRequested) return;
    weatherRequested = true;
    appMsg.write(new Map([["WEATHER_REQUEST", 1]]));
  },
});

// ── Battery ───────────────────────────────────────────────────────────────────

const batteryMonitor = new Battery({
  onSample() {
    state.battery = batteryMonitor.sample();
    draw();
  },
});
state.battery = batteryMonitor.sample();

// ── Watch event listeners ─────────────────────────────────────────────────────

watch.addEventListener("connected", () => {
  state.bluetoothConnected = watch.connected.app;
  weatherRequested = false;
  draw();
});

watch.addEventListener("minutechange", ({ date }: { date: Date }) => {
  state.date = date;
  draw();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function centerX(textWidth: number): number {
  return Math.round((Layout.W - textWidth) / 2);
}

function padTwo(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS   = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul","Aug","Sep","Oct","Nov","Dec"];

// Detect 12h vs 24h preference from locale
const use12h: boolean = (() => {
  try {
    const fmt = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
    return (fmt.resolvedOptions() as { hour12?: boolean }).hour12 ?? false;
  } catch (_) {
    return false;
  }
})();

function formatTime(d: Date): string {
  if (use12h) {
    const h = d.getHours() % 12 || 12;
    return `${h}:${padTwo(d.getMinutes())}`;
  }
  return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}`;
}

function formatDate(d: Date): string {
  const day = d.getDate();
  return `${WEEKDAYS[d.getDay()]} ${day} ${MONTHS[d.getMonth()]}`;
}

function formatSteps(): string {
  if (state.steps === null) return "-- steps  -- mi";
  const s = state.steps.toLocaleString();
  const tenths = state.distanceTenthsMiles;
  const mi = tenths !== null ? `${Math.floor(tenths / 10)}.${tenths % 10}` : "--";
  return `${s} steps  ${mi} mi`;
}

// ── Sub-draw functions ────────────────────────────────────────────────────────

function drawStatusBar(): void {
  const cy = Layout.ROW_STATUS + 9;

  // Bluetooth indicator — left side
  const cx = Layout.MARGIN + 8;
  if (state.bluetoothConnected) {
    render.drawCircle(Colors.blue, cx, cy, 8, 0, 360);
  } else {
    render.frameRoundRect(cx - 8, cy - 8, cx + 8, cy + 8, Colors.gray, 8);
  }

  // Battery — right side
  const batText = state.battery !== null ? `${state.battery.percent}%` : "??";
  const batW = render.getTextWidth(batText, Fonts.small);
  render.drawText(batText, Fonts.small, Colors.white, Layout.W - Layout.MARGIN - batW, Layout.ROW_STATUS, batW);
}

function drawTime(): void {
  const text = formatTime(state.date);
  const tw = render.getTextWidth(text, Fonts.time);
  render.drawText(text, Fonts.time, Colors.white, centerX(tw), Layout.ROW_TIME, tw);
}

function drawDate(): void {
  const text = formatDate(state.date);
  const tw = render.getTextWidth(text, Fonts.date);
  render.drawText(text, Fonts.date, Colors.white, centerX(tw), Layout.ROW_DATE, tw);
}

function drawCity(): void {
  const text = state.cityName || "...";
  const tw = render.getTextWidth(text, Fonts.city);
  render.drawText(text, Fonts.city, Colors.gray, centerX(tw), Layout.ROW_CITY, tw);
}

function drawConditionIcon(condition: WeatherCondition, isDay: number): void {
  const cx = 33;
  const cy = Layout.ROW_WEATHER + 12;

  switch (condition) {
    case WeatherCondition.Clear:
      if (isDay === 1) {
        render.drawCircle(Colors.yellow, cx, cy, 10, 0, 360);
      } else {
        render.drawCircle(Colors.white, cx, cy, 10, 0, 360);
        render.drawCircle(Colors.black, cx + 5, cy - 3, 8, 0, 360);
      }
      break;
    case WeatherCondition.FewClouds:
    case WeatherCondition.ScatteredClouds:
    case WeatherCondition.BrokenClouds:
      render.drawCircle(Colors.gray,  cx,     cy,     10, 0, 360);
      render.drawCircle(Colors.white, cx + 6, cy - 4,  6, 0, 360);
      break;
    case WeatherCondition.ShowerRain:
    case WeatherCondition.Rain:
      render.drawCircle(Colors.gray, cx, cy - 4, 9, 0, 360);
      render.drawLine(cx - 6, cy + 6,  cx - 9,  cy + 14, Colors.gray, 1);
      render.drawLine(cx,     cy + 6,  cx - 3,  cy + 14, Colors.gray, 1);
      render.drawLine(cx + 6, cy + 6,  cx + 3,  cy + 14, Colors.gray, 1);
      break;
    case WeatherCondition.Thunderstorm:
      render.drawCircle(Colors.gray, cx, cy - 4, 9, 0, 360);
      render.drawLine(cx + 2, cy + 4,  cx - 2, cy + 10, Colors.yellow, 2);
      render.drawLine(cx - 2, cy + 10, cx + 2, cy + 16, Colors.yellow, 2);
      break;
    case WeatherCondition.Snow:
      render.drawCircle(Colors.gray,  cx, cy - 4, 9, 0, 360);
      render.drawCircle(Colors.white, cx - 6, cy + 10, 2, 0, 360);
      render.drawCircle(Colors.white, cx,     cy + 10, 2, 0, 360);
      render.drawCircle(Colors.white, cx + 6, cy + 10, 2, 0, 360);
      break;
    case WeatherCondition.Mist:
      render.fillRectangle(Colors.gray, cx - 12, cy - 6,  24, 3);
      render.fillRectangle(Colors.gray, cx - 10, cy + 1,  20, 3);
      render.fillRectangle(Colors.gray, cx - 12, cy + 8,  24, 3);
      break;
    default: {
      const qw = render.getTextWidth("?", Fonts.weather);
      render.drawText("?", Fonts.weather, Colors.gray, cx - Math.round(qw / 2), cy - Math.round(Fonts.weather.height / 2), qw);
      break;
    }
  }
}

function drawWeather(): void {
  drawConditionIcon(state.condition, state.isDay);

  const tempText = state.tempF !== null ? `${Math.round(state.tempF)}\u00b0F` : "--\u00b0F";
  const tempX = 70;
  const tempW = Layout.W - tempX - Layout.MARGIN;
  render.drawText(tempText, Fonts.weather, Colors.white, tempX, Layout.ROW_WEATHER, tempW);
}

function drawSteps(): void {
  const text = formatSteps();
  const tw = render.getTextWidth(text, Fonts.small);
  render.drawText(text, Fonts.small, Colors.gray, centerX(tw), Layout.ROW_STEPS, tw);
}

function drawHeartRate(): void {
  const bpm = state.heartRateBpm;
  const text = bpm !== null && bpm > 0 ? `${bpm} bpm` : "-- bpm";
  const tw = render.getTextWidth(text, Fonts.small);
  render.drawText(text, Fonts.small, Colors.red, centerX(tw), Layout.ROW_HR, tw);
}

// ── Main draw ─────────────────────────────────────────────────────────────────

function draw(): void {
  render.begin();
  render.fillRectangle(Colors.black, 0, 0, Layout.W, Layout.H);
  drawStatusBar();
  drawTime();
  drawDate();
  drawCity();
  drawWeather();
  drawSteps();
  drawHeartRate();
  render.end();
}

// ── Initial render ────────────────────────────────────────────────────────────

draw();
