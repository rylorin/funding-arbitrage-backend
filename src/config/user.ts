import { RiskLevel, UserSettings } from "@/types";

export const defaultSettings: UserSettings = {
  enabled: false, // Désactivé par défaut pour la sécurité
  minAPR: 30, // APR minimum
  maxPositionSize: 1_000, // $1000 max par position
  maxSimultaneousPositions: 3,
  riskTolerance: RiskLevel.MEDIUM,
  preferredExchanges: ["orderly", "extended", "vest"],
  autoCloseEnabled: true,
  autoCloseAPRThreshold: 0, // Fermer si APR < 0%
  autoClosePnLThreshold: 100, // Fermer si perte > $100
  autoCloseTimeoutHours: 24_1000, // Fermer après 1 000 jours max
  notificationPreferences: {
    email: true,
    webhook: true,
    discord: true,
  },
  slippageTolerance: 0.2, // 0.2% slippage toléré
  positionLeverage: 1, // Levier par défaut de 1x
};
