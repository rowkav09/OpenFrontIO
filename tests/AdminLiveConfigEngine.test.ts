import {
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { ADMIN_BOT_CLIENT_ID } from "@openfront/engine-api/Schemas";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { Executor } from "@openfront/engine/execution/ExecutionManager";
import { GameRunner } from "@openfront/engine/GameRunner";
import { describe, expect, it } from "vitest";
import { setup } from "./util/Setup";

describe("admin live rules in the engine", () => {
  it("makes a newly built city finish immediately after an instant-build turn", async () => {
    const builder = new PlayerInfo(
      "builder",
      PlayerType.Human,
      "builder_client",
      "builder_id",
    );
    const game = await setup("plains", { instantBuild: false }, [builder]);
    const player = game.player(builder.id);
    const target = game.ref(0, 10);
    player.conquer(target);

    // Prime the cached City rule before the live update. The cached duration
    // must be invalidated, or the server's changed config has no gameplay effect.
    expect(game.unitInfo(UnitType.City).constructionDuration).toBe(20);
    const runner = new GameRunner(
      game,
      new Executor(game, "game_id", undefined),
      () => {},
    );
    runner.addTurn({
      turnNumber: 0,
      intents: [
        {
          type: "admin_live_config",
          clientID: ADMIN_BOT_CLIENT_ID,
          config: { instantBuild: true },
        },
      ],
    });
    expect(runner.executeNextTick()).toBe(true);
    expect(game.unitInfo(UnitType.City).constructionDuration).toBe(0);

    player.addGold(game.unitInfo(UnitType.City).cost(game, player));
    game.addExecution(new ConstructionExecution(player, UnitType.City, target));
    game.executeNextTick(); // initialize construction
    game.executeNextTick(); // build and complete in the same tick
    expect(player.units(UnitType.City)).toHaveLength(1);
    expect(player.units(UnitType.City)[0].isUnderConstruction()).toBe(false);
  });
});
