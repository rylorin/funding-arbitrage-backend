#!/usr/bin/env python3
#
# Script to generate Vest signing key and register it with Vest server
#
import secrets
import time
from eth_account import Account as EthAccount
from eth_account.messages import encode_typed_data
import os

primaryAddr = os.getenv("PUBLIC_KEY")  # Replace with your signing address
primary_private_key = os.getenv("PRIVATE_KEY")  # Replace with your primary private key

# Phase 1: Generate a new signing key
priv = secrets.token_hex(32)
private_key = "0x" + priv
acct = EthAccount.from_key(private_key)
signing_private_key = acct.key.hex()
signing_public_key = acct.address

# Phase 2: Create a proof signature using the signing key
expiry = int(time.time()) * 1000 + (1 * 24 * 3600000)  # 1 day(s) from now
domain = {
    "name": 'VestRouterV2',
    "version": '0.0.1',
    "verifyingContract": "0x919386306C47b2Fe1036e3B4F7C40D22D2461a23", # Vest Router V2 (Prod)
    # "verifyingContract": "0x8E4D87AEf4AC4D5415C35A12319013e34223825B", # Vest Router V2 (Testnet)
}
types = {
    'SignerProof': [
        {'name': "approvedSigner", 'type': "address"},
        {'name': "signerExpiry", 'type': "uint256"},
    ],
}
proofArgs = {
    'approvedSigner': signing_public_key,
    'signerExpiry': expiry,
}
proofSignature = encode_typed_data(domain, types, proofArgs)
signature = EthAccount.sign_message(proofSignature, primary_private_key).signature.hex()

d = { 'signingAddr': (acct.address).lower(), 'primaryAddr': primaryAddr.lower(), 'signature': signature, 'expiry': expiry, 'openbrace': '{','closebrace': '}' }
s = """
curl -H 'Content-Type: application/json' \\
-d '{openbrace} "signingAddr": "{signingAddr}", "primaryAddr": "{primaryAddr}", "signature": "{signature}", "expiryTime": {expiry}, "networkType": 0 {closebrace}' \\
-X POST \\
https://server-prod.hz.vestmarkets.com/v2/register
"""
cmd = s.format(**d)
print(cmd)
os.system(cmd)

print("\n\n")
print("Signing Address (for information):", signing_public_key)
print("Signing Private Key (keep this secret!):", f"{signing_private_key}")
