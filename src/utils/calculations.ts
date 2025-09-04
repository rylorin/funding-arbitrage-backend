import { ArbitrageOpportunity } from '../types/index';

export class CalculationUtils {
  static calculateAPR(fundingRate: number, hoursPerFunding: number = 8): number {
    const fundingsPerYear = (365 * 24) / hoursPerFunding;
    return fundingRate * fundingsPerYear * 100;
  }

  static calculateSpreadAPR(longRate: number, shortRate: number, hoursPerFunding: number = 8): number {
    const spread = shortRate - longRate;
    return this.calculateAPR(spread, hoursPerFunding);
  }

  static calculatePositionPnL(
    entryPrice: number,
    currentPrice: number,
    size: number,
    side: 'long' | 'short',
    fees: number = 0
  ): number {
    const priceChange = currentPrice - entryPrice;
    const pnl = side === 'long' ? priceChange * size : -priceChange * size;
    return pnl - fees;
  }

  static calculateFundingPnL(
    fundingRate: number,
    notionalSize: number,
    side: 'long' | 'short'
  ): number {
    // Funding is paid by longs when positive, received when negative
    const fundingPayment = fundingRate * notionalSize;
    return side === 'long' ? -fundingPayment : fundingPayment;
  }

  static calculateArbitrageOpportunity(
    longRate: number,
    shortRate: number,
    token: string,
    longExchange: string,
    shortExchange: string,
    minSize: number = 100,
    maxSize: number = 10000
  ): ArbitrageOpportunity | null {
    const spreadAPR = this.calculateSpreadAPR(longRate, shortRate);
    
    if (spreadAPR <= 0) return null;

    // Calculate confidence based on spread size and rate consistency
    const rateSum = Math.abs(longRate) + Math.abs(shortRate);
    const spreadRatio = Math.abs(spreadAPR) / (rateSum * 100 * 8760 || 1);
    const confidence = Math.min(95, 50 + (spreadRatio * 1000));

    return {
      token: token as any,
      longExchange: longExchange as any,
      shortExchange: shortExchange as any,
      longFundingRate: longRate,
      shortFundingRate: shortRate,
      spreadAPR: Number(spreadAPR.toFixed(2)),
      confidence: Number(confidence.toFixed(0)),
      minSize,
      maxSize,
    };
  }

  static calculatePortfolioMetrics(positions: any[]): {
    totalPnL: number;
    totalSize: number;
    averageAPR: number;
    riskScore: number;
  } {
    if (positions.length === 0) {
      return { totalPnL: 0, totalSize: 0, averageAPR: 0, riskScore: 0 };
    }

    const totalPnL = positions.reduce((sum, pos) => sum + pos.currentPnl, 0);
    const totalSize = positions.reduce((sum, pos) => sum + pos.size, 0);
    
    // Calculate weighted average APR
    let weightedAPRSum = 0;
    positions.forEach(pos => {
      const positionAPR = this.calculateCurrentAPR(pos);
      const weight = pos.size / totalSize;
      weightedAPRSum += positionAPR * weight;
    });

    // Calculate risk score (0-100, higher = riskier)
    const exchangeCount = new Set(positions.flatMap(p => [p.longExchange, p.shortExchange])).size;
    const tokenCount = new Set(positions.map(p => p.token)).size;
    const avgPositionSize = totalSize / positions.length;
    
    // Risk factors
    const concentrationRisk = Math.max(0, 100 - (tokenCount * 10)); // Less diversification = more risk
    const exchangeRisk = Math.max(0, 100 - (exchangeCount * 15)); // Fewer exchanges = more risk
    const sizeRisk = Math.min(100, avgPositionSize / 1000 * 10); // Larger positions = more risk
    
    const riskScore = (concentrationRisk + exchangeRisk + sizeRisk) / 3;

    return {
      totalPnL: Number(totalPnL.toFixed(2)),
      totalSize: Number(totalSize.toFixed(2)),
      averageAPR: Number(weightedAPRSum.toFixed(2)),
      riskScore: Number(riskScore.toFixed(0)),
    };
  }

  static calculateCurrentAPR(position: any): number {
    const hoursOpen = this.getHoursOpen(position.entryTimestamp);
    if (hoursOpen === 0 || position.size === 0) return 0;
    
    const returnPercentage = (position.currentPnl / position.size) * 100;
    const annualizedReturn = returnPercentage * (8760 / hoursOpen); // 8760 hours in a year
    
    return Number(annualizedReturn.toFixed(2));
  }

  static getHoursOpen(entryTimestamp: Date): number {
    const now = new Date();
    const entry = new Date(entryTimestamp);
    return Math.max(0, (now.getTime() - entry.getTime()) / (1000 * 60 * 60));
  }

  static calculateOptimalPositionSize(
    availableBalance: number,
    riskPercentage: number,
    expectedVolatility: number,
    maxLeverage: number = 1
  ): number {
    // Kelly Criterion adapted for funding arbitrage
    const riskAmount = availableBalance * (riskPercentage / 100);
    
    // Adjust for volatility - higher volatility means smaller position
    const volatilityAdjustment = Math.max(0.1, 1 - expectedVolatility);
    
    const optimalSize = riskAmount * volatilityAdjustment * maxLeverage;
    
    return Number(Math.max(0, optimalSize).toFixed(2));
  }

  static calculateFeeImpact(
    tradingFees: number,
    fundingAPR: number,
    positionSize: number
  ): { breakEvenDays: number; netAPRAfterFees: number } {
    const annualFeeImpact = tradingFees * 365; // Assuming fees are daily
    const annualFundingReturn = (fundingAPR / 100) * positionSize;
    
    const netAPRAfterFees = ((annualFundingReturn - annualFeeImpact) / positionSize) * 100;
    const breakEvenDays = tradingFees / (annualFundingReturn / 365);

    return {
      breakEvenDays: Number(Math.max(0, breakEvenDays).toFixed(1)),
      netAPRAfterFees: Number(netAPRAfterFees.toFixed(2)),
    };
  }

  static isOpportunityViable(
    spreadAPR: number,
    tradingFees: number,
    positionSize: number,
    minViableAPR: number = 5
  ): boolean {
    const { netAPRAfterFees } = this.calculateFeeImpact(tradingFees, spreadAPR, positionSize);
    return netAPRAfterFees >= minViableAPR;
  }

  static roundToDecimals(num: number, decimals: number): number {
    return Number(num.toFixed(decimals));
  }

  static formatPercentage(num: number, decimals: number = 2): string {
    return `${this.roundToDecimals(num, decimals)}%`;
  }

  static formatCurrency(num: number, decimals: number = 2): string {
    return `$${this.roundToDecimals(num, decimals).toLocaleString()}`;
  }
}

export default CalculationUtils;