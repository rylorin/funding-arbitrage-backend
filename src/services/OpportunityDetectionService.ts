import { FundingRate } from "../models/index";
import { ArbitrageOpportunity, ExchangeName, RiskLevel, TokenSymbol } from "../types/index";

interface DetailedArbitrageOpportunity extends ArbitrageOpportunity {
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
  priceDeviation: number;
}

interface OpportunityFilters {
  minAPRThreshold?: number;
  maxPositionSize?: number; // not implemented yet
  maxPriceDeviation?: number;
  allowedExchanges?: ExchangeName[];
  riskTolerance?: RiskLevel;
  limit?: number;
}

export class OpportunityDetectionService {
  /**
   * Trouve les meilleures opportunités d'arbitrage selon les filtres
   */
  public async findOpportunities(filters: OpportunityFilters = {}): Promise<DetailedArbitrageOpportunity[]> {
    const {
      minAPRThreshold = 5,
      // maxPositionSize = 10_000,
      maxPriceDeviation = 0.5,
      allowedExchanges,
      riskTolerance,
      limit = null,
    } = filters;

    try {
      // Récupérer les rates les plus récents depuis la DB
      const latestRates = await FundingRate.getLatestRates();

      // Grouper par token
      const ratesByToken = this.groupRatesByToken(latestRates);

      const opportunities: DetailedArbitrageOpportunity[] = [];

      // Pour chaque token, trouver les meilleures opportunités
      for (const [token, rates] of Object.entries(ratesByToken)) {
        if (rates.length < 2) continue; // Besoin d'au moins 2 exchanges

        // Trier par funding rate croissant (plus cher à être long = meilleur pour short)
        rates.sort((a, b) => a.fundingRate - b.fundingRate);

        // Trouver les meilleures combinaisons
        for (let i = 0; i < rates.length - 1; i++) {
          for (let j = i + 1; j < rates.length; j++) {
            const longRate = rates[i]; // Taux le plus bas = plus rentable pour être long
            const shortRate = rates[j]; // Taux le plus haut = plus rentable pour être short

            // Éviter la même exchange
            if (longRate.exchange === shortRate.exchange) continue;

            // Filtrer par exchanges autorisés
            if (
              allowedExchanges &&
              (!allowedExchanges.includes(longRate.exchange as ExchangeName) ||
                !allowedExchanges.includes(shortRate.exchange as ExchangeName))
            )
              continue;

            // Calculer l'APR du spread
            const spreadAPR = this.calculateSpreadAPR(longRate, shortRate);
            // if (token === "KAITO")
            //   console.log(
            //     `Token: ${token}, Long: ${longRate.exchange} (${longRate.fundingRate}), Short: ${shortRate.exchange} (${shortRate.fundingRate}), Spread APR: ${spreadAPR.toFixed(2)}%`,
            //   );

            // Filtrer par seuil minimum APR
            if (spreadAPR < minAPRThreshold) continue;

            // Calculer la déviation de prix
            const priceDeviation = this.calculatePriceDeviation(longRate, shortRate);

            // Filtrer par déviation de prix maximale
            if (priceDeviation > maxPriceDeviation) continue;

            const opportunity: DetailedArbitrageOpportunity = {
              token: token as TokenSymbol,
              longExchange: longRate.exchange,
              shortExchange: shortRate.exchange,
              longFundingRate: longRate.fundingRate / longRate.fundingFrequency,
              shortFundingRate: shortRate.fundingRate / shortRate.fundingFrequency,
              spreadAPR,
              confidence: this.calculateConfidence(longRate, shortRate, priceDeviation),
              minSize: 100,
              maxSize: this.calculateMaxSize(longRate, shortRate),
              longMarkPrice: longRate.markPrice || 0,
              shortMarkPrice: shortRate.markPrice || 0,
              riskLevel: this.assessRiskLevel(spreadAPR, priceDeviation),
              fundingFrequency: {
                longExchange: longRate.fundingFrequency || this.getFundingFrequency(longRate.exchange),
                shortExchange: shortRate.fundingFrequency || this.getFundingFrequency(shortRate.exchange),
              },
              nextFundingTimes: {
                longExchange: longRate.nextFunding,
                shortExchange: shortRate.nextFunding,
              },
              priceDeviation,
            };

            // Filtrer par tolérance au risque
            if (riskTolerance && !this.matchesRiskTolerance(opportunity, riskTolerance)) {
              continue;
            }

            opportunities.push(opportunity);
          }
        }
      }

      // Trier par spreadAPR décroissant
      opportunities.sort((a, b) => b.spreadAPR - a.spreadAPR);

      return limit ? opportunities.slice(0, limit) : opportunities; // Retourner les n meilleures
    } catch (error) {
      console.error("Error finding arbitrage opportunities:", error);
      throw new Error("Failed to find arbitrage opportunities");
    }
  }

