import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAdminBotRoutes } from "../../src/server/AdminBotRoutes";
import { GamePhase } from "../../src/server/GameServer";
import { ServerEnv } from "../../src/server/ServerEnv";

function captureListingHandler(game: any) {
  const routes: Record<string, (req: any, res: any) => void> = {};
  const app: any = {
    post(path: string, ...handlers: ((req: any, res: any) => void)[]) {
      routes[path] = handlers[handlers.length - 1];
    },
    get() {},
  };
  const log: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const gm: any = { game: () => game };
  vi.spyOn(ServerEnv, "workerIndex").mockReturnValue(0);
  registerAdminBotRoutes({ app, gm, workerId: 0, log });
  return routes["/api/adminbot/game/:id/listing"];
}

function response() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function lobby() {
  let listed = true;
  return {
    id: "aaaaaaaaaa",
    isPublic: () => false,
    phase: () => GamePhase.Lobby,
    isListed: () => listed,
    hasJoinWhitelist: () => false,
    hasHostCheats: () => false,
    setListed: vi.fn((value: boolean) => {
      listed = value;
    }),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("admin bot listing route", () => {
  it("delists an existing lobby independently of its game config", () => {
    const game = lobby();
    const handler = captureListingHandler(game);
    const res = response();
    handler({ params: { id: game.id }, body: { listed: false } }, res);
    expect(res.statusCode).toBe(200);
    expect(game.setListed).toHaveBeenCalledWith(false);
    expect(res.body).toEqual({ listed: false, gameID: game.id });
  });

  it("rejects relisting with a join whitelist or host perks", () => {
    for (const forbidden of ["hasJoinWhitelist", "hasHostCheats"] as const) {
      const game = lobby();
      game.setListed(false);
      game[forbidden] = () => true;
      const handler = captureListingHandler(game);
      const res = response();
      handler({ params: { id: game.id }, body: { listed: true } }, res);
      expect(res.statusCode).toBe(409);
      expect(game.setListed).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects listing changes after the lobby starts", () => {
    const game = lobby();
    game.phase = () => GamePhase.Active;
    const handler = captureListingHandler(game);
    const res = response();
    handler({ params: { id: game.id }, body: { listed: false } }, res);
    expect(res.statusCode).toBe(409);
    expect(game.setListed).not.toHaveBeenCalled();
  });
});
