// API reference: https://github.com/asterdex/api-docs/blob/master/aster-finance-spot-api.md
import { AxiosRequestConfig, AxiosResponse } from "axios";
import { createHmac } from "crypto";
import WebSocket from "ws";
import Position, { PositionSide, PositionStatus } from "../models/Position";
import { ExchangeConnector, FundingRateData, OrderData, PlacedOrderData, TokenSymbol } from "../types/index";

interface AsterSpotMarket {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  isSpotTradingAllowed: boolean;
  quotePrecision: number;
  basePrecision: number;
  minQty: string;
  maxQty: string;
  stepSize: string;
  tickSize: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  lastPrice: string;
  lastQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

interface AsterSpotAccountInfo {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
  accountType: string;
  balances: Array<{
    asset: string;
    free: string;
    locked: string;
  }>;
  permissions: string[];
}

interface AsterSpotOrder {
  symbol: string;
  orderId: number;
  orderListId: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  stopPrice: string;
  icebergQty: string;
  time: number;
  updateTime: number;
  isWorking: boolean;
  origQuoteOrderQty: string;
}

function calculateHmacSha256(data: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(data);
  return hmac.digest("hex");
}

export class AsterSpotExchange extends ExchangeConnector {
  private readonly secretKey: string;
  private readonly universe: Record<
    TokenSymbol,
    {
      symbol: string;
      pricePrecision: number;
      quantityPrecision: number;
      stepSize: string;
      tickSize: string;
      minQty: string;
      maxQty: string;
    }
  > = {};

  constructor() {
    super("asterspot");
    this.secretKey = this.config.get<string>("secretKey");
  }

  public post<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R> {
    return super
      .post<T, R, D>(url, data, {
        transformRequest: [
          (data, headers) => {
            headers["Content-Type"] = "application/x-www-form-urlencoded";
            // delete headers["Content-Type"];
            return data;
          },
        ],
        ...config,
      })
      .catch((reason) => {
        throw Error(reason.data.msg);
      });
  }

  private async getExchangeInfo(force: boolean = false): Promise<number> {
    if (force || !this.universe["BTC"]) {
      const response = await this.get("/api/v1/exchangeInfo").then((response) => response.data.symbols);
      response
        // .map((m: AsterSpotMarket) => {
        //   console.log(m);
        //   return m;
        // })
        .filter(
          (m: AsterSpotMarket) =>
            m.status === "TRADING" && m.quoteAsset == "USDT" && m.baseAsset.startsWith("TEST") === false,
        )
        .forEach((item: any) => {
          // console.debug(item);
          this.universe[item.baseAsset] = {
            symbol: item.baseAsset,
            pricePrecision: item.quotePrecision,
            quantityPrecision: item.quantityPrecision,
            stepSize: item.filters?.find((f: any) => f.filterType === "LOT_SIZE")?.stepSize || "0.00000001",
            tickSize: item.filters?.find((f: any) => f.filterType === "PRICE_FILTER")?.tickSize || "0.00000001",
            minQty: item.filters?.find((f: any) => f.filterType === "LOT_SIZE")?.minQty || "0.00000001",
            maxQty: item.filters?.find((f: any) => f.filterType === "LOT_SIZE")?.maxQty || "9000.00000000",
          };
        });
    }
    const count = Object.keys(this.universe).length;
    return count;
  }

  public async testConnection(): Promise<number> {
    try {
      const count = await this.getExchangeInfo(true);
      console.log(`✅ Aster Spot Exchange connected: ${count} pairs available`);
      return count;
    } catch (error) {
      console.error("❌ Failed to connect to Aster Spot Exchange:", error);
      return 0;
    }
  }

  protected tokenFromTicker(symbol: string): TokenSymbol | null {
    // Aster Spot uses format like BTCUSDT (no separator)
    const match = symbol.match(/^(\w+)USDT$/);
    return match ? match[1] : null;
  }

  protected tokenToTicker(token: TokenSymbol): string {
    return `${token}USDT`;
  }

  // Note: Spot exchanges typically don't have funding rates since they're not derivatives
  public async getFundingRates(_tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    console.warn("⚠️ Funding rates not applicable for spot trading");
    return [];
  }

