// API reference: https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md
import { TradeStatus } from "@/models/TradeHistory";
import { AxiosRequestConfig, AxiosResponse } from "axios";
import { createHmac } from "crypto";
import WebSocket from "ws";
import Position, { PositionSide } from "../models/Position";
import {
  ExchangeConnector,
  FundingRateData,
  OrderData,
  OrderStatus,
  PlacedOrderData,
  TokenSymbol,
} from "../types/index";

interface AsterMarket {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  contractType: string;
  deliveryDate: number;
  onboardDate: number;
  contractSize: number;
  ticker: {
    lastPrice: string;
    bidPrice: string;
    askPrice: string;
    lastQuantity: string;
    volume: string;
    quoteVolume: string;
    priceChange: string;
    priceChangePercent: string;
    highPrice: string;
    lowPrice: string;
    openPrice: string;
    closePrice: string;
  };
}

interface AsterFundingRate {
  symbol: string;
  fundingRate: string;
  nextFundingTime: number;
}

interface AsterAccountInfo {
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
  accountType: string;
  balances: {
    asset: string;
    walletBalance: string;
    unrealizedProfit: string;
    marginBalance: string;
    maxWithdrawAmount: string;
  }[];
  positions: {
    symbol: string;
    positionAmt: string;
    entryPrice: string;
    markPrice: string;
    unRealizedProfit: string;
    liquidationPrice: string;
    leverage: string;
    maxWithdrawAmount: string;
    marginType: string;
    isolatedMargin: string;
    isAutoAddMargin: string;
    positionSide: string;
    notional: string;
    isolatedWallet: string;
    updateTime: number;
  }[];
}

function calculateHmacSha256(data: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(data);
  return hmac.digest("hex");
}

export class AsterPerpExchange extends ExchangeConnector {
  private readonly secretKey: string;
  private readonly universe: Record<
    TokenSymbol,
    {
      symbol: string;
      pricePrecision: number;
      quantityPrecision: number;
    }
  > = {};

  constructor() {
    super("asterperp");
    this.secretKey = this.config.get<string>("secretKey");
  }

