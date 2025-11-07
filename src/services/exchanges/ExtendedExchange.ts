import { FeesResponseSchema } from "@/extended/api/fees.schema";
import { MarketsResponseSchema } from "@/extended/api/markets.schema";
import { PlacedOrderResponseSchema } from "@/extended/api/orders.schema";
import { StarknetDomainResponseSchema } from "@/extended/api/starknet.schema";
import { Order } from "@/extended/models/order";
import { createOrderContext } from "@/extended/utils/create-order-context";
import { HexString } from "@/extended/utils/hex";
import { Decimal, Long } from "@/extended/utils/number";
import { roundToMinChange } from "@/extended/utils/round-to-min-change";
import WebSocket from "ws";
import { ExchangeConnector, FundingRateData, TokenSymbol } from "../../types";
import { OrderData, OrderSide } from "./ExchangeConnector";

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

const SLIPPAGE = 0.0075;

export class ExtendedExchange extends ExchangeConnector {
  private ws: WebSocket | null = null;
  private starkPrivateKey: HexString;
  private vaultId: string;

  constructor() {
    super("extended");

    this.starkPrivateKey = this.config.get<HexString>("starkPrivateKey");
    this.vaultId = this.config.get("vaultId");
  }

  public async testConnection(): Promise<number> {
    try {
      // Test connection with public endpoint - get markets
      const response = await this.axiosClient.get("/api/v1/info/markets");
      const marketsResponse = response.data as ExtendedMarketsResponse;
      const count = marketsResponse.data?.length || 0;

      console.log(`✅ Extended Exchange connected: ${count} markets available`);
      return count;
    } catch (error) {
      console.error("❌ Failed to connect to Extended Exchange:", error);
      return 0;
    }
  }

  private extractTokensFromTickers(marketsResponse: ExtendedMarket[]): TokenSymbol[] {
    return marketsResponse
      .map((m) => {
        // Extract token from market name like BTC-USD
        const parts = m.name.split("-");
        return parts.length === 2 ? (parts[0] as TokenSymbol) : null;
      })
      .filter((t): t is TokenSymbol => t !== null);
  }

