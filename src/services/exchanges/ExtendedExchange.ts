import WebSocket from "ws";
import { ExchangeConnector, FundingRateData, TokenSymbol } from "../../types";
import { generateNonce, generateOrderSignature, OrderMessage, StarknetSignatureError } from "../../utils/starknet";
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

export class ExtendedExchange extends ExchangeConnector {
  private ws: WebSocket | null = null;

  constructor() {
    super("extended");

    // Add API key if available
    if (this.config.has("apiKey")) {
      this.client.defaults.headers["X-Api-Key"] = this.config.get("apiKey");
    }

    // Initialize Starknet signing capability
    this.initializeStarknetSigning();

    // Add request interceptor for authenticated endpoints
    this.client.interceptors.request.use(this.signRequest.bind(this));

    this.testConnection();
  }

  private async testConnection(): Promise<void> {
    try {
      // Test connection with public endpoint - get markets
      const response = await this.client.get("/api/v1/info/markets");
      const marketsResponse = response.data as ExtendedMarketsResponse;

      this.isConnected = true;
      console.log(`✅ Extended Exchange connected: ${marketsResponse.data?.length || 0} markets available`);
    } catch (error) {
      console.error("❌ Failed to connect to Extended Exchange:", error);
      this.isConnected = false;
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
      const response = await this.client.get("/api/v1/info/markets");
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

  /**
   * Initialize Starknet signing capability
   */
  private initializeStarknetSigning(): void {
    try {
      // Validate required configuration parameters
      if (!this.config.has("stark-key-private")) {
        throw new Error("Missing Starknet private key configuration");
      }
      if (!this.config.has("stark-key-public")) {
        throw new Error("Missing Starknet public key configuration");
      }
      if (!this.config.has("vault")) {
        throw new Error("Missing vault configuration");
      }
      if (!this.config.has("client-id")) {
        throw new Error("Missing client ID configuration");
      }

      console.log("✅ Extended Starknet signing initialized");
    } catch (error) {
      console.error("❌ Failed to initialize Starknet signing:", error);
      throw error;
    }
  }

  /**
   * Sign requests to authenticated endpoints
   */
  private signRequest(config: any): any {
    // For now, only sign order-related requests
    // Additional authentication logic can be added here for other endpoints
    return config;
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
    const { token, side, size, price } = order;
    try {
      if (!this.isConnected) {
        throw new Error("Extended exchange is not connected");
      }

      const apiKey = this.config.get("apiKey");
      if (!apiKey) {
        throw new Error("Extended API key not configured");
      }

      // Extended uses format like BTC-USD, ETH-USD, SOL-USD
      const symbol = `${token}-USD`;

      // Convert side to Extended format (BUY/SELL)
      const orderSide = side === OrderSide.LONG ? "buy" : "sell";

      // Generate unique nonce for this order
      const nonce = generateNonce();

      // Prepare order message for signing
      const orderMessage: OrderMessage = {
        id: `${token}-${this.name}-${nonce}`, // Unique client order ID
        market: symbol,
        type: "market", // Market order for immediate execution
        side: orderSide,
        qty: size,
        price: price * (side === OrderSide.LONG ? 1.001 : 0.999), // Slightly adjust price to ensure execution
        timeInForce: "GTT",
        expiryEpochMillis: Date.now() + 60 * 1_000, // Order valid for 60 seconds
        fee: "0.0002",
        selfTradeProtectionLevel: "ACCOUNT",
        nonce,
        vault: this.config.get("vault"),
        clientId: this.config.get("client-id"),
      };

      // Generate Starknet signature
      const settlement = generateOrderSignature(
        orderMessage,
        this.config.get("stark-key-private"),
        this.config.get("stark-key-public"),
        this.config.get("vault"),
      );

      // Prepare order data with signature
      const orderData = {
        ...orderMessage,
        settlement,
      };

      // Make API request to place order with API key in headers
      const response = await this.client.post("/api/v1/user/order", orderData, {});

      if (response.data && response.data.orderId) {
        console.log(`✅ Opened ${side} position for ${token} on Extended: ${response.data.orderId}`);
        return response.data.orderId.toString();
      } else {
        throw new Error("Invalid response from Extended API");
      }
    } catch (error) {
      if (error instanceof StarknetSignatureError) {
        console.error(`Starknet signature error for ${token}:`, (error as StarknetSignatureError).message);
        throw new Error(
          `Failed to generate signature for ${side} position: ${(error as StarknetSignatureError).message}`,
        );
      }
      console.error(`Error opening Extended ${side} position for ${token}:`, error);
      throw new Error(
        `Failed to open ${side} position on Extended: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
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
    this.isConnected = false;
  }
}

export const extendedExchange = new ExtendedExchange();
