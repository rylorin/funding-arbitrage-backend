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

export interface UserSettings {
  autoCloseAPRThreshold: number;
  autoClosePnLThreshold: number;
  autoCloseTimeoutHours: number;
  preferredExchanges: string[];
  riskTolerance: 'low' | 'medium' | 'high';
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
  nextFunding: Date;
  timestamp: Date;
  markPrice?: number | undefined;
  indexPrice?: number | undefined;
}

export interface ArbitrageOpportunity {
  token: string;
  longExchange: string;
  shortExchange: string;
  longFundingRate: number;
  shortFundingRate: number;
  spreadAPR: number;
  confidence: number;
  minSize: number;
  maxSize: number;
  estimatedGas?: number;
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

export type PositionStatus = 'OPEN' | 'CLOSED' | 'ERROR' | 'CLOSING';
export type ExchangeName = 'vest' | 'hyperliquid' | 'orderly' | 'extended' | 'paradex' | 'backpack' | 'hibachi';
export type TokenSymbol = 'BTC' | 'ETH' | 'SOL' | 'AVAX' | 'MATIC' | 'ARB' | 'OP';

export interface ExchangeConnector {
  name: ExchangeName;
  isConnected: boolean;
  getFundingRates(tokens: TokenSymbol[]): Promise<FundingRateData[]>;
  getAccountBalance(): Promise<{ [token: string]: number }>;
  openPosition(token: TokenSymbol, side: 'long' | 'short', size: number): Promise<string>;
  closePosition(positionId: string): Promise<boolean>;
  getPositionPnL(positionId: string): Promise<number>;
}