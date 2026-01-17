import { signL1Action } from "@/hyperliquid/signing";
import { ENDPOINTS, InfoType } from "@hyperliquid/constants";
import { HyperliquidClearinghouseState, HyperliquidPosition, Tif } from "../hyperliquid/types";
import Position, { PositionSide, PositionStatus } from "../models/Position";
import { FundingRateData, OrderData, OrderStatus, PlacedOrderData, TokenSymbol } from "../types/index";
import { ExchangeType } from "./ExchangeConnector";
import { HyperliquidExchange } from "./HyperliquidExchange";

type VenueName = string;
interface HyperliquidPredictedFundingElement {
  fundingRate: string;
  nextFundingTime: number;
}
type HyperliquidPredictedFundingItem = [VenueName, HyperliquidPredictedFundingElement];
type HyperliquidPredictedFunding = [TokenSymbol, HyperliquidPredictedFundingItem[]];

interface HyperliquidFundingHistory {
  coin: string;
  fundingRate: string;
  premium: string;
  time: number;
}

export class HyperliquidPerpExchange extends HyperliquidExchange {
  constructor() {
    super("hyperliquid");
  }

  // Override type to PERP for this exchange
  // Note: We can't override the readonly property directly, so we'll handle it in the specific methods
  public get type(): ExchangeType {
    return ExchangeType.PERP;
  }

  private extractTokensFromTickers(marketsResponse: HyperliquidPredictedFunding[]): TokenSymbol[] {
    return marketsResponse.reduce((p, row) => {
      const [coin, perps] = row;
      const element = perps.find((p) => p[0] === "HlPerp");
      if (element) p.push(coin);
      return p;
    }, [] as TokenSymbol[]);
  }

  public async getFundingRates(tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    try {
      const fundingRates: FundingRateData[] = [];

      const prices = await this.getPrices(tokens);

      // Get predicted funding rates for current period
      const predictedResponse = await this.post(ENDPOINTS.INFO, {
        type: InfoType.PREDICTED_FUNDINGS,
      });

      const predictedFundings = predictedResponse.data as HyperliquidPredictedFunding[];

      // If no tokens specified, use default supported tokens
      const tokensToProcess = tokens || this.extractTokensFromTickers(predictedFundings);
      // console.log('Hyperliquid tokens to process:', tokensToProcess);

      for (const token of tokensToProcess) {
        try {
          // Find predicted funding for this token
          const predictedFunding = predictedFundings.find(
            (funding: HyperliquidPredictedFunding) => funding[0] === token,
          );
          // console.log(`Hyperliquid predicted funding for ${token}:`, predictedFunding);
          if (predictedFunding) {
            const nextFundingItem = predictedFunding[1].find((item) => item[0] === "HlPerp");
            // Hyperliquid has 8-hour funding cycles
            const nextFunding = new Date(nextFundingItem![1].nextFundingTime);

            fundingRates.push({
              exchange: "hyperliquid",
              token,
              fundingRate: parseFloat(nextFundingItem![1].fundingRate), // 1h funding rate
              fundingFrequency: parseInt(this.config.get("fundingFrequency")), // in hours
              nextFunding,
              updatedAt: new Date(),
              markPrice: prices[token],
            });
          } else {
            // If no predicted funding, try to get the latest historical funding
            const historyResponse = await this.post(ENDPOINTS.INFO, {
              type: "fundingHistory",
              coin: token,
              startTime: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
            });

            const fundingHistory = historyResponse.data as HyperliquidFundingHistory[];

            if (fundingHistory && fundingHistory.length > 0) {
              // Get the most recent funding rate
              const latestFunding = fundingHistory[fundingHistory.length - 1];

              // Calculate next funding time (8-hour cycles)
              const lastFundingTime = new Date(latestFunding.time);
              const nextFunding = new Date(lastFundingTime.getTime() + 8 * 60 * 60 * 1000);

              fundingRates.push({
                exchange: this.name,
                token,
                fundingRate: parseFloat(latestFunding.fundingRate),
                fundingFrequency: this.config.get("fundingFrequency"), // in hours
                nextFunding,
                updatedAt: new Date(),
                markPrice: prices[token],
              });
            }
          }
        } catch (error) {
          console.warn(`Failed to get funding rate for ${token} on Hyperliquid:`, error);
        }
      }

      return fundingRates;
    } catch (error) {
      console.error("Error fetching Hyperliquid funding rates:", error);
      throw new Error("Failed to fetch funding rates from Hyperliquid");
    }
  }

