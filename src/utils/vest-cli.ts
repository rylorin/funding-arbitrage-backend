#!/usr/bin/env node

/**
 * CLI utility to generate Vest signing key and register it with Vest server
 * Replicates the functionality of vest.py in TypeScript/Node.js
 */

import { randomBytes } from "crypto";
import { ethers } from "ethers";

const primaryAddr = process.env.PUBLIC_KEY;
const primaryPrivateKey = process.env.PRIVATE_KEY;

if (!primaryAddr || !primaryPrivateKey) {
  console.error("Error: PUBLIC_KEY and PRIVATE_KEY environment variables are required");
  process.exit(1);
}

async function main() {
  try {
    console.log("Generating Vest signing key and registering with server...\n");

    // Phase 1: Generate a new signing key
    const priv = randomBytes(32).toString("hex");
    const privateKey = "0x" + priv;
    const wallet = new ethers.Wallet(privateKey);

    const signingPrivateKey = wallet.privateKey;
    const signingPublicKey = wallet.address;
    // const signingPrivateKey = "31e6c58d9f75b911690103ea312bbd3451459534951f300a6aae0a9983cf532b";
    // const signingPublicKey = "0x105207652607266B78C72Cc10bf73Fa7e73A4666";

    console.log("✓ Generated new signing key", privateKey);

    // Phase 2: Create a proof signature using the signing key
    const expiry = Math.round(Date.now() + 1 * 24 * 3600_000); // 1 day from now
    // const expiry = 1763805410000;

    const domain = {
      name: "VestRouterV2",
      version: "0.0.1",
      verifyingContract: "0x919386306C47b2Fe1036e3B4F7C40D22D2461a23", // Vest Router V2 (Prod)
      // verifyingContract: '0x8E4D87AEf4AC4D5415C35A12319013e34223825B', // Vest Router V2 (Testnet)
    };

    const types = {
      SignerProof: [
        { name: "approvedSigner", type: "address" },
        { name: "signerExpiry", type: "uint256" },
      ],
    };

    const proofArgs = {
      approvedSigner: signingPublicKey,
      signerExpiry: expiry,
    };

    // Sign with the PRIMARY private key (not the signing key) to match Python behavior
    if (!primaryPrivateKey) {
      throw new Error("PRIVATE_KEY environment variable is required for signing");
    }
    const primaryWallet = new ethers.Wallet(primaryPrivateKey);
    const signature = await primaryWallet.signTypedData(domain, types, proofArgs);
    // const signature =
    //   "308ad2ce04bea337dca6d973aa465b164cc35ad143cadb54ab2c581e27aa0d0f3dadf7cfad757c1b53c9a7da2b3ad8787fb9a539f612fc8bfcf873932e7f0c361b";
    console.log("✓ Created proof signature");

    // Phase 3: Register with Vest server
    const registrationData = {
      signingAddr: signingPublicKey.toLowerCase(),
      primaryAddr: primaryAddr!.toLowerCase(),
      signature: signature,
      expiryTime: expiry,
      networkType: 0,
    };

    console.log("✓ Sending registration request to Vest server...", registrationData);
    console.log(`
curl -H 'Content-Type: application/json' \\
-d '{ "signingAddr": "${registrationData.signingAddr}", "primaryAddr": "${registrationData.primaryAddr}", "signature": "${registrationData.signature}", "expiryTime": ${expiry}, "networkType": 0 }' \\
-X POST \\
https://server-prod.hz.vestmarkets.com/v2/register
`);
    const response = await fetch("https://server-prod.hz.vestmarkets.com/v2/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(registrationData),
      // body: '{ "signingAddr": "0x105207652607266b78c72cc10bf73fa7e73a4666", "primaryAddr": "0xb35272da8a98cd894ee661cac356be2f50f91f47", "signature": "308ad2ce04bea337dca6d973aa465b164cc35ad143cadb54ab2c581e27aa0d0f3dadf7cfad757c1b53c9a7da2b3ad8787fb9a539f612fc8bfcf873932e7f0c361b", "expiryTime": 1763805410000, "networkType": 0 }',
    });

    if (!response.ok) {
      console.error(await response.text());
      throw new Error(`Registration failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log("✓ Registration successful!");
    console.log("Response:", JSON.stringify(result, null, 2));

    // Phase 4: Output the generated keys
    console.log("\n" + "=".repeat(60));
    console.log("GENERATED SIGNING CREDENTIALS");
    console.log("=".repeat(60));
    console.log(`Signing Address: ${signingPublicKey}`);
    console.log(`Signing Private Key: ${signingPrivateKey}`);
    console.log("\n⚠️  IMPORTANT: Keep the signing private key secure and never share it!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
