import { GameType } from "@openfront/engine-api/game/GameTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAdminBotRoutes } from "../../src/server/AdminBotRoutes";
import { ServerEnv } from "../../src/server/ServerEnv";

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res;
}

// Capture the route handlers registered on a fake Express app so we can invoke
// the create_game handler directly. requireAdminBotKey is registered as the
// preceding middleware (tested separately); we call the final handler.
function captureCreateHandler(gm: any = {}) {
  const routes: Record<string, (req: any, res: any) => void> = {};
  const app: any = {
    post(path: string, ...handlers: ((req: any, res: any) => void)[]) {
      routes[path] = handlers[handlers.length - 1];
    },
    get() {},
  };
  const log: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  registerAdminBotRoutes({ app, gm, workerId: 0, log });
  return routes["/api/adminbot/create_game"];
}

afterEach(() => vi.restoreAllMocks());

describe("admin bot create_game gameType guard", () => {
  it("rejects a Singleplayer game with 400", () => {
    const handler = captureCreateHandler();
    const res = mockRes();
    handler({ body: { gameType: GameType.Singleplayer } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/unsupported admin game type/);
  });

  it("rejects a Public game with 400", () => {
    const handler = captureCreateHandler();
    const res = mockRes();
    handler({ body: { gameType: GameType.Public } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/unsupported admin game type/);
  });

  it("creates a true public custom lobby on a self-hosted server", () => {
    vi.spyOn(ServerEnv, "selfHosted").mockReturnValue(true);
    vi.spyOn(ServerEnv, "generateGameIdForWorker").mockReturnValue("abcdefgh");
    vi.spyOn(ServerEnv, "workerPath").mockReturnValue("w0");
    const createGame = vi
      .fn()
      .mockReturnValue({ gameInfo: () => ({ gameID: "abcdefgh" }) });
    const handler = captureCreateHandler({ createGame });
    const res = mockRes();
    handler({ body: { gameType: GameType.Public } }, res);
    expect(res.statusCode).toBe(200);
    expect(createGame).toHaveBeenCalledWith(
      "abcdefgh",
      expect.objectContaining({ gameType: GameType.Public }),
      undefined,
      undefined,
      "hosted",
      undefined,
    );
  });
});
