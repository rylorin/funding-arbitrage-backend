// API reference documation available at https://api.docs.extended.exchange/#extended-api-documentation
import { FeesResponseSchema } from "@/extended/api/fees.schema";
import { LeverageResponseSchema } from "@/extended/api/leverage.schema";
import { Market, MarketsResponseSchema } from "@/extended/api/markets.schema";
import { PlacedOrderResponseSchema } from "@/extended/api/orders.schema";
import { UserPositionsResponseSchema } from "@/extended/api/positions.schema";
import { StarknetDomainResponseSchema } from "@/extended/api/starknet.schema";
import { Order } from "@/extended/models/order";
import { createOrderContext } from "@/extended/utils/create-order-context";
import { HexString } from "@/extended/utils/hex";
import { Decimal, Long } from "@/extended/utils/number";
import { roundToMinChange } from "@/extended/utils/round-to-min-change";
import { Position } from "@/models";
import { PositionSide, PositionStatus } from "@/models/Position";
import WebSocket from "ws";
import { ExchangeConnector, FundingRateData, OrderData, PlacedOrderData, TokenSymbol } from "../types";

interface ExtendedMarketStats {
  dailyVolume: string;
  dailyVolumeBase: string;
  dailyPriceChange: string;
  dailyPriceChangePercentage: string;
  dailyLow: string;
  dailyHigh: string;
  lastPrice: string;
  askPrice: string;
  bidPrice: string;
  markPrice: string;
  indexPrice: string;
  fundingRate: string;
  nextFundingRate: number;
  openInterest: string;
  openInterestBase: string;
}

interface ExtendedMarket {
  name: string;
  uiName: string;
  category: string;
  assetName: string;
  assetPrecision: number;
  collateralAssetName: string;
  collateralAssetPrecision: number;
  active: boolean;
  status: string;
  marketStats: ExtendedMarketStats;
}

interface ExtendedMarketsResponse {
  status: string;
  data: ExtendedMarket[];
}

type GenericResponse<T> = {
  status: "OK" | "ERROR";
  data: T;
};

export class ExtendedExchange extends ExchangeConnector {
  private ws: WebSocket | null = null;
  private starkPrivateKey: HexString;
  private vaultId: string;

  constructor() {
    super("extended");

    this.starkPrivateKey = this.config.get<HexString>("starkPrivateKey");
    this.vaultId = this.config.get("vaultId");

    // Auto-connect WebSocket for real-time data
    // this.connectWebSocket((data) => console.log("Extended WS:", data));
  }

  public async testConnection(): Promise<number> {
    try {
      // Test connection with public endpoint - get markets
      const response = await this.get("/api/v1/info/markets");
      const marketsResponse = response.data as ExtendedMarketsResponse;
      const count = marketsResponse.data?.length || 0;

      console.log(`✅ Extended Exchange connected: ${count} markets available`);
      return count;
    } catch (error) {
      console.error("❌ Failed to connect to Extended Exchange:", error);
      return 0;
    }
  }

  protected tokenFromTicker(symbol: string): string | null {
    // Extract token from market name like BTC-USD
    const parts = symbol.split("-");
    return parts.length === 2 ? (parts[0] as TokenSymbol) : null;
  }

  private extractTokensFromTickers(marketsResponse: ExtendedMarket[]): TokenSymbol[] {
    return marketsResponse.map((m) => this.tokenFromTicker(m.name)).filter((t): t is TokenSymbol => t !== null);
  }

  protected tokenToTicker(token: TokenSymbol): string {
    return `${token}-USD`;
  }

  public async getFundingRates(tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    try {
      const fundingRates: FundingRateData[] = [];

      // Get all markets to find funding rates
      const response = await this.get("/api/v1/info/markets");
      const marketsResponse = response.data as ExtendedMarketsResponse;

      // If no tokens specified, extract all available tokens from tickers
      const tokensToProcess = tokens || this.extractTokensFromTickers(marketsResponse.data);

      // For each requested token, find its funding rate

      for (const token of tokensToProcess) {
        try {
          // Extended uses format like BTC-USD, ETH-USD, SOL-USD
          const symbol = this.tokenToTicker(token);

          // Find market for this token
          const market = marketsResponse.data.find((m) => m.name === symbol);

          if (market && market.marketStats) {
            // 1h funding rate from market stats
            const fundingRate = parseFloat(market.marketStats.fundingRate);

            // Next funding time is provided in milliseconds
            const nextFunding = new Date(market.marketStats.nextFundingRate);

            fundingRates.push({
              exchange: this.name,
              token,
              fundingRate,
              fundingFrequency: this.config.get("fundingFrequency"), // in hours
              nextFunding,
              updatedAt: new Date(),
              markPrice: parseFloat(market.marketStats.markPrice),
              indexPrice: parseFloat(market.marketStats.indexPrice),
            });
          }
        } catch (error) {
          console.warn(`Failed to get funding rate for ${token} on Extended:`, error);
        }
      }

      return fundingRates;
    } catch (error) {
      console.error("Error fetching Extended funding rates:", error);
      throw new Error("Failed to fetch funding rates from Extended");
    }
  }

