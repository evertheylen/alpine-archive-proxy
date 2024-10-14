# alpine-archive-proxy

Functions as a proxy for the standard Alpine package repos, but it will store all downloaded packages locally. It then merges the APKINDEX of the Alpine repos with the locally stored packages. This way, packages you once downloaded will be available forever. You can also store local packages (and it will automatically create APKINDEX files).

To use, deploy somewhere like fly.io (see below) or run the Docker container yourself.

Written in Typescript. No *runtime* dependencies are needed apart from Node.


## Generating a private/public keypair

This is required. In short:

  - Generate private key: `openssl genrsa -out alpine-archive-proxy.rsa 2048`.
  - Then generate public key: `openssl rsa -in alpine-archive-proxy.rsa -pubout -out ./alpine-archive-proxy.rsa.pub`.
  - Store public key in `/etc/apk/keys/alpine-archive-proxy.rsa.pub` on client systems. Alternatively, you can download it from `https://your.deployed.url/alpine-archive-proxy.rsa.pub`.
  - Give private key as an environment variable `APKINDEX_PRIVKEY`, which should contain the base64 encoding of the private key. You can just paste the key generated by `abuild-keygen` or `openssl`, it handle spaces/newlines/headers/footers (`BEGIN/END PRIVATE KEY`).

See the [Alpine wiki](https://wiki.alpinelinux.org/wiki/Abuild_and_Helpers#abuild-keygen) for more info/instructions on the key format and generation. **Note that the filenames of public/private keys in host and client have to match!** As this Docker container always stores the key as `alpine-archive-proxy.rsa`, you have no choice but to store the public key as `alpine-archive-proxy.rsa.pub`.


## Password protection

If you configure an environment variable like so: `HTTP_AUTH="foo:bar,quuz:bol`, it will only allow requests that specify one of the username/password combos in the URL (eg. `https://foo:bar@yourserver.com/`) aka HTTP basic authentication.


## Fly.io instructions

1. Adjust the `fly.toml.example` file to your liking. Make sure to keep a volume around!
2. Run `fly launch` to create your project. It will eventually fail as this project is set up to build the Docker image locally
3. Run `./deploy_fly.sh`


## Development instructions

- First install build dependencies with `pnpm install`
- Build image with `pnpm tsc -b . && docker build . -t alpine-archive-proxy`
- Run with `docker run -p 8080:80 -e "APKINDEX_PRIVKEY=$(cat /your/key/here)" -v /tmp/packages:/packages alpine-archive-proxy:latest`
