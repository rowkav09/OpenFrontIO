# Safe game deployment

The self-hosted Compose stack keeps the game container asleep between visits.
For a game source update, set `OPENFRONT_GIT_COMMIT` in the stack's `.env`, then
run:

```sh
python3 scripts/selfhost/safe_deploy.py --stack-dir /home/rowankavanagh/Homelab/openfront-stack
```

The command builds the image first. Immediately before recreating the game
container, it queries every worker's key-gated `/api/adminbot/games` endpoint
from inside the existing container. Any connected player, missing worker,
invalid response, or unavailable Docker state stops the deployment. A stopped
game can be started with the new image. The admin bot key remains inside the
container and is never passed through command arguments.

This guards only game deployments performed through this command. Run the
Python checks with:

```sh
python3 -m unittest discover -s scripts/selfhost -p 'test_*.py'
```