  public async getAccountBalance(): Promise<{ [token: string]: number }> {
    try {
      // Extended requires Stark signature for private endpoints
      // TODO: Implement authenticated balance retrieval
      console.warn("Extended account balance requires Stark signature authentication");
      return {};
    } catch (error) {
      console.error("Error fetching Extended account balance:", error);
      throw new Error("Failed to fetch account balance from Extended");
    }
  }

  private async checkOrderBounds(order: OrderData): Promise<Market> {
    const { token, size } = order;
    const marketName = this.tokenToTicker(token);
    const market = await this.getMarket(marketName);

    const orderSize = Decimal(size);

    if (orderSize.isLessThan(market.tradingConfig.minOrderSize)) {
      throw new Error(
        `Order size ${orderSize.toString()} is below minimum ${market.tradingConfig.minOrderSize.toString()} for ${marketName}`,
      );
    }

    return market;
  }

  public async setLeverage(token: TokenSymbol, leverage: number): Promise<{ market: string; leverage: number }> {
    const payload = { market: this.tokenToTicker(token), leverage };
    const { data } = await this.patch<GenericResponse<unknown>>("/api/v1/user/leverage", payload).catch(
      (reason: any) => {
        // console.error(this.name, payload, reason);
        throw new Error(reason.data.status || reason.message || "Unknown error #1");
      },
    );
    // console.log(data);
    // returs payload if status is OK as response does not conform to documentation (empty data object returned)
    return data.status == "OK" ? payload : LeverageResponseSchema.parse(data).data;
  }

  public async openPosition(order: OrderData, reduceOnly: boolean = false): Promise<PlacedOrderData> {
    const { token, side, size } = order;
    try {
      if (order.leverage) await this.setLeverage(order.token, order.leverage);

      // Extended uses format like BTC-USD, ETH-USD, SOL-USD
      const marketName = this.tokenToTicker(token);

      // Convert side to Extended format (BUY/SELL)
      const orderSide = side === PositionSide.LONG ? "BUY" : "SELL";

      const market = await this.checkOrderBounds(order);
      const fees = await this.getFees({ marketName });
      const starknetDomain = await this.getStarknetDomain();

      // const orderSize = Decimal(size);
      const amountOfSynthetic = roundToMinChange(
        Decimal(size),
        market.tradingConfig.minOrderSizeChange,
        Decimal.ROUND_DOWN,
      );

      const orderPrice =
        order.side == PositionSide.LONG
          ? market.marketStats.askPrice.times(1 + order.slippage / 100)
          : market.marketStats.bidPrice.times(1 - order.slippage / 100);
      const price = roundToMinChange(
        orderPrice,
        market.tradingConfig.minPriceChange,
        PositionSide.LONG ? Decimal.ROUND_UP : Decimal.ROUND_DOWN,
      );
      // console.log(market.marketStats.askPrice, market.marketStats.bidPrice, price);

      const ctx = createOrderContext({
        market,
        fees,
        starknetDomain,
        vaultId: this.vaultId,
        starkPrivateKey: this.starkPrivateKey,
      });

      const nativeOrder = Order.create({
        marketName: marketName,
        orderType: "MARKET",
        side: orderSide,
        amountOfSynthetic,
        price,
        timeInForce: "IOC",
        reduceOnly,
        postOnly: false,
        ctx,
      });

      const result = await this.placeOrder({ order: nativeOrder });

      return { ...order, orderId: result.externalId, price: price.toNumber(), size: amountOfSynthetic.toNumber() };
    } catch (error) {
      throw error;
    }
  }

  public async cancelOrder(order: PlacedOrderData): Promise<boolean> {
    const { orderId: externalId } = order;
    const result = await this.post<GenericResponse<null>>(`/api/v1/user/order?externalId=${externalId}`);

    return result.data.status == "OK";
  }

  async placeOrder(args: { order: Order }) {
    const { data } = await this.post<unknown>("/api/v1/user/order", args.order);

    return PlacedOrderResponseSchema.parse(data).data;
  }

  private async getStarknetDomain() {
    const { data } = await this.get<unknown>("/api/v1/info/starknet");

    return StarknetDomainResponseSchema.parse(data).data;
  }

  private async getFees({ marketName, builderId }: { marketName: string; builderId?: Long }) {
    const { data } = await this.get<unknown>("/api/v1/user/fees", {
      params: {
        market: [marketName],
        builderId: builderId?.toString(),
      },
    });

    return FeesResponseSchema.parse(data).data[0];
  }

  private async getMarket(marketName: string): Promise<Market> {
    const { data } = await this.get<unknown>("/api/v1/info/markets", {
      params: {
        market: [marketName],
      },
    });

    return MarketsResponseSchema.parse(data).data[0];
  }

  public async getPositionPnL(positionId: string): Promise<number> {
    try {
      // Note: Extended requires authentication for position data
      throw new Error("Extended position PnL requires Stark signature authentication");
    } catch (error) {
      console.error(`Error fetching Extended position PnL for ${positionId}:`, error);
      throw new Error("Failed to fetch position PnL from Extended");
    }
  }

