import type { SitesEnv } from "./platform-types";

export type SquareEnvironment = "sandbox" | "production";

export function squareEnvironment(env: Pick<SitesEnv, "APP_ENVIRONMENT" | "SQUARE_ENVIRONMENT">): SquareEnvironment {
  const appEnvironment = env.APP_ENVIRONMENT?.trim().toLowerCase();
  const configured = env.SQUARE_ENVIRONMENT?.trim().toLowerCase();
  if (configured && configured !== "sandbox" && configured !== "production") {
    throw new Error("SQUARE_ENVIRONMENT must be sandbox or production");
  }
  if (appEnvironment === "staging" && configured !== "sandbox") {
    throw new Error("staging must use Square sandbox");
  }
  return configured === "sandbox" ? "sandbox" : "production";
}

export function squareApiBaseUrl(env: Pick<SitesEnv, "APP_ENVIRONMENT" | "SQUARE_ENVIRONMENT">) {
  return squareEnvironment(env) === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

export function squareApiUrl(env: Pick<SitesEnv, "APP_ENVIRONMENT" | "SQUARE_ENVIRONMENT">, path: string) {
  return `${squareApiBaseUrl(env)}${path.startsWith("/") ? path : `/${path}`}`;
}