  /**
   * Filtre les opportunités selon les paramètres utilisateur
   */
  public filterByUserSettings(
    opportunities: DetailedArbitrageOpportunity[],
    userSettings: {
      minAPR?: number;
      maxPositionSize?: number;
      riskTolerance?: RiskLevel;
      allowedExchanges?: ExchangeName[];
    },
  ): DetailedArbitrageOpportunity[] {
    return opportunities.filter((opp) => {
      // Filtre APR minimum
      if (userSettings.minAPR && opp.spreadAPR < userSettings.minAPR) {
        console.log(
          `Filtering out opportunity for ${opp.token} due to min APR: ${opp.spreadAPR} < ${userSettings.minAPR}`,
          opp,
        );
        return false;
      }

      // Filtre taille maximum
      if (userSettings.maxPositionSize && opp.maxSize < userSettings.maxPositionSize) {
        console.log(
          `Filtering out opportunity for ${opp.token} due to max position size: ${opp.maxSize} > ${userSettings.maxPositionSize}`,
          opp,
        );
        return false;
      }

      // Filtre tolérance au risque
      if (userSettings.riskTolerance && !this.matchesRiskTolerance(opp, userSettings.riskTolerance)) {
        console.log(
          `Filtering out opportunity for ${opp.token} due to risk tolerance: opportunity risk ${opp.riskLevel}, user tolerance ${userSettings.riskTolerance}`,
          opp,
        );
        return false;
      }

      // Filtre exchanges autorisés
      if (
        userSettings.allowedExchanges &&
        (!userSettings.allowedExchanges.includes(opp.longExchange as ExchangeName) ||
          !userSettings.allowedExchanges.includes(opp.shortExchange as ExchangeName))
      ) {
        console.log(
          `Filtering out opportunity for ${opp.token} due to allowed exchanges: long ${opp.longExchange}, short ${opp.shortExchange}`,
          opp,
        );
        return false;
      }

      return true;
    });
  }

  /**
   * Calcule l'APR du spread entre deux rates
   */
  private calculateSpreadAPR(longRate: any, shortRate: any): number {
    const longApr = (365 * 24 * longRate.fundingRate) / longRate.fundingFrequency;
    const shortApr = (365 * 24 * shortRate.fundingRate) / shortRate.fundingFrequency;
    const spread = shortApr - longApr;

    return spread * 100; // Convertir en pourcentage
  }

  /**
   * Calcule la déviation de prix entre deux exchanges
   */
  private calculatePriceDeviation(longRate: any, shortRate: any): number {
    if (!longRate.markPrice || !shortRate.markPrice) return 0;

    const avgPrice = (longRate.markPrice + shortRate.markPrice) / 2;
    const priceDiff = Math.abs(longRate.markPrice - shortRate.markPrice);

    return (priceDiff / avgPrice) * 100; // Pourcentage de déviation
  }

  /**
   * Calcule le niveau de confiance d'une opportunité
   */
  private calculateConfidence(longRate: any, shortRate: any, priceDeviation: number): number {
    let confidence = 90; // Confiance de base

    // Réduire la confiance selon la déviation de prix
    confidence -= priceDeviation * 10;

    // Réduire la confiance si les funding rates sont trop proches
    const spread = Math.abs(shortRate.fundingRate - longRate.fundingRate);
    if (spread < 0.0001) confidence -= 20; // Spread très faible

    // Augmenter la confiance pour les exchanges établis
    const establishedExchanges = ["vest", "hyperliquid"];
    if (establishedExchanges.includes(longRate.exchange) && establishedExchanges.includes(shortRate.exchange)) {
      confidence += 10;
    }

    return Math.max(50, Math.min(95, confidence));
  }

  /**
   * Calcule la taille maximale de position
   */
  private calculateMaxSize(longRate: any, shortRate: any): number {
    // not implemented yet
    return 1_000_000_000;
    // Basé sur la liquidité et l'open interest disponibles
    // Idéalement, cela viendrait des APIs des exchanges
    const baseSize = 10000;

    // Réduire la taille pour les exchanges plus petits/nouveaux
    const smallExchanges = ["extended", "orderly"];
    if (smallExchanges.includes(longRate.exchange) || smallExchanges.includes(shortRate.exchange)) {
      return baseSize * 0.5;
    }

    return baseSize;
  }

  /**
   * Évalue le niveau de risque
   */
  private assessRiskLevel(spreadAPR: number, priceDeviation: number): RiskLevel {
    if (priceDeviation > 0.3 || spreadAPR > 50) return RiskLevel.HIGH;
    if (priceDeviation > 0.1 || spreadAPR > 20) return RiskLevel.MEDIUM;
    return RiskLevel.LOW;
  }

  /**
   * Vérifie si l'opportunité correspond à la tolérance au risque
   */
  private matchesRiskTolerance(opportunity: DetailedArbitrageOpportunity, riskTolerance: RiskLevel): boolean {
    switch (riskTolerance) {
      case RiskLevel.LOW:
        return opportunity.riskLevel === RiskLevel.LOW && opportunity.confidence >= 80;
      case RiskLevel.MEDIUM:
        return [RiskLevel.LOW, RiskLevel.MEDIUM].includes(opportunity.riskLevel) && opportunity.confidence >= 70;
      case RiskLevel.HIGH:
        return opportunity.confidence >= 60;
      default:
        return false;
    }
  }

  /**
   * Récupère la fréquence de funding d'un exchange
   */
  private getFundingFrequency(exchange: string): string {
    const exchangeFrequencies: Record<string, string> = {
      vest: "Hourly",
      hyperliquid: "8 Hours",
      orderly: "8 Hours",
      extended: "Hourly",
    };

    return exchangeFrequencies[exchange] || "8 Hours";
  }

  /**
   * Groupe les rates par token
   */
  private groupRatesByToken(rates: FundingRate[]): Record<string, any[]> {
    return rates.reduce(
      (acc, rate) => {
        const rateData = rate.dataValues || rate;
        if (!rateData.token) return acc;

        if (!acc[rateData.token]) {
          acc[rateData.token] = [];
        }
        acc[rateData.token].push(rateData);
        return acc;
      },
      {} as Record<string, any[]>,
    );
  }
}

export const opportunityDetectionService = new OpportunityDetectionService();
