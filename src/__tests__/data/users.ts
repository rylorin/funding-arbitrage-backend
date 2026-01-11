import { defaultUserSettings, UserAttributes, UserSettings } from "@/models";
import { RiskLevel } from "@/types";

const now = new Date();

export const sampleSettings: UserSettings = { ...defaultUserSettings, maxPositionSize: 50 };

export const sampleSettingsLeverage3x: UserSettings = {
  ...defaultUserSettings,
  positionLeverage: 3,
};

export const sampleSettingsHighRisk: UserSettings = {
  ...defaultUserSettings,
  riskTolerance: RiskLevel.HIGH,
};

export const sampleUser: UserAttributes = {
  id: "1",
  walletAddress: "0xSampleWalletAddress",
  settings: sampleSettings,
  createdAt: now,
  updatedAt: now,
};
