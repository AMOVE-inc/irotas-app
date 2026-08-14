export function getPublishedAgeBand(
  birthDate: string | undefined,
  showAge: boolean | undefined,
  now = new Date(),
): string | null {
  if (!showAge || !birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;

  let age = now.getFullYear() - birth.getFullYear();
  if (
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  ) age -= 1;
  if (age < 0) return null;

  const decade = Math.floor(age / 10) * 10;
  return `${decade}代${age % 10 < 5 ? "前半" : "後半"}`;
}
