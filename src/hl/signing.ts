import { ethers } from "ethers";

/**
 * Hyperliquid API signing utilities
 */

export interface HyperliquidAuthConfig {
  walletAddress: string;
  privateKey: string;
}

export interface SignedRequest {
  action: {
    type: string;
    [key: string]: any;
  };
  nonce: number;
  signature: string;
  vaultAddress?: string;
}

/**
 * Generate a signature for Hyperliquid API requests
 */
export async function signHyperliquidRequest(
  action: any,
  nonce: number,
  privateKey: string,
  vaultAddress?: string,
): Promise<SignedRequest> {
  const message = {
    action,
    nonce,
    ...(vaultAddress && { vaultAddress }),
  };

  // Convert message to JSON string for signing
  const messageString = JSON.stringify(message);

  // Create wallet from private key
  const wallet = new ethers.Wallet(privateKey);

  // Sign the message
  const signature = await wallet.signMessage(messageString);

  return {
    ...message,
    signature,
  };
}

/**
 * Create a positions request payload
 */
export function createPositionsRequest(walletAddress: string): any {
  return {
    type: "clearinghouseState",
    user: walletAddress,
  };
}

/**
 * Create a signed positions request
 */
export async function createSignedPositionsRequest(
  auth: HyperliquidAuthConfig,
  nonce?: number,
): Promise<SignedRequest> {
  const actualNonce = nonce || Date.now();
  const action = createPositionsRequest(auth.walletAddress);

  return await signHyperliquidRequest(action, actualNonce, auth.privateKey);
}
