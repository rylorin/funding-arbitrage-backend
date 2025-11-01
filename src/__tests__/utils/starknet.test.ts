import {
  generateNonce,
  generateOrderSignature,
  hashOrderMessage,
  signMessage,
  StarknetSignatureError,
  validatePrivateKey,
  validatePublicKey,
} from "../../utils/starknet";

describe("Starknet Utilities", () => {
  describe("generateNonce", () => {
    it("should generate a unique nonce", () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();

      expect(nonce1).toBeDefined();
      expect(nonce2).toBeDefined();
      expect(typeof nonce1).toBe("string");
      expect(nonce1.length).toBeGreaterThan(0);
      // Nonces should be different (though theoretically could be same)
      expect(nonce1).not.toBe(nonce2);
    });

    it("should generate numeric string", () => {
      const nonce = generateNonce();
      expect(/^\d+$/.test(nonce)).toBe(true);
    });
  });

  describe("validatePrivateKey", () => {
    it("should validate correct private key format", () => {
      const validKey = "0x5c0f0ce622b870f67e500a8ef3e18dc47a24076516b7e34bc6780047159d0ab";
      expect(validatePrivateKey(validKey)).toBe(true);
    });

    it("should reject invalid private key", () => {
      const invalidKey = "invalid-key";
      expect(validatePrivateKey(invalidKey)).toBe(false);
    });

    it("should reject private key too small", () => {
      const smallKey = "0x1"; // Too small
      expect(validatePrivateKey(smallKey)).toBe(false);
    });

    it("should reject private key too large", () => {
      const largeKey = "0x" + "f".repeat(65); // Too large
      expect(validatePrivateKey(largeKey)).toBe(false);
    });
  });

  describe("validatePublicKey", () => {
    it("should validate correct public key format", () => {
      const validKey = "0x86c7ac0bdad799257d4e9a684089f398f488297beb0df402b3b6eee74791a4";
      expect(validatePublicKey(validKey)).toBe(true);
    });

    it("should reject invalid public key", () => {
      const invalidKey = "invalid-key";
      expect(validatePublicKey(invalidKey)).toBe(false);
    });
  });

  describe("hashOrderMessage", () => {
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

    it("should generate consistent hash for same order", () => {
      const hash1 = hashOrderMessage(testOrder);
      const hash2 = hashOrderMessage(testOrder);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe("string");
      expect(hash1.length).toBe(64); // 32 bytes hex
    });

    it("should generate different hash for different orders", () => {
      const order2 = { ...testOrder, qty: 2 };
      const hash1 = hashOrderMessage(testOrder);
      const hash2 = hashOrderMessage(order2);

      expect(hash1).not.toBe(hash2);
    });

    it("should handle all required fields", () => {
      const hash = hashOrderMessage(testOrder);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("signMessage", () => {
    const testPrivateKey = "0x5c0f0ce622b870f67e500a8ef3e18dc47a24076516b7e34bc6780047159d0ab";
    const testMessageHash = "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3";

    it("should sign message successfully", () => {
      const signature = signMessage(testMessageHash, testPrivateKey);

      expect(signature).toBeDefined();
      expect(signature.r).toBeDefined();
      expect(signature.s).toBeDefined();
      expect(signature.r).toMatch(/^0x[a-f0-9]{64}$/);
      expect(signature.s).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it("should throw error for invalid private key", () => {
      expect(() => {
        signMessage(testMessageHash, "invalid-key");
      }).toThrow(StarknetSignatureError);
    });

    it("should generate different signatures for different messages", () => {
      const sig1 = signMessage(testMessageHash, testPrivateKey);
      const sig2 = signMessage("b665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3", testPrivateKey);

      expect(sig1.r).not.toBe(sig2.r);
      expect(sig1.s).not.toBe(sig2.s);
    });
  });

  describe("generateOrderSignature", () => {
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

    it("should generate complete settlement signature", () => {
      const settlement = generateOrderSignature(testOrder, testPrivateKey, testPublicKey, testVault);

      expect(settlement).toBeDefined();
      expect(settlement.signature).toBeDefined();
      expect(settlement.signature.r).toMatch(/^0x[a-f0-9]{64}$/);
      expect(settlement.signature.s).toMatch(/^0x[a-f0-9]{64}$/);
      expect(settlement.starkKey).toBe(testPublicKey);
      expect(settlement.collateralPosition).toBe(testVault);
    });

    it("should throw error for invalid private key", () => {
      expect(() => {
        generateOrderSignature(testOrder, "invalid-key", testPublicKey, testVault);
      }).toThrow(StarknetSignatureError);
    });

    it("should throw error for invalid public key", () => {
      expect(() => {
        generateOrderSignature(testOrder, testPrivateKey, "invalid-key", testVault);
      }).toThrow(StarknetSignatureError);
    });

    it("should generate consistent signatures for same input", () => {
      const sig1 = generateOrderSignature(testOrder, testPrivateKey, testPublicKey, testVault);
      const sig2 = generateOrderSignature(testOrder, testPrivateKey, testPublicKey, testVault);

      expect(sig1.signature.r).toBe(sig2.signature.r);
      expect(sig1.signature.s).toBe(sig2.signature.s);
    });
  });

  describe("StarknetSignatureError", () => {
    it("should create error with message and code", () => {
      const error = new StarknetSignatureError("Test error", "TEST_CODE");

      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_CODE");
      expect(error.name).toBe("StarknetSignatureError");
    });
  });
});
