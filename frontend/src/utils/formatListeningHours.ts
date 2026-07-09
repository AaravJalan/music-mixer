/** Format estimated listening time — always in hours, never days/minutes. */
export function formatListeningHours(hours: number | undefined | null): string {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return '0';
  return hours >= 100 ? Math.round(hours).toString() : hours.toFixed(1);
}

/** Value + unit for stat bubbles and cards. */
export function formatListeningHoursDisplay(hours: number | undefined | null): { value: string; unit: string } {
  return { value: `~${formatListeningHours(hours)}`, unit: 'hours' };
}
