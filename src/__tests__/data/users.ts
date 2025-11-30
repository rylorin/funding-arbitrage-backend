import { UserSettings } from "@/models";
import { UserAttributes } from "@/models/User";
import { RiskLevel } from "@/types";

export const sampleSettings: UserSettings = {
  enabled: false,
  minAPR: 40,
  maxPositionSize: 1000,
  maxSimultaneousPositions: 1,
  riskTolerance: RiskLevel.MEDIUM,
  preferredExchanges: ["orderly", "extended", "vest", "hyperliquid", "asterperp"],
  autoCloseEnabled: true,
  autoCloseAPRThreshold: 0,
  autoCloseTimeoutHours: 0,
  autoClosePnLThreshold: 25,
  positionLeverage: 1,
  slippageTolerance: 0.3,
  notificationPreferences: {
    email: true,
    webhook: true,
    discord: true,
  },
};

export const sampleUser: UserAttributes = {
  id: "1",
  walletAddress: "0xSampleWalletAddress",
  settings: sampleSettings,
  createdAt: new Date(),
  updatedAt: new Date(),
};
