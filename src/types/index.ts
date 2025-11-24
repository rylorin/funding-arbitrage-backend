import { ExchangeName } from "@/exchanges/ExchangeConnector";
import { PositionSide } from "@/models/Position";
import { PositionMetrics } from "@/services/PositionSyncService";

export type OrderData = {
  exchange: ExchangeName;
  token: TokenSymbol;
  side: PositionSide;
  size: number;
  price: number;
  leverage: number;
  slippage: number;
};

export type PlacedOrderData = OrderData & { orderId: string };

export interface AuthChallenge {
  message: string;
  nonce: string;
  expiresAt: number;
}

export interface AuthTokenPayload {
  walletAddress: string;
  userId: string;
  iat: number;
  exp: number;
}

export enum RiskLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export interface FundingRateData {
  exchange: string;
  token: string;
  fundingRate: number;
  fundingFrequency: number; // in hours
  nextFunding: Date;
  updatedAt: Date;
  markPrice?: number | undefined;
  indexPrice?: number | undefined;
}

export type PositionPnL =
  | PositionMetrics
  | {
      positionId: string;
      // hoursOpen: number;
      lastUpdated: Date;
    };

export interface ExchangeApiCredentials {
  apiKey: string;
  secretKey?: string;
  passphrase?: string;
  sandbox?: boolean;
}

export interface ExchangeConfig extends ExchangeApiCredentials {
  fundingFrequency: number; // in hours
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: Date;
  userId?: string;
}

export interface JobResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  executionTime: number;
}

export type TokenSymbol = string; // e.g., 'BTC', 'ETH', 'SOL', etc.

export interface ExchangeData {
  name: ExchangeName;
  fundingRate: number;
  fundingFrequency: number;
  price: number;
}

export interface RiskAssessment {
  level: RiskLevel;
  score: number; // 0-100 composite score
  factors: {
    priceDeviation: number; // % price difference between exchanges
    spreadQuality: number; // Quality of funding rate spread
    exchangeReliability: number; // 0.5 for new exchanges, 1.0 for established
  };
}

export interface OpportunitySpread {
  absolute: number;
  apr: number;
}

export interface OpportunityTiming {
  nextFunding: string;
  longFrequency: number;
  shortFrequency: number;
}

export interface ArbitrageOpportunityData {
  id: string;
  token: TokenSymbol;
  tokenIcon: string;
  longExchange: ExchangeData;
  shortExchange: ExchangeData;
  spread: OpportunitySpread;
  risk: RiskAssessment;
  timing: OpportunityTiming;
}

export { ExchangeConnector, type ExchangeName } from "@/exchanges/ExchangeConnector";

export enum ServiceName {
  POSITION_SYNC = "position-sync",
  DELTA_NEUTRAL = "delta-neutral",
}
