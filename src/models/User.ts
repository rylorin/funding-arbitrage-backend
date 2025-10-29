import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import { RiskLevel, UserSettings } from "../types/index";

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

const defaultSettings: UserSettings = {
  enabled: false,
  autoCloseAPRThreshold: 10,
  autoClosePnLThreshold: -5,
  autoCloseTimeoutHours: 168,
  riskTolerance: RiskLevel.MEDIUM,
  preferredExchanges: ["vest", "hyperliquid"],
  minAPR: 50,
  maxPositionSize: 1_000,
  maxSimultaneousPositions: 3,
  autoCloseEnabled: false,
  notificationPreferences: {
    email: false,
    webhook: false,
    discord: false,
  },
};

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
      defaultValue: defaultSettings,
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