  public async getOrderHistory(_symbol?: string, _limit: number = 100): Promise<any[]> {
    try {
      // Note: Extended requires authentication for order history
      console.warn("Extended order history requires Stark signature authentication");
      return [];
    } catch (error) {
      console.error("Error fetching Extended order history:", error);
      throw new Error("Failed to fetch order history from Extended");
    }
  }

  public connectWebSocket(onMessage: (data: any) => void): void {
    try {
      console.log("🔌 Attempting to connect to Extended WebSocket:", this.wsUrl);
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => {
        console.log("✅ Extended WebSocket connected");

        // Subscribe to all relevant topics for Extended Exchange
        const subscribeTopics = [
          // Market data topics
          "btcusdt@ticker",
          "ethusdt@ticker",
          "solusdt@ticker",
          "adausdt@ticker",
          "dogeusdt@ticker",
          "maticusdt@ticker",
          "avaxusdt@ticker",
          "dotusdt@ticker",
          "linkusdt@ticker",
          "ltcusdt@ticker",

          // Market depth/orderbook
          "btcusdt@depth5",
          "ethusdt@depth5",
          "solusdt@depth5",

          // Trade data
          "btcusdt@trades",
          "ethusdt@trades",
          "solusdt@trades",

          // Funding rates
          "btcusdt@fundingRate",
          "ethusdt@fundingRate",
          "solusdt@fundingRate",

          // User-specific topics (if authenticated)
          "orders",
          "fills",
          "positions",
          "balance",
          "account",
        ];

        // Subscribe to market data updates
        subscribeTopics.forEach((topic, index) => {
          if (topic.includes("@")) {
            // Standard ticker/depth/funding topics
            const subscribeMessage = {
              method: "SUBSCRIBE",
              params: [topic],
              id: index + 1,
            };
            console.log(`📡 Subscribing to market topic: ${topic}`);
            this.ws?.send(JSON.stringify(subscribeMessage));
          } else {
            // User-specific topics
            const userSubscribeMessage = {
              method: "SUBSCRIBE_PRIVATE",
              params: [topic],
              id: index + 100,
            };
            console.log(`📡 Subscribing to private topic: ${topic}`);
            this.ws?.send(JSON.stringify(userSubscribeMessage));
          }
        });

        // Send heartbeat to maintain connection
        const heartbeatInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const pingMessage = {
              method: "PING",
              id: Date.now(),
            };
            this.ws.send(JSON.stringify(pingMessage));
          } else {
            clearInterval(heartbeatInterval);
          }
        }, 30000); // Ping every 30 seconds
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log("📨 Extended WebSocket message received:", JSON.stringify(message, null, 2));
          onMessage(message);
        } catch (error) {
          console.error("Error parsing Extended WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Extended WebSocket error:", error);
      });

      this.ws.on("close", (code, reason) => {
        console.log("Extended WebSocket disconnected:", { code, reason: reason.toString() });
        // Auto-reconnect after 5 seconds
        setTimeout(() => {
          console.log("🔄 Attempting to reconnect to Extended WebSocket...");
          this.connectWebSocket(onMessage);
        }, 5000);
      });
    } catch (error) {
      console.error("Error connecting to Extended WebSocket:", error);
    }
  }

  public disconnect(): void {
    if (this.ws) {
      console.log("🔌 Disconnecting Extended WebSocket...");
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
      this.isConnected = false;
      console.log("✅ Extended WebSocket disconnected");
    }
  }

  public async getAllPositions(): Promise<Position[]> {
    const { data } = await this.get<unknown>("/api/v1/user/positions");
    // console.log(data);
    return UserPositionsResponseSchema.parse(data).data.map(
      (pos) =>
        ({
          id: pos.id.toNumber(),
          userId: "userId",
          tradeId: "tradeId",
          token: this.tokenFromTicker(pos.market),
          status: pos.size ? PositionStatus.OPEN : PositionStatus.CLOSED,
          entryTimestamp: new Date(pos.createdAt),

          exchange: this.name,
          side: pos.side == "LONG" ? PositionSide.LONG : PositionSide.SHORT,
          size: pos.size.toNumber(),
          price: pos.markPrice.toNumber(),
          leverage: pos.leverage.toNumber(),
          orderId: "orderId",

          cost: pos.openPrice.times(pos.size).toNumber(),
          unrealizedPnL: pos.unrealisedPnl.toNumber(),
          realizedPnL: pos.realisedPnl.toNumber(),

          accountId: pos.accountId.toNumber(),
          value: pos.value.toNumber(),
          openPrice: pos.openPrice.toNumber(),
          liquidationPrice: pos.liquidationPrice.toNumber(),
          margin: pos.margin.toNumber(),
          tpTriggerPrice: pos.tpTriggerPrice,
          tpLimitPrice: pos.tpLimitPrice,
          slTriggerPrice: pos.slTriggerPrice,
          slLimitPrice: pos.slLimitPrice,
          maxPositionSize: pos.maxPositionSize,
          adl: pos.adl,
          updatedAt: pos.updatedAt,
        }) as unknown as Position,
    );
  }
}

export const extendedExchange = new ExtendedExchange();
