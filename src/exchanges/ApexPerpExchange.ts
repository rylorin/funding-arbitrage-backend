// API reference documentation available at https://api-docs.pro.apex.exchange
import { Position, PositionSide, PositionStatus } from "@/models";
import crypto from "crypto";
import WebSocket from "ws";
import { ExchangeConnector, FundingRateData, OrderData, PlacedOrderData, TokenSymbol } from "../types/index";

interface ApexFundingRate {
  symbol: string;
  fundingRate: string;
  nextFundingTime: number;
  markPrice: string;
  indexPrice: string;
}

interface ApexPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  size: string;
  entryPrice: string;
  markPrice: string;
  liquidationPrice: string;
  unrealizedPnl: string;
  leverage: string;
  positionValue: string;
}

interface ApexOrderResponse {
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: string;
  price: string;
  size: string;
  status: string;
}

export class ApexPerpExchange extends ExchangeConnector {
  private readonly apiKey: string;
  private readonly passphrase: string;
  private readonly secretKey: string;

  constructor() {
    super("apexperp");
    this.apiKey = this.config.get<string>("apiKey");
    this.passphrase = this.config.get<string>("passphrase");
    this.secretKey = this.config.get<string>("secretKey");
  }

  /**
   * Generate HMAC SHA256 signature for Apex API requests
   */
  private generateSignature(timestamp: string, method: string, requestPath: string, body: string = ""): string {
    const message = timestamp + method + requestPath + body;
    return crypto.createHmac("sha256", this.secretKey).update(message).digest("base64");
  }

  /**
   * Add authentication headers to requests
   */
  private addAuthHeaders(method: string, requestPath: string, body: string = ""): Record<string, string> {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(timestamp, method, requestPath, body);

    return {
      "APEX-SIGNATURE": signature,
      "APEX-TIMESTAMP": timestamp,
      "APEX-PASSPHRASE": this.passphrase,
    };
  }

  public async testConnection(): Promise<number> {
    try {
      const response = await this.get("/v3/symbols");
      const count = response.data?.data?.list?.length || 0;

      console.log(`✅ Apex Perp Exchange connected: ${count} pairs available`);
      return count;
    } catch (error) {
      console.error("❌ Failed to connect to Apex Perp Exchange:", error);
      return 0;
    }
  }

  protected tokenFromTicker(symbol: string): TokenSymbol | null {
    // Apex uses format like BTC-USDT, ETH-USDT
    const match = symbol.match(/^(\w+)-USDT$/);
    return match ? match[1] : null;
  }

  protected tokenToTicker(token: TokenSymbol): string {
    return `${token}USDT`;
  }

  public async getFundingRates(tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    try {
      const fundingRates: FundingRateData[] = [];

      // Get funding rate data from Apex
      const response = await this.get("/api/v1/funding-rates");
      const fundingData = response.data?.data?.list as ApexFundingRate[];

      if (!fundingData) {
        throw new Error("No funding rate data received from Apex");
      }

      // Extract tokens if not specified
      const tokensToProcess =
        tokens ||
        fundingData
          .map((item) => this.tokenFromTicker(item.symbol))
          .filter((token): token is TokenSymbol => token !== null);

      for (const token of tokensToProcess) {
        try {
          const symbol = this.tokenToTicker(token);
          const tokenFunding = fundingData.find((item) => item.symbol === symbol);

          if (tokenFunding) {
            fundingRates.push({
              exchange: this.name,
              token,
              fundingRate: parseFloat(tokenFunding.fundingRate),
              nextFunding: new Date(tokenFunding.nextFundingTime),
              fundingFrequency: this.config.get("fundingFrequency"),
              updatedAt: new Date(),
              markPrice: parseFloat(tokenFunding.markPrice),
              indexPrice: parseFloat(tokenFunding.indexPrice),
            });
          }
        } catch (error) {
          console.warn(`Failed to get funding rate for ${token} on Apex Perp:`, error);
        }
      }

      return fundingRates;
    } catch (error) {
      console.error("Error fetching Apex Perp funding rates:", error);
      throw new Error("Failed to fetch funding rates from Apex Perp");
    }
  }

