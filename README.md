# alpine-archive-proxy

Functions as a proxy for the standard Alpine package repos, but it will cache all packages locally and merge them into the APKINDEX. This way, packages you once downloaded will be available forever.

Written in Typescript, but no *runtime* dependencies are needed apart from Node.

**TODO: the APKINDEX is not signed right now, you'll need to add `--allow-untrusted` to all apk commands.**

## Fly.io instructions

1. Adjust the `fly.toml.example` file to your liking. Make sure to keep a volume around!
2. Run `fly launch` to create your project. It will eventually fail as this project is set up to build the Docker image locally
3. Run `./deploy_fly.sh`
