import { uuidToBase64url } from "@openfront/shared/Base64";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyClientToken } from "../../src/server/jwt";
import { ServerEnv } from "../../src/server/ServerEnv";

const HOST = "openfront.example.test";
const ORIGIN = `https://${HOST}:8443`;
const UUID = "f6e850b4-43af-43da-a8a3-4219f52f92b6";

describe("self-hosted game authentication", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects bare guest IDs and accepts only locally issued signed tokens", async () => {
    vi.stubEnv("SELF_HOSTED", "1");
    vi.stubEnv("SELF_HOST_ORIGIN", ORIGIN);
    vi.stubEnv("LOCAL_AUTH_BASE", "http://openfront-portal:8787");
    vi.stubEnv("DOMAIN", HOST);

    expect(await verifyClientToken(UUID)).toMatchObject({ type: "error" });

    const keys = await generateKeyPair("EdDSA", { extractable: true });
    const jwk = await exportJWK(keys.publicKey);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        keys: [{ ...jwk, alg: "EdDSA", kty: "OKP", crv: "Ed25519" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const issue = (issuer: string) =>
      new SignJWT({ sub: uuidToBase64url(UUID), role: "root" })
        .setProtectedHeader({ alg: "EdDSA" })
        .setJti(crypto.randomUUID())
        .setIssuer(issuer)
        .setAudience(HOST)
        .setIssuedAt()
        .setExpirationTime("15m")
        .sign(keys.privateKey);

    const valid = await issue(ORIGIN);
    expect(await verifyClientToken(valid)).toMatchObject({
      type: "success",
      persistentId: UUID,
      claims: { role: "root", sub: UUID },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://openfront-portal:8787/.well-known/jwks.json",
      expect.objectContaining({ redirect: "error" }),
    );

    const wrongIssuer = await issue("https://someone-else.example.test");
    expect(await verifyClientToken(wrongIssuer)).toMatchObject({
      type: "error",
    });
  });

  it("refuses an origin that does not match the audience", () => {
    vi.stubEnv("SELF_HOSTED", "1");
    vi.stubEnv("DOMAIN", HOST);
    vi.stubEnv("SELF_HOST_ORIGIN", "https://different.example.test:8443");
    expect(() => ServerEnv.jwtIssuer()).toThrow("Invalid SELF_HOST_ORIGIN");
  });
});