  public async getPrice(token: TokenSymbol): Promise<number> {
    try {
      const symbol = this.tokenToTicker(token);
      const response = await this.get(`/api/v1/ticker/price?symbol=${symbol}`);

      const price = parseFloat(response.data.price);
      if (!price || isNaN(price)) {
        throw new Error(`Invalid price data for token: ${token}`);
      }

      return price;
    } catch (error) {
      console.error(`❌ Failed to retrieve price for ${token}:`, error);
      throw new Error(`Failed to fetch price from Aster Spot for ${token}`);
    }
  }

  public async getAccountBalance(): Promise<{ [token: string]: number }> {
    try {
      const timestamp = Date.now();
      const payload = `timestamp=${timestamp}`;
      const signature = calculateHmacSha256(payload, this.secretKey);

      const response = await this.get(`/api/v1/account?${payload}&signature=${signature}`);
      const balances: { [token: string]: number } = {};

      if (response.data.balances) {
        response.data.balances.forEach((balance: any) => {
          const total = parseFloat(balance.free) + parseFloat(balance.locked);
          if (total > 0) {
            balances[balance.asset] = total;
          }
        });
      }

      return balances;
    } catch (error) {
      console.error("Error fetching Aster Spot account balance:", error);
      throw new Error("Failed to fetch account balance from Aster Spot");
    }
  }

  private quantizeQuantity(token: TokenSymbol, quantity: number): string {
    const universe = this.universe[token];
    if (!universe) return quantity.toString();

    // Use stepSize for quantization
    const stepSize = parseFloat(universe.stepSize);
    if (stepSize > 0) {
      const quantized = Math.floor(quantity / stepSize) * stepSize;
      return quantized.toFixed(universe.quantityPrecision);
    }

    return quantity.toFixed(universe.quantityPrecision);
  }

  private quantizePrice(token: TokenSymbol, price: number): string {
    const universe = this.universe[token];
    if (!universe) return price.toString();

    // Use tickSize for price quantization
    const tickSize = parseFloat(universe.tickSize);
    if (tickSize > 0) {
      const quantized = Math.floor(price / tickSize) * tickSize;
      return quantized.toFixed(universe.pricePrecision);
    }

    return price.toFixed(universe.pricePrecision);
  }