  public async getPrice(token: TokenSymbol): Promise<number> {
    try {
      const symbol = this.tokenToTicker(token);
      const response = await this.get(`/v3/ticker?symbol=${symbol}`);

      const tickerData = response.data?.data[0];
      if (!tickerData) {
        throw new Error(`Price data not available for token: ${token}`);
      }

      const price = tickerData.markPrice ? parseFloat(tickerData.markPrice) : parseFloat(tickerData.lastPrice);

      if (!price || isNaN(price)) {
        throw new Error(`Invalid price data for token: ${token}`);
      }

      return price;
    } catch (error) {
      console.error(`❌ Failed to retrieve price for ${token}:`, error);
      throw new Error(`Failed to fetch price from Apex Perp for ${token}`);
    }
  }

  public async getAccountBalance(): Promise<{ [token: string]: number }> {
    try {
      const requestPath = "/api/v1/account";
      const headers = this.addAuthHeaders("GET", requestPath);

      const response = await this.get(requestPath, { headers });
      const balances: { [token: string]: number } = {};

      if (response.data?.data?.balances) {
        response.data.data.balances.forEach((balance: any) => {
          balances[balance.asset] = parseFloat(balance.free) + parseFloat(balance.locked);
        });
      }

      return balances;
    } catch (error) {
      console.error("Error fetching Apex Perp account balance:", error);
      throw new Error("Failed to fetch account balance from Apex Perp");
    }
  }

  public async setLeverage(token: TokenSymbol, leverage: number): Promise<number> {
    try {
      const symbol = this.tokenToTicker(token);
      const requestPath = "/v3/set-initial-margin-rate";
      const body = JSON.stringify({ leverage, symbol });
      const headers = this.addAuthHeaders("POST", requestPath, body);

      const response = await this.post(requestPath, body, { headers });
      console.debug(response);
      return leverage;
    } catch (error) {
      console.error(`Error setting leverage for ${token}:`, error);
      throw new Error(`Failed to set leverage for ${token} on Apex Perp`);
    }
  }

  public async openPosition(orderData: OrderData, reduceOnly: boolean = false): Promise<PlacedOrderData> {
    const { token, side, size, slippage, leverage } = orderData;

    try {
      // Set leverage if specified
      if (leverage && !reduceOnly) {
        await this.setLeverage(token, leverage);
      }

      const symbol = this.tokenToTicker(token);
      const isBuy = side === PositionSide.LONG;

      // Get current price for slippage calculation
      const currentPrice = await this.getPrice(token);
      const limitPrice = isBuy ? currentPrice * (1 + slippage / 100) : currentPrice * (1 - slippage / 100);

      const requestPath = "/v3/order";
      const orderPayload = {
        symbol,
        side: isBuy ? "BUY" : "SELL",
        type: "MARKET",
        size: size.toString(),
        reduceOnly: `${reduceOnly}`,
      };

      const body = JSON.stringify(orderPayload);
      const headers = this.addAuthHeaders("POST", requestPath, body);

      const response = await this.post(requestPath, orderPayload, { headers });
      console.debug(response);
      const orderResponse = response.data?.data as ApexOrderResponse;

      if (!orderResponse?.orderId) {
        throw new Error("Failed to place order: No order ID returned");
      }

      console.log(`✅ Apex Perp ${side} position opened: ${orderResponse.orderId}`);

      return {
        ...orderData,
        orderId: orderResponse.orderId,
        size: parseFloat(orderResponse.size),
        price: parseFloat(orderResponse.price) || limitPrice,
      };
    } catch (error) {
      console.error(`Error opening Apex Perp position for ${token}:`, error);
      throw error;
    }
  }

  public async cancelOrder(orderData: PlacedOrderData): Promise<boolean> {
    const { token, orderId } = orderData;

    try {
      const symbol = this.tokenToTicker(token);
      const requestPath = "/api/v1/order";
      const body = JSON.stringify({ symbol, orderId });
      const headers = this.addAuthHeaders("DELETE", requestPath, body);

      const response = await this.delete(requestPath, {
        headers,
        data: { symbol, orderId },
      });

      return response.data?.success === true;
    } catch (error) {
      console.error(`Error cancelling order ${orderId}:`, error);
      throw new Error(`Failed to cancel order ${orderId} on Apex Perp`);
    }
  }

