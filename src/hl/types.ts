/**
 * Hyperliquid API types
 */

export interface HyperliquidPosition {
  coin: string;
  szi: string; // size
  leverage: {
    type: string;
    value: number;
  };
  entryPx: string; // entry price
  positionValue: string;
  unrealizedPnl: string;
  realizedPnl: string;
  liquidationPx: string;
  marginUsed: string;
  maxLeverage: number;
  cumFunding: {
    allTime: string;
    sinceOpen: string;
    sinceChange: string;
  };
}

export interface HyperliquidClearinghouseState {
  assetPositions: HyperliquidPosition[];
  crossMarginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  withdrawable: string;
}

export interface HyperliquidPositionsResponse {
  [userAddress: string]: HyperliquidClearinghouseState;
}
