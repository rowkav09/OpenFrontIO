import {
  Difficulty,
  GameMapSize,
  GameMode,
  GameType,
  listedMaps,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import type { GameConfig } from "@openfront/engine-api/Schemas";
import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { ClientEnv } from "./ClientEnv";

type AdminSession = {
  authenticated: boolean;
  username?: string;
  csrfToken?: string;
};

type AdminGame = {
  gameID: string;
  phase?: string;
  paused?: boolean;
  playerCount?: number;
  workerIndex?: number;
  workerPath?: string;
  listed?: boolean;
  featured?: boolean;
  label?: string;
  startsAt?: number;
  gameConfig?: Partial<GameConfig>;
  clients?: { clientID: string; username: string; spectator?: boolean }[];
};

type RosterPlayer = {
  clientID: string;
  publicId?: string;
  username: string;
};

type LocalProfile = {
  publicId: string;
  username: string;
  role: string;
  createdAt: string;
  games: number;
  wins: number;
  totalXp: number;
  level: number;
  xpMultiplier: number;
  softRewardMultiplier: number;
  hardRewardMultiplier: number;
  premium: boolean;
  allCosmetics: boolean;
  ownedCosmetics: string[];
  softCurrency: number;
  hardCurrency: number;
  canCreatePublicLobbies: boolean;
};

type CatalogItem = {
  id: string;
  type: string;
  name: string;
  priceSoft?: number;
  priceHard?: number;
};

type ConfigDraft = {
  gameMap: string;
  difficulty: Difficulty;
  gameMapSize: GameMapSize;
  gameMode: GameMode;
  bots: number;
  nations: number | "default" | "disabled";
  maxPlayers: number;
  startDelay: number;
  maxTimerValue: number | null;
  winThresholdTenths: number | null;
  goldMultiplier: number | null;
  troopRegenMultiplier: number | null;
  startingGold: number | null;
  customAllianceDuration: number | null;
  infiniteGold: boolean;
  infiniteTroops: boolean;
  instantBuild: boolean;
  randomSpawn: boolean;
  donateGold: boolean;
  donateTroops: boolean;
  disableAlliances: boolean;
  anonymizeNames: boolean;
  liveStatsEnabled: boolean;
  disabledUnits: UnitType[];
  hostCheatInfiniteGold: boolean;
  hostCheatInfiniteTroops: boolean;
  hostCheatGoldMultiplier: number | null;
  hostCheatStartingGold: number | null;
};

type LiveDraft = Pick<
  ConfigDraft,
  | "donateGold"
  | "donateTroops"
  | "infiniteGold"
  | "infiniteTroops"
  | "instantBuild"
  | "disableAlliances"
  | "goldMultiplier"
  | "troopRegenMultiplier"
  | "maxTimerValue"
  | "winThresholdTenths"
  | "disabledUnits"
  | "customAllianceDuration"
> & {
  waterNukes: boolean;
  overtimeEnabled: boolean;
  overtimeStartMinutes: number | null;
};

const DEFAULT_LIVE_DRAFT: LiveDraft = {
  donateGold: false,
  donateTroops: false,
  infiniteGold: false,
  infiniteTroops: false,
  instantBuild: false,
  disableAlliances: false,
  waterNukes: false,
  goldMultiplier: null,
  troopRegenMultiplier: null,
  maxTimerValue: null,
  winThresholdTenths: null,
  overtimeEnabled: false,
  overtimeStartMinutes: null,
  disabledUnits: [],
  customAllianceDuration: null,
};

const DEFAULT_DRAFT: ConfigDraft = {
  gameMap: "World",
  difficulty: Difficulty.Easy,
  gameMapSize: GameMapSize.Normal,
  gameMode: GameMode.FFA,
  bots: 100,
  nations: "default",
  maxPlayers: 16,
  startDelay: 3,
  maxTimerValue: null,
  winThresholdTenths: null,
  goldMultiplier: null,
  troopRegenMultiplier: null,
  startingGold: null,
  customAllianceDuration: null,
  infiniteGold: false,
  infiniteTroops: false,
  instantBuild: false,
  randomSpawn: false,
  donateGold: false,
  donateTroops: false,
  disableAlliances: false,
  anonymizeNames: false,
  liveStatsEnabled: true,
  disabledUnits: [],
  hostCheatInfiniteGold: false,
  hostCheatInfiniteTroops: false,
  hostCheatGoldMultiplier: null,
  hostCheatStartingGold: null,
};

function numberValue(raw: string, fallback: number, min: number, max: number) {
  const value = Number(raw);
  return Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function optionalNumber(raw: string, min: number, max: number): number | null {
  return raw.trim() === "" ? null : numberValue(raw, min, min, max);
}

function gameLink(id: string): string {
  return `${window.location.origin}${ClientEnv.gamePath(id)}`;
}

function isEditableTarget(event: KeyboardEvent): boolean {
  const target = event.composedPath()[0];
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

@customElement("rowan-admin-panel")
export class RowanAdminPanel extends LitElement {
  @state() private session: AdminSession = { authenticated: false };
  @state() private open = false;
  @state() private loading = false;
  @state() private busy = false;
  @state() private message = "";
  @state() private error = "";
  @state() private games: AdminGame[] = [];
  @state() private selectedId = "";
  @state() private roster: RosterPlayer[] = [];
  @state() private playerRegenDrafts: Record<string, number> = {};
  @state() private liveStats: unknown = null;
  @state() private tab: "profiles" | "overview" | "lobby" | "game" = "profiles";
  @state() private inMatch = false;
  @state() private profileQuery = "";
  @state() private profiles: LocalProfile[] = [];
  @state() private selectedProfile: LocalProfile | null = null;
  @state() private profilesLoading = false;
  @state() private globalRewardDraft = { xp: 1, soft: 1, hard: 1 };
  @state() private entitlementDraft = {
    xpMultiplier: 1,
    softRewardMultiplier: 1,
    hardRewardMultiplier: 1,
    premium: false,
    allCosmetics: false,
    canCreatePublicLobbies: false,
  };
  @state() private grantXpAmount = 0;
  @state() private grantSoftAmount = 0;
  @state() private grantHardAmount = 0;
  @state() private unlockId = "";
  @state() private catalog: CatalogItem[] = [];
  @state() private catalogQuery = "";
  @state() private draft: ConfigDraft = { ...DEFAULT_DRAFT };
  @state() private liveDraft: LiveDraft = { ...DEFAULT_LIVE_DRAFT };
  @state() private createGameType: GameType.Private | GameType.Public =
    GameType.Private;
  @state() private listed = false;
  @state() private featured = false;
  @state() private label = "";
  @state() private accent = "blue";
  @state() private teamPublicId = "";
  @state() private teamIndex = 0;

  private refreshTimer: number | undefined;

  static styles = css`
    :host {
      position: fixed;
      z-index: 2147482000;
      inset: 0;
      pointer-events: none;
      color: #edf5ff;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      font-size: 14px;
    }
    * {
      box-sizing: border-box;
    }
    button,
    input,
    select {
      font: inherit;
    }
    button {
      cursor: pointer;
    }
    .launcher {
      position: absolute;
      right: 16px;
      bottom: 16px;
      border: 1px solid #3a7695;
      border-radius: 999px;
      background: #082b40;
      color: #e7f8ff;
      padding: 10px 16px;
      box-shadow: 0 7px 28px #0009;
      pointer-events: auto;
    }
    .backdrop {
      position: absolute;
      inset: 0;
      background: #020c16bd;
      pointer-events: auto;
    }
    .panel {
      position: absolute;
      inset: 4vh max(3vw, 12px);
      max-width: 1250px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #46687d;
      border-radius: 18px;
      background: #0b1c2b;
      box-shadow: 0 24px 90px #000b;
      pointer-events: auto;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid #29495d;
      background: #102a3d;
    }
    header h2 {
      margin: 0;
      font-size: 20px;
    }
    header small {
      display: block;
      color: #95b7c9;
      font-size: 12px;
    }
    nav {
      display: flex;
      gap: 7px;
      flex-wrap: wrap;
    }
    nav button,
    .secondary {
      border: 1px solid #406379;
      border-radius: 9px;
      padding: 8px 11px;
      color: #e6f4fb;
      background: #173346;
    }
    nav button.active {
      background: #176083;
      border-color: #4ac9e0;
    }
    .close {
      border: 0;
      background: none;
      color: #d4ecf4;
      font-size: 26px;
    }
    .content {
      overflow: auto;
      padding: 20px;
    }
    .cols {
      display: grid;
      grid-template-columns: minmax(250px, 0.8fr) minmax(0, 1.7fr);
      gap: 18px;
    }
    .cols.match-only {
      grid-template-columns: minmax(0, 1fr);
    }
    .card {
      border: 1px solid #315469;
      border-radius: 12px;
      background: #102739;
      padding: 16px;
      margin-bottom: 14px;
    }
    .card h3 {
      font-size: 16px;
      margin: 0 0 12px;
    }
    .card h4 {
      font-size: 14px;
      margin: 16px 0 8px;
      color: #9cdbec;
    }
    .card p {
      margin: 6px 0 12px;
      color: #bbd0dc;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 9px;
      flex-wrap: wrap;
      margin: 9px 0;
    }
    .row > label {
      min-width: 135px;
    }
    .row input:not([type="checkbox"]),
    .row select {
      min-height: 36px;
      width: min(100%, 260px);
      border: 1px solid #527488;
      border-radius: 7px;
      padding: 6px 9px;
      color: #f5fbff;
      background: #0a1b28;
    }
    input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: #35b4d0;
    }
    .check {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 4px 8px 4px 0;
    }
    .checks {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    }
    .primary {
      border: 1px solid #48cde8;
      border-radius: 9px;
      padding: 9px 14px;
      color: #05202d;
      font-weight: 700;
      background: #54d2e8;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .danger {
      border-color: #a6656c;
      color: #ffbfc5;
    }
    .status {
      padding: 8px 12px;
      border-radius: 8px;
      background: #164b3e;
      margin-bottom: 12px;
    }
    .error {
      background: #673038;
    }
    .muted {
      color: #a4c0cf;
    }
    .games {
      display: grid;
      gap: 7px;
    }
    .game {
      width: 100%;
      text-align: left;
      border: 1px solid #33576c;
      border-radius: 9px;
      padding: 10px;
      color: #e8f4fa;
      background: #0c2232;
    }
    .game.active {
      border-color: #55d5ec;
      background: #164257;
    }
    .game small {
      display: block;
      color: #9cbccb;
      margin-top: 3px;
    }
    .badge {
      border-radius: 5px;
      padding: 3px 7px;
      background: #284d61;
      font-size: 11px;
    }
    .players {
      width: 100%;
      border-collapse: collapse;
    }
    .players td,
    .players th {
      border-bottom: 1px solid #315468;
      text-align: left;
      padding: 7px;
    }
    .players td:last-child {
      text-align: right;
    }
    .scroll-table {
      overflow-x: auto;
    }
    .account {
      width: 100%;
      text-align: left;
      border: 1px solid #33576c;
      border-radius: 9px;
      padding: 10px;
      margin-bottom: 7px;
      color: #e8f4fa;
      background: #0c2232;
    }
    .account.active {
      border-color: #55d5ec;
      background: #164257;
    }
    .account small {
      display: block;
      color: #9cbccb;
      margin-top: 3px;
    }
    .profile-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 8px;
    }
    .profile-stats span {
      border: 1px solid #315468;
      border-radius: 8px;
      padding: 9px;
      background: #0b1e2b;
    }
    .profile-stats strong {
      display: block;
      color: #9cdbec;
      font-size: 17px;
    }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: 290px;
      overflow: auto;
      color: #a8d6dd;
    }
    a {
      color: #79def0;
      overflow-wrap: anywhere;
    }
    details {
      border-top: 1px solid #2f5163;
      margin-top: 14px;
      padding-top: 12px;
    }
    summary {
      cursor: pointer;
      color: #9cdbec;
      font-weight: 600;
    }
    @media (max-width: 750px) {
      .panel {
        inset: 0;
        border-radius: 0;
      }
      .cols {
        grid-template-columns: 1fr;
      }
      .content {
        padding: 12px;
      }
      header {
        padding: 12px;
      }
      header h2 {
        font-size: 17px;
      }
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("popstate", this.onLocationChanged);
    window.addEventListener("open-rowan-admin", this.onOpenAdmin);
    window.addEventListener("focus", this.onFocus);
    document.addEventListener("session-cleared", this.onSessionCleared);
    document.addEventListener(
      "join-lobby",
      this.onLobbyJoined as EventListener,
    );
    document.addEventListener("game-starting", this.onGameStarting);
    document.addEventListener("leave-lobby", this.onLeaveLobby);
    this.selectedId = this.gameIdFromLocation() ?? "";
    const requestedOpen =
      new URL(window.location.href).searchParams.has("rowan-admin") ||
      sessionStorage.getItem("rowan-admin-open") === "1";
    sessionStorage.removeItem("rowan-admin-open");
    void this.checkSession().then((allowed) => {
      if (allowed && requestedOpen) void this.opened();
    });
    this.refreshTimer = window.setInterval(() => {
      if (this.open && this.session.authenticated && this.tab !== "profiles")
        void this.loadGames(false);
    }, 10_000);
  }

  disconnectedCallback(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("popstate", this.onLocationChanged);
    window.removeEventListener("open-rowan-admin", this.onOpenAdmin);
    window.removeEventListener("focus", this.onFocus);
    document.removeEventListener("session-cleared", this.onSessionCleared);
    document.removeEventListener(
      "join-lobby",
      this.onLobbyJoined as EventListener,
    );
    document.removeEventListener("game-starting", this.onGameStarting);
    document.removeEventListener("leave-lobby", this.onLeaveLobby);
    window.clearInterval(this.refreshTimer);
    super.disconnectedCallback();
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (
      !this.session.authenticated ||
      event.code !== "F8" ||
      event.repeat ||
      isEditableTarget(event)
    )
      return;
    event.preventDefault();
    if (this.open) this.open = false;
    else void this.opened();
  };

  private onOpenAdmin = () => {
    void this.opened();
  };

  private onFocus = () => {
    void this.checkSession();
  };

  private onSessionCleared = () => {
    this.session = { authenticated: false };
    this.open = false;
  };

  private onLocationChanged = () => {
    const id = this.gameIdFromLocation();
    if (id) this.selectedId = id;
  };

  private onLobbyJoined = (event: CustomEvent<{ gameID: string }>) => {
    if (event.detail?.gameID) this.selectedId = event.detail.gameID;
  };

  private onGameStarting = () => {
    this.inMatch = true;
    this.tab = "game";
    this.selectedId = this.gameIdFromLocation() ?? this.selectedId;
    if (this.open && this.session.authenticated) void this.loadGames();
  };

  private onLeaveLobby = () => {
    this.inMatch = false;
    if (this.tab === "game") this.tab = "profiles";
  };

  private gameIdFromLocation(): string | null {
    const match = window.location.pathname.match(/\/(?:w\d+\/)?game\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body) headers.set("Content-Type", "application/json");
    if (init.method && init.method !== "GET" && this.session.csrfToken) {
      headers.set("X-CSRF-Token", this.session.csrfToken);
    }
    const response = await fetch(`/rowan-admin${path}`, {
      ...init,
      credentials: "same-origin",
      headers,
    });
    const data = (await response.json().catch(() => ({}))) as T & {
      error?: string;
    };
    if (!response.ok) {
      if (response.status === 401) this.session = { authenticated: false };
      throw new Error(data.error ?? `Request failed (${response.status})`);
    }
    return data;
  }

  private async checkSession(): Promise<boolean> {
    try {
      this.session = await this.request<AdminSession>("/session");
      if (!this.session.authenticated) {
        this.open = false;
        this.games = [];
      }
      return this.session.authenticated;
    } catch {
      this.session = { authenticated: false };
      this.open = false;
      this.error = "Admin service is unavailable.";
      return false;
    }
  }

  private async opened() {
    this.error = "";
    if (!(await this.checkSession())) return;
    if (this.inMatch) {
      this.tab = "game";
      this.selectedId = this.gameIdFromLocation() ?? this.selectedId;
    }
    this.open = true;
    if (this.tab === "profiles") {
      await Promise.all([this.loadProfiles(), this.loadCatalog(), this.loadGlobalRewards()]);
    } else {
      await this.loadGames();
    }
  }

  private async logout() {
    await this.act(async () => {
      await this.request("/logout", { method: "POST" });
      this.session = { authenticated: false };
      this.games = [];
      this.roster = [];
      this.liveStats = null;
      localStorage.removeItem("username");
      localStorage.removeItem("usernameIsGenerated");
      // Reload closes any socket that was admitted with the root JWT. The
      // next page obtains a fresh guest session before joining another game.
      window.location.reload();
    }, "Signed out.");
  }

  private async act(operation: () => Promise<void>, success: string) {
    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      await operation();
      this.message = success;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Action failed";
    } finally {
      this.busy = false;
    }
  }

  private async loadProfiles(query = this.profileQuery) {
    if (!this.session.authenticated) return;
    this.profilesLoading = true;
    this.error = "";
    try {
      const result = await this.request<{ players: LocalProfile[] }>(
        `/players?q=${encodeURIComponent(query.trim())}`,
      );
      this.profiles = result.players ?? [];
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : "Could not load accounts";
    } finally {
      this.profilesLoading = false;
    }
  }

  private async loadGlobalRewards() {
    try {
      const result = await this.request<{ multipliers: { xp: number; soft: number; hard: number } }>("/reward-multipliers");
      this.globalRewardDraft = result.multipliers;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not load global rewards";
    }
  }

  private saveGlobalRewards() {
    return this.act(async () => {
      const result = await this.request<{ multipliers: { xp: number; soft: number; hard: number } }>(
        "/reward-multipliers", { method: "PATCH", body: JSON.stringify(this.globalRewardDraft) },
      );
      this.globalRewardDraft = result.multipliers;
    }, "Global reward multipliers saved.");
  }

  private async loadCatalog() {
    try {
      const result = await this.request<{ items: CatalogItem[] }>("/catalog");
      this.catalog = result.items ?? [];
    } catch {
      // Catalog availability must not block account and entitlement controls.
      this.catalog = [];
    }
  }

  private async selectProfile(publicId: string) {
    this.error = "";
    try {
      const result = await this.request<{ player: LocalProfile }>(
        `/player/${encodeURIComponent(publicId)}`,
      );
      const player = result.player;
      this.selectedProfile = player;
      this.entitlementDraft = {
        xpMultiplier: player.xpMultiplier ?? 1,
        softRewardMultiplier: player.softRewardMultiplier ?? 1,
        hardRewardMultiplier: player.hardRewardMultiplier ?? 1,
        premium: player.premium === true,
        allCosmetics: player.allCosmetics === true,
        canCreatePublicLobbies: player.canCreatePublicLobbies === true,
      };
      this.grantXpAmount = 0;
      this.grantSoftAmount = 0;
      this.grantHardAmount = 0;
      this.unlockId = "";
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : "Could not load account";
    }
  }

  private async patchProfile(
    changes: Record<string, unknown>,
    success: string,
  ) {
    if (!this.selectedProfile) return;
    const id = this.selectedProfile.publicId;
    await this.act(async () => {
      const result = await this.request<{ player: LocalProfile }>(
        `/player/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(changes) },
      );
      this.selectedProfile = result.player;
      this.profiles = this.profiles.map((player) =>
        player.publicId === id ? result.player : player,
      );
      this.entitlementDraft = {
        xpMultiplier: result.player.xpMultiplier ?? 1,
        softRewardMultiplier: result.player.softRewardMultiplier ?? 1,
        hardRewardMultiplier: result.player.hardRewardMultiplier ?? 1,
        premium: result.player.premium === true,
        allCosmetics: result.player.allCosmetics === true,
        canCreatePublicLobbies: result.player.canCreatePublicLobbies === true,
      };
    }, success);
  }

  private saveEntitlements() {
    return this.patchProfile(
      this.entitlementDraft,
      "Account entitlements saved.",
    );
  }

  private grantXp() {
    if (this.grantXpAmount <= 0) return;
    return this.patchProfile({ grantXp: this.grantXpAmount }, "XP granted.");
  }

  private grantCurrency(kind: "soft" | "hard") {
    const amount =
      kind === "soft" ? this.grantSoftAmount : this.grantHardAmount;
    if (amount <= 0) return;
    return this.patchProfile(
      kind === "soft" ? { grantSoft: amount } : { grantHard: amount },
      `${kind === "soft" ? "Soft" : "Hard"} currency granted.`,
    );
  }

  private grantUnlock(id: string) {
    if (!id.trim()) return;
    return this.patchProfile({ addUnlocks: [id.trim()] }, "Unlock granted.");
  }

  private removeUnlock(id: string) {
    return this.patchProfile({ removeUnlocks: [id] }, "Unlock removed.");
  }

  private async loadGames(showBusy = true) {
    if (!this.session.authenticated) return;
    if (showBusy) this.loading = true;
    try {
      const previousSelection = this.selectedId;
      const result = await this.request<{ games: AdminGame[] }>("/games");
      this.games = result.games ?? [];
      if (
        !this.selectedId ||
        !this.games.some((g) => g.gameID === this.selectedId)
      ) {
        this.selectedId =
          this.gameIdFromLocation() ?? this.games[0]?.gameID ?? "";
      }
      if (this.selectedId && this.selectedId !== previousSelection) {
        const config = this.selectedGame()?.gameConfig;
        if (config) {
          this.fillDraft(config);
          this.fillLiveDraft(config);
        }
      }
      if (this.selectedId && this.tab === "game") await this.loadGameDetails();
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : "Could not load games";
    } finally {
      this.loading = false;
    }
  }

  private async loadGameDetails() {
    if (!this.selectedId) return;
    const id = encodeURIComponent(this.selectedId);
    const [roster, stats] = await Promise.all([
      this.request<{ players: RosterPlayer[]; playerRegenBonuses?: Record<string, number> }>(`/game/${id}/roster`),
      this.request<{ liveStats: unknown }>(`/game/${id}/stats`),
    ]);
    this.roster = roster.players ?? [];
    this.playerRegenDrafts = { ...(roster.playerRegenBonuses ?? {}) };
    this.liveStats = stats.liveStats;
  }

  private selectGame(id: string) {
    this.selectedId = id;
    if (this.tab === "game") void this.loadGameDetails();
    const game = this.games.find((g) => g.gameID === id);
    if (game?.gameConfig) {
      this.fillDraft(game.gameConfig);
      this.fillLiveDraft(game.gameConfig);
    }
    if (game?.gameConfig?.gameType === GameType.Public) {
      this.createGameType = GameType.Public;
    } else {
      this.createGameType = GameType.Private;
    }
    this.listed = game?.listed === true;
    this.featured = game?.featured === true;
    this.label = game?.label ?? "";
  }

  private fillDraft(config: Partial<GameConfig>) {
    this.draft = {
      ...DEFAULT_DRAFT,
      ...config,
      gameMap: config.gameMap ?? DEFAULT_DRAFT.gameMap,
      maxPlayers: config.maxPlayers ?? DEFAULT_DRAFT.maxPlayers,
      startDelay: config.startDelay ?? DEFAULT_DRAFT.startDelay,
      maxTimerValue: config.maxTimerValue ?? null,
      winThresholdTenths: config.winThresholdTenths ?? null,
      goldMultiplier: config.goldMultiplier ?? null,
      troopRegenMultiplier: config.troopRegenMultiplier ?? null,
      startingGold: config.startingGold ?? null,
      customAllianceDuration: config.customAllianceDuration ?? null,
      disableAlliances: config.disableAlliances ?? false,
      disabledUnits: config.disabledUnits ?? [],
      hostCheatInfiniteGold: config.hostCheats?.infiniteGold ?? false,
      hostCheatInfiniteTroops: config.hostCheats?.infiniteTroops ?? false,
      hostCheatGoldMultiplier: config.hostCheats?.goldMultiplier ?? null,
      hostCheatStartingGold: config.hostCheats?.startingGold ?? null,
    };
  }

  private fillLiveDraft(config: Partial<GameConfig>) {
    this.liveDraft = {
      donateGold: config.donateGold ?? false,
      donateTroops: config.donateTroops ?? false,
      infiniteGold: config.infiniteGold ?? false,
      infiniteTroops: config.infiniteTroops ?? false,
      instantBuild: config.instantBuild ?? false,
      disableAlliances: config.disableAlliances ?? false,
      waterNukes: config.waterNukes ?? false,
      goldMultiplier: config.goldMultiplier ?? null,
      troopRegenMultiplier: config.troopRegenMultiplier ?? null,
      maxTimerValue: config.maxTimerValue ?? null,
      winThresholdTenths: config.winThresholdTenths ?? null,
      overtimeEnabled: config.overtime?.enabled ?? false,
      overtimeStartMinutes: config.overtime?.startMinutes ?? null,
      disabledUnits: config.disabledUnits ?? [],
      customAllianceDuration: config.customAllianceDuration ?? null,
    };
  }

  private updateLiveDraft<K extends keyof LiveDraft>(
    key: K,
    value: LiveDraft[K],
  ) {
    this.liveDraft = { ...this.liveDraft, [key]: value };
  }

  private updateDraft<K extends keyof ConfigDraft>(
    key: K,
    value: ConfigDraft[K],
  ) {
    this.draft = { ...this.draft, [key]: value };
  }

  // Some browser automation and mobile keyboards change a number field's
  // displayed value without firing `change` before the action button runs.
  // Read the live controls at submission so the sent config matches what the
  // admin sees, including the last focused field.
  private syncNumericDraftFromDom(): boolean {
    let next = this.draft;
    for (const input of this.renderRoot.querySelectorAll<HTMLInputElement>(
      "input[data-admin-number]",
    )) {
      const key = input.dataset.adminNumber;
      if (!key) continue;
      if (
        !input.hasAttribute("data-optional-number") &&
        input.value.trim() === ""
      ) {
        this.error = `${input.previousElementSibling?.textContent?.trim() ?? key} is required.`;
        input.focus();
        return false;
      }
      const min = Number(input.min);
      const max = Number(input.max);
      const value = input.hasAttribute("data-optional-number")
        ? optionalNumber(input.value, min, max)
        : numberValue(
            input.value,
            Number(next[key as keyof ConfigDraft]) || min,
            min,
            max,
          );
      next = { ...next, [key]: value };
    }
    this.draft = next;
    return true;
  }

  private configBody(includeEmptyHostCheats = true): Partial<GameConfig> {
    const d = this.draft;
    return {
      gameMap: d.gameMap as GameConfig["gameMap"],
      difficulty: d.difficulty,
      gameMapSize: d.gameMapSize,
      gameMode: d.gameMode,
      bots: d.bots,
      nations: d.nations,
      maxPlayers: d.maxPlayers,
      startDelay: d.startDelay,
      maxTimerValue: d.maxTimerValue,
      winThresholdTenths: d.winThresholdTenths,
      goldMultiplier: d.goldMultiplier,
      troopRegenMultiplier: d.troopRegenMultiplier,
      startingGold: d.startingGold,
      customAllianceDuration: d.customAllianceDuration,
      infiniteGold: d.infiniteGold,
      infiniteTroops: d.infiniteTroops,
      instantBuild: d.instantBuild,
      randomSpawn: d.randomSpawn,
      donateGold: d.donateGold,
      donateTroops: d.donateTroops,
      disableAlliances: d.disableAlliances,
      anonymizeNames: d.anonymizeNames,
      liveStatsEnabled: d.liveStatsEnabled,
      disabledUnits: d.disabledUnits,
      ...(includeEmptyHostCheats || this.hasHostPerks()
        ? {
            hostCheats: {
              infiniteGold: d.hostCheatInfiniteGold,
              infiniteTroops: d.hostCheatInfiniteTroops,
              ...(d.hostCheatGoldMultiplier === null
                ? {}
                : { goldMultiplier: d.hostCheatGoldMultiplier }),
              ...(d.hostCheatStartingGold === null
                ? {}
                : { startingGold: d.hostCheatStartingGold }),
            },
          }
        : {}),
    };
  }

  private async createGame() {
    if (!this.syncNumericDraftFromDom()) return;
    if (this.createGameType === GameType.Public && this.hasHostPerks()) {
      this.error = "Remove private host perks before creating a public game.";
      return;
    }
    await this.act(
      async () => {
        const result = await this.request<AdminGame>("/create_game", {
          method: "POST",
          body: JSON.stringify({
            ...this.configBody(false),
            gameType: this.createGameType,
            ...(this.createGameType === GameType.Private
              ? {
                  listed: this.listed,
                  featured: this.listed && this.featured,
                  ...(this.listed && this.featured
                    ? { label: this.label || undefined, accent: this.accent }
                    : {}),
                }
              : {}),
          }),
        });
        if (
          result.gameConfig?.bots !== this.draft.bots ||
          (this.draft.gameMode === GameMode.FFA &&
            result.gameConfig?.maxPlayers !== this.draft.maxPlayers)
        ) {
          throw new Error(
            "Lobby was created, but its bot or player limit did not match the form.",
          );
        }
        this.selectedId = result.gameID;
        await this.loadGames();
        this.tab = "game";
      },
      this.createGameType === GameType.Public
        ? "Public game created and visible in the game feed."
        : "Lobby created. Share its link with friends.",
    );
  }

  private async updateGame() {
    if (!this.selectedId) return;
    const game = this.selectedGame();
    if (!game) return;
    if (!this.syncNumericDraftFromDom()) return;
    if (game.gameConfig?.gameType === GameType.Public && this.hasHostPerks()) {
      this.error = "Private host perks cannot be applied to a public game.";
      return;
    }
    await this.act(async () => {
      const id = encodeURIComponent(this.selectedId);
      // Delist before applying a change that might enable private host perks;
      // list after applying a change that removes them.
      if (
        game.gameConfig?.gameType !== GameType.Public &&
        game.listed &&
        !this.listed
      ) {
        await this.request(`/game/${id}/listing`, {
          method: "POST",
          body: JSON.stringify({ listed: false }),
        });
      }
      const updated = await this.request<AdminGame>(`/game/${id}/intent`, {
        method: "POST",
        body: JSON.stringify({
          type: "update_game_config",
          config: this.configBody(false),
        }),
      });
      if (
        updated.gameConfig?.bots !== this.draft.bots ||
        (this.draft.gameMode === GameMode.FFA &&
          updated.gameConfig?.maxPlayers !== this.draft.maxPlayers)
      ) {
        throw new Error("The server did not apply the bot or player limit.");
      }
      if (
        game.gameConfig?.gameType !== GameType.Public &&
        !game.listed &&
        this.listed
      ) {
        await this.request(`/game/${id}/listing`, {
          method: "POST",
          body: JSON.stringify({ listed: true }),
        });
      }
      await this.loadGames();
    }, "Lobby settings saved.");
  }

  private syncLiveNumericDraftFromDom() {
    let next = this.liveDraft;
    for (const input of this.renderRoot.querySelectorAll<HTMLInputElement>(
      "input[data-admin-live-number]",
    )) {
      const key = input.dataset.adminLiveNumber as keyof LiveDraft | undefined;
      if (!key) continue;
      next = {
        ...next,
        [key]: optionalNumber(
          input.value,
          Number(input.min),
          Number(input.max),
        ),
      };
    }
    this.liveDraft = next;
  }

  private async saveLiveRules() {
    if (this.selectedGame()?.phase !== "ACTIVE") return;
    this.syncLiveNumericDraftFromDom();
    const d = this.liveDraft;
    const config: Partial<GameConfig> = {
      donateGold: d.donateGold,
      donateTroops: d.donateTroops,
      infiniteGold: d.infiniteGold,
      infiniteTroops: d.infiniteTroops,
      instantBuild: d.instantBuild,
      disableAlliances: d.disableAlliances,
      waterNukes: d.waterNukes,
      goldMultiplier: d.goldMultiplier,
      troopRegenMultiplier: d.troopRegenMultiplier,
      maxTimerValue: d.maxTimerValue,
      winThresholdTenths: d.winThresholdTenths,
      overtime: {
        enabled: d.overtimeEnabled,
        ...(d.overtimeStartMinutes === null
          ? {}
          : { startMinutes: d.overtimeStartMinutes }),
      },
      disabledUnits: d.disabledUnits,
      customAllianceDuration: d.customAllianceDuration,
    };
    await this.sendIntent(
      { type: "admin_live_config", config },
      "Live rules saved for this match.",
    );
  }

  private async sendIntent(intent: unknown, success: string) {
    if (!this.selectedId) return;
    await this.act(async () => {
      await this.request(
        `/game/${encodeURIComponent(this.selectedId)}/intent`,
        {
          method: "POST",
          body: JSON.stringify(intent),
        },
      );
      await this.loadGames();
      if (this.tab === "game") await this.loadGameDetails();
    }, success);
  }

  private async kick(player: RosterPlayer) {
    if (!confirm(`Kick ${player.username} from this game?`)) return;
    await this.sendIntent(
      { type: "kick_player", targetClientID: player.clientID },
      `${player.username} was removed from this game.`,
    );
  }

  private async setPlayerRegen(player: RosterPlayer) {
    const bonusPercent = this.playerRegenDrafts[player.clientID] ?? 0;
    if (!Number.isFinite(bonusPercent) || bonusPercent < 0 || bonusPercent > 1900) {
      this.error = "Regeneration bonus must be from 0% to 1900%.";
      return;
    }
    await this.sendIntent(
      { type: "admin_player_regen", targetClientID: player.clientID, bonusPercent },
      `${player.username}'s troop regeneration bonus is ${bonusPercent}%.`,
    );
  }

  private async pinTeam() {
    if (!this.selectedId || !this.teamPublicId.trim()) return;
    await this.act(async () => {
      await this.request(`/game/${encodeURIComponent(this.selectedId)}/pin`, {
        method: "POST",
        body: JSON.stringify({
          publicId: this.teamPublicId.trim(),
          teamIndex: this.teamIndex,
        }),
      });
      this.teamPublicId = "";
    }, "Player pinned to team.");
  }

  private async copyLink(id: string) {
    try {
      await navigator.clipboard.writeText(gameLink(id));
      this.message = "Invite link copied.";
    } catch {
      this.error = "Clipboard access failed. Use the link shown below.";
    }
  }

  private renderGames() {
    return html` <div class="card">
      <div class="row">
        <h3 style="margin:0">Games (${this.games.length})</h3>
        <button
          class="secondary"
          ?disabled=${this.loading}
          @click=${() => this.loadGames()}
        >
          Refresh
        </button>
      </div>
      <div class="games">
        ${
          this.games.length === 0
            ? html`<p>No active games yet. Create a lobby to get started.</p>`
            : this.games.map(
                (game) =>
                  html` <button
                    class="game ${game.gameID === this.selectedId ? "active" : ""}"
                    @click=${() => this.selectGame(game.gameID)}
                  >
                    <strong>${game.label ?? game.gameID}</strong>
                    <small
                      >${game.phase ?? "Lobby"} ·
                      ${game.playerCount ?? game.clients?.length ?? 0} players ·
                      ${game.gameConfig?.gameMap ?? "Map pending"}</small
                    >
                    ${game.listed ? html`<span class="badge">Listed</span>` : nothing}
                    ${game.featured ? html`<span class="badge">Featured</span>` : nothing}
                    ${game.paused ? html`<span class="badge">Paused</span>` : nothing}
                  </button>`,
              )
        }
      </div>
    </div>`;
  }

  private renderProfiles() {
    const player = this.selectedProfile;
    const matches = this.catalog.filter((item) =>
      `${item.name} ${item.id} ${item.type}`
        .toLowerCase()
        .includes(this.catalogQuery.toLowerCase().trim()),
    );
    return html`<div class="cols">
      <div>
        <div class="card">
          <h3>Global match rewards</h3>
          <p>These multipliers apply to every account's match rewards, alongside each account's own settings.</p>
          ${(["xp", "soft", "hard"] as const).map((key) => html`
            <div class="row"><label>${key === "xp" ? "XP" : key === "soft" ? "Soft currency" : "Hard currency"} multiplier</label>
              <input type="number" min="0" max="10" step="0.1"
                .value=${String(this.globalRewardDraft[key])}
                @input=${(event: Event) => {
                  const raw = (event.target as HTMLInputElement).value;
                  if (raw !== "") this.globalRewardDraft = {
                    ...this.globalRewardDraft, [key]: numberValue(raw, 1, 0, 10),
                  };
                }} />
            </div>`)}
          <button class="primary" ?disabled=${this.busy} @click=${this.saveGlobalRewards}>Save global multipliers</button>
        </div>
        <div class="card">
          <h3>Local accounts</h3>
          <form
            class="row"
            @submit=${(event: Event) => {
              event.preventDefault();
              void this.loadProfiles();
            }}
          >
            <input
              aria-label="Search accounts"
              placeholder="Search by username"
              .value=${this.profileQuery}
              @input=${(event: Event) => (this.profileQuery = (event.target as HTMLInputElement).value)}
            />
            <button
              class="secondary"
              type="submit"
              ?disabled=${this.profilesLoading}
            >
              Search
            </button>
          </form>
          ${this.profilesLoading ? html`<p>Loading accounts…</p>` : nothing}
          ${
            this.profiles.length === 0
              ? html`<p>No local accounts match this search.</p>`
              : this.profiles.map(
                  (account) =>
                    html` <button
                      class="account ${player?.publicId === account.publicId ? "active" : ""}"
                      @click=${() => this.selectProfile(account.publicId)}
                    >
                      <strong>${account.username}</strong>
                      ${account.premium ? html`<span class="badge">Premium</span>` : nothing}
                      ${account.role === "root" || account.role === "admin" ? html`<span class="badge">Admin</span>` : nothing}
                      <small
                        >Level ${account.level ?? 1} · ${account.games ?? 0}
                        games · ${account.totalXp ?? 0} XP</small
                      >
                    </button>`,
                )
          }
        </div>
      </div>
      <div>
        ${
          player
            ? html`
                <div class="card">
                  <h3>${player.username}</h3>
                  <p class="muted">
                    ${player.publicId} · ${player.role} · Joined
                    ${player.createdAt ? new Date(player.createdAt).toLocaleDateString() : "unknown"}
                  </p>
                  <div class="profile-stats">
                    <span><strong>${player.level ?? 1}</strong>Level</span>
                    <span><strong>${player.totalXp ?? 0}</strong>Total XP</span>
                    <span><strong>${player.games ?? 0}</strong>Games</span>
                    <span><strong>${player.wins ?? 0}</strong>Wins</span>
                    <span
                      ><strong>${player.softCurrency ?? 0}</strong>Soft
                      currency</span
                    >
                    <span
                      ><strong>${player.hardCurrency ?? 0}</strong>Hard
                      currency</span
                    >
                  </div>
                </div>
                <div class="card">
                  <h3>Entitlements</h3>
                  <p>
                    Grants apply to this account. Other players keep the normal
                    shop prices.
                  </p>
                  <div class="row">
                    <label>XP multiplier</label
                    ><input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      .value=${String(this.entitlementDraft.xpMultiplier)}
                      @input=${(event: Event) => {
                        const value = (event.target as HTMLInputElement).value;
                        if (value !== "")
                          this.entitlementDraft = {
                            ...this.entitlementDraft,
                            xpMultiplier: numberValue(value, 1, 0, 10),
                          };
                      }}
                    />
                  </div>
                  <div class="row">
                    <label>Soft currency reward multiplier</label
                    ><input type="number" min="0" max="10" step="0.1"
                      .value=${String(this.entitlementDraft.softRewardMultiplier)}
                      @input=${(event: Event) => {
                        const value = (event.target as HTMLInputElement).value;
                        if (value !== "") this.entitlementDraft = {
                          ...this.entitlementDraft,
                          softRewardMultiplier: numberValue(value, 1, 0, 10),
                        };
                      }}
                    />
                  </div>
                  <div class="row">
                    <label>Hard currency reward multiplier</label
                    ><input type="number" min="0" max="10" step="0.1"
                      .value=${String(this.entitlementDraft.hardRewardMultiplier)}
                      @input=${(event: Event) => {
                        const value = (event.target as HTMLInputElement).value;
                        if (value !== "") this.entitlementDraft = {
                          ...this.entitlementDraft,
                          hardRewardMultiplier: numberValue(value, 1, 0, 10),
                        };
                      }}
                    />
                  </div>
                  <div class="checks">
                    <label class="check"
                      ><input
                        type="checkbox"
                        .checked=${this.entitlementDraft.premium}
                        @change=${(event: Event) => (this.entitlementDraft = { ...this.entitlementDraft, premium: (event.target as HTMLInputElement).checked })}
                      />Premium</label
                    >
                    <label class="check"
                      ><input
                        type="checkbox"
                        .checked=${this.entitlementDraft.allCosmetics}
                        @change=${(event: Event) => (this.entitlementDraft = { ...this.entitlementDraft, allCosmetics: (event.target as HTMLInputElement).checked })}
                      />All cosmetics</label
                    >
                    <label class="check"
                      ><input
                        type="checkbox"
                        .checked=${this.entitlementDraft.canCreatePublicLobbies}
                        @change=${(event: Event) => (this.entitlementDraft = { ...this.entitlementDraft, canCreatePublicLobbies: (event.target as HTMLInputElement).checked })}
                      />Can create public lobbies</label
                    >
                  </div>
                  <button
                    class="primary"
                    ?disabled=${this.busy}
                    @click=${this.saveEntitlements}
                  >
                    Save entitlements
                  </button>
                </div>
                <div class="card">
                  <h3>Grant progress or currency</h3>
                  <div class="row">
                    <label>XP</label
                    ><input
                      type="number"
                      min="0"
                      max="1000000"
                      step="1"
                      .value=${String(this.grantXpAmount)}
                      @input=${(event: Event) => (this.grantXpAmount = numberValue((event.target as HTMLInputElement).value, 0, 0, 1000000))}
                    />
                    <button
                      class="secondary"
                      ?disabled=${this.busy || this.grantXpAmount <= 0}
                      @click=${this.grantXp}
                    >
                      Grant XP
                    </button>
                  </div>
                  <div class="row">
                    <label>Soft currency</label
                    ><input
                      type="number"
                      min="0"
                      step="1"
                      .value=${String(this.grantSoftAmount)}
                      @input=${(event: Event) => (this.grantSoftAmount = Math.max(0, Math.floor(Number((event.target as HTMLInputElement).value) || 0)))}
                    />
                    <button
                      class="secondary"
                      ?disabled=${this.busy || this.grantSoftAmount <= 0}
                      @click=${() => this.grantCurrency("soft")}
                    >
                      Grant
                    </button>
                  </div>
                  <div class="row">
                    <label>Hard currency</label
                    ><input
                      type="number"
                      min="0"
                      step="1"
                      .value=${String(this.grantHardAmount)}
                      @input=${(event: Event) => (this.grantHardAmount = Math.max(0, Math.floor(Number((event.target as HTMLInputElement).value) || 0)))}
                    />
                    <button
                      class="secondary"
                      ?disabled=${this.busy || this.grantHardAmount <= 0}
                      @click=${() => this.grantCurrency("hard")}
                    >
                      Grant
                    </button>
                  </div>
                </div>
                <div class="card">
                  <h3>Cosmetic unlocks</h3>
                  <p>
                    ${player.ownedCosmetics?.length ?? 0} individually granted ·
                    ${player.allCosmetics ? "All cosmetics enabled" : "Normal shop ownership"}
                  </p>
                  <div class="row">
                    <input
                      aria-label="Cosmetic item ID"
                      placeholder="Exact item ID"
                      .value=${this.unlockId}
                      @input=${(event: Event) => (this.unlockId = (event.target as HTMLInputElement).value)}
                    />
                    <button
                      class="secondary"
                      ?disabled=${this.busy || !this.unlockId.trim()}
                      @click=${() => this.grantUnlock(this.unlockId)}
                    >
                      Grant ID
                    </button>
                  </div>
                  <div class="row">
                    <input
                      aria-label="Search cosmetics"
                      placeholder="Search catalog"
                      .value=${this.catalogQuery}
                      @input=${(event: Event) => (this.catalogQuery = (event.target as HTMLInputElement).value)}
                    />
                  </div>
                  ${
                    this.catalog.length === 0
                      ? html`<p>
                          Catalog is unavailable; grant by exact item ID above.
                        </p>`
                      : html` <div class="scroll-table">
                            <table class="players">
                              <thead>
                                <tr>
                                  <th>Item</th>
                                  <th>Normal price</th>
                                  <th>Grant</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${matches.slice(0, 100).map((item) => {
                                  const owned =
                                    player.ownedCosmetics?.includes(item.id) ===
                                    true;
                                  const prices = [
                                    item.priceSoft !== undefined
                                      ? `${item.priceSoft} soft`
                                      : "",
                                    item.priceHard !== undefined
                                      ? `${item.priceHard} hard`
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" / ");
                                  return html`<tr>
                                    <td>
                                      <strong>${item.name}</strong><br /><small
                                        >${item.type} · ${item.id}</small
                                      >
                                    </td>
                                    <td>${prices || "Not sold"}</td>
                                    <td>
                                      <button
                                        class="secondary"
                                        ?disabled=${this.busy || (player.allCosmetics && !owned)}
                                        @click=${() => (owned ? this.removeUnlock(item.id) : this.grantUnlock(item.id))}
                                      >
                                        ${owned ? "Revoke grant" : player.allCosmetics ? "Included" : "Grant"}
                                      </button>
                                    </td>
                                  </tr>`;
                                })}
                              </tbody>
                            </table>
                          </div>
                          ${matches.length > 100 ? html`<p>Showing the first 100 matches. Narrow the search to see more.</p>` : nothing}`
                  }
                </div>
              `
            : html`<div class="card">
                <h3>Choose an account</h3>
                <p>
                  Select a local player to inspect their progress and manage
                  entitlements.
                </p>
              </div>`
        }
      </div>
    </div>`;
  }

  private renderOverview() {
    const players = this.games.reduce(
      (sum, g) => sum + (g.playerCount ?? g.clients?.length ?? 0),
      0,
    );
    return html` <div class="cols">
      <div>${this.renderGames()}</div>
      <div>
        <div class="card">
          <h3>Server overview</h3>
          <div class="row">
            <span class="badge">${this.games.length} active games</span
            ><span class="badge">${players} connected players</span>
          </div>
          <p>OpenFront is available to friends at this address:</p>
          <a
            href=${window.location.origin}
            target="_blank"
            rel="noopener noreferrer"
            >${window.location.origin}</a
          >
        </div>
        <div class="card">
          <h3>Selected game</h3>
          ${
            this.selectedGame()
              ? html`
                  <p>
                    ${this.selectedGame()?.gameID} ·
                    ${this.selectedGame()?.phase ?? "Lobby"}
                  </p>
                  <div class="row">
                    <button
                      class="secondary"
                      @click=${() => {
                        this.tab = "game";
                        void this.loadGameDetails();
                      }}
                    >
                      Manage game
                    </button>
                    <button
                      class="secondary"
                      @click=${() => this.copyLink(this.selectedId)}
                    >
                      Copy invite link
                    </button>
                  </div>
                  <a
                    href=${gameLink(this.selectedId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    >${gameLink(this.selectedId)}</a
                  >
                `
              : html`<p>Select a game or create a lobby.</p>`
          }
        </div>
      </div>
    </div>`;
  }

  private renderSelect(
    label: string,
    value: string,
    options: readonly string[],
    change: (v: string) => void,
  ) {
    return html`<div class="row">
      <label>${label}</label
      ><select
        .value=${value}
        @change=${(e: Event) => change((e.target as HTMLSelectElement).value)}
      >
        ${options.map((o) => html`<option value=${o} ?selected=${o === value}>${o}</option>`)}
      </select>
    </div>`;
  }

  private renderNumber(
    label: string,
    key: keyof ConfigDraft,
    min: number,
    max: number,
    step = 1,
  ) {
    const value = this.draft[key];
    return html`<div class="row">
      <label>${label}</label
      ><input
        type="number"
        data-admin-number=${key}
        min=${min}
        max=${max}
        step=${step}
        .value=${value === null ? "" : String(value)}
        @input=${(e: Event) => {
          const raw = (e.target as HTMLInputElement).value;
          if (raw !== "")
            this.updateDraft(
              key,
              numberValue(raw, Number(value) || min, min, max) as never,
            );
        }}
      />
    </div>`;
  }

  private renderOptionalNumber(
    label: string,
    key: keyof ConfigDraft,
    min: number,
    max: number,
    step = 1,
  ) {
    const value = this.draft[key];
    return html`<div class="row">
      <label>${label}</label
      ><input
        type="number"
        data-admin-number=${key}
        data-optional-number="true"
        min=${min}
        max=${max}
        step=${step}
        placeholder="Default"
        .value=${value === null ? "" : String(value)}
        @input=${(e: Event) => this.updateDraft(key, optionalNumber((e.target as HTMLInputElement).value, min, max) as never)}
      />
    </div>`;
  }

  private renderCheck(label: string, key: keyof ConfigDraft) {
    return html`<label class="check"
      ><input
        type="checkbox"
        .checked=${Boolean(this.draft[key])}
        @change=${(e: Event) => this.updateDraft(key, (e.target as HTMLInputElement).checked as never)}
      />${label}</label
    >`;
  }

  private renderConfig() {
    return html` <div class="card">
      <h3>Game setup</h3>
      <p>
        These settings apply when you create a lobby or update the selected
        lobby before it starts.
      </p>
      ${this.renderSelect(
        "Map",
        this.draft.gameMap,
        listedMaps.map((m) => m.type),
        (v) => this.updateDraft("gameMap", v),
      )}
      ${this.renderSelect("Difficulty", this.draft.difficulty, Object.values(Difficulty), (v) => this.updateDraft("difficulty", v as Difficulty))}
      ${this.renderSelect("Mode", this.draft.gameMode, Object.values(GameMode), (v) => this.updateDraft("gameMode", v as GameMode))}
      ${this.renderSelect("Map size", this.draft.gameMapSize, Object.values(GameMapSize), (v) => this.updateDraft("gameMapSize", v as GameMapSize))}
      <div class="row">
        <label>Nations</label
        ><select
          @change=${(e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            this.updateDraft(
              "nations",
              v === "default" || v === "disabled" ? v : Number(v),
            );
          }}
        >
          <option value="default" ?selected=${this.draft.nations === "default"}>
            Default
          </option>
          <option
            value="disabled"
            ?selected=${this.draft.nations === "disabled"}
          >
            Disabled
          </option>
          ${[5, 10, 20, 40, 80, 120, 200].map((n) => html`<option value=${n} ?selected=${this.draft.nations === n}>${n}</option>`)}
        </select>
      </div>
      ${this.renderNumber("Bots", "bots", 0, 400)}
      ${this.renderNumber("Maximum players", "maxPlayers", 2, 1000)}
      ${this.renderNumber("Start delay (sec)", "startDelay", 0, 600)}
      ${this.renderOptionalNumber("Game timer (min)", "maxTimerValue", 1, 120)}
      ${this.renderOptionalNumber("Win threshold (0.1%)", "winThresholdTenths", 100, 999)}
      <details>
        <summary>Economy and rules</summary>
        <div class="checks">
          ${this.renderCheck("Infinite gold", "infiniteGold")}
          ${this.renderCheck("Infinite troops", "infiniteTroops")}
          ${this.renderCheck("Instant build", "instantBuild")}
          ${this.renderCheck("Random spawn", "randomSpawn")}
          ${this.renderCheck("Donate gold", "donateGold")}
          ${this.renderCheck("Donate troops", "donateTroops")}
          ${this.renderCheck("Disable alliances", "disableAlliances")}
          ${this.renderCheck("Anonymize names", "anonymizeNames")}
          ${this.renderCheck("Collect live stats", "liveStatsEnabled")}
        </div>
        ${this.renderOptionalNumber("Gold multiplier", "goldMultiplier", 0.1, 1000, 0.1)}
        ${this.renderOptionalNumber("Troop regen multiplier", "troopRegenMultiplier", 0.1, 20, 0.1)}
        ${this.renderOptionalNumber("Starting gold", "startingGold", 0, 1000000000)}
        ${this.renderOptionalNumber("Alliance duration", "customAllianceDuration", 0, 15)}
      </details>
      <details>
        <summary>Host perks and units</summary>
        <p>
          Host perks are for private games. They cannot be used in a publicly
          listed lobby.
        </p>
        <div class="checks">
          ${this.renderCheck("Host infinite gold", "hostCheatInfiniteGold")}
          ${this.renderCheck("Host infinite troops", "hostCheatInfiniteTroops")}
        </div>
        ${this.renderOptionalNumber("Host gold multiplier", "hostCheatGoldMultiplier", 0.1, 1000, 0.1)}
        ${this.renderOptionalNumber("Host starting gold", "hostCheatStartingGold", 0, 1000000000)}
        <h4>Disabled units</h4>
        <div class="checks">
          ${Object.values(UnitType).map(
            (unit) =>
              html` <label class="check"
                ><input
                  type="checkbox"
                  .checked=${this.draft.disabledUnits.includes(unit)}
                  @change=${(e: Event) => {
                    const checked = (e.target as HTMLInputElement).checked;
                    this.updateDraft(
                      "disabledUnits",
                      checked
                        ? [...this.draft.disabledUnits, unit]
                        : this.draft.disabledUnits.filter((u) => u !== unit),
                    );
                  }}
                />${unit}</label
              >`,
          )}
        </div>
      </details>
    </div>`;
  }

  private hasHostPerks(): boolean {
    const d = this.draft;
    return (
      d.hostCheatInfiniteGold ||
      d.hostCheatInfiniteTroops ||
      d.hostCheatGoldMultiplier !== null ||
      d.hostCheatStartingGold !== null
    );
  }

  private renderLobby() {
    return html` <div class="cols">
      <div>${this.renderGames()}</div>
      <div>
        ${this.renderConfig()}
        <div class="card">
          <h3>Create game</h3>
          ${this.renderSelect(
            "Visibility",
            this.createGameType,
            [GameType.Private, GameType.Public],
            (value) => {
              this.createGameType = value as GameType.Private | GameType.Public;
              if (value === GameType.Public) this.featured = false;
            },
          )}
          <p>
            ${
              this.createGameType === GameType.Public
                ? "Public games appear in the normal game feed."
                : "Private games use an invite link. You can also list a private lobby for friends to find."
            }
          </p>
          ${
            this.createGameType === GameType.Private
              ? html`<div class="checks">
                  <label class="check"
                    ><input
                      type="checkbox"
                      .checked=${this.listed}
                      ?disabled=${this.hasHostPerks()}
                      @change=${(e: Event) => {
                        this.listed = (e.target as HTMLInputElement).checked;
                        if (!this.listed) this.featured = false;
                      }}
                    />List publicly</label
                  >
                  <label class="check"
                    ><input
                      type="checkbox"
                      .checked=${this.featured}
                      ?disabled=${!this.listed}
                      @change=${(e: Event) => (this.featured = (e.target as HTMLInputElement).checked)}
                    />Feature lobby</label
                  >
                </div>`
              : nothing
          }
          ${
            this.createGameType === GameType.Private && this.featured
              ? html`
                  <div class="row">
                    <label>Lobby label</label
                    ><input
                      maxlength="48"
                      .value=${this.label}
                      @change=${(e: Event) => (this.label = (e.target as HTMLInputElement).value)}
                    />
                  </div>
                  ${this.renderSelect("Accent", this.accent, ["blue", "green", "gold", "red"], (v) => (this.accent = v))}
                `
              : nothing
          }
          <div class="row">
            <button
              class="primary"
              ?disabled=${this.busy || ((this.createGameType === GameType.Public || this.listed) && this.hasHostPerks())}
              @click=${this.createGame}
            >
              ${this.createGameType === GameType.Public ? "Create public game" : "Create lobby"}
            </button>
          </div>
        </div>
        <div class="card">
          <h3>Selected lobby</h3>
          ${
            this.selectedGame()
              ? html`
                  <p>
                    ${this.selectedId} ·
                    ${this.selectedGame()?.phase ?? "Lobby"} ·
                    ${this.selectedGame()?.gameConfig?.gameType ?? "Private"}
                  </p>
                  ${this.selectedGame()?.gameConfig?.gameType === GameType.Public ? html`<p>Public game settings are editable until the match starts. Visibility is set by the game type.</p>` : nothing}
                  <div class="row">
                    <button
                      class="primary"
                      ?disabled=${this.busy || this.selectedGame()?.phase !== "LOBBY" || (this.selectedGame()?.gameConfig?.gameType === GameType.Public && this.hasHostPerks())}
                      @click=${this.updateGame}
                    >
                      Apply settings
                    </button>
                    <button
                      class="secondary"
                      ?disabled=${this.busy || this.selectedGame()?.phase !== "LOBBY"}
                      @click=${() => this.sendIntent({ type: "toggle_game_start_timer" }, "Start timer toggled.")}
                    >
                      Start / cancel timer
                    </button>
                  </div>
                  <a
                    href=${gameLink(this.selectedId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    >${gameLink(this.selectedId)}</a
                  >
                `
              : html`<p>Select a game above.</p>`
          }
        </div>
      </div>
    </div>`;
  }

  private selectedGame(): AdminGame | undefined {
    return this.games.find((game) => game.gameID === this.selectedId);
  }

  private renderLiveCheck(label: string, key: keyof LiveDraft) {
    return html`<label class="check"
      ><input
        type="checkbox"
        .checked=${Boolean(this.liveDraft[key])}
        @change=${(event: Event) => this.updateLiveDraft(key, (event.target as HTMLInputElement).checked as never)}
      />${label}</label
    >`;
  }

  private renderLiveNumber(
    label: string,
    key: keyof LiveDraft,
    min: number,
    max: number,
    step = 1,
  ) {
    const value = this.liveDraft[key];
    return html`<div class="row">
      <label>${label}</label
      ><input
        type="number"
        data-admin-live-number=${key}
        min=${min}
        max=${max}
        step=${step}
        placeholder="Default"
        .value=${value === null ? "" : String(value)}
        @change=${(event: Event) => this.updateLiveDraft(key, optionalNumber((event.target as HTMLInputElement).value, min, max) as never)}
      />
    </div>`;
  }

  private renderLiveRules() {
    return html`<div class="card">
      <h3>Live match rules</h3>
      <p>
        Changes take effect during the match. Map, teams, bots, player limit,
        starting gold, and difficulty can only be changed in the lobby.
      </p>
      <div class="checks">
        ${this.renderLiveCheck("Donate gold", "donateGold")}
        ${this.renderLiveCheck("Donate troops", "donateTroops")}
        ${this.renderLiveCheck("Infinite gold", "infiniteGold")}
        ${this.renderLiveCheck("Infinite troops", "infiniteTroops")}
        ${this.renderLiveCheck("Instant build", "instantBuild")}
        ${this.renderLiveCheck("Disable alliances", "disableAlliances")}
        ${this.renderLiveCheck("Water nukes", "waterNukes")}
        ${this.renderLiveCheck("Overtime", "overtimeEnabled")}
      </div>
      ${this.renderLiveNumber("Gold multiplier", "goldMultiplier", 0.1, 1000, 0.1)}
      ${this.renderLiveNumber("Troop regen multiplier", "troopRegenMultiplier", 0.1, 20, 0.1)}
      ${this.renderLiveNumber("Game timer (min)", "maxTimerValue", 1, 120)}
      ${this.renderLiveNumber("Win threshold (0.1%)", "winThresholdTenths", 100, 999)}
      ${this.renderLiveNumber("Alliance duration (min)", "customAllianceDuration", 0, 15)}
      ${
        this.liveDraft.overtimeEnabled
          ? this.renderLiveNumber(
              "Overtime starts (min)",
              "overtimeStartMinutes",
              1,
              120,
            )
          : nothing
      }
      <details>
        <summary>Disabled units</summary>
        <div class="checks">
          ${Object.values(UnitType).map(
            (unit) =>
              html`<label class="check"
                ><input
                  type="checkbox"
                  .checked=${this.liveDraft.disabledUnits.includes(unit)}
                  @change=${(event: Event) => {
                    const checked = (event.target as HTMLInputElement).checked;
                    this.updateLiveDraft(
                      "disabledUnits",
                      checked
                        ? [...this.liveDraft.disabledUnits, unit]
                        : this.liveDraft.disabledUnits.filter(
                            (item) => item !== unit,
                          ),
                    );
                  }}
                />${unit}</label
              >`,
          )}
        </div>
      </details>
      <div class="row">
        <button
          class="primary"
          ?disabled=${this.busy}
          @click=${this.saveLiveRules}
        >
          Apply live rules
        </button>
      </div>
    </div>`;
  }

  private renderGame() {
    const game = this.selectedGame();
    return html` <div class="cols ${this.inMatch ? "match-only" : ""}">
      ${this.inMatch ? nothing : html`<div>${this.renderGames()}</div>`}
      <div>
        ${
          game
            ? html`
                <div class="card">
                  <h3>Game ${game.gameID}</h3>
                  <div class="row">
                    <span class="badge">${game.phase ?? "Lobby"}</span>
                    <span class="badge"
                      >${game.paused ? "Paused" : "Running"}</span
                    >
                    <span class="badge">${game.playerCount ?? 0} players</span>
                  </div>
                  <div class="row">
                    <button
                      class="secondary"
                      @click=${() => this.copyLink(game.gameID)}
                    >
                      Copy invite link
                    </button>
                    <button
                      class="secondary"
                      @click=${() => this.act(() => this.loadGameDetails(), "Game details refreshed.")}
                    >
                      Refresh details
                    </button>
                  </div>
                  <a
                    href=${gameLink(game.gameID)}
                    target="_blank"
                    rel="noopener noreferrer"
                    >${gameLink(game.gameID)}</a
                  >
                  <h4>Live controls</h4>
                  <div class="row">
                    <button
                      class="primary"
                      ?disabled=${this.busy || game.phase !== "ACTIVE" || Boolean(game.paused)}
                      @click=${() => this.sendIntent({ type: "toggle_pause", paused: true }, "Game paused.")}
                    >
                      Pause
                    </button>
                    <button
                      class="secondary"
                      ?disabled=${this.busy || game.phase !== "ACTIVE" || !game.paused}
                      @click=${() => this.sendIntent({ type: "toggle_pause", paused: false }, "Game resumed.")}
                    >
                      Resume
                    </button>
                    <button
                      class="secondary"
                      ?disabled=${this.busy || game.phase !== "LOBBY"}
                      @click=${() => this.sendIntent({ type: "toggle_game_start_timer" }, "Start timer toggled.")}
                    >
                      Start / cancel timer
                    </button>
                  </div>
                </div>
                ${game.phase === "ACTIVE" ? this.renderLiveRules() : nothing}
                <div class="card">
                  <h3>Players and moderation</h3>
                  ${
                    this.roster.length === 0
                      ? html`<p>No players in the roster yet.</p>`
                      : html` <table class="players">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Player ID</th>
                              <th>Regen bonus</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${this.roster.map(
                              (player) =>
                                html`<tr>
                                  <td>${player.username}</td>
                                  <td>
                                    <small
                                      >${player.publicId ?? player.clientID}</small
                                    >
                                  </td>
                                  <td>
                                    <div class="row">
                                      <input
                                        type="number"
                                        min="0"
                                        max="1900"
                                        step="5"
                                        aria-label=${`${player.username} troop regeneration bonus percent`}
                                        .value=${String(this.playerRegenDrafts[player.clientID] ?? 0)}
                                        @input=${(event: Event) => {
                                          const value = Number((event.target as HTMLInputElement).value);
                                          this.playerRegenDrafts = { ...this.playerRegenDrafts, [player.clientID]: value };
                                        }}
                                      />%
                                      <button
                                        class="secondary"
                                        ?disabled=${this.busy || game.phase !== "ACTIVE"}
                                        @click=${() => this.setPlayerRegen(player)}
                                      >Set</button>
                                    </div>
                                  </td>
                                  <td>
                                    <button
                                      class="secondary danger"
                                      ?disabled=${this.busy}
                                      @click=${() => this.kick(player)}
                                    >
                                      Kick
                                    </button>
                                  </td>
                                </tr>`,
                            )}
                          </tbody>
                        </table>`
                  }
                  <details>
                    <summary>Pin a player to a team</summary>
                    <p>
                      Use the player’s public ID and a zero-based team number
                      before the match starts.
                    </p>
                    <div class="row">
                      <input
                        placeholder="Public ID"
                        .value=${this.teamPublicId}
                        @change=${(e: Event) => (this.teamPublicId = (e.target as HTMLInputElement).value)}
                      />
                      <input
                        type="number"
                        min="0"
                        max="199"
                        .value=${String(this.teamIndex)}
                        @change=${(e: Event) => (this.teamIndex = numberValue((e.target as HTMLInputElement).value, 0, 0, 199))}
                      />
                      <button
                        class="secondary"
                        ?disabled=${this.busy}
                        @click=${this.pinTeam}
                      >
                        Pin
                      </button>
                    </div>
                  </details>
                </div>
                <div class="card">
                  <h3>Live stats</h3>
                  ${
                    this.liveStats === null || this.liveStats === undefined
                      ? html`<p>
                          No consensus snapshot yet. Enable live stats in the
                          lobby setup.
                        </p>`
                      : html`<pre>
${JSON.stringify(this.liveStats, null, 2)}</pre>`
                  }
                </div>
              `
            : html`<div class="card"><p>Select a game to manage it.</p></div>`
        }
      </div>
    </div>`;
  }

  render() {
    if (!this.session.authenticated) return nothing;
    return html`
      ${
        this.session.authenticated && !this.open
          ? html`<button
              class="launcher"
              @click=${() => void this.opened()}
              title="Show admin panel (F8)"
            >
              Admin · F8
            </button>`
          : nothing
      }
      ${
        this.open
          ? html` <div
                class="backdrop"
                @click=${() => (this.open = false)}
              ></div>
              <section
                class="panel"
                role="dialog"
                aria-modal="true"
                aria-label="RowanFront admin panel"
              >
                <header>
                  <div>
                    <h2>${this.inMatch ? "RowanFront game admin" : "RowanFront admin"}</h2>
                    <small>Signed in as ${this.session.username}</small>
                  </div>
                  ${this.inMatch ? nothing : html`<nav>
                    <button
                      class=${this.tab === "profiles" ? "active" : ""}
                      @click=${() => {
                        this.tab = "profiles";
                        void this.loadProfiles();
                        void this.loadCatalog();
                      }}
                    >
                      Profiles
                    </button>
                    <button
                      class=${this.tab === "overview" ? "active" : ""}
                      @click=${() => {
                        this.tab = "overview";
                        void this.loadGames();
                      }}
                    >
                      Overview
                    </button>
                    <button
                      class=${this.tab === "lobby" ? "active" : ""}
                      @click=${() => {
                        this.tab = "lobby";
                        void this.loadGames();
                      }}
                    >
                      Lobbies
                    </button>
                    <button
                      class=${this.tab === "game" ? "active" : ""}
                      @click=${() => {
                        this.tab = "game";
                        void this.loadGameDetails();
                      }}
                    >
                      Games
                    </button>
                    <button class="secondary" @click=${this.logout}>
                      Sign out
                    </button>
                  </nav>`}
                  <button
                    class="close"
                    aria-label="Close admin panel"
                    @click=${() => (this.open = false)}
                  >
                    ×
                  </button>
                </header>
                <div class="content">
                  ${this.error ? html`<div class="status error" role="alert">${this.error}</div>` : nothing}
                  ${this.message ? html`<div class="status" role="status">${this.message}</div>` : nothing}
                  ${
                    this.inMatch
                      ? this.renderGame()
                      : this.tab === "profiles"
                      ? this.renderProfiles()
                      : this.tab === "overview"
                        ? this.renderOverview()
                        : this.tab === "lobby"
                          ? this.renderLobby()
                          : this.renderGame()
                  }
                </div>
              </section>`
          : nothing
      }
    `;
  }
}

// The admin surface is only mounted for deployments that explicitly opt in.
function mountRowanAdminPanel() {
  if (!ClientEnv.selfHosted()) return;
  if (document.querySelector("rowan-admin-panel")) return;
  document.body.appendChild(document.createElement("rowan-admin-panel"));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountRowanAdminPanel, {
    once: true,
  });
} else {
  mountRowanAdminPanel();
}
