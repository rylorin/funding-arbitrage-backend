// API reference documation available at https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
import { orderWireToAction } from "@/hyperliquid/signing";
import { ENDPOINTS, ExchangeType, InfoType } from "@hyperliquid/constants";
import { orderToWire, signL1Action } from "@hyperliquid/signing";
import { ethers } from "ethers";
import WebSocket from "ws";
import { HyperliquidPosition, HyperliquidPositionsResponse, Meta, OrderRequest } from "../hyperliquid/types";
import Position, { PositionSide, PositionStatus } from "../models/Position";
import { ExchangeConnector, FundingRateData, OrderData, PlacedOrderData, TokenSymbol } from "../types/index";

interface HyperliquidFundingHistory {
  coin: string;
  fundingRate: string;
  premium: string;
  time: number;
}

type VenueName = string;
type HyperliquidPredictedFundingElement = {
  fundingRate: string;
  nextFundingTime: number;
};
type HyperliquidPredictedFundingItem = [VenueName, HyperliquidPredictedFundingElement];
type HyperliquidPredictedFunding = [TokenSymbol, HyperliquidPredictedFundingItem[]];

export class HyperliquidExchange extends ExchangeConnector {
  private readonly IS_MAINNET: boolean;
  private universe: Record<
    TokenSymbol,
    {
      name: string;
      index: number;
      szDecimals: number;
      maxLeverage: number;
      onlyIsolated?: boolean;
    }
  > = {};
  privateKey: string | null;
  wallet: ethers.Wallet | null;

  constructor() {
    super("hyperliquid");
    this.IS_MAINNET = this.config.get<boolean>("isMainNet");
    this.privateKey = this.config.has("privateKey") ? this.config.get<string>("privateKey") : null;
    if (this.privateKey) this.wallet = new ethers.Wallet(this.privateKey);
    else this.wallet = null;
  }

  private async getMeta(force: boolean = false): Promise<number> {
    if (force || !this.universe["BTC"]) {
      const response = (await this.post(ENDPOINTS.INFO, { type: InfoType.META })).data as Meta;
      response.universe.forEach((item, index) => (this.universe[item.name] = { ...item, index }));
    }
    const count = Object.keys(this.universe).length;
    return count;
  }

  public async testConnection(): Promise<number> {
    try {
      const count = this.getMeta(true);
      console.log(`✅ Hyperliquid Exchange connected: ${count} markets available`);
      return count;
    } catch (error) {
      console.error("❌ Failed to connect to Hyperliquid Exchange:", error);
      return 0;
    }
  }

  private extractTokensFromTickers(marketsResponse: HyperliquidPredictedFunding[]): TokenSymbol[] {
    return marketsResponse.reduce((p, row) => {
      const [coin, perps] = row;
      const element = perps.find((p) => p[0] === "HlPerp");
      if (element) p.push(coin);
      return p;
    }, [] as TokenSymbol[]);
  }

  public async getPrice(tokens?: TokenSymbol[]): Promise<{ [token: string]: number }> {
    try {
      const prices: { [token: string]: number } = {};

      const response = await this.post(ENDPOINTS.INFO, {
        type: InfoType.ALL_MIDS,
      });

      const allMids = response.data as { [token: TokenSymbol]: number };

      const tokensToProcess = tokens || (Object.keys(allMids) as TokenSymbol[]);

      for (const token of tokensToProcess) {
        if (allMids[token] !== undefined) {
          prices[token] = allMids[token];
        }
      }

      return prices;
    } catch (error) {
      console.error("Error fetching Hyperliquid prices:", error);
      throw new Error("Failed to fetch prices from Hyperliquid");
    }
  }

