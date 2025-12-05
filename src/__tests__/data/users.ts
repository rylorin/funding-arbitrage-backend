import { defaultUserSettings, UserSettings } from "@/models";
import { UserCreationAttributes } from "@/models/User";
import { RiskLevel } from "@/types";

export const sampleSettings: UserSettings = defaultUserSettings;

export const sampleSettingsLeverage3x: UserSettings = {
  ...defaultUserSettings,
  positionLeverage: 3,
};

export const sampleSettingsHighRisk: UserSettings = {
  ...defaultUserSettings,
  riskTolerance: RiskLevel.HIGH,
};

export const sampleUser: UserCreationAttributes = {
  id: "1",
  walletAddress: "0xSampleWalletAddress",
  settings: sampleSettings,
};
