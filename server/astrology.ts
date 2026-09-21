/**
 * Lightweight astronomical chart calculation for StarLoveLab.
 *
 * This intentionally uses a self-contained low-precision ephemeris rather than
 * pretending the LLM can calculate a birth chart. Planetary positions are
 * suitable for a consumer astrology product (roughly degree-level accuracy),
 * while the ascendant uses geocoded latitude/longitude and the local timezone.
 */

import { resolveBirthMoment } from "../shared/birthplaces";

export type ChartPoint = {
  sign: string;
  degree: number;
  absoluteLongitude: number;
  retrograde?: boolean;
};

export type BirthChart = {
  calculatedAt: string;
  birth: { localDateTime: string; utcDateTime: string; place: string; latitude: number; longitude: number; timeZone: string };
  planets: Record<string, ChartPoint>;
  ascendant?: ChartPoint;
  houses: Array<{ house: number; sign: string }>;
  note?: string;
};

const SIGNS = ["牡羊座", "金牛座", "雙子座", "巨蟹座", "獅子座", "處女座", "天秤座", "天蠍座", "射手座", "摩羯座", "水瓶座", "雙魚座"];
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const mod360 = (x: number) => ((x % 360) + 360) % 360;
const sind = (x: number) => Math.sin(x * RAD);
const cosd = (x: number) => Math.cos(x * RAD);
const tand = (x: number) => Math.tan(x * RAD);
const asind = (x: number) => Math.asin(x) * DEG;
const atand = (x: number) => Math.atan(x) * DEG;
const atan2d = (y: number, x: number) => Math.atan2(y, x) * DEG;

function signPoint(longitude: number, retrograde = false): ChartPoint {
  const absoluteLongitude = mod360(longitude);
  const signIndex = Math.floor(absoluteLongitude / 30);
  return { sign: SIGNS[signIndex], degree: absoluteLongitude - signIndex * 30, absoluteLongitude, retrograde };
}

function julianDay(date: Date) { return date.getTime() / 86400000 + 2440587.5; }

// Paul Schlyter-style low precision heliocentric orbital elements.
function orbitalElements(T: number) {
  // JPL/NASA-style mean orbital elements at J2000 with century rates.
  const e = (a0: number, a1: number, e0: number, e1: number, I0: number, I1: number, L0: number, L1: number, p0: number, p1: number, n0: number, n1: number) => ({
    a: a0 + a1 * T, e: e0 + e1 * T, I: I0 + I1 * T, L: L0 + L1 * T, p: p0 + p1 * T, node: n0 + n1 * T,
  });
  return {
    Mercury: e(0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.25032350, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081),
    Venus: e(0.72333566, 0.00000390, 0.00677672, -0.00004107, 3.39467605, -0.00078890, 181.97909950, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418),
    Earth: e(1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0),
    Mars: e(1.52371034, 0.00001847, 0.09339410, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343),
    Jupiter: e(5.20288700, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106),
    Saturn: e(9.53667594, -0.00125060, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794),
    Uranus: e(19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939, 313.23810451, 428.48202785, 170.95427630, 0.40805281, 74.01692503, 0.04240589),
    Neptune: e(30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372, -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664),
  };
}
function heliocentric(elements: ReturnType<typeof orbitalElements>[keyof ReturnType<typeof orbitalElements>]) {
  const N = elements.node * RAD, i = elements.I * RAD, w = (elements.p - elements.node) * RAD, M = mod360(elements.L - elements.p) * RAD;
  let E = M;
  for (let k = 0; k < 8; k++) E = E - (E - elements.e * Math.sin(E) - M) / (1 - elements.e * Math.cos(E));
  const xv = elements.a * (Math.cos(E) - elements.e);
  const yv = elements.a * (Math.sqrt(1 - elements.e * elements.e) * Math.sin(E));
  const v = Math.atan2(yv, xv), r = Math.hypot(xv, yv);
  const vw = v + w;
  const xh = r * (Math.cos(N) * Math.cos(vw) - Math.sin(N) * Math.sin(vw) * Math.cos(i));
  const yh = r * (Math.sin(N) * Math.cos(vw) + Math.cos(N) * Math.sin(vw) * Math.cos(i));
  const zh = r * Math.sin(vw) * Math.sin(i);
  return { x: xh, y: yh, z: zh };
}

function planetLongitude(date: Date, name: string) {
  const d = julianDay(date) - 2451543.5;
  const T = (julianDay(date) - 2451545.0) / 36525;
  const elems = orbitalElements(T);
  const earth = heliocentric(elems.Earth);
  const body = heliocentric(elems[name as keyof typeof elems]);
  // Geocentric ecliptic coordinates.
  const xg = body.x - earth.x, yg = body.y - earth.y, zg = body.z - earth.z;
  return mod360(atan2d(yg, xg));
}

