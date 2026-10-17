import { createHash } from "node:crypto";

export function promptVersionFor(defaultVersion: string, instructions: string, defaultInstructions: string) {
  if (instructions === defaultInstructions) return defaultVersion;
  return `${defaultVersion}-custom-${createHash("sha256").update(instructions).digest("hex").slice(0, 12)}`;
}
