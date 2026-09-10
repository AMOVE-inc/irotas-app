/** A Discord account removed by its owner has no usable member name. */
export function displayMemberName(value: string | null | undefined, fallback = "未設定") {
  const name = (value ?? "").trim();
  return /^deleted\s+user$/i.test(name) || !name ? fallback : name;
}
