// API reference documation available at https://docs.vestmarkets.com/vest-api
import { Position } from "@/models";
import { PositionSide, PositionStatus } from "@/models/Position";
import { generateCancelOrderSignature, generateOrderSignature } from "@/utils/vest";
import WebSocket from "ws";
import {
  ExchangeConnector,
  FundingRateData,
  OrderData,
  OrderStatus,
  PlacedOrderData,
  TokenSymbol,
} from "../types/index";

interface TokenInfo {
  symbol: string;
  displayName: string;
  base: TokenSymbol;
  quote: TokenSymbol;
  sizeDecimals: number;
  priceDecimals: number;
  initMarginRatio: number;
  maintMarginRatio: number;
  takerFee: number;
  isolated: boolean;
}

export class VestExchange extends ExchangeConnector {
  private readonly privateKey: string;

  constructor() {
    super("vest");
    this.privateKey = this.config.get<string>("privateKey");
  }

  public async testConnection(): Promise<number> {
    try {
      const response = await this.get("/exchangeInfo");
      const count = response.data.symbols?.length || 0;
      // console.log(`✅ Vest Exchange connected: ${count} pairs available`);
      return count;
    } catch (error) {
      console.error("❌ Failed to connect to Vest Exchange:", error);
      return 0;
    }
  }

  public async getTokenInfo(token: TokenSymbol): Promise<TokenInfo> {
    try {
      const response = await this.get(`/exchangeInfo?symbols=${this.tokenToTicker(token)}`);
      const info: TokenInfo = response.data.symbols[0];
      return info;
    } catch (error) {
      console.error("❌ Failed to retrive token info:", error);
      throw new Error("Failed to fetch token info from Vest");
    }
  }

  public async getFundingRates(tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    try {
      const fundingRates: FundingRateData[] = [];

      // Get all tickers which contain funding rates
      const response = await this.get("/ticker/latest");
      const tickerData = response.data.tickers;

      // If no tokens specified, extract all available tokens from tickers
      const tokensToProcess = tokens || this.extractTokensFromTickers(tickerData);

      for (const token of tokensToProcess) {
        const symbol = this.tokenToTicker(token);

        try {
          // Find the ticker for this token
          const tokenTicker = tickerData.find((ticker: any) => ticker.symbol === symbol);

          if (tokenTicker) {
            // Calculate next funding time (hourly funding)
            const now = new Date();
            const nextFunding = new Date(now.getTime() + (60 - now.getMinutes()) * 60 * 1000);
            nextFunding.setSeconds(0);
            nextFunding.setMilliseconds(0);

            fundingRates.push({
              exchange: this.name,
              token,
              fundingRate: parseFloat(tokenTicker.oneHrFundingRate), // 1h funding rate
              nextFunding,
              fundingFrequency: this.config.get("fundingFrequency"), // in hours
              updatedAt: new Date(),
              markPrice: tokenTicker.markPrice ? parseFloat(tokenTicker.markPrice) : undefined,
              indexPrice: tokenTicker.indexPrice ? parseFloat(tokenTicker.indexPrice) : undefined,
            });
          }
        } catch (error) {
          console.warn(`Failed to get funding rate for ${token} on Vest:`, error);
        }
      }

      return fundingRates;
    } catch (error) {
      console.error("Error fetching Vest funding rates:", error);
      throw new Error("Failed to fetch funding rates from Vest");
    }
  }

  public async getAccountBalance(): Promise<Record<string, number>> {
    try {
      const response = await this.get("/account");
      const balances: Record<string, number> = {};

      if (response.data.balances) {
        response.data.balances.forEach((balance: any) => {
          // Vest uses USDC as primary numéraire
          balances[balance.coin] = parseFloat(balance.total);
        });
      }

      return balances;
    } catch (error) {
      console.error("Error fetching Vest account balance:", error);
      throw new Error("Failed to fetch account balance from Vest");
    }
  }

  public async setLeverage(token: TokenSymbol, leverage: number): Promise<number> {
    const time = Date.now();
    const payload = { time, symbol: this.tokenToTicker(token), value: leverage };
    const response = await this.post("/account/leverage", payload).catch((reason: any) => {
      // console.error(this.name, payload, reason);
      throw new Error(
        reason.data.detail.msg ||
          (reason.data ? JSON.stringify(reason.data) : undefined) ||
          reason.message ||
          "Unknown error #1",
      );
    });
    return response.data.value;
  }

