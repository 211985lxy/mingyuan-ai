import type { SafeRole } from "./contracts"

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function distributeCounts(
  roles: SafeRole[],
  total: number,
): Array<{ role: SafeRole; count: number }> {
  if (roles.length === 0) return [];

  const counts = roles.map((role) => ({
    role,
    count: Math.floor(total / roles.length),
  }));

  for (let index = 0; index < total % roles.length; index += 1) {
    counts[index].count += 1;
  }

  return counts.filter((item) => item.count > 0);
}
