import { ExchangeName, RiskLevel } from "@/types";
import { default as config } from "config";
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";

export const defaultUserSettings = config.get<UserSettings>("defaultUserSettings");
// console.log(defaultUserSettings);

export interface UserSettings {
  enabled: boolean;

  autoCloseAPRThreshold: number;
  autoClosePnLThreshold: number;
  autoCloseTimeoutHours: number;
  riskTolerance: RiskLevel;

  preferredExchanges: ExchangeName[];

  minAPR: number;
  maxPositionSize: number;
  maxSimultaneousPositions: number;
  autoCloseEnabled: boolean;

  notificationPreferences: {
    email: boolean;
    webhook: boolean;
    discord: boolean;
  };

  slippageTolerance: number; // in percentage
  positionLeverage: number;
}

interface UserAttributes {
  id: string;
  walletAddress: string;
  settings: UserSettings;
  createdAt: Date;
  updatedAt: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, "id" | "createdAt" | "updatedAt"> {}

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare public id: string;
  declare public walletAddress: string;
  declare public settings: UserSettings;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;

  public static associate() {
    // Will be defined when other models are created
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    walletAddress: {
      type: DataTypes.STRING(42),
      allowNull: false,
      unique: true,
      validate: {
        is: /^0x[a-fA-F0-9]{40}$/,
      },
    },
    settings: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: defaultUserSettings,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "User",
    tableName: "users",
    indexes: [
      {
        unique: true,
        fields: ["walletAddress"],
      },
    ],
  },
);

export default User;
