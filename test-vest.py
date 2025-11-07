#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# A script to generate a Vest order signature for testing purposes.
from eth_abi import encode
from eth_account import Account as EthAccount
from eth_account.messages import encode_defunct
from web3 import Web3

time, nonce, orderType, symbol, isBuy, size, limitPrice, reduceOnly \
    = 1762097336031, 1762097336031, "MARKET", "BTC-PERP", True, "1.0000", "50000.00", False

args = Web3.keccak(
    encode(
        ["uint256", "uint256", "string", "string", "bool", "string", "string", "bool"],
        [time, nonce, orderType, symbol, isBuy, size, limitPrice, reduceOnly]
    )
)
print("Args Hash:", args.hex())

signable_msg = encode_defunct(args)
print("Signable Message:", signable_msg)

signature = EthAccount.sign_message(
    signable_msg, "ac2a66d4181d09f9f278b2c3f59802c7c415de4f819be1c46e121c91f8bba0fb",
).signature.hex()

print("Signature:", signature)