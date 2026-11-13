import { PlayerType, UnitType } from "@openfront/engine-api/game/GameTypes";
import { PlayerLike } from "@openfront/engine-api/game/ReadViews";
import { GameConfig } from "@openfront/engine-api/Schemas";
import { Config } from "@openfront/engine-lib/configuration/Config";
import { EngineConfig } from "@openfront/engine/configuration/EngineConfig";
import { describe, expect, it } from "vitest";

describe("EngineConfig.unitInfo", () => {
  for (const instantBuild of [false, true]) {
    const gameConfig = { instantBuild } as unknown as GameConfig;
    const shared = new Config(gameConfig, false);
    const engine = new EngineConfig(gameConfig, false);

    it(`adds a cost to the shared unit stats (instantBuild=${instantBuild})`, () => {
      for (const type of Object.values(UnitType)) {
        const { cost, ...stats } = engine.unitInfo(type);
        expect(stats).toEqual(shared.unitInfo(type));
        expect(typeof cost).toBe("function");
      }
    });
  }

  it("caches per unit type", () => {
    const engine = new EngineConfig({} as unknown as GameConfig, false);
    expect(engine.unitInfo(UnitType.City)).toBe(engine.unitInfo(UnitType.City));
  });
});

describe("Config.troopIncreaseRate", () => {
  it("applies the troop regeneration multiplier", () => {
    const player = {
      units: () => [],
      type: () => PlayerType.Human,
      numTilesOwned: () => 100,
      troops: () => 1_000,
      isLobbyCreator: () => false,
    } as unknown as PlayerLike;
    const base = new Config({ infiniteTroops: false } as GameConfig, false);
    const doubled = new Config({ infiniteTroops: false, troopRegenMultiplier: 2 } as GameConfig, false);
    expect(doubled.troopIncreaseRate(player)).toBeCloseTo(base.troopIncreaseRate(player) * 2);
  });
});
