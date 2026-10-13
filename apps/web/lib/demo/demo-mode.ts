/**
 * Server-side Demo Mode Configuration
 *
 * Controls whether CampusGram is running in explicit portfolio showcase mode.
 * - Enabled ONLY when CAMPUSGRAM_DEMO_MODE === "true".
 * - When enabled, all services isolate themselves from live databases,
 *   service-role credentials, real OTP SMS delivery, Python ML inference,
 *   and local disk attachment writes.
 * - Safe boolean exposed to client via `isDemoMode()` or `NEXT_PUBLIC_DEMO_MODE`.
 */

export function isDemoMode(): boolean {
  if (process.env.CAMPUSGRAM_DEMO_MODE === "true") {
    return true;
  }
  return false;
}

/**
 * Returns safe metadata for the client about the demo environment.
 * Never includes database keys, URLs, or secrets.
 */
export function getDemoConfiguration() {
  const active = isDemoMode();
  return {
    isDemo: active,
    sourceRepoUrl: "https://github.com/helloabhishek2004/campus-hackthon",
    notice: "This is an interactive demonstration using fictional data. Actions do not create real campus reports or trigger real emergency services.",
  };
}