  private async nativePlaceOrder(order: any): Promise<string> {
    const privateKey: string = this.config.get<string>("privateKey");
    const signature = generateOrderSignature(order, privateKey);

    const response = await this.post("/orders", { order, signature }).catch((reason: any) => {
      console.error(order, reason);
      throw new Error(reason.data.detail.msg || "Unknown error #2");
    });

    if (response.data.orderId || response.data.id) {
      const orderId = response.data.orderId || response.data.id;
      // console.log(`✅ Vest ${side} position opened: ${orderId}`);
      return orderId.toString();
    }

    console.error(response);
    throw new Error(`Failed to open position: ${response?.data.detail.msg || "Unknown error #3"}`);
  }

  public async getPrice(token: TokenSymbol): Promise<number> {
    try {
      const symbol = this.tokenToTicker(token);

      // Get latest ticker data to find the current price
      const response = await this.get("/ticker/latest");
      const tickerData = response.data.tickers;

      // Find the ticker for this specific token
      const tokenTicker = tickerData.find((ticker: any) => ticker.symbol === symbol);

      if (!tokenTicker) {
        throw new Error(`Ticker not found for token: ${token}`);
      }

      // Use markPrice as the primary price source, fallback to indexPrice
      const price = tokenTicker.markPrice
        ? parseFloat(tokenTicker.markPrice)
        : tokenTicker.indexPrice
          ? parseFloat(tokenTicker.indexPrice)
          : null;

      if (price === null || isNaN(price)) {
        throw new Error(`Price data not available for token: ${token}`);
      }

      return price;
    } catch (error) {
      console.error(`❌ Failed to retrieve price for ${token}:`, error);
      throw new Error(`Failed to fetch price from Vest for ${token}`);
    }
  }

  public async placeOrder(orderData: OrderData, reduceOnly = false): Promise<PlacedOrderData> {
    const { token, side, size, slippage, leverage } = orderData;
    try {
      if (leverage) await this.setLeverage(token, leverage);

      const info = await this.getTokenInfo(token);
      const price = await this.getPrice(token);

      const symbol = this.tokenToTicker(token);
      const isBuy = side === PositionSide.LONG;
      const time = Date.now();
      const nonce = this.generateUniqueNonce();

      const quantity = size.toFixed(info.sizeDecimals);
      const limitPrice = (isBuy ? price * (1 + slippage / 100) : price * (1 - slippage / 100)).toFixed(
        info.priceDecimals,
      );

      const order = {
        time,
        nonce,
        symbol,
        isBuy,
        size: quantity,
        orderType: "MARKET",
        limitPrice,
        reduceOnly,
        timeInForce: "GTC",
      };

      const orderId = await this.nativePlaceOrder(order);
      return {
        ...orderData,
        orderId,
        size: parseFloat(quantity),
        price: parseFloat(limitPrice),
        status: OrderStatus.FILLED,
      };
    } catch (error) {
      throw error;
    }
  }

  public async openPosition(order: OrderData, reduceOnly = false): Promise<PlacedOrderData> {
    // Place the order
    const placedOrder = await this.placeOrder(order, reduceOnly);

    // Poll for order status every second until filled, rejected, or timeout (60s)
    const maxWaitTime = 60000; // 60 seconds
    const pollInterval = 1000; // 1 second
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      // Wait for poll interval before checking
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      // Get order status from the API
      const orders = await this.getAllOrders(order.token);
      const currentOrder = orders.find((o) => o.orderId === placedOrder.orderId);

      if (!currentOrder) {
        // Order not found - could be filled and removed from open orders
        // Check positions to see if order was filled
        try {
          const positions = await this.getAllPositions();
          const relatedPosition = positions.find(
            (pos) =>
              pos.token === order.token &&
              ((order.side === PositionSide.LONG && pos.side === PositionSide.LONG) ||
                (order.side === PositionSide.SHORT && pos.side === PositionSide.SHORT)),
          );
          if (relatedPosition && relatedPosition.size > 0) {
            // Order was likely filled
            return {
              ...placedOrder,
              status: OrderStatus.FILLED,
            };
          }
        } catch {
          // Ignore errors - continue polling
        }
        continue;
      }

      // Check order status
      if (currentOrder.status === OrderStatus.FILLED) {
        return {
          ...placedOrder,
          status: OrderStatus.FILLED,
        };
      }

      if (currentOrder.status === OrderStatus.REJECTED) {
        throw new Error("Order rejected");
      }

      if (currentOrder.status === OrderStatus.CANCELED) {
        throw new Error("Order was cancelled");
      }

      // If still OPEN, continue polling
    }

