import { deltaNeutralTradingService as service } from "@/services/DeltaNeutralTradingService";
import { jest } from "@jest/globals";
import { sampleOpportunity } from "../data/opportunities";
import { sampleTrade } from "../data/trades";
import { sampleSettings, sampleUser } from "../data/users";

describe("DeltaNeutralTradingService", () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  it("should initialize correctly", () => {
    expect(service).toBeDefined();
    expect(service.name).toBe("delta-neutral-trading-service");
  });

  test("Execute trade", async () => {
    const result = await service.executeTrade(sampleUser, sampleOpportunity, sampleSettings);
  });

  test("Close trade", async () => {
    const result = await service.closeTrade(sampleTrade);
  });
});
