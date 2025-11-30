import { ArbitrageOpportunityData, RiskLevel } from "@/types";

export const sampleOpportunity: ArbitrageOpportunityData = {
  id: "id-12345",
  token: "INIT",
  tokenIcon: "string",
  longExchange: {
    name: "extended",
    fundingRate: 0.0001,
    fundingFrequency: 1,
    price: 0.120155707125,
  },
  shortExchange: {
    name: "hyperliquid",
    fundingRate: 0.0001,
    fundingFrequency: 1,
    price: 0.12016,
  },
  spread: {
    absolute: 0.0001,
    apr: 1,
  },
  risk: {
    level: RiskLevel.HIGH,
    score: 50,
    factors: {
      priceDeviation: 50,
      spreadQuality: 50,
      exchangeReliability: 0.5,
    },
  },
  timing: {
    nextFunding: "string",
    longFrequency: 1,
    shortFrequency: 1,
  },
};
