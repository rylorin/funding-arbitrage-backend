import { ecdsa, weierstrass } from "@noble/curves/abstract/weierstrass.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

// Starknet curve parameters (STARK-friendly elliptic curve)
// Using the actual Starknet curve (STARK curve over prime field)
const StarknetCurve = weierstrass({
  a: 1n,
  b: 3141592653589793238462643383279502884197169399375105820974944592307816406665n,
  p: 2n ** 251n + 17n * 2n ** 192n + 1n,
  n: 3618502788666131213697322783095070105526743751716087489154079457884512865583n,
  Gx: 874739451078007766457464989774322083649278607533249481151382481072868806602n,
  Gy: 152666792071518830868575557812948353041420400780739481342941381225525861407n,
  h: 1n,
});

// ECDSA interface for Starknet curve
const StarknetECDSA = ecdsa(StarknetCurve, keccak_256);

export interface OrderMessage {
  id: string;
  market: string;
  type: string;
  side: string;
  qty: string;
  price: string;
  timeInForce: string;
  expiryEpochMillis: number;
  fee: string;
  selfTradeProtectionLevel: string;
  nonce: string;
  vault?: string;
  clientId?: string;
}

export interface StarknetSignature {
  r: string;
  s: string;
}

export interface SettlementSignature {
  signature: StarknetSignature;
  starkKey: string;
  collateralPosition: string;
}

/**
 * Custom error class for Starknet signature operations
 */
export class StarknetSignatureError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "StarknetSignatureError";
  }
}

/**
 * Normalize hex string by removing '0x' prefix and ensuring proper format
 */
export function normalizeHex(hex: string): string {
  if (hex.startsWith("0x")) {
    return hex.slice(2);
  }
  return hex;
}

/**
 * Add '0x' prefix to hex string if not present
 */
export function addHexPrefix(hex: string): string {
  if (hex.startsWith("0x")) {
    return hex;
  }
  return "0x" + hex;
}

/**
 * Validate Starknet private key format
 */
export function validatePrivateKey(privateKey: string): boolean {
  try {
    const normalized = normalizeHex(privateKey);
    const keyBigInt = BigInt("0x" + normalized);

    // Check if key is within valid range (1 to n-1)
    // Starknet curve order n
    const n = 3618502788666131213697322783095070105526743751716087489154079457884512865583n;
    return keyBigInt > 0n && keyBigInt < n;
  } catch {
    return false;
  }
}

/**
 * Validate Starknet public key format
 */
export function validatePublicKey(publicKey: string): boolean {
  try {
    const normalized = normalizeHex(publicKey);
    const keyBigInt = BigInt("0x" + normalized);

    // Check if key is within field range
    // Starknet field prime p
    const p = 2n ** 251n + 17n * 2n ** 192n + 1n;
    return keyBigInt > 0n && keyBigInt < p;
  } catch {
    return false;
  }
}

/**
 * Generate a unique nonce based on timestamp with microsecond precision
 */
export function generateNonce(): string {
  const timestamp = Date.now();
  const microseconds = process.hrtime.bigint() % 1000n;
  return `${timestamp}${microseconds}`;
}

/**
 * Create a deterministic hash of the order message using Keccak256
 * This follows the Extended DEX message hashing convention
 */
export function hashOrderMessage(orderData: OrderMessage): string {
  // Create a deterministic string representation of the order
  const messageString = JSON.stringify({
    id: orderData.id,
    market: orderData.market,
    type: orderData.type,
    side: orderData.side,
    qty: orderData.qty.toString(),
    price: orderData.price.toString(),
    timeInForce: orderData.timeInForce,
    expiryEpochMillis: orderData.expiryEpochMillis.toString(),
    fee: orderData.fee,
    nonce: orderData.nonce,
    vault: orderData.vault,
    clientId: orderData.clientId,
  });

  // Hash using Keccak256 (Ethereum standard, compatible with Starknet)
  const hash = keccak_256(new TextEncoder().encode(messageString));

  // Return as hex string
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Sign a message hash using Starknet ECDSA
 */
export function signMessage(messageHash: string, privateKey: string): StarknetSignature {
  try {
    // Validate inputs
    if (!validatePrivateKey(privateKey)) {
      throw new StarknetSignatureError("Invalid private key format", "INVALID_PRIVATE_KEY");
    }

    // Convert private key to BigInt
    const privateKeyBigInt = BigInt("0x" + normalizeHex(privateKey));

    // Convert message hash to bytes for signing
    const messageBytes = new Uint8Array(messageHash.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));

    // Convert private key to bytes for signing (pad to 32 bytes)
    const privateKeyHex = privateKeyBigInt.toString(16).padStart(64, "0");
    const privateKeyBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));

    // Sign using Starknet ECDSA
    const signatureBytes = StarknetECDSA.sign(messageBytes, privateKeyBytes);
    const signature = StarknetECDSA.Signature.fromBytes(signatureBytes);

    // Convert signature components to hex strings
    const r = signature.r.toString(16).padStart(64, "0");
    const s = signature.s.toString(16).padStart(64, "0");

    return { r: addHexPrefix(r), s: addHexPrefix(s) };
  } catch (error) {
    if (error instanceof StarknetSignatureError) {
      throw error;
    }
    throw new StarknetSignatureError(
      `Failed to sign message: ${error instanceof Error ? error.message : "Unknown error"}`,
      "SIGNATURE_FAILED",
    );
  }
}

/**
 * Generate complete settlement signature for Extended DEX order
 */
export function generateOrderSignature(
  orderData: OrderMessage,
  privateKey: string,
  publicKey: string,
  vault: string,
): SettlementSignature {
  try {
    // Validate configuration
    if (!validatePrivateKey(privateKey)) {
      throw new StarknetSignatureError("Invalid private key", "INVALID_PRIVATE_KEY");
    }

    if (!validatePublicKey(publicKey)) {
      throw new StarknetSignatureError("Invalid public key", "INVALID_PUBLIC_KEY");
    }

    // Hash the order message
    const messageHash = hashOrderMessage(orderData);

    // Sign the hash
    const signature = signMessage(messageHash, privateKey);

    // Return complete settlement object
    return {
      signature,
      starkKey: addHexPrefix(normalizeHex(publicKey)),
      collateralPosition: vault,
    };
  } catch (error) {
    if (error instanceof StarknetSignatureError) {
      throw error;
    }
    throw new StarknetSignatureError(
      `Failed to generate order signature: ${error instanceof Error ? error.message : "Unknown error"}`,
      "SIGNATURE_GENERATION_FAILED",
    );
  }
}

/**
 * Verify a signature (useful for testing and validation)
 */
export function verifySignature(messageHash: string, signature: StarknetSignature, publicKey: string): boolean {
  try {
    const publicKeyBigInt = BigInt("0x" + normalizeHex(publicKey));

    // Convert signature components to bytes for verification
    const signatureBytes = StarknetECDSA.Signature.fromHex(signature.r + signature.s.slice(2)).toBytes();
    const publicKeyBytes = new Uint8Array(
      publicKeyBigInt
        .toString(16)
        .match(/.{1,2}/g)!
        .map((byte) => parseInt(byte, 16)),
    );

    // Convert message hash to bytes
    const messageBytes = new Uint8Array(messageHash.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));

    return StarknetECDSA.verify(signatureBytes, messageBytes, publicKeyBytes);
  } catch {
    return false;
  }
}