  public async post<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>,
  ): Promise<R> {
    return super
      .post<T, R, D>(url, data, {
        transformRequest: [
          (data, headers) => {
            headers["Content-Type"] = "application/x-www-form-urlencoded";
            return data;
          },
        ],
        ...config,
      })
      .catch((reason) => {
        throw Error(reason.data.msg);
      });
  }

  private async getExchangeInfo(force = false): Promise<number> {
    if (force || !this.universe["BTC"]) {
      const response = await this.get("/fapi/v1/exchangeInfo").then((response) => response.data.symbols);
      response
        .filter((m: any) => m.contractType === "PERPETUAL" && m.status === "TRADING")
        .forEach((item: any) => (this.universe[this.tokenFromTicker(item.symbol)!] = item));
    }
    const count = Object.keys(this.universe).length;
    return count;
  }

  public async testConnection(): Promise<number> {
    try {
      const count = await this.getExchangeInfo(true);
      // console.log(`✅ Aster Perp Exchange connected: ${count} perpetual markets available`);
      return count;
    } catch (error) {
      console.error("❌ Failed to connect to Aster Perp Exchange:", error);
      return 0;
    }
  }

  protected tokenFromTicker(symbol: string): TokenSymbol | null {
    const token = symbol.replace("USDT", "").replace("BUSD", "").replace("USD", "");
    return token && token.length > 0 ? (token as TokenSymbol) : null;
  }

  protected tokenToTicker(token: TokenSymbol): string {
    return `${token}USDT`;
  }

  // https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md#get-funding-rate-config
  public async getFundingRates(tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    try {
      const fundingRates: FundingRateData[] = [];

      const prices: Record<
        TokenSymbol,
        { symbol: string; markPrice: number; lastFundingRate: number; nextFunding: Date }
      > = {};
      await this.get("/fapi/v1/premiumIndex").then((response) =>
        response.data.forEach((index: any) => {
          const token = this.tokenFromTicker(index.symbol);
          // if (token == "DASH") console.debug(index);
          prices[token!] = {
            symbol: index.symbol,
            markPrice: parseFloat(index.markPrice),
            lastFundingRate: parseFloat(index.lastFundingRate),
            nextFunding: new Date(index.nextFundingTime),
          };
        }),
      );

      await this.get("/fapi/v1/fundingInfo").then((response) =>
        response.data.forEach((index: any) => {
          const token = this.tokenFromTicker(index.symbol)!;
          // if (token == "DASH") console.debug(index);
          const rate: FundingRateData = {
            exchange: this.name,
            token,
            fundingRate: prices[token].lastFundingRate,
            fundingFrequency: index.fundingIntervalHours,
            nextFunding: prices[token].nextFunding,
            markPrice: prices[token].markPrice,
            updatedAt: new Date(index.time),
          };
          fundingRates.push(rate);
        }),
      );

      // Filter by tokens if specified
      if (tokens && tokens.length > 0) {
        return fundingRates.filter((rate) => tokens.includes(rate.token));
      }

      return fundingRates;
    } catch (error) {
      console.error("Error fetching Aster Perp funding rates:", error);
      throw new Error("Failed to fetch funding rates from Aster Perp");
    }
  }

  public async getPrice(token: TokenSymbol): Promise<number> {
    const response = await this.get("/fapi/v1/premiumIndex", {
      params: { symbol: this.tokenToTicker(token) },
    }).then((response) => response.data);
    return parseFloat(response.markPrice);
  }

  public async getAccountBalance(): Promise<Record<string, number>> {
    try {
      const response = await this.get("/fapi/v2/account");
      const balances: Record<string, number> = {};

      if (response.data.balances) {
        response.data.balances.forEach((balance: any) => {
          const amount = parseFloat(balance.walletBalance);
          if (amount > 0) {
            balances[balance.asset] = amount;
          }
        });
      }

      return balances;
    } catch (error) {
      console.error("Error fetching Aster Perp account balance:", error);
      throw new Error("Failed to fetch account balance from Aster Perp");
    }
  }

  // https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md#change-initial-leverage-trade
  public async setLeverage(token: TokenSymbol, leverage: number): Promise<number> {
    const symbol = this.tokenToTicker(token);
    const payload = `symbol=${symbol}&leverage=${leverage}&timestamp=${Date.now()}`;
    const signature = calculateHmacSha256(payload, this.secretKey);
    const response = await this.post("/fapi/v1/leverage", `${payload}&signature=${signature}`).then(
      (response) => response.data,
    );
    // console.log(response);
    return response.leverage;
  }

  // https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md#new-order--trade
  public async placeOrder(order: OrderData, reduceOnly = false): Promise<PlacedOrderData> {
    const { token, side, size, leverage } = order;
    try {
      await this.getExchangeInfo();

      const symbol = this.tokenToTicker(token);
      const sideParam = side === PositionSide.LONG ? "BUY" : "SELL";
      const quantity = size.toFixed(this.universe[token].quantityPrecision);

      if (leverage) this.setLeverage(token, leverage);

      const payload = `symbol=${symbol}&side=${sideParam}&type=MARKET&quantity=${quantity}&reduceOnly=${reduceOnly}&timestamp=${Date.now()}`;
      const signature = calculateHmacSha256(payload, this.secretKey);
      const response = await this.post("/fapi/v1/order", `${payload}&signature=${signature}`).then(
        (response) => response.data,
      );
      // console.debug("Aster perp response:", order, response);
      if (response.orderId) {
        return {
          ...response,
          ...order,
          orderId: response.clientOrderId.toString(),
          size: parseFloat(response.origQty),
          status: OrderStatus.FILLED,
        };
      }

      throw new Error("Failed to open position");
    } catch (error) {
      console.error(`${this.name}: Error opening ${side} order for ${token}:`, error);
      throw error;
    }
  }

  // public async openPosition(order: OrderData, reduceOnly = false): Promise<PlacedOrderData> {
  //   // Place the order
  //   const placedOrder = await this.placeOrder(order, reduceOnly);

  //   // Poll for order status every second until filled, rejected, or timeout (60s)
  //   const maxWaitTime = 60_000; // 60 seconds
  //   const pollInterval = 1_000; // 1 second
  //   const startTime = Date.now();

  //   while (Date.now() - startTime < maxWaitTime) {
  //     // Wait for poll interval before checking
  //     await new Promise((resolve) => setTimeout(resolve, pollInterval));

  //     // Get order status from the API
  //     const orders = await this.getAllOrders(order.token);
  //     const currentOrder = orders.find((o) => o.orderId === placedOrder.orderId);

  //     if (!currentOrder) {
  //       // Order not found - could be filled and removed from open orders
  //       // Check positions to see if order was filled
  //       try {
  //         const positions = await this.getAllPositions();
  //         const relatedPosition = positions.find(
  //           (pos) =>
  //             pos.token === order.token &&
  //             ((order.side === PositionSide.LONG && pos.side === PositionSide.LONG) ||
  //               (order.side === PositionSide.SHORT && pos.side === PositionSide.SHORT)),
  //         );
  //         if (relatedPosition && relatedPosition.size > 0) {
  //           // Order was likely filled
  //           return {
  //             ...placedOrder,
  //             status: OrderStatus.FILLED,
  //           };
  //         }
  //       } catch {
  //         // Ignore errors - continue polling
  //       }
  //       continue;
  //     }

  //     // Check order status
  //     if (currentOrder.status === OrderStatus.FILLED) {
  //       return {
  //         ...placedOrder,
  //         status: OrderStatus.FILLED,
  //       };
  //     }

  //     if (currentOrder.status === OrderStatus.REJECTED) {
  //       throw new Error(`${this.name}: Order ${currentOrder.orderId} rejected`);
  //     }

  //     if (currentOrder.status === OrderStatus.CANCELED) {
  //       throw new Error(`${this.name}: Order ${currentOrder.orderId} cancelled`);
  //     }

  //     // If still OPEN, continue polling
  //   }

  //   // Timeout after 60 seconds - cancel the order
  //   await this.cancelOrder(placedOrder);
  //   throw new Error("Order timeout: still open after 60 seconds, cancelled");
  // }

  // https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md#cancel-order-trade
  public async cancelOrder(order: PlacedOrderData): Promise<boolean> {
    const { token, orderId } = order;
    const symbol = this.tokenToTicker(token);

    const payload = `symbol=${symbol}&origClientOrderId=${orderId}&timestamp=${Date.now()}`;
    const signature = calculateHmacSha256(payload, this.secretKey);
    try {
      const response = await this.delete(`/fapi/v1/order?${payload}&signature=${signature}`).then(
        (response) => response.data,
      );
      console.log(response);
    } catch (error) {
      console.error(`${this.name}: failed to cancel order:`, error);
      return false;
    }
    return true;
  }

  public async getPositionPnL(positionId: string): Promise<number> {
    try {
      const response = await this.get("/fapi/v2/positionRisk", {
        params: { symbol: positionId },
      });

      if (response.data.length > 0) {
        return parseFloat(response.data[0].unRealizedProfit);
      }

      return 0;
    } catch (error) {
      console.error(`Error fetching Aster Perp position PnL for ${positionId}:`, error);
      throw new Error("Failed to fetch position PnL from Aster Perp");
    }
  }

  // https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md#all-orders-user_data
  public async getAllOrders(token?: TokenSymbol, limit = 100): Promise<PlacedOrderData[]> {
    try {
      let payload = "";
      if (limit) payload = `limit=${limit}`;
      if (token) {
        if (payload.length > 0) payload += "&";
        payload += `symbol=${this.tokenToTicker(token)}`;
      }
      if (payload.length > 0) payload += "&";
      payload += `timestamp=${Date.now()}`;

      const signature = calculateHmacSha256(payload, this.secretKey);
      const response = await this.get(`/fapi/v1/allOrders?${payload}&signature=${signature}`).then(
        (response) => response.data,
      );
      // console.debug("response", payload, response);
      return response.map((item: any) => ({
        exchange: this.name,
        token: this.tokenFromTicker(item.symbol),
        side: item.side == "BUY" ? PositionSide.LONG : PositionSide.SHORT,
        price: parseFloat(item.price),
        size: parseFloat(item.origQty),
        leverage: parseFloat(item.leverage) || 1,
        slippage: 0,
        orderId: item.clientOrderId?.toString() || item.orderId?.toString(),
        status: this.mapOrderStatus(item.status),
      }));
    } catch (error) {
      console.error("Error fetching Aster Perp order history:", error);
      throw new Error("Failed to fetch order history from Aster Perp");
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

  public connectWebSocket(onMessage: (data: any) => void): void {
    try {
      console.log("🔌 Attempting to connect to Aster Perp WebSocket:", this.wsUrl);
      this.ws = new WebSocket(this.wsUrl);
      this.isConnected = true;

      this.ws.on("open", () => {
        console.log("✅ Aster Perp WebSocket connected");

        // Subscribe to comprehensive market data streams
        const tradingPairs = [
          "BTCUSDT",
          "ETHUSDT",
          "SOLUSDT",
          "ADAUSDT",
          "DOGEUSDT",
          "MATICUSDT",
          "AVAXUSDT",
          "DOTUSDT",
          "LINKUSDT",
          "LTCUSDT",
          "UNIUSDT",
          "ATOMUSDT",
          "XRPUSDT",
          "FILUSDT",
          "TRXUSDT",
        ];

        const streamTypes = [
          "@ticker", // 24hr ticker statistics
          "@markPrice", // Mark price and funding rate
          "@bookTicker", // Best bid/ask price
          "@trade", // Individual trade updates
          "@kline_1m", // 1-minute candlesticks
          "@depth20@100ms", // Order book depth
        ];

        let streamId = 1;

        // Subscribe to each stream type for major pairs
        streamTypes.forEach((streamType) => {
          tradingPairs.forEach((pair) => {
            const streamName = `${pair.toLowerCase()}${streamType}`;
            const subscribeMessage = {
              method: "SUBSCRIBE",
              params: [streamName],
              id: streamId++,
            };

            console.log(`📡 Subscribing to ${streamName}`);
            this.ws?.send(JSON.stringify(subscribeMessage));
          });
        });

        // Subscribe to user data streams if authenticated
        if (this.config.has("apiKey") && this.config.has("secretKey")) {
          const userStreams = [
            {
              stream: "balanceAndPositionUpdate",
              description: "Balance and position updates",
            },
            {
              stream: "orderUpdate",
              description: "Order status updates",
            },
            {
              stream: "userDataStream",
              description: "General user data",
            },
          ];

          userStreams.forEach((userStream) => {
            const userSubscribeMessage = {
              method: "SUBSCRIBE",
              params: [userStream.stream],
              id: streamId++,
            };

            console.log(`📡 Subscribing to user stream: ${userStream.description}`);
            this.ws?.send(JSON.stringify(userSubscribeMessage));
          });
        }

        // Send ping every 30 seconds to maintain connection
        const pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const pingMessage = {
              method: "ping",
              id: streamId++,
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
          console.log("📨 Aster Perp WebSocket message received:", JSON.stringify(message, null, 2));
          onMessage(message);
        } catch (error) {
          console.error("Error parsing Aster Perp WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Aster Perp WebSocket error:", error);
      });

      this.ws.on("close", (code, reason) => {
        console.log("Aster Perp WebSocket disconnected:", { code, reason: reason.toString() });
        // Auto-reconnect after 5 seconds
        if (this.isConnected)
          setTimeout(() => {
            console.log("🔄 Attempting to reconnect to Aster Perp WebSocket...");
            this.connectWebSocket(onMessage);
          }, 5000);
      });
    } catch (error) {
      console.error("Error connecting to Aster Perp WebSocket:", error);
    }
  }

  // https://github.com/asterdex/api-docs/blob/master/aster-finance-futures-api.md#position-information-v2-user_data
  public async getAllPositions(): Promise<Position[]> {
    try {
      const timestamp = Date.now();
      const payload = `timestamp=${timestamp}`;
      const signature = calculateHmacSha256(payload, this.secretKey);
      const response = await this.get(`/fapi/v2/positionRisk?${payload}&signature=${signature}`);
      const positions: Position[] = [];

      for (const pos of response.data) {
        if (parseFloat(pos.positionAmt) !== 0) {
          const token = this.tokenFromTicker(pos.symbol);
          if (token) {
            positions.push({
              ...pos,

              id: pos.symbol,
              userId: "userId",
              tradeId: "tradeId",
              token,
              status: TradeStatus.OPEN,

              exchange: this.name,
              side: parseFloat(pos.positionAmt) > 0 ? PositionSide.LONG : PositionSide.SHORT,
              size: Math.abs(parseFloat(pos.positionAmt)),
              price: parseFloat(pos.entryPrice),
              leverage: parseFloat(pos.leverage),
              orderId: "orderId",

              cost: Math.abs(parseFloat(pos.notional)),
              unrealizedPnL: parseFloat(pos.unRealizedProfit),
              realizedPnL: 0,
            });
          }
        }
      }

      return positions as unknown as Position[];
    } catch (error) {
      console.error("Error fetching Aster Perp positions:", error);
      throw new Error("Failed to fetch positions from Aster Perp");
    }
  }
}

export const asterPerpExchange: AsterPerpExchange = new AsterPerpExchange();
export default asterPerpExchange;
