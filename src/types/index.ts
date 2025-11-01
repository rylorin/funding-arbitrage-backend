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

export interface UserSettings {
  enabled: boolean;

  autoCloseAPRThreshold: number;
  autoClosePnLThreshold: number;
  autoCloseTimeoutHours: number;
  riskTolerance: RiskLevel;

  preferredExchanges: ExchangeName[];

  minAPR: number;
  maxPositionSize: number;
  maxSimultaneousPositions: number;
  autoCloseEnabled: boolean;

  notificationPreferences: {
    email: boolean;
    webhook: boolean;
    discord: boolean;
  };
}

export interface FundingRateData {
  exchange: string;
  token: string;
  fundingRate: number;
  fundingFrequency: number; // in hours
  nextFunding: Date;
  timestamp: Date;
  markPrice?: number | undefined;
  indexPrice?: number | undefined;
}

export interface PositionPnL {
  positionId: string;
  currentPnL: number;
  unrealizedPnL: number;
  realizedPnL: number;
  totalFees: number;
  currentAPR: number;
  hoursOpen: number;
  lastUpdated: Date;
}

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

export type PositionStatus = "OPEN" | "CLOSED" | "ERROR" | "CLOSING";
export type ExchangeName = "vest" | "hyperliquid" | "orderly" | "extended" | "mock";
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
  longFrequency: string;
  shortFrequency: string;
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

export { ExchangeConnector } from "@/services/exchanges/ExchangeConnector";
