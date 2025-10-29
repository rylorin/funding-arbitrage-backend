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

export interface ArbitrageOpportunity {
  token: string;
  longExchange: ExchangeName;
  shortExchange: ExchangeName;
  longFundingRate: number;
  shortFundingRate: number;
  spreadAPR: number; // Annualized Percentage Rate of the spread (10 for 10%)
  confidence: number;
  minSize: number;
  maxSize: number;
  estimatedGas?: number;
}

export interface DetailedArbitrageOpportunity extends ArbitrageOpportunity {
  longMarkPrice: number;
  shortMarkPrice: number;
  riskLevel: RiskLevel;
  fundingFrequency: {
    longExchange: string;
    shortExchange: string;
  };
  nextFundingTimes: {
    longExchange: Date;
    shortExchange: Date;
  };
  priceDeviation: number; // Écart de prix entre les exchanges
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
export type ExchangeName = "vest" | "hyperliquid" | "woofi" | "extended" | "paradex" | "backpack" | "hibachi";
export type TokenSymbol = string; // e.g., 'BTC', 'ETH', 'SOL', etc.

export interface ArbitrageOpportunityData {
  id: string;
  rank: number;
  token: string;
  tokenIcon: string;
  longExchange: {
    name: string;
    color: string;
    fundingRate: number;
    fundingRateFormatted: string;
    price: number;
  };
  shortExchange: {
    name: string;
    color: string;
    fundingRate: number;
    fundingRateFormatted: string;
    price: number;
  };
  spread: {
    absolute: number;
    percent: string;
    apr: number;
  };
  metrics: {
    confidence: number;
    riskLevel: RiskLevel;
    riskColor: string;
    expectedDailyReturn: string;
    maxSize: number;
    maxSizeFormatted: string;
    priceDeviation: number;
    priceDeviationFormatted: string;
  };
  timing: {
    nextFunding: string;
    longFrequency: string;
    shortFrequency: string;
  };
}

export { ExchangeConnector } from "@/services/exchanges/ExchangeConnector";
