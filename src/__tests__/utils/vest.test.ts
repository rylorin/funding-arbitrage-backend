import { generateOrderSignature } from "../../utils/vest";

describe("Vest Utilities", () => {
  it("should generate valid order signature", async () => {
    const testOrder = {
      time: 1762097336031,
      nonce: 1762097336031,
      orderType: "MARKET",
      symbol: "BTC-PERP",
      isBuy: true,
      size: "1.0000",
      limitPrice: "50000.00",
      reduceOnly: false,
    };

    const testPrivateKey = "ac2a66d4181d09f9f278b2c3f59802c7c415de4f819be1c46e121c91f8bba0fb";

    const signature = await generateOrderSignature(testOrder, testPrivateKey);

    expect(signature).toBeDefined();
    expect(signature).toBe(
      "0x" +
        "481a1dc2da68ad7ced704d610899c72cf9a5480c4446ce65beeec32a61d6bd793b20ef6ea5883b5f88678359e9fdbaf52a78117fe366733197a04b2992b9ee561c",
    );
  });
});
