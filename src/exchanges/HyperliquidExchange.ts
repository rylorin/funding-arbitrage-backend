// Base class for common Hyperliquid functionality
import { cancelOrderToAction, orderWireToAction } from "@/hyperliquid/signing";
import { ENDPOINTS, InfoType } from "@hyperliquid/constants";
import { orderToWire, signL1Action } from "@hyperliquid/signing";
import { ethers } from "ethers";
import WebSocket from "ws";
import { CancelOrderRequest, Meta, OrderRequest } from "../hyperliquid/types";
import { ExchangeConnector, ExchangeName, TokenSymbol } from "../types/index";

export abstract class HyperliquidExchange extends ExchangeConnector {
  protected readonly IS_MAINNET: boolean;
  protected universe: Record<
    TokenSymbol,
    {
      name: string;
      index: number;
      szDecimals: number;
      maxLeverage: number;
      onlyIsolated?: boolean;
    }
  > = {};
  protected readonly privateKey: string | null;
  protected readonly wallet: ethers.Wallet | null;
  protected readonly primaryAddress: string | null;

  constructor(name: ExchangeName) {
    super(name);
    this.IS_MAINNET = this.config.get<boolean>("isMainNet");
    this.privateKey = this.config.has("privateKey") ? this.config.get<string>("privateKey") : null;
    if (this.privateKey) this.wallet = new ethers.Wallet(this.privateKey);
    else this.wallet = null;
    this.primaryAddress = this.config.has("primaryAddress")
      ? this.config.get<string>("primaryAddress").toLowerCase()
      : null;
  }

  protected async getMeta(force: boolean = false): Promise<number> {
    if (force || !this.universe["BTC"]) {
      const response = await this.post<Meta>(ENDPOINTS.INFO, { type: InfoType.META }).then(
        (response) => response.data.universe,
      );
      response.forEach((item, index) => (this.universe[item.name] = { ...item, index }));
    }
    const count = Object.keys(this.universe).length;
    return count;
  }

  public async testConnection(): Promise<number> {
    try {
      const count = await this.getMeta(true);
      console.log(`✅ ${this.name} Exchange connected: ${count} markets available`);
      return count;
    } catch (error) {
      console.error(`❌ Failed to connect to ${this.name} Exchange:`, error);
      return 0;
    }
  }

  public async getPrices(tokens?: TokenSymbol[]): Promise<{ [token: TokenSymbol]: number }> {
    try {
      const prices: { [token: string]: number } = {};

      const allMids = await this.post<{ [token: TokenSymbol]: string }>(ENDPOINTS.INFO, {
        type: InfoType.ALL_MIDS,
      }).then((response) => response.data);

      const tokensToProcess = tokens || (Object.keys(allMids) as TokenSymbol[]);

      for (const token of tokensToProcess) {
        if (allMids[token] !== undefined) {
          prices[token] = parseFloat(allMids[token]);
        }
      }

      return prices;
    } catch (error) {
      console.error(`Error fetching ${this.name} prices:`, error);
      throw new Error(`Failed to fetch prices from ${this.name}`);
    }
  }

  public async getPrice(token: TokenSymbol): Promise<number> {
    const allPrices = await this.getPrices([token]);
    return allPrices[token];
  }

  public async getAccountBalance(): Promise<{ [token: string]: number }> {
    try {
      // Note: This requires authentication with user's wallet address
      // For now, return empty object as we don't have user wallet integration
      console.warn(`${this.name} account balance requires user wallet address authentication`);
      return {};
    } catch (error) {
      console.error(`Error fetching ${this.name} account balance:`, error);
      throw new Error(`Failed to fetch account balance from ${this.name}`);
    }
  }

  protected getVaultAddress() {
    return null;
  }

  /**
   * Format price according to Hyperliquid rules:
   * - Max 5 significant figures
   * - Max MAX_DECIMALS decimal places (6 for perps, 8 for spot)
   * - Integer prices always allowed regardless of significant figures
   */
  protected formatPriceForHyperliquid(price: number, isPerp: boolean = true): string {
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

  protected async placeOrder(orderRequest: OrderRequest) {
    if (!this.wallet) {
      throw new Error(`${this.name} place order requires walletAddress and privateKey configuration`);
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

  public async cancelOrder(order: { token: TokenSymbol; orderId: string }): Promise<boolean> {
    const { token, orderId } = order;

    if (!this.wallet) {
      throw new Error(`${this.name} cancel order requires walletAddress and privateKey configuration`);
    }

    await this.getMeta();

    // Validate that the token exists in the universe
    if (!this.universe[token]) {
      throw new Error(`Token ${token} not found in ${this.name} universe`);
    }

    // Create cancel request
    const cancelRequest: CancelOrderRequest = {
      a: this.universe[token].index,
      o: parseInt(orderId), // Convert order ID string to number
    };

    // Convert to action format
    const action = cancelOrderToAction(cancelRequest);
    const nonce = this.generateUniqueNonce();
    const signature = await signL1Action(this.wallet, action, null, nonce, this.IS_MAINNET);
    const payload = { action, nonce, signature, vaultAddress: null };

    try {
      // console.log(payload);
      const response = await this.post(ENDPOINTS.EXCHANGE, payload);

      if (response.data.status === "ok") {
        console.log(`✅ ${this.name} order ${orderId} for ${token} cancelled successfully`);
        return true;
      } else {
        throw new Error(`Cancel order failed: ${JSON.stringify(response.data)}`);
      }
    } catch (error) {
      console.error(`❌ Error cancelling ${this.name} order ${orderId} for ${token}:`, error);
      throw error;
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
                isPerp: true, // Will be overridden in subclasses
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
