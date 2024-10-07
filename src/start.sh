#!/bin/bash

set -e

if [ -z "$APKINDEX_PRIVKEY" ]; then
  echo "Error: APKINDEX_PRIVKEY is not set."
  exit 1
fi

# Strip spaces and clean key
# TODO this is wrong!
clean_key=$(echo "$APKINDEX_PRIVKEY" | sed -e 's/-\+[A-Z]\+ PRIVATE KEY-\+//g' | tr -d '[:space:]\n')

# Add BEGIN and END markers and write to file
echo "-----BEGIN PRIVATE KEY-----" > /private_key.rsa
echo "$clean_key" >> /private_key.rsa
echo "-----END PRIVATE KEY-----" >> /private_key.rsa

# Write public key
openssl rsa -in /private_key.rsa -pubout -out /public_key.pub

# Run the actual server
NODE_ENV=production node ./dist/index.js
