import { ArbitrageOpportunityData, FundingRateData, PositionPnL } from "../../types/index";
import { WebSocketBroadcaster } from "../broadcaster";

export class WebSocketHandlers {
  constructor(private broadcaster: WebSocketBroadcaster) {}

  public handleFundingRateUpdate(rates: FundingRateData[]): void {
    // Filter out invalid rates
    const validRates = rates.filter(
      (rate) => rate.fundingRate !== undefined && rate.fundingRate !== null && !isNaN(rate.fundingRate),
    );

    if (validRates.length > 0) {
      this.broadcaster.broadcastFundingRatesUpdate(validRates);
    }
  }

  public handlePositionPnLUpdate(userId: string, positionPnL: PositionPnL): void {
    if (!userId || !positionPnL) {
      console.warn("Invalid position PnL update data");
      return;
    }

    this.broadcaster.broadcastPositionPnLUpdate(userId, positionPnL);
  }

  public handleOpportunityAlert(opportunity: ArbitrageOpportunityData): void {
    // Only alert for high-value opportunities
    if (opportunity.spreadAPR >= 15 && opportunity.risk.score >= 70) {
      this.broadcaster.broadcastOpportunityAlert(opportunity);
    }
  }

  public handlePositionClosed(userId: string, positionId: string, reason: string, pnl: number): void {
    if (!userId || !positionId) {
      console.warn("Invalid position closure data");
      return;
    }

    this.broadcaster.broadcastPositionClosed(userId, positionId, reason, pnl);
  }

  public handleExchangeConnectionChange(exchangeName: string, isConnected: boolean): void {
    const message = `${exchangeName} exchange ${isConnected ? "connected" : "disconnected"}`;
    const level = isConnected ? "info" : "warning";

    this.broadcaster.broadcastSystemAlert(message, level);
  }

  public handleSystemError(error: string): void {
    this.broadcaster.broadcastSystemAlert(error, "error");
  }

  public notifyUser(
    userId: string,
    notification: {
      type: string;
      title: string;
      message: string;
      data?: any;
    },
  ): void {
    this.broadcaster.sendToUser(userId, "notification", {
      ...notification,
      timestamp: new Date(),
    });
  }

  public sendMarketUpdate(_marketData: {
    prices: { [token: string]: number };
    volumes: { [token: string]: number };
  }): void {
    this.broadcaster.broadcastFundingRatesUpdate([]);

    // Send market data to all connected clients
    // This would typically be sent to a 'market-data' room
    // For now, we'll use the funding rates room as it's already established
  }

  public getStats(): {
    connectedClients: number;
    roomStats: { [key: string]: number };
  } {
    return {
      connectedClients: this.broadcaster.getConnectedClients(),
      roomStats: this.broadcaster.getRoomStats(),
    };
  }
}

let handlersInstance: WebSocketHandlers | null = null;

export const createWebSocketHandlers = (broadcaster: WebSocketBroadcaster): WebSocketHandlers => {
  if (handlersInstance) {
    return handlersInstance;
  }

  handlersInstance = new WebSocketHandlers(broadcaster);
  return handlersInstance;
};

export const getWebSocketHandlers = (): WebSocketHandlers | null => {
  return handlersInstance;
};
