#!/usr/bin/env python3
"""Build and recreate the self-hosted game only when both workers are idle."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Callable


CONTAINER = "openfront-game"
SERVICE = "game"

# The bot key stays inside the game container. Neither this script nor Docker's
# command arguments receive it. Query the workers directly, rather than using
# the idle controller's cached count, which may predate a long image build.
WORKER_COUNT_SCRIPT = r"""
const key = process.env.ADMIN_BOT_API_KEY;
const workers = Number(process.env.NUM_WORKERS || 2);
if (!key || !Number.isSafeInteger(workers) || workers < 1) process.exit(1);
(async () => {
  let activeConnections = 0;
  for (let i = 0; i < workers; i++) {
    const response = await fetch(`http://127.0.0.1:${3001 + i}/api/adminbot/games`, {
      headers: { "x-admin-bot-key": key },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("worker unavailable");
    const data = await response.json();
    if (data.workerIndex !== i || !Array.isArray(data.games)) {
      throw new Error("invalid worker response");
    }
    for (const game of data.games) {
      const count = game.playerCount;
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error("invalid player count");
      }
      activeConnections += count;
      if (!Number.isSafeInteger(activeConnections)) {
        throw new Error("invalid total");
      }
    }
  }
  process.stdout.write(JSON.stringify({ activeConnections, workersChecked: workers }));
})().catch(() => process.exit(1));
"""

Runner = Callable[[list[str], Path, float], subprocess.CompletedProcess[str]]


class DeploymentError(Exception):
    pass


def run_command(
    args: list[str], cwd: Path, timeout: float
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args, cwd=cwd, timeout=timeout, capture_output=True, text=True, check=False
    )


def container_running(stack_dir: Path, runner: Runner) -> bool:
    result = runner(
        ["docker", "inspect", "--format", "{{.State.Running}}", CONTAINER],
        stack_dir,
        10,
    )
    if result.returncode != 0:
        if "No such object" in result.stderr or "No such container" in result.stderr:
            return False
        raise DeploymentError("Cannot determine whether the game container is running")
    state = result.stdout.strip()
    if state not in ("true", "false"):
        raise DeploymentError("Docker returned an invalid game container state")
    return state == "true"


def active_connections(stack_dir: Path, runner: Runner) -> int:
    result = runner(
        ["docker", "exec", CONTAINER, "node", "-e", WORKER_COUNT_SCRIPT],
        stack_dir,
        18,
    )
    if result.returncode != 0:
        raise DeploymentError("Worker status unavailable; game deployment refused")
    try:
        report = json.loads(result.stdout)
        count = report["activeConnections"]
        checked = report["workersChecked"]
        if type(count) is not int or count < 0 or type(checked) is not int or checked < 1:
            raise ValueError("invalid count")
        return count
    except (TypeError, ValueError, KeyError) as exc:
        raise DeploymentError("Invalid worker status; game deployment refused") from exc


def safe_deploy(stack_dir: Path, runner: Runner = run_command) -> None:
    if not (stack_dir / "compose.yaml").is_file():
        raise DeploymentError(f"No compose.yaml found in {stack_dir}")

    print("Building the game image...")
    build = runner(["docker", "compose", "build", SERVICE], stack_dir, 1800)
    if build.returncode != 0:
        raise DeploymentError("Game image build failed; running game was not touched")

    # This check is intentionally after the build and immediately before up.
    # A visitor may have started or joined a match while the image was building.
    if container_running(stack_dir, runner):
        count = active_connections(stack_dir, runner)
        if count > 0:
            raise DeploymentError(
                f"Game deployment refused: {count} connected player(s) across both workers"
            )
        print("Both workers report zero connected players.")
    else:
        print("Game container is stopped.")

    up = runner(
        ["docker", "compose", "up", "-d", "--no-deps", SERVICE], stack_dir, 180
    )
    if up.returncode != 0:
        raise DeploymentError("Game container recreation failed")
    print("Game deployment completed.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stack-dir", type=Path, required=True)
    args = parser.parse_args()
    try:
        safe_deploy(args.stack_dir.resolve())
    except (DeploymentError, OSError, subprocess.TimeoutExpired) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