  public async getFundingRates(tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    try {
      const fundingRates: FundingRateData[] = [];

      // Get all markets to find funding rates
      const response = await this.axiosClient.get("/api/v1/info/markets");
      const marketsResponse = response.data as ExtendedMarketsResponse;

      // If no tokens specified, extract all available tokens from tickers
      const tokensToProcess = tokens || this.extractTokensFromTickers(marketsResponse.data);

      // For each requested token, find its funding rate

      for (const token of tokensToProcess) {
        try {
          // Extended uses format like BTC-USD, ETH-USD, SOL-USD
          const symbol = `${token}-USD`;

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
              timestamp: new Date(),
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

  public async openPosition(order: OrderData): Promise<string> {
    const { token, side, size } = order;
    try {
      // Extended uses format like BTC-USD, ETH-USD, SOL-USD
      const marketName = `${token}-USD`;

      // Convert side to Extended format (BUY/SELL)
      const orderSide = side === OrderSide.LONG ? "BUY" : "SELL";

      const market = await this.getMarket(marketName);
      const fees = await this.getFees({ marketName });
      const starknetDomain = await this.getStarknetDomain();

      // const orderSize = market.tradingConfig.minOrderSize;
      const orderSize = Decimal(size);
      const orderPrice = market.marketStats.askPrice.times(1 + SLIPPAGE);

      const ctx = createOrderContext({
        market,
        fees,
        starknetDomain,
        vaultId: this.vaultId,
        starkPrivateKey: this.starkPrivateKey,
      });

      const order = Order.create({
        marketName: marketName,
        orderType: "MARKET",
        side: orderSide,
        amountOfSynthetic: roundToMinChange(orderSize, market.tradingConfig.minOrderSizeChange, Decimal.ROUND_DOWN),
        price: roundToMinChange(orderPrice, market.tradingConfig.minPriceChange, Decimal.ROUND_DOWN),
        timeInForce: "IOC",
        reduceOnly: false,
        postOnly: false,
        ctx,
      });

      // // Generate unique nonce for this order
      // const nonce = generateNonce();

      // // Prepare order message for signing
      // const orderMessage: OrderMessage = {
      //   id: `${token}-${this.name}-${nonce}`, // Unique client order ID
      //   market: marketName,
      //   type: "market", // Market order for immediate execution
      //   side: orderSide,
      //   qty: size.toString(),
      //   price: (price * (side === OrderSide.LONG ? 1.001 : 0.999)).toString(), // Slightly adjust price to ensure execution
      //   timeInForce: "GTT",
      //   expiryEpochMillis: Date.now() + 60 * 1_000, // Order valid for 60 seconds
      //   fee: "0.0002",
      //   selfTradeProtectionLevel: "ACCOUNT",
      //   nonce,
      //   // vault: this.config.get("vault"),
      //   // clientId: this.config.get("client-id"),
      // };

      // // Generate Starknet signature
      // const settlement = generateOrderSignature(
      //   orderMessage,
      //   this.config.get("stark-key-private"),
      //   this.config.get("stark-key-public"),
      //   this.config.get("vault"),
      // );

      // // Prepare order data with signature
      // const orderData = {
      //   ...orderMessage,
      //   settlement,
      // };

      const result = await this.placeOrder({ order });

      console.log("Order placed: %o", result);

      return result.externalId;
    } catch (error) {
      console.error(`Error opening Extended ${side} position for ${token}:`, error);
      throw new Error(
        `Failed to open ${side} position on Extended: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async placeOrder(args: { order: Order }) {
    const { data } = await this.axiosClient.post<unknown>("/api/v1/user/order", args.order);

    return PlacedOrderResponseSchema.parse(data).data;
  }

  private async getStarknetDomain() {
    const { data } = await this.axiosClient.get<unknown>("/api/v1/info/starknet");

    return StarknetDomainResponseSchema.parse(data).data;
  }

  private async getFees({ marketName, builderId }: { marketName: string; builderId?: Long }) {
    const { data } = await this.axiosClient.get<unknown>("/api/v1/user/fees", {
      params: {
        market: [marketName],
        builderId: builderId?.toString(),
      },
    });

    return FeesResponseSchema.parse(data).data[0];
  }

  private async getMarket(marketName: string) {
    const { data } = await this.axiosClient.get<unknown>("/api/v1/info/markets", {
      params: {
        market: [marketName],
      },
    });

    return MarketsResponseSchema.parse(data).data[0];
  }

  public async closePosition(positionId: string): Promise<boolean> {
    try {
      // Note: Extended requires Stark signature for trading operations
      throw new Error("Extended position closing requires Stark signature authentication");
    } catch (error) {
      console.error(`Error closing Extended position ${positionId}:`, error);
      return false;
    }
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

  public async getAllPositions(): Promise<any[]> {
    try {
      // Note: Extended requires authentication for positions
      console.warn("Extended positions require Stark signature authentication");
      return [];
    } catch (error) {
      console.error("Error fetching Extended positions:", error);
      throw new Error("Failed to fetch positions from Extended");
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
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => {
        console.log("✅ Extended WebSocket connected");

        // Subscribe to market data updates (funding rates, prices)
        const subscribeMessage = {
          method: "SUBSCRIBE",
          params: ["btcusdt@ticker", "ethusdt@ticker", "solusdt@ticker"],
          id: 1,
        };

        this.ws?.send(JSON.stringify(subscribeMessage));
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          onMessage(message);
        } catch (error) {
          console.error("Error parsing Extended WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Extended WebSocket error:", error);
      });

      this.ws.on("close", () => {
        console.log("Extended WebSocket disconnected");
        // Auto-reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(onMessage), 5000);
      });
    } catch (error) {
      console.error("Error connecting to Extended WebSocket:", error);
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const extendedExchange = new ExtendedExchange();