  public async setLeverage(asset: TokenSymbol, leverage: number, leverageMode = "isolated"): Promise<number> {
    if (!this.wallet) {
      throw new Error("Hyperliquid set leverage requires walletAddress and privateKey configuration");
    }

    await this.getMeta();

    const vaultAddress = this.getVaultAddress();
    const action = {
      type: "updateLeverage" as any, // Using 'any' to avoid import issues
      asset: this.universe[asset].index,
      isCross: leverageMode === "cross",
      leverage: leverage,
    };
    const nonce = this.generateUniqueNonce();
    const signature = await signL1Action(this.wallet, action, vaultAddress, nonce, this.IS_MAINNET);

    const payload = { action, nonce, signature, vaultAddress };
    // console.log("updateLeverage payload", payload);

    // Send leverage update request
    const response = await this.post(ENDPOINTS.EXCHANGE, payload).then((response) => response.data);
    // console.log(response);

    return leverage;
  }

  protected getVaultAddress() {
    return null;
  }

  /**
   * Place a new order on Hyperliquid perpetual exchange
   * @param order description of order to place
   */
  public async placeOrder(order: OrderData, reduce_only = false): Promise<PlacedOrderData> {
    const { token, side, size, leverage, slippage } = order;
    try {
      if (!this.wallet) {
        throw new Error("Hyperliquid position opening requires walletAddress and privateKey configuration");
      }

      await this.getMeta();

      // If leverage is specified, set it first
      if (leverage && !reduce_only) this.setLeverage(token, leverage);

      // Get current market price to calculate limit price with slippage
      const price = await this.getPrice(token);

      if (!price) {
        throw new Error(`Failed to get current price for ${token}`);
      }

      // Calculate limit price based on side and slippage
      const szDecimals = this.universe[token].szDecimals;
      const is_buy = side === PositionSide.LONG;
      const limitPrice = is_buy
        ? price * (1 + slippage / 100) // For long, add slippage
        : price * (1 - slippage / 100); // For short, subtract slippage
      const sz = size.toFixed(szDecimals);
      const limit_px = this.formatPriceForHyperliquid(limitPrice, true); // true for perps

      // Create order action for Hyperliquid
      const orderRequest = {
        coin: token, // asset/coin
        is_buy, // is buy
        sz, // size
        limit_px, // limit price
        order_type: { limit: { tif: "Gtc" as Tif } },
        reduce_only,
        //        cloid: order.orderId, not working :(
      };

      const response = await this.nativePlaceOrder(orderRequest);
      // console.log(response);
      if (response.status != "ok") {
        throw new Error(JSON.stringify(response) || "Failed to place order");
      }
      if ("error" in response.response.data.statuses?.[0]) {
        throw new Error(response.response.data.statuses?.[0].error);
      }

      // console.log(response.response.data.statuses?.[0]);
      // Extract order ID from response
      const orderResult = response.response.data.statuses?.[0];
      const orderId = orderResult.filled?.oid || orderResult.resting.oid;

      // console.log(`✅ ${this.name}: ${reduce_only ? "close" : "open"} ${side} order placed for ${token}: ${orderId}`);

      return {
        exchange: order.exchange,
        token: order.token,
        side: order.side,
        leverage: order.leverage,
        slippage: order.slippage,

        orderId: orderId.toString(),
        price: limitPrice,
        size,
        status: OrderStatus.FILLED,
      };
    } catch (error) {
      console.error(
        `❌ Error ${reduce_only ? "closing" : "opening"} Hyperliquid ${side} position for ${token}:`,
        error,
      );
      throw error;
    }
  }

  public async getPositionPnL(positionId: string): Promise<number> {
    try {
      // Note: This requires user's wallet address to fetch position data
      // For now, throw an error indicating authentication is needed
      throw new Error("Hyperliquid position PnL requires user wallet address authentication");
    } catch (error) {
      console.error(`Error fetching Hyperliquid position PnL for ${positionId}:`, error);
      throw new Error("Failed to fetch position PnL from Hyperliquid");
    }
  }