function sunLongitude(date: Date) {
  const T = (julianDay(date) - 2451545.0) / 36525;
  const earth = heliocentric(orbitalElements(T).Earth);
  return mod360(atan2d(-earth.y, -earth.x));
}

function moonLongitude(date: Date) {
  // Compact lunar model based on the principal periodic terms.
  const jd = julianDay(date);
  const T = (jd - 2451545.0) / 36525;
  const Lp = mod360(218.3164477 + 481267.88123421 * T);
  const D = mod360(297.8501921 + 445267.1114034 * T);
  const M = mod360(357.5291092 + 35999.0502909 * T);
  const Mp = mod360(134.9633964 + 477198.8675055 * T);
  const F = mod360(93.2720950 + 483202.0175233 * T);
  let lon = Lp;
  lon += 6.289 * sind(Mp);
  lon += 1.274 * sind(2 * D - Mp);
  lon += 0.658 * sind(2 * D);
  lon += 0.214 * sind(2 * Mp);
  lon -= 0.186 * sind(M);
  lon -= 0.059 * sind(2 * D - 2 * Mp);
  lon -= 0.057 * sind(2 * D - M - Mp);
  lon += 0.053 * sind(2 * D + Mp);
  lon += 0.046 * sind(2 * D - M);
  lon += 0.041 * sind(M - Mp);
  lon -= 0.035 * sind(D);
  lon -= 0.031 * sind(M + Mp);
  lon -= 0.015 * sind(2 * F - 2 * D);
  lon += 0.011 * sind(Mp - 4 * D);
  return mod360(lon);
}

function meanObliquity(date: Date) {
  const T = (julianDay(date) - 2451545) / 36525;
  return 23.43929111 - 0.013004167 * T;
}

function gmstDegrees(date: Date) {
  const jd = julianDay(date);
  const T = (jd - 2451545) / 36525;
  return mod360(280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - T * T * T / 38710000);
}

function ascendant(date: Date, latitude: number, longitude: number) {
  const eps = meanObliquity(date);
  const lst = mod360(gmstDegrees(date) + longitude);
  const lambda = mod360(atan2d(-cosd(lst), sind(lst) * cosd(eps) + tand(latitude) * sind(eps)));
  return lambda;
}

export async function calculateBirthChart(input: { year: string; month: string; day: string; time?: string; place: string }): Promise<BirthChart> {
  const { city, utcDate, hasTime } = resolveBirthMoment(input);
  const location = { lat: city.latitude, lng: city.longitude };

  const planets: Record<string, ChartPoint> = {};
  planets["太陽"] = signPoint(sunLongitude(utcDate));
  planets["月亮"] = signPoint(moonLongitude(utcDate));
  for (const [name, key] of [["水星", "Mercury"], ["金星", "Venus"], ["火星", "Mars"], ["木星", "Jupiter"], ["土星", "Saturn"], ["天王星", "Uranus"], ["海王星", "Neptune"]] as const) {
    const lon = planetLongitude(utcDate, key);
    // Approximate retrograde from a one-day finite difference.
    const next = planetLongitude(new Date(utcDate.getTime() + 86400000), key);
    const delta = ((next - lon + 540) % 360) - 180;
    planets[name] = signPoint(lon, delta < 0);
  }
  // Pluto is slow enough that a simple mean-longitude approximation is more useful than omitting it.
  const jd = julianDay(utcDate);
  const pluto = mod360(238.95 + 145.2078 * ((jd - 2451545) / 36525));
  planets["冥王星"] = signPoint(pluto);

  const houses: Array<{ house: number; sign: string }> = [];
  let asc: ChartPoint | undefined;
  let note: string | undefined;
  if (hasTime) {
    const ascLon = ascendant(utcDate, location.lat, location.lng);
    asc = signPoint(ascLon);
    const ascSign = Math.floor(ascLon / 30);
    for (let house = 1; house <= 12; house++) houses.push({ house, sign: SIGNS[(ascSign + house - 1) % 12] });
  } else {
    note = "未提供出生時間，因此未計算上升與宮位；太陽、月亮與行星位置仍依出生日期與地點計算。";
  }

  note = [note, "出生地使用所選城市中心的近似座標。"].filter(Boolean).join(" ");

  return {
    calculatedAt: new Date().toISOString(),
    birth: {
      localDateTime: `${input.year}-${String(input.month).padStart(2, "0")}-${String(input.day).padStart(2, "0")} ${input.time || "12:00"}`,
      utcDateTime: utcDate.toISOString(), place: input.place, latitude: location.lat, longitude: location.lng, timeZone: city.timeZone,
    },
    planets,
    ascendant: asc,
    houses,
    note,
  };
}
