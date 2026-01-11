import { ArbitrageOpportunityData, RiskLevel } from "@/types";

export const sampleOpportunity: ArbitrageOpportunityData = {
  id: "id-12345",
  token: "ANIME",
  tokenIcon: "TBD",
  longExchange: {
    name: "hyperliquid",
    fundingRate: 0.0001,
    fundingFrequency: 1,
    price: 1000,
    apr: 0,
  },
  shortExchange: {
    name: "asterperp",
    fundingRate: 0.0001,
    fundingFrequency: 1,
    price: 1000,
    apr: 0,
  },
  spreadAPR: 1,
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
