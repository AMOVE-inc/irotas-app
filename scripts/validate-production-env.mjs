const PRODUCTION_URL_VARIABLES = [
  { name: "EXPO_PUBLIC_API_BASE_URL", required: true },
  { name: "EXPO_PUBLIC_OAUTH_SERVER_URL", required: false },
  { name: "EXPO_PUBLIC_OAUTH_PORTAL_URL", required: false },
];

function isPrivateIpv4(hostname) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) {
    return false;
  }

  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function validatePublicHttpsUrl(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:") {
    throw new Error(`${name} must use https:// for a production build.`);
  }
  if (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error(`${name} must use a public host, not ${hostname}.`);
  }
}

export function validateProductionEnvironment(env = process.env) {
  for (const { name, required } of PRODUCTION_URL_VARIABLES) {
    const value = env[name]?.trim();
    if (!value) {
      if (required) {
        throw new Error(`${name} is required for a production Android build.`);
      }
      continue;
    }
    validatePublicHttpsUrl(name, value);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  validateProductionEnvironment();
  console.log("Production API URLs are valid public HTTPS URLs.");
}
