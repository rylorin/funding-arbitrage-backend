import { Position, PositionSide, PositionStatus, TradeHistory, User } from "@/models";
import { deltaNeutralTradingService as service } from "@/services/DeltaNeutralTradingService";
import { jest } from "@jest/globals";
import { sampleOpportunity } from "../data/opportunities";
import { sampleOrder } from "../data/orders";
import { sampleTrade } from "../data/trades";
import { sampleSettingsLeverage3x, sampleUser } from "../data/users";

const setupCloseContext = async (): Promise<{
  user: User;
  trade: TradeHistory;
  longLeg: Position;
  shortLeg: Position;
}> => {
  const user = await User.create(sampleUser);
  const trade = await TradeHistory.create(sampleTrade);
  const longLeg = await Position.create({
    id: "long-leg-1",
    userId: user.id,
    exchange: sampleOpportunity.longExchange.name,
    token: sampleOpportunity.token,
    side: PositionSide.LONG,
    price: sampleOpportunity.longExchange.price,
    size: sampleOrder.size,
    leverage: sampleUser.settings.positionLeverage,
    status: PositionStatus.OPEN,
    tradeId: trade.id,
    entryTimestamp: new Date(),
    slippage: user.settings.slippageTolerance,
  });
  const shortLeg = await Position.create({
    userId: user.id,
    exchange: sampleOpportunity.shortExchange.name,
    token: sampleOpportunity.token,
    side: PositionSide.SHORT,
    price: sampleOpportunity.shortExchange.price,
    size: sampleOrder.size,
    leverage: sampleUser.settings.positionLeverage,
    status: PositionStatus.OPEN,
    tradeId: trade.id,
    entryTimestamp: new Date(),
    slippage: user.settings.slippageTolerance,
  });
  return { user, trade, longLeg, shortLeg };
};

describe("DeltaNeutralTradingService", () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    // jest.spyOn(DeltaNeutralTradingService, "placeOrders").mockImplementation(() => {});
  });

  it("should initialize correctly", () => {
    expect(service).toBeDefined();
    expect(service.name).toBe("delta-neutral-trading-service");
  });

  test("calculateLegSizes", () => {
    // Perpetuals only
    const result = service.calculateLegSizes(sampleOpportunity, sampleSettingsLeverage3x, false, false);
    expect(result.longSize).toBe(result.shortSize);
    expect(result.totalNotional).toBeGreaterThan(0);
    // Long spot, short perp
    const resultSpot = service.calculateLegSizes(sampleOpportunity, sampleSettingsLeverage3x, true, false);
    expect(resultSpot.longSize).toBeCloseTo(resultSpot.shortSize * sampleSettingsLeverage3x.positionLeverage, 3);
    expect(resultSpot.totalNotional).toBeGreaterThan(0);
    // Short spot
    expect(() => service.calculateLegSizes(sampleOpportunity, sampleSettingsLeverage3x, false, true)).toThrow(
      "Spot exchange cannot be used for short position.",
    );
  });

  test("Execute trade", async () => {
    // const result = await service.executeTrade(sampleUser, sampleOpportunity, sampleSettings);
  });

  test("Close trade", async () => {
    const { trade } = await setupCloseContext();
    const result = await service.closeTrade(trade);
  });

  test("Run once", async () => {
    const result = await service.runOnce();
    console.debug(result);
  });

  test("Run twice", async () => {
    const result = await service.runOnce();
    console.debug(result);
    const result2 = await service.runOnce();
    console.debug(result2);
  });
});
