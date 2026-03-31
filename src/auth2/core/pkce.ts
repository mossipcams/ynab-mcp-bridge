import { createHash, randomBytes } from "node:crypto";

type PkcePair = {
  challenge: string;
  method: "S256";
  verifier: string;
};

function toBase64Url(value: Buffer) {
  return value.toString("base64url");
}

function createCodeChallenge(verifier: string) {
  return toBase64Url(createHash("sha256").update(verifier).digest());
}

export function createPkcePair(): PkcePair {
  const verifier = toBase64Url(randomBytes(32));

  return {
    challenge: createCodeChallenge(verifier),
    method: "S256",
    verifier,
  };
}

export function verifyPkceCodeVerifier(codeVerifier: string, expectedChallenge: string) {
  const actualChallenge = createCodeChallenge(codeVerifier);

  if (actualChallenge !== expectedChallenge) {
    throw new Error("PKCE code_verifier is invalid.");
  }

  return {
    method: "S256" as const,
    valid: true as const,
  };
}