  public async getAllPositions(): Promise<Position[]> {
    try {
      const requestPath = "/api/v1/positions";
      const headers = this.addAuthHeaders("GET", requestPath);

      const response = await this.get(requestPath, { headers });
      const positions = response.data?.data?.list as ApexPosition[];

      if (!positions) {
        return [];
      }

      return positions
        .filter((pos) => parseFloat(pos.size) !== 0)
        .map((pos) => ({
          id: "id",
          userId: "userId",
          tradeId: "tradeId",
          token: this.tokenFromTicker(pos.symbol) as TokenSymbol,
          status: PositionStatus.OPEN,
          entryTimestamp: new Date(),

          exchange: this.name,
          side: pos.side === "LONG" ? PositionSide.LONG : PositionSide.SHORT,
          size: Math.abs(parseFloat(pos.size)),
          price: parseFloat(pos.markPrice),
          leverage: parseFloat(pos.leverage),
          orderId: "orderId",

          cost: parseFloat(pos.positionValue),
          unrealizedPnL: parseFloat(pos.unrealizedPnl),
          realizedPnL: 0,

          entryPrice: parseFloat(pos.entryPrice),
          liqPrice: parseFloat(pos.liquidationPrice),
        })) as unknown as Position[];
    } catch (error) {
      console.error("Error fetching Apex Perp positions:", error);
      throw new Error("Failed to fetch positions from Apex Perp");
    }
  }

  public async getPositionPnL(positionId: string): Promise<number> {
    try {
      const positions = await this.getAllPositions();
      const position = positions.find((pos) => pos.id === positionId);

      return position?.unrealizedPnL || 0;
    } catch (error) {
      console.error(`Error fetching position PnL for ${positionId}:`, error);
      throw new Error("Failed to fetch position PnL from Apex Perp");
    }
  }

  public connectWebSocket(onMessage: (data: any) => void): void {
    try {
      console.log("🔌 Attempting to connect to Apex Perp WebSocket:", this.wsUrl);
      this.ws = new WebSocket(this.wsUrl);
      this.isConnected = true;

      this.ws.on("open", () => {
        console.log("✅ Apex Perp WebSocket connected");

        // Authenticate WebSocket connection
        if (this.config.has("apiKey")) {
          const timestamp = Date.now().toString();
          const signature = this.generateSignature(timestamp, "GET", "/ws", "");

          const authMessage = {
            op: "auth",
            args: [
              {
                apiKey: this.config.get("apiKey"),
                passphrase: this.config.get("passphrase"),
                timestamp,
                signature,
              },
            ],
          };

          this.ws?.send(JSON.stringify(authMessage));
        }

        // Subscribe to channels after authentication
        setTimeout(() => {
          const subscriptions = [
            { channel: "ticker", instType: "PERP" },
            { channel: "funding-rate", instType: "PERP" },
            { channel: "positions", instType: "PERP" },
            { channel: "orders", instType: "PERP" },
          ];

          subscriptions.forEach((sub) => {
            const subscribeMessage = {
              op: "subscribe",
              args: [sub],
            };
            this.ws?.send(JSON.stringify(subscribeMessage));
          });
        }, 1000);

        // Send ping every 30 seconds
        const pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ op: "ping" }));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());

          // Handle pong response
          if (message.op === "pong") {
            return;
          }

          console.log("📨 Apex Perp WebSocket message received:", JSON.stringify(message, null, 2));
          onMessage(message);
        } catch (error) {
          console.error("Error parsing Apex Perp WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Apex Perp WebSocket error:", error);
      });

      this.ws.on("close", (code, reason) => {
        console.log("Apex Perp WebSocket disconnected:", { code, reason: reason.toString() });

        if (this.isConnected) {
          setTimeout(() => {
            console.log("🔄 Attempting to reconnect to Apex Perp WebSocket...");
            this.connectWebSocket(onMessage);
          }, 5000);
        }
      });
    } catch (error) {
      console.error("Error connecting to Apex Perp WebSocket:", error);
    }
  }
}

export const apexPerpExchange = new ApexPerpExchange();
export default apexPerpExchange;