  public async getAllPositions(): Promise<Position[]> {
    try {
      // Check if authentication credentials are available
      if (!this.primaryAddress) {
        throw new Error("Hyperliquid requires primaryAddress configuration");
      }

      // Make API call to get positions
      const userPositions = await this.post<HyperliquidClearinghouseState>(ENDPOINTS.INFO, {
        type: InfoType.PERPS_CLEARINGHOUSE_STATE,
        user: this.primaryAddress,
      }).then((response) => response.data.assetPositions);
      // console.debug(userPositions);

      // Map Hyperliquid positions to Position model
      return userPositions.map((hlPosition: HyperliquidPosition) => ({
        id: "id",
        userId: "userId", // This should be provided by the caller
        tradeId: "tradeId", // This should be provided by the caller
        token: hlPosition.position.coin as TokenSymbol,
        status: parseFloat(hlPosition.position.szi) !== 0 ? PositionStatus.OPEN : PositionStatus.CLOSED,
        // entryTimestamp: new Date(), // Hyperliquid doesn't provide entry timestamp in this endpoint

        exchange: this.name,
        side: parseFloat(hlPosition.position.szi) > 0 ? PositionSide.LONG : PositionSide.SHORT,
        size: Math.abs(parseFloat(hlPosition.position.szi)),
        price: parseFloat(hlPosition.position.positionValue) / Math.abs(parseFloat(hlPosition.position.szi)),
        leverage: hlPosition.position.leverage.value,
        // slippage: 0,
        // orderId: "orderId", // Not available in this endpoint

        cost: Math.abs(parseFloat(hlPosition.position.szi)) * parseFloat(hlPosition.position.entryPx),
        unrealizedPnL: parseFloat(hlPosition.position.unrealizedPnl),
        realizedPnL: -parseFloat(hlPosition.position.cumFunding.sinceOpen),

        positionValue: parseFloat(hlPosition.position.positionValue),
      })) as unknown as Position[];
    } catch (error) {
      console.error("Error fetching Hyperliquid positions:", error);
      throw new Error("Failed to fetch positions from Hyperliquid");
    }
  }

  public async getOrderHistory(_symbol?: string, _limit = 100): Promise<any[]> {
    try {
      // Note: This requires user's wallet address for order history
      console.warn("Hyperliquid order history requires user wallet address authentication");
      return [];
    } catch (error) {
      console.error("Error fetching Hyperliquid order history:", error);
      throw new Error("Failed to fetch order history from Hyperliquid");
    }
  }

  public async getAllOrders(token?: TokenSymbol, limit = 100): Promise<PlacedOrderData[]> {
    try {
      if (!this.primaryAddress) {
        throw new Error("Hyperliquid requires primaryAddress configuration");
      }

      // Hyperliquid API: POST /info with type "orderHistory"
      const response = await this.post(ENDPOINTS.INFO, {
        type: "orderHistory",
        user: this.primaryAddress,
        coin: token,
        limit,
      });

      const orders = response.data || [];

      return orders.map((order: any) => ({
        exchange: this.name,
        token: order.coin as TokenSymbol,
        side: order.isBuy ? PositionSide.LONG : PositionSide.SHORT,
        price: parseFloat(order.price) || 0,
        size: parseFloat(order.sz) || 0,
        leverage: order.leverage?.value || 1,
        slippage: 0,
        orderId: order.oid?.toString() || order.id?.toString(),
        status: this.mapOrderStatus(order.status),
      }));
    } catch (error) {
      console.error("Error fetching Hyperliquid all orders:", error);
      throw new Error("Failed to fetch all orders from Hyperliquid");
    }
  }

  private mapOrderStatus(status: string): OrderStatus {
    switch (status?.toUpperCase()) {
      case "FILLED":
        return OrderStatus.FILLED;
      case "CANCELED":
      case "CANCELLED":
        return OrderStatus.CANCELED;
      case "REJECTED":
        return OrderStatus.REJECTED;
      default:
        return OrderStatus.OPEN;
    }
  }
}

export const hyperliquidPerpExchange = new HyperliquidPerpExchange();
export default hyperliquidPerpExchange;
