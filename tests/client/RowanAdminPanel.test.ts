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
});
