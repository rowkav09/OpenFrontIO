import { afterEach, describe, expect, it } from "vitest";
import { getApiBase } from "../../src/client/ApiBase";
import { ClientEnv } from "../../src/client/ClientEnv";

describe("self-hosted account API", () => {
  afterEach(() => {
    delete window.BOOTSTRAP_CONFIG;
    ClientEnv.reset();
  });

  it("uses the page origin, including its port, for account requests", () => {
    window.BOOTSTRAP_CONFIG = {
      gameEnv: "dev",
      turnstileSiteKey: "test",
      jwtAudience: "openfront.rowans-media.duckdns.org",
      gitCommit: "test",
      selfHosted: true,
    };
    ClientEnv.reset();

    expect(getApiBase()).toBe(window.location.origin);
    expect(ClientEnv.jwtIssuer()).toBe(window.location.origin);
  });
});
