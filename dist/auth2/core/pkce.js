import { createHash, randomBytes } from "node:crypto";
function toBase64Url(value) {
    return value.toString("base64url");
}
function createCodeChallenge(verifier) {
    return toBase64Url(createHash("sha256").update(verifier).digest());
}
export function createPkcePair() {
    const verifier = toBase64Url(randomBytes(32));
    return {
        challenge: createCodeChallenge(verifier),
        method: "S256",
        verifier,
    };
}
export function verifyPkceCodeVerifier(codeVerifier, expectedChallenge) {
    const actualChallenge = createCodeChallenge(codeVerifier);
    if (actualChallenge !== expectedChallenge) {
        throw new Error("PKCE code_verifier is invalid.");
    }
    return {
        method: "S256",
        valid: true,
    };
}
