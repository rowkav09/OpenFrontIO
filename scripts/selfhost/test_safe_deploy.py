"""Fail-closed checks for RowanFront game image deployments."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from safe_deploy import DeploymentError, WORKER_COUNT_SCRIPT, safe_deploy


class FakeDocker:
    def __init__(self, *, running: bool = True, after_build_count: int = 0):
        self.running = running
        self.after_build_count = after_build_count
        self.calls: list[list[str]] = []
        self.build_ok = True
        self.worker_ok = True

    def __call__(
        self, args: list[str], _cwd: Path, _timeout: float
    ) -> subprocess.CompletedProcess[str]:
        self.calls.append(args)
        if args[:3] == ["docker", "compose", "build"]:
            return subprocess.CompletedProcess(args, 0 if self.build_ok else 1, "", "")
        if args[:2] == ["docker", "inspect"]:
            return subprocess.CompletedProcess(
                args, 0, "true\n" if self.running else "false\n", ""
            )
        if args[:2] == ["docker", "exec"]:
            return subprocess.CompletedProcess(
                args,
                0 if self.worker_ok else 1,
                json.dumps({"activeConnections": self.after_build_count, "workersChecked": 2}),
                "",
            )
        if args[:3] == ["docker", "compose", "up"]:
            return subprocess.CompletedProcess(args, 0, "", "")
        raise AssertionError(f"Unexpected command: {args}")


class SafeDeployTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.stack_dir = Path(self.temporary.name)
        (self.stack_dir / "compose.yaml").write_text("services: {}\n")

    def test_checks_after_build_and_refuses_connected_players(self) -> None:
        runner = FakeDocker(after_build_count=2)
        with self.assertRaisesRegex(DeploymentError, "2 connected player"):
            safe_deploy(self.stack_dir, runner)
        self.assertEqual(
            [call[:3] for call in runner.calls],
            [
                ["docker", "compose", "build"],
                ["docker", "inspect", "--format"],
                ["docker", "exec", "openfront-game"],
            ],
        )

    def test_unknown_worker_state_refuses_recreation(self) -> None:
        runner = FakeDocker()
        runner.worker_ok = False
        with self.assertRaisesRegex(DeploymentError, "Worker status unavailable"):
            safe_deploy(self.stack_dir, runner)
        self.assertFalse(any(call[:3] == ["docker", "compose", "up"] for call in runner.calls))

    def test_zero_connections_allows_recreation(self) -> None:
        runner = FakeDocker()
        safe_deploy(self.stack_dir, runner)
        self.assertEqual(runner.calls[-1], ["docker", "compose", "up", "-d", "--no-deps", "game"])

    def test_stopped_game_can_start(self) -> None:
        runner = FakeDocker(running=False)
        safe_deploy(self.stack_dir, runner)
        self.assertFalse(any(call[:2] == ["docker", "exec"] for call in runner.calls))
        self.assertEqual(runner.calls[-1][:3], ["docker", "compose", "up"])

    def test_failed_build_leaves_running_game_untouched(self) -> None:
        runner = FakeDocker()
        runner.build_ok = False
        with self.assertRaisesRegex(DeploymentError, "build failed"):
            safe_deploy(self.stack_dir, runner)
        self.assertEqual(len(runner.calls), 1)

    def run_worker_script(self, response: str) -> subprocess.CompletedProcess[str]:
        bootstrap = f"globalThis.fetch = async (url) => ({response});\n"
        return subprocess.run(
            ["node", "-e", bootstrap + WORKER_COUNT_SCRIPT],
            text=True,
            capture_output=True,
            check=False,
            env={**os.environ, "ADMIN_BOT_API_KEY": "test-key", "NUM_WORKERS": "2"},
            timeout=10,
        )

    def test_worker_script_counts_both_workers(self) -> None:
        result = self.run_worker_script(
            "({ ok: true, json: async () => ({ "
            "workerIndex: Number(new URL(url).port) - 3001, "
            "games: [{ playerCount: Number(new URL(url).port) - 3000 }] "
            "}) })"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {"activeConnections": 3, "workersChecked": 2})

    def test_worker_script_refuses_duplicate_or_missing_worker(self) -> None:
        result = self.run_worker_script(
            "({ ok: true, json: async () => ({ workerIndex: 0, games: [] }) })"
        )
        self.assertNotEqual(result.returncode, 0)

    def test_worker_script_refuses_invalid_player_count(self) -> None:
        result = self.run_worker_script(
            "({ ok: true, json: async () => ({ "
            "workerIndex: Number(new URL(url).port) - 3001, "
            "games: [{ playerCount: -1 }] "
            "}) })"
        )
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
