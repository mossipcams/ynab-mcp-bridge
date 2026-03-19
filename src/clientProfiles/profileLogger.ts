export function logClientProfileEvent(event: string, details: Record<string, unknown>) {
  console.error("[profile]", event, details);
}
