/**
 * Simple test file to verify Starknet utilities work correctly
 * This file is meant to be run with node directly to test the utilities
 */

// Import the functions directly
import {
  generateNonce,
  generateOrderSignature,
  hashOrderMessage,
  signMessage,
  StarknetSignatureError,
  validatePrivateKey,
  validatePublicKey,
} from "../../utils/starknet";

console.log("🧪 Testing Starknet Utilities...");

// Test 1: Nonce generation
console.log("\n1. Testing nonce generation...");
try {
  const nonce1 = generateNonce();
  const nonce2 = generateNonce();
  console.log(`✅ Generated nonce 1: ${nonce1}`);
  console.log(`✅ Generated nonce 2: ${nonce2}`);
  console.log(`✅ Nonces are different: ${nonce1 !== nonce2}`);
} catch (error) {
  console.error("❌ Error in nonce generation:", error);
}

// Test 2: Private key validation
console.log("\n2. Testing private key validation...");
try {
  const validKey = "0x5c0f0ce622b870f67e500a8ef3e18dc47a24076516b7e34bc6780047159d0ab";
  const invalidKey = "invalid-key";

  console.log(`✅ Valid key validation: ${validatePrivateKey(validKey)}`);
  console.log(`✅ Invalid key validation: ${validatePrivateKey(invalidKey)}`);
} catch (error) {
  console.error("❌ Error in key validation:", error);
}

// Test 3: Public key validation
console.log("\n3. Testing public key validation...");
try {
  const validKey = "0x86c7ac0bdad799257d4e9a684089f398f488297beb0df402b3b6eee74791a4";
  const invalidKey = "invalid-key";

  console.log(`✅ Valid key validation: ${validatePublicKey(validKey)}`);
  console.log(`✅ Invalid key validation: ${validatePublicKey(invalidKey)}`);
} catch (error) {
  console.error("❌ Error in key validation:", error);
}

// Test 4: Message hashing
console.log("\n4. Testing message hashing...");
try {
  const testOrder = {
    id: "test-order-123",
    market: "BTC-USD",
    type: "market",
    side: "buy",
    qty: 1,
    price: 50000,
    timeInForce: "GTT",
    expiryEpochMillis: 1640995200000,
    fee: "0.0002",
    nonce: "123456789",
    vault: "202045",
    clientId: "101928",
    selfTradeProtectionLevel: "ACCOUNT",
  };

  const hash = hashOrderMessage(testOrder);
  console.log(`✅ Generated hash: ${hash.substring(0, 32)}...`);
  console.log(`✅ Hash length: ${hash.length} characters`);
} catch (error) {
  console.error("❌ Error in message hashing:", error);
}

// Test 5: Signature generation
console.log("\n5. Testing signature generation...");
try {
  const testPrivateKey = "0x5c0f0ce622b870f67e500a8ef3e18dc47a24076516b7e34bc6780047159d0ab";
  const testMessageHash = "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3";

  const signature = signMessage(testMessageHash, testPrivateKey);
  console.log(`✅ Signature r: ${signature.r.substring(0, 20)}...`);
  console.log(`✅ Signature s: ${signature.s.substring(0, 20)}...`);
} catch (error) {
  console.error("❌ Error in signature generation:", error);
}

// Test 6: Complete order signature
console.log("\n6. Testing complete order signature...");
try {
  const testOrder = {
    id: "test-order-123",
    market: "BTC-USD",
    type: "market",
    side: "buy",
    qty: 1,
    price: 50000,
    timeInForce: "GTT",
    expiryEpochMillis: 1640995200000,
    fee: "0.0002",
    nonce: "123456789",
    vault: "202045",
    clientId: "101928",
    selfTradeProtectionLevel: "ACCOUNT",
  };

  const testPrivateKey = "0x5c0f0ce622b870f67e500a8ef3e18dc47a24076516b7e34bc6780047159d0ab";
  const testPublicKey = "0x86c7ac0bdad799257d4e9a684089f398f488297beb0df402b3b6eee74791a4";
  const testVault = "202045";

  const settlement = generateOrderSignature(testOrder, testPrivateKey, testPublicKey, testVault);
  console.log(`✅ Settlement signature generated`);
  console.log(`✅ Stark key: ${settlement.starkKey.substring(0, 20)}...`);
  console.log(`✅ Collateral position: ${settlement.collateralPosition}`);
} catch (error) {
  console.error("❌ Error in order signature generation:", error);
}

// Test 7: Error handling
console.log("\n7. Testing error handling...");
try {
  const error = new StarknetSignatureError("Test error", "TEST_CODE");
  console.log(`✅ Error created: ${error.message} (code: ${error.code})`);
} catch (error) {
  console.error("❌ Error in error handling:", error);
}

console.log("\n🧪 All tests completed!");