    // Timeout after 60 seconds - cancel the order
    await this.cancelOrder(placedOrder);
    throw new Error("Order timeout: still open after 60 seconds, cancelled");
  }

  public async cancelOrder(orderData: PlacedOrderData): Promise<boolean> {
    const { orderId } = orderData;
    const time = Date.now();
    const order = {
      time,
      nonce: time,
      id: orderId,
    };

    const signature = generateCancelOrderSignature(order, this.privateKey);

    const response = await this.post("/orders/cancel", { order, signature }).catch((reason: any) => {
      console.warn(reason.data.detail.msg, order.id);
    });
    return true;
  }

  protected tokenFromTicker(symbol: string): TokenSymbol | null {
    const token = symbol.replace("-PERP", "");
    if (token.endsWith("-USD")) return null;
    else return token;
  }

  private extractTokensFromTickers(tickerData: any[]): TokenSymbol[] {
    const tokens = tickerData
      .map((ticker): TokenSymbol | null => this.tokenFromTicker(ticker.symbol))
      .filter((token) => token);
    return tokens as TokenSymbol[];
  }

  protected tokenToTicker(token: TokenSymbol): string {
    return `${token}-PERP`;
  }

  public async getPositionPnL(positionId: string): Promise<number> {
    try {
      // Get account info which includes positions
      const response = await this.get("/account");

      if (response.data.positions) {
        const position = response.data.positions.find((pos: any) => pos.id === positionId);
        if (position && position.unrealizedPnl) {
          return parseFloat(position.unrealizedPnl);
        }
      }

      return 0;
    } catch (error) {
      console.error(`Error fetching Vest position PnL for ${positionId}:`, error);
      throw new Error("Failed to fetch position PnL from Vest");
    }
  }

  public async getAllOrders(token?: TokenSymbol, limit = 100): Promise<PlacedOrderData[]> {
    try {
      const params: any = {};
      if (token) params.symbol = this.tokenToTicker(token);
      if (limit) params.limit = limit;

      const response = await this.get("/orders", { params });
      const orders = response.data || [];

      return orders.map((order: any) => ({
        exchange: this.name,
        token: this.tokenFromTicker(order.symbol) as TokenSymbol,
        side: order.isBuy ? PositionSide.LONG : PositionSide.SHORT,
        price: parseFloat(order.price) || 0,
        size: parseFloat(order.size) || 0,
        leverage: parseFloat(order.leverage) || 1,
        slippage: 0,
        orderId: order.id?.toString() || order.orderId?.toString(),
        status: this.mapOrderStatus(order.status),
      }));
    } catch (error) {
      console.error("Error fetching Vest all orders:", error);
      throw new Error("Failed to fetch all orders from Vest");
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
      console.log("🔌 Attempting to connect to Vest WebSocket:", this.wsUrl);
      this.ws = new WebSocket(this.wsUrl);
      this.isConnected = true;

      this.ws.on("open", () => {
        console.log("✅ Vest WebSocket connected");

        // Subscribe to comprehensive market data for Vest Exchange
        const tradingPairs = [
          "BTC-PERP",
          "ETH-PERP",
          "SOL-PERP",
          "ADA-PERP",
          "DOGE-PERP",
          "MATIC-PERP",
          "AVAX-PERP",
          "DOT-PERP",
          "LINK-PERP",
          "LTC-PERP",
          "UNI-PERP",
          "ATOM-PERP",
          "XRP-PERP",
          "FIL-PERP",
          "TRX-PERP",
        ];

        const streamTypes = [
          { name: "tickers", description: "Price tickers with funding rates" },
          { name: "orderbook", description: "Order book depth" },
          { name: "trades", description: "Recent trades" },
          { name: "candles", description: "OHLC candles" },
        ];

        let subscriptionId = 1;

        // Subscribe to each stream type for each trading pair
        streamTypes.forEach((streamType) => {
          const subscribeMessage = {
            method: "subscribe",
            stream: streamType.name,
            symbols: tradingPairs,
            id: subscriptionId++,
          };

          console.log(`📡 Subscribing to ${streamType.name} for ${tradingPairs.length} pairs`);
          this.ws?.send(JSON.stringify(subscribeMessage));
        });

        // Subscribe to user-specific streams if private key is available
        if (this.config.has("privateKey")) {
          const userStreams = [
            { name: "positions", description: "User positions" },
            { name: "orders", description: "User orders" },
            { name: "fills", description: "User order fills" },
            { name: "balance", description: "Account balance updates" },
          ];

          userStreams.forEach((userStream) => {
            const userSubscribeMessage = {
              method: "subscribe_private",
              stream: userStream.name,
              id: subscriptionId++,
            };

            console.log(`📡 Subscribing to private stream: ${userStream.name}`);
            this.ws?.send(JSON.stringify(userSubscribeMessage));
          });
        }

        // Send heartbeat every 30 seconds to maintain connection
        const heartbeatInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const heartbeatMessage = {
              method: "ping",
              timestamp: Date.now(),
              id: subscriptionId++,
            };
            this.ws.send(JSON.stringify(heartbeatMessage));
          } else {
            clearInterval(heartbeatInterval);
          }
        }, 30000);
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log("📨 Vest WebSocket message received:", JSON.stringify(message, null, 2));
          onMessage(message);
        } catch (error) {
          console.error("Error parsing Vest WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Vest WebSocket error:", error);
      });

      this.ws.on("close", (code, reason) => {
        console.log("Vest WebSocket disconnected:", { code, reason: reason.toString() });
        // Auto-reconnect after 5 seconds
        if (this.isConnected)
          setTimeout(() => {
            console.log("🔄 Attempting to reconnect to Vest WebSocket...");
            this.connectWebSocket(onMessage);
          }, 5000);
      });
    } catch (error) {
      console.error("Error connecting to Vest WebSocket:", error);
    }
  }

  public async getAllPositions(): Promise<Position[]> {
    const time = Date.now();
    const response = await this.get("/account").catch((reason: any) => {
      console.error(time, reason);
      throw new Error(reason.data.detail.msg || "Unknown error #4");
    });

    if (response.data.positions) {
      return response.data.positions.map((pos: any) => {
        // console.log(pos);
        return {
          id: "id",
          userId: "userId",
          tradeId: "tradeId",
          token: this.tokenFromTicker(pos.symbol),
          status: pos.size ? PositionStatus.OPEN : PositionStatus.CLOSED,
          entryTimestamp: 0,

          exchange: this.name,
          side: pos.isLong ? PositionSide.LONG : PositionSide.SHORT,
          size: parseFloat(pos.size),
          price: parseFloat(pos.markPrice),
          leverage: undefined,
          orderId: "orderId",

          cost: parseFloat(pos.entryPrice) * parseFloat(pos.size),
          unrealizedPnL: parseFloat(pos.unrealizedPnl),
          realizedPnL: 0,

          entryPrice: parseFloat(pos.entryPrice),
          entryFunding: parseFloat(pos.entryFunding),
          settledFunding: parseFloat(pos.settledFunding),
          indexPrice: parseFloat(pos.indexPrice),
          liqPrice: parseFloat(pos.liqPrice),
          initMargin: parseFloat(pos.initMargin),
          maintMargin: parseFloat(pos.maintMargin),
          initMarginRatio: parseFloat(pos.initMarginRatio),
        };
      });
    }

    console.error(response);
    throw new Error(`Failed to cancel order: ${response?.data.detail.msg || "Unknown error #5"}`);
  }
}

export const vestExchange = new VestExchange();
export default vestExchange;
