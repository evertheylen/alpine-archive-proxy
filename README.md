# alpine-archive-proxy

Functions as a proxy for the standard Alpine package repos, but it will store all downloaded packages locally. It then merges the APKINDEX of the Alpine repos with the locally stored packages. This way, packages you once downloaded will be available forever.

To use, deploy somewhere like fly.io (see below).

Written in Typescript, but no *runtime* dependencies are needed apart from Node.

## Signing

The Docker image expects an environment variable `APKINDEX_PRIVKEY`, which should contain the base64 encoding of the private key. See the [Alpine wiki](https://wiki.alpinelinux.org/wiki/Abuild_and_Helpers#abuild-keygen) for more info/instructions on the key format and generation.


## Fly.io instructions

1. Adjust the `fly.toml.example` file to your liking. Make sure to keep a volume around!
2. Run `fly launch` to create your project. It will eventually fail as this project is set up to build the Docker image locally
3. Run `./deploy_fly.sh`


## Development instructions

- First install dependencies with `pnpm install`
- Build image with `pnpm tsc -b . && docker build . -t alpine-archive-proxy`
- Run with `docker run -p 8080:80 -e "APKINDEX_PRIVKEY=$(cat /your/key/here)" -v /tmp/packages:/packages alpine-archive-proxy:latest`