  public async getFundingRates(tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    try {
      const fundingRates: FundingRateData[] = [];

      const prices = await this.getPrice(tokens);

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

  public async getAccountBalance(): Promise<{ [token: string]: number }> {
    try {
      // Note: This requires authentication with user's wallet address
      // For now, return empty object as we don't have user wallet integration
      console.warn("Hyperliquid account balance requires user wallet address authentication");
      return {};
    } catch (error) {
      console.error("Error fetching Hyperliquid account balance:", error);
      throw new Error("Failed to fetch account balance from Hyperliquid");
    }
  }

  public async setLeverage(
    asset: TokenSymbol,
    leverage: number,
    leverageMode: string = "isolated",
  ): Promise<{ market: string; leverage: number }> {
    if (!this.wallet) {
      throw new Error("Hyperliquid set leverage requires walletAddress and privateKey configuration");
    }

    await this.getMeta();

    const vaultAddress = this.getVaultAddress();
    const action = {
      type: ExchangeType.UPDATE_LEVERAGE,
      asset: this.universe[asset].index,
      isCross: leverageMode === "cross",
      leverage: leverage,
    };
    const nonce = this.generateUniqueNonce();
    const signature = await signL1Action(this.wallet, action, vaultAddress, nonce, this.IS_MAINNET);

    const payload = { action, nonce, signature, vaultAddress };
    // console.log("updateLeverage payload", payload);

    // Send leverage update request
    await this.post(ENDPOINTS.EXCHANGE, payload);

    return { market: asset, leverage };
  }

  private getVaultAddress() {
    return null;
  }

  /**
   * Format price according to Hyperliquid rules:
   * - Max 5 significant figures
   * - Max MAX_DECIMALS decimal places (6 for perps, 8 for spot)
   * - Integer prices always allowed regardless of significant figures
   */
  private formatPriceForHyperliquid(price: number, isPerp: boolean = true): string {
    const MAX_DECIMALS = isPerp ? 6 : 8;

    // If price is integer, it's always valid regardless of significant figures
    if (Number.isInteger(price)) {
      return price.toString();
    }

    // Convert to string to count significant figures
    const priceStr = price.toString();
    const significantFigures = priceStr.replace(".", "").replace("-", "").length;

    // If we have more than 5 significant figures, round appropriately
    if (significantFigures > 5) {
      // Find the decimal point position
      const decimalIndex = priceStr.indexOf(".");
      if (decimalIndex === -1) {
        // It's an integer (already handled above)
        return priceStr;
      }

      // Count digits before decimal to determine how many decimal places we can keep
      const digitsBeforeDecimal = decimalIndex;
      const remainingSignificantFigures = 5 - digitsBeforeDecimal;

      if (remainingSignificantFigures > 0) {
        // We can keep some decimal places
        const decimalPlaces = Math.min(remainingSignificantFigures, MAX_DECIMALS);
        return price.toFixed(decimalPlaces);
      } else {
        // No room for decimal places, round to integer
        return Math.round(price).toString();
      }
    }

    // We have 5 or fewer significant figures, just limit decimal places
    const decimalPlaces = Math.min(MAX_DECIMALS, 5);
    return price.toFixed(decimalPlaces);
  }

  private async placeOrder(orderRequest: OrderRequest) {
    if (!this.wallet) {
      throw new Error("Hyperliquid set leverage requires walletAddress and privateKey configuration");
    }

    await this.getMeta();
    const vaultAddress = this.getVaultAddress();
    const grouping = orderRequest.grouping || "na";
    let builder = orderRequest.builder;

    const orderWires = [orderToWire(orderRequest, this.universe[orderRequest.coin].index)];
    // Sign and send the order
    const actions = orderWireToAction(orderWires, grouping, builder);
    const nonce = this.generateUniqueNonce();
    const signature = await signL1Action(this.wallet, actions, vaultAddress, nonce, this.IS_MAINNET);
    const payload = { action: actions, nonce, signature, vaultAddress };
    // console.log("placeOrder payload", payload);

    // Place the order
    return this.post(ENDPOINTS.EXCHANGE, payload).then((response) => response.data);
  }

  /**
   * Place a new order on Hyperliquid exchange
   * @param order description of order to place
   */
  public async openPosition(order: OrderData): Promise<PlacedOrderData> {
    const { token, side, size, price, leverage, slippage } = order;
    try {
      if (!this.wallet) {
        throw new Error("Hyperliquid position opening requires walletAddress and privateKey configuration");
      }

      await this.getMeta();

      // Get current market price to calculate limit price with slippage
      const prices = await this.getPrice([token]);
      const currentPrice = prices[token];

      if (!currentPrice) {
        throw new Error(`Failed to get current price for ${token}`);
      }

      // Calculate limit price based on side and slippage
      const szDecimals = this.universe[token].szDecimals;
      const is_buy = side === PositionSide.LONG;
      const limitPrice = is_buy
        ? currentPrice * (1 + slippage / 100) // For long, add slippage
        : currentPrice * (1 - slippage / 100); // For short, subtract slippage
      const sz = size.toFixed(szDecimals);
      const limit_px = this.formatPriceForHyperliquid(limitPrice, true); // true for perps

      // Create order action for Hyperliquid
      const orderRequest: OrderRequest = {
        coin: token, // asset/coin
        is_buy, // is buy
        sz, // size
        limit_px, // limit price
        order_type: { limit: { tif: "Gtc" } },
        reduce_only: false,
        //        cloid: order.orderId, not working :(
      };

      // If leverage is specified, set it first
      if (leverage) this.setLeverage(token, leverage);

      const response = await this.placeOrder(orderRequest);
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

      console.log(`✅ Hyperliquid ${side} position opened for ${token}: ${orderId}`);

      return {
        exchange: order.exchange,
        token: order.token,
        side: order.side,
        leverage: order.leverage,
        slippage: order.slippage,

        orderId: orderId.toString(),
        price: limitPrice,
        size,
      };
    } catch (error) {
      console.error(`❌ Error opening Hyperliquid ${side} position for ${token}:`, error);
      throw error;
    }
  }

  public async closePosition(_orderData: OrderData): Promise<PlacedOrderData> {
    throw new Error("Hyperliquid position closing requires wallet authentication and signing");
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
      const walletAddress = this.config.has("walletAddress") ? this.config.get<string>("walletAddress") : null;
      const privateKey = this.config.has("privateKey") ? this.config.get<string>("privateKey") : null;

      if (!walletAddress || !privateKey) {
        console.warn("Hyperliquid positions require walletAddress and privateKey configuration");
        return [];
      }

      // Make API call to get positions
      const response = await this.post(ENDPOINTS.INFO, { type: "userFills", user: walletAddress });

      if (!response.data) {
        console.warn("No positions data received from Hyperliquid");
        return [];
      }

      // Parse the response
      const positionsData: HyperliquidPositionsResponse = response.data;

      // Extract positions for the user
      const userPositions = positionsData[walletAddress.toLowerCase()];
      if (!userPositions || !userPositions.assetPositions) {
        return [];
      }

      // Map Hyperliquid positions to Position model
      return userPositions.assetPositions.map((hlPosition: HyperliquidPosition) => ({
        id: `${walletAddress}-${hlPosition.coin}`,
        userId: "userId", // This should be provided by the caller
        tradeId: "tradeId", // This should be provided by the caller
        token: hlPosition.coin as TokenSymbol,
        status: parseFloat(hlPosition.szi) !== 0 ? PositionStatus.OPEN : PositionStatus.CLOSED,
        entryTimestamp: new Date(), // Hyperliquid doesn't provide entry timestamp in this endpoint

        exchange: this.name,
        side: parseFloat(hlPosition.szi) > 0 ? PositionSide.LONG : PositionSide.SHORT,
        size: Math.abs(parseFloat(hlPosition.szi)),
        price: parseFloat(hlPosition.entryPx),
        leverage: hlPosition.leverage.value,
        slippage: 0,
        orderId: "orderId", // Not available in this endpoint

        cost: parseFloat(hlPosition.positionValue),
        unrealizedPnL: parseFloat(hlPosition.unrealizedPnl),
        realizedPnL: parseFloat(hlPosition.realizedPnl),

        updatedAt: new Date(),
        createdAt: new Date(),
      })) as unknown as Position[];
    } catch (error) {
      console.error("Error fetching Hyperliquid positions:", error);
      throw new Error("Failed to fetch positions from Hyperliquid");
    }
  }

  public async getOrderHistory(_symbol?: string, _limit: number = 100): Promise<any[]> {
    try {
      // Note: This requires user's wallet address for order history
      console.warn("Hyperliquid order history requires user wallet address authentication");
      return [];
    } catch (error) {
      console.error("Error fetching Hyperliquid order history:", error);
      throw new Error("Failed to fetch order history from Hyperliquid");
    }
  }

  public connectWebSocket(onMessage: (data: any) => void): void {
    try {
      console.log("🔌 Attempting to connect to Hyperliquid WebSocket:", this.wsUrl);
      this.ws = new WebSocket(this.wsUrl);
      this.isConnected = true;

      this.ws.on("open", () => {
        console.log("✅ Hyperliquid WebSocket connected");

        // Subscribe to multiple topics and coins for comprehensive data
        const tradingPairs: string[] = [];
        const subscriptionTypes = ["trades", "book", "candle", "fills"];

        let subscriptionId = 1;

        // Subscribe to public market data for all trading pairs
        tradingPairs.forEach((coin) => {
          subscriptionTypes.forEach((type) => {
            const subscribeMessage = {
              method: "subscribe",
              subscription: {
                type: type,
                coin: coin,
                isPerp: true, // Hyperliquid primarily trades perpetuals
              },
              id: subscriptionId++,
            };

            console.log(`📡 Subscribing to ${type} for ${coin}`);
            this.ws?.send(JSON.stringify(subscribeMessage));
          });
        });

        // Subscribe to user-specific topics if wallet address is available
        if (this.config.has("walletAddress")) {
          const userTopics = ["userFills", "userFillsByTime", "openInterest", "fundingRates"];

          userTopics.forEach((topic) => {
            const userSubscribeMessage = {
              method: "subscribe",
              subscription: {
                type: topic,
                user: this.config.get("walletAddress"),
              },
              id: subscriptionId++,
            };

            console.log(`📡 Subscribing to user topic: ${topic}`);
            this.ws?.send(JSON.stringify(userSubscribeMessage));
          });
        }

        // Send ping every 30 seconds to maintain connection
        const pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const pingMessage = {
              method: "ping",
              id: Date.now(),
            };
            this.ws.send(JSON.stringify(pingMessage));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log("📨 Hyperliquid WebSocket message received:", JSON.stringify(message, null, 2));
          onMessage(message);
        } catch (error) {
          console.error("Error parsing Hyperliquid WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Hyperliquid WebSocket error:", error);
      });

      this.ws.on("close", (code, reason) => {
        console.log("Hyperliquid WebSocket disconnected:", { code, reason: reason.toString() });
        // Auto-reconnect after 5 seconds
        if (this.isConnected)
          setTimeout(() => {
            console.log("🔄 Attempting to reconnect to Hyperliquid WebSocket...");
            this.connectWebSocket(onMessage);
          }, 5000);
      });
    } catch (error) {
      console.error("Error connecting to Hyperliquid WebSocket:", error);
    }
  }
}

export const hyperliquidExchange = new HyperliquidExchange();
export default hyperliquidExchange;