  public async openPosition(orderData: OrderData, reduceOnly: boolean = false): Promise<PlacedOrderData> {
    const { token, side, size, leverage, slippage } = orderData;

    if (side == PositionSide.SHORT && !reduceOnly) {
      throw new Error("❌ Short positions not applicable on spot trading exchanges");
    }

    await this.getExchangeInfo();

    const symbol = this.tokenToTicker(token);
    const isBuy = side === PositionSide.LONG;

    // Get current price for slippage calculation
    const currentPrice = await this.getPrice(token);
    const limitPrice = isBuy ? currentPrice * (1 + slippage / 100) : currentPrice * (1 - slippage / 100);

    // Quantize the quantity and price
    const quantity = this.quantizeQuantity(token, size * (leverage || 1));
    const price = this.quantizePrice(token, limitPrice);

    // Build the payload for signing
    const timestamp = Date.now();
    const sideParam = isBuy ? "BUY" : "SELL";
    const payload = `symbol=${symbol}&side=${sideParam}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
    const signature = calculateHmacSha256(payload, this.secretKey);

    const order = await this.post<AsterSpotOrder>(`/api/v1/order?${payload}&signature=${signature}`).then(
      (response) => response.data,
    );

    if (!order.orderId) {
      throw new Error("Failed to place order: No order ID returned");
    }

    console.log(`✅ Aster Spot ${isBuy ? "BUY" : "SELL"} order placed: ${order.orderId}`);

    return {
      ...orderData,
      orderId: order.orderId.toString(),
      size: parseFloat(quantity),
      price: parseFloat(price),
    };
  }

  public async cancelOrder(orderData: PlacedOrderData): Promise<boolean> {
    const { token, orderId } = orderData;

    try {
      const symbol = this.tokenToTicker(token);
      const timestamp = Date.now();
      const payload = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
      const signature = calculateHmacSha256(payload, this.secretKey);

      try {
        const response = await this.delete(`/api/v1/order?${payload}&signature=${signature}`);
        return response.data.status === "FILLED";
      } catch (error: any) {
        if (error.data.msg.includes("Order does not exist")) {
          // Order might already be filled or cancelled
          return true;
        }
        throw error;
      }
    } catch (error) {
      console.error(`Error cancelling order ${orderId}:`, error);
      throw new Error(`Failed to cancel order ${orderId} on Aster Spot`);
    }
  }

  public async getAllPositions(): Promise<Position[]> {
    try {
      const timestamp = Date.now();
      const payload = `timestamp=${timestamp}`;
      const signature = calculateHmacSha256(payload, this.secretKey);

      const response = await this.get(`/api/v1/account?${payload}&signature=${signature}`);

      const positions: Position[] = [];

      if (response.data.balances) {
        response.data.balances.forEach((balance: any) => {
          const free = parseFloat(balance.free);
          const locked = parseFloat(balance.locked);
          const total = free + locked;

          // Only include non-zero balances as positions
          if (total > 0 && balance.asset !== "USDT") {
            const token = balance.asset;
            positions.push({
              id: `${token}_balance`,
              userId: "userId",
              tradeId: "tradeId",
              token: token as TokenSymbol,
              status: PositionStatus.OPEN,
              entryTimestamp: new Date(),

              exchange: this.name,
              side: PositionSide.LONG, // Spot holdings are always long positions
              size: total,
              price: 0, // Spot holdings don't have a position price
              leverage: 1,
              slippage: 0,
              orderId: "balance_holding",

              cost: 0,
              unrealizedPnL: 0,
              realizedPnL: 0,

              updatedAt: new Date(),
              createdAt: new Date(),
            } as any);
          }
        });
      }

      return positions as unknown as Position[];
    } catch (error) {
      console.error("Error fetching Aster Spot positions:", error);
      throw new Error("Failed to fetch positions from Aster Spot");
    }
  }

  public async getPositionPnL(_positionId: string): Promise<number> {
    console.warn("⚠️ PnL tracking for spot positions may require custom implementation");
    return 0;
  }

  public connectWebSocket(onMessage: (data: any) => void): void {
    try {
      console.log("🔌 Attempting to connect to Aster Spot WebSocket:", this.wsUrl);
      this.ws = new WebSocket(this.wsUrl);
      this.isConnected = true;

      this.ws.on("open", () => {
        console.log("✅ Aster Spot WebSocket connected");

        // Subscribe to spot-specific streams
        const streams = [
          "!ticker@arr", // All symbol ticker updates
          "!depth@arr", // All symbol depth updates
          "!trade@arr", // All symbol trade updates
          "!kline_1m@arr", // 1-minute candlestick updates
        ];

        streams.forEach((stream) => {
          const subscribeMessage = {
            method: "SUBSCRIBE",
            params: [stream],
            id: Date.now(),
          };
          this.ws?.send(JSON.stringify(subscribeMessage));
        });

        // Authenticate if API key is available (for user data streams)
        setTimeout(() => {
          if (this.config.has("apiKey")) {
            const listenKey = this.generateListenKey();
            if (listenKey) {
              const authMessage = {
                method: "SUBSCRIBE",
                params: [`${listenKey}@account`, `${listenKey}@orders`, `${listenKey}@outboundAccountPosition`],
                id: Date.now() + 1,
              };
              this.ws?.send(JSON.stringify(authMessage));
            }
          }
        }, 2000);

        // Send ping every 30 seconds
        const pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ method: "PING" }));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());

          // Handle pong response
          if (message.result === null && message.id) {
            return;
          }

          console.log("📨 Aster Spot WebSocket message received:", JSON.stringify(message, null, 2));
          onMessage(message);
        } catch (error) {
          console.error("Error parsing Aster Spot WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Aster Spot WebSocket error:", error);
      });

      this.ws.on("close", (code, reason) => {
        console.log("Aster Spot WebSocket disconnected:", { code, reason: reason.toString() });

        if (this.isConnected) {
          setTimeout(() => {
            console.log("🔄 Attempting to reconnect to Aster Spot WebSocket...");
            this.connectWebSocket(onMessage);
          }, 5000);
        }
      });
    } catch (error) {
      console.error("Error connecting to Aster Spot WebSocket:", error);
    }
  }

  private async generateListenKey(): Promise<string | null> {
    try {
      const timestamp = Date.now();
      const payload = `timestamp=${timestamp}`;
      const signature = calculateHmacSha256(payload, this.secretKey);

      const response = await this.post(`/api/v1/userDataStream?${payload}&signature=${signature}`);
      return response.data.listenKey;
    } catch (error) {
      console.error("Error generating listen key:", error);
      return null;
    }
  }
}

export const asterSpotExchange = new AsterSpotExchange();
export default asterSpotExchange;
