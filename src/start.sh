#!/bin/bash

set -e

if [ -z "$APKINDEX_PRIVKEY" ]; then
  echo "Error: APKINDEX_PRIVKEY is not set."
  exit 1
fi

# Strip spaces and clean key
clean_key=$(echo "$APKINDEX_PRIVKEY" | sed -e 's/-\+[A-Z]\+ PRIVATE KEY-\+//g' | tr -d '[:space:]\n')
priv_key_path=/alpine-archive-proxy.rsa
pub_key_path="${priv_key_path}.pub"

# Add BEGIN and END markers and write to file
echo "-----BEGIN PRIVATE KEY-----" > $priv_key_path
echo "$clean_key" >> $priv_key_path
echo "-----END PRIVATE KEY-----" >> $priv_key_path

# Write public key
openssl rsa -in $priv_key_path -pubout -out $pub_key_path

# Run the actual server
NODE_ENV=production node ./dist/index.js
