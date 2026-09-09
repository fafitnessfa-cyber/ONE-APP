const METERS_PER_MILE = 1609.344;

export function roundToTwoDecimals(value) {
  return Math.round(value * 100) / 100;
}

export function poundsToKilograms(value) {
  return roundToTwoDecimals(value * 0.45359237);
}

export function kilogramsToPounds(value) {
  return roundToTwoDecimals(value * 2.2046226218);
}

export function metersToMiles(value) {
  return value / METERS_PER_MILE;
}

export function milesToMeters(value) {
  return value * METERS_PER_MILE;
}
