import { AdminLiveConfigIntentSchema } from "@openfront/engine-api/Schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/ClientEnv", () => ({
  ClientEnv: {
    selfHosted: () => false,
    gamePath: (id: string) => `/game/${id}`,
  },
}));

import "../../src/client/RowanAdminPanel";
import type { RowanAdminPanel } from "../../src/client/RowanAdminPanel";

const gameId = "aVSACDXAVd";

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function button(panel: RowanAdminPanel, label: string): HTMLButtonElement {
  const buttons = Array.from(
    panel.shadowRoot!.querySelectorAll<HTMLButtonElement>("button"),
  );
  const found = buttons.find((item) => item.textContent?.trim() === label);
  if (!found) throw new Error(`Button missing: ${label}`);
  return found;
}

async function openLobbyPanel(fetcher: typeof fetch) {
  vi.stubGlobal("fetch", fetcher);
  const panel = document.createElement("rowan-admin-panel") as RowanAdminPanel;
  document.body.appendChild(panel);
  await vi.waitFor(() =>
    expect((panel as any).session.authenticated).toBe(true),
  );
  (panel as any).open = true;
  (panel as any).tab = "lobby";
  await panel.updateComplete;
  return panel;
}

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("self-host admin lobby settings", () => {
  it("submits the numbers displayed in the form even without a change event", async () => {
    let createBody: any;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/session")) {
        return json({
          authenticated: true,
          username: "rowkav",
          csrfToken: "csrf",
        });
      }
      if (url.endsWith("/games")) return json({ games: [] });
      if (url.endsWith("/create_game")) {
        createBody = JSON.parse(String(init?.body));
        return json({
          gameID: gameId,
          gameConfig: {
            bots: createBody.bots,
            maxPlayers: createBody.maxPlayers,
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as unknown as typeof fetch;
    const panel = await openLobbyPanel(fetcher);
    const bots = panel.shadowRoot!.querySelector<HTMLInputElement>(
      'input[data-admin-number="bots"]',
    )!;
    const maxPlayers = panel.shadowRoot!.querySelector<HTMLInputElement>(
      'input[data-admin-number="maxPlayers"]',
    )!;
    bots.value = "2";
    maxPlayers.value = "4";
    button(panel, "Create lobby").click();
    await vi.waitFor(() => expect(createBody).toBeDefined());
    expect(createBody).toMatchObject({ bots: 2, maxPlayers: 4 });
  });

  it("delists a selected lobby and applies its displayed numbers", async () => {
    const requests: { url: string; body?: any }[] = [];
    let listed = true;
    let config = { bots: 100, maxPlayers: 16, gameMap: "London" };
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (url.endsWith("/session")) {
        return json({
          authenticated: true,
          username: "rowkav",
          csrfToken: "csrf",
        });
      }
      if (url.endsWith("/games")) {
        return json({
          games: [
            { gameID: gameId, phase: "LOBBY", listed, gameConfig: config },
          ],
        });
      }
      if (url.endsWith("/listing")) {
        requests.push({ url, body });
        listed = body.listed;
        return json({ gameID: gameId, listed });
      }
      if (url.endsWith("/intent")) {
        requests.push({ url, body });
        config = { ...config, ...body.config };
        return json({ gameID: gameId, gameConfig: config });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as unknown as typeof fetch;
    const panel = await openLobbyPanel(fetcher);
    await (panel as any).loadGames();
    (panel as any).selectGame(gameId);
    await panel.updateComplete;
    const visibility = Array.from(
      panel.shadowRoot!.querySelectorAll<HTMLLabelElement>("label.check"),
    ).find((item) => item.textContent?.includes("List publicly"))!;
    const listedInput = visibility.querySelector("input")!;
    listedInput.checked = false;
    listedInput.dispatchEvent(new Event("change", { bubbles: true }));
    await panel.updateComplete;
    const bots = panel.shadowRoot!.querySelector<HTMLInputElement>(
      'input[data-admin-number="bots"]',
    )!;
    const maxPlayers = panel.shadowRoot!.querySelector<HTMLInputElement>(
      'input[data-admin-number="maxPlayers"]',
    )!;
    bots.value = "2";
    maxPlayers.value = "4";
    button(panel, "Apply settings").click();
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0]).toMatchObject({ body: { listed: false } });
    expect(requests[1].body).toMatchObject({
      type: "update_game_config",
      config: { bots: 2, maxPlayers: 4 },
    });
  });

  it("creates a public game without a private listing flag", async () => {
    let createBody: Record<string, unknown> | undefined;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/session")) {
        return json({
          authenticated: true,
          username: "rowkav",
          csrfToken: "csrf",
        });
      }
      if (url.endsWith("/games")) return json({ games: [] });
      if (url.endsWith("/create_game")) {
        createBody = JSON.parse(String(init?.body));
        return json({
          gameID: gameId,
          gameConfig: {
            bots: createBody?.bots,
            maxPlayers: createBody?.maxPlayers,
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as unknown as typeof fetch;
    const panel = await openLobbyPanel(fetcher);
    const visibility = Array.from(panel.shadowRoot!.querySelectorAll(".row"))
      .find((row) => row.querySelector("label")?.textContent === "Visibility")!
      .querySelector("select")!;
    visibility.value = "Public";
    visibility.dispatchEvent(new Event("change", { bubbles: true }));
    await panel.updateComplete;
    button(panel, "Create public game").click();
    await vi.waitFor(() => expect(createBody).toBeDefined());
    expect(createBody?.gameType).toBe("Public");
    expect(createBody).not.toHaveProperty("listed");
    expect(createBody).not.toHaveProperty("featured");
  });

  it("edits a public lobby without calling the private listing route", async () => {
    const requests: { url: string; body: any }[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/session")) {
        return json({
          authenticated: true,
          username: "rowkav",
          csrfToken: "csrf",
        });
      }
      if (url.endsWith("/games")) {
        return json({
          games: [
            {
              gameID: gameId,
              phase: "LOBBY",
              gameConfig: {
                gameType: "Public",
                gameMap: "London",
                bots: 100,
                maxPlayers: 16,
              },
            },
          ],
        });
      }
      if (url.endsWith("/intent")) {
        const body = JSON.parse(String(init?.body));
        requests.push({ url, body });
        return json({
          gameID: gameId,
          gameConfig: {
            bots: body.config.bots,
            maxPlayers: body.config.maxPlayers,
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as unknown as typeof fetch;
    const panel = await openLobbyPanel(fetcher);
    await (panel as any).loadGames();
    (panel as any).selectGame(gameId);
    await panel.updateComplete;
    const bots = panel.shadowRoot!.querySelector<HTMLInputElement>(
      'input[data-admin-number="bots"]',
    )!;
    bots.value = "3";
    button(panel, "Apply settings").click();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body).toMatchObject({
      type: "update_game_config",
      config: { bots: 3 },
    });
    expect(requests[0].body.config).not.toHaveProperty("hostCheats");
  });
});

describe("self-host admin access", () => {
  it.each(["guest", "ordinary local account"])(
    "keeps the panel hidden for a %s",
    async () => {
      const fetcher = vi.fn(async (url: string) => {
        if (url.endsWith("/session")) return json({ authenticated: false });
        throw new Error(`Unexpected URL: ${url}`);
      }) as unknown as typeof fetch;
      vi.stubGlobal("fetch", fetcher);
      const panel = document.createElement(
        "rowan-admin-panel",
      ) as RowanAdminPanel;
      document.body.appendChild(panel);
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "F8", bubbles: true }),
      );
      window.dispatchEvent(new Event("open-rowan-admin"));
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
      await panel.updateComplete;
      expect((panel as any).open).toBe(false);
      expect(panel.shadowRoot!.querySelector(".launcher")).toBeNull();
      expect(panel.shadowRoot!.querySelector(".panel")).toBeNull();
    },
  );
});

describe("self-host profile administration", () => {
  it("searches accounts and saves account entitlements with CSRF", async () => {
    const player = {
      publicId: "friend-id",
      username: "friend",
      role: "player",
      createdAt: "2026-11-12T00:00:00.000Z",
      games: 4,
      wins: 1,
      totalXp: 120,
      level: 2,
      xpMultiplier: 1,
      premium: false,
      allCosmetics: false,
      ownedCosmetics: [],
      softCurrency: 30,
      hardCurrency: 0,
      canCreatePublicLobbies: false,
    };
    let patch: { body: any; csrf: string | null } | undefined;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/session")) {
        return json({
          authenticated: true,
          username: "rowkav",
          csrfToken: "csrf",
        });
      }
      if (url.includes("/players?")) return json({ players: [player] });
      if (url.endsWith("/catalog")) return json({ items: [] });
      if (url.endsWith("/reward-multipliers"))
        return json({ multipliers: { xp: 1, soft: 1, hard: 1 } });
      if (url.endsWith("/player/friend-id")) {
        if (init?.method === "PATCH") {
          patch = {
            body: JSON.parse(String(init.body)),
            csrf: new Headers(init.headers).get("X-CSRF-Token"),
          };
          return json({ player: { ...player, ...patch.body } });
        }
        return json({ player });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetcher);
    const panel = document.createElement(
      "rowan-admin-panel",
    ) as RowanAdminPanel;
    document.body.appendChild(panel);
    await vi.waitFor(() =>
      expect((panel as any).session.authenticated).toBe(true),
    );
    window.dispatchEvent(new Event("open-rowan-admin"));
    await vi.waitFor(() =>
      expect(panel.shadowRoot!.querySelector(".account")).not.toBeNull(),
    );
    const search = panel.shadowRoot!.querySelector<HTMLInputElement>(
      'input[aria-label="Search accounts"]',
    )!;
    search.value = "fri";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    button(panel, "Search").click();
    await vi.waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        "/rowan-admin/players?q=fri",
        expect.anything(),
      ),
    );
    panel.shadowRoot!.querySelector<HTMLButtonElement>(".account")!.click();
    await vi.waitFor(() =>
      expect(panel.shadowRoot!.textContent).toContain("Entitlements"),
    );
    const entitlements = Array.from(
      panel.shadowRoot!.querySelectorAll(".card"),
    ).find((card) => card.querySelector("h3")?.textContent === "Entitlements")!;
    const multiplierRow = Array.from(
      entitlements.querySelectorAll(".row"),
    ).find(
      (row) => row.querySelector("label")?.textContent === "XP multiplier",
    )!;
    const multiplier = multiplierRow.querySelector<HTMLInputElement>("input")!;
    multiplier.value = "2.5";
    multiplier.dispatchEvent(new Event("input", { bubbles: true }));
    const premium = Array.from(
      panel.shadowRoot!.querySelectorAll("label.check"),
    )
      .find((label) => label.textContent?.trim() === "Premium")!
      .querySelector<HTMLInputElement>("input")!;
    premium.checked = true;
    premium.dispatchEvent(new Event("change", { bubbles: true }));
    await panel.updateComplete;
    button(panel, "Save entitlements").click();
    await vi.waitFor(() => expect(patch).toBeDefined());
    expect(patch?.csrf).toBe("csrf");
    expect(patch?.body).toMatchObject({ xpMultiplier: 2.5, premium: true });
  });
});

describe("self-host live game controls", () => {
  it("sends only mutable live rules for an active game", async () => {
    let intent: any;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/session")) {
        return json({
          authenticated: true,
          username: "rowkav",
          csrfToken: "csrf",
        });
      }
      if (url.endsWith("/games")) {
        return json({
          games: [
            {
              gameID: gameId,
              phase: "ACTIVE",
              gameConfig: {
                gameType: "Public",
                gameMap: "London",
                bots: 2,
                goldMultiplier: 1,
              },
            },
          ],
        });
      }
      if (url.endsWith("/roster")) return json({ players: [] });
      if (url.endsWith("/stats")) return json({ liveStats: null });
      if (url.endsWith("/intent")) {
        intent = JSON.parse(String(init?.body));
        return json({ gameID: gameId });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as unknown as typeof fetch;
    const panel = await openLobbyPanel(fetcher);
    await (panel as any).loadGames();
    (panel as any).selectGame(gameId);
    (panel as any).tab = "game";
    await panel.updateComplete;
    const waterNukes = Array.from(
      panel.shadowRoot!.querySelectorAll("label.check"),
    )
      .find((label) => label.textContent?.trim() === "Water nukes")!
      .querySelector<HTMLInputElement>("input")!;
    waterNukes.checked = true;
    waterNukes.dispatchEvent(new Event("change", { bubbles: true }));
    await panel.updateComplete;
    const gold = panel.shadowRoot!.querySelector<HTMLInputElement>(
      'input[data-admin-live-number="goldMultiplier"]',
    )!;
    gold.value = "2.5";
    button(panel, "Apply live rules").click();
    await vi.waitFor(() => expect(intent).toBeDefined());
    expect(intent.type).toBe("admin_live_config");
    expect(AdminLiveConfigIntentSchema.safeParse(intent).success).toBe(true);
    expect(intent.config).toMatchObject({
      goldMultiplier: 2.5,
      waterNukes: true,
    });
    expect(intent.config).not.toHaveProperty("gameMap");
    expect(intent.config).not.toHaveProperty("bots");
    expect(intent.config).not.toHaveProperty("gameType");
    expect(Object.keys(intent.config).sort()).toEqual(
      [
        "donateGold",
        "donateTroops",
        "infiniteGold",
        "infiniteTroops",
        "instantBuild",
        "disableAlliances",
        "waterNukes",
        "goldMultiplier",
        "troopRegenMultiplier",
        "maxTimerValue",
        "winThresholdTenths",
        "overtime",
        "disabledUnits",
        "customAllianceDuration",
      ].sort(),
    );
  });
});
