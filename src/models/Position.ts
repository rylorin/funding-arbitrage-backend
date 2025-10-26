import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import { PositionStatus, ExchangeName, TokenSymbol } from "../types/index";
import User from "./User";

interface PositionAttributes {
  id: string;
  userId: string;
  token: TokenSymbol;
  longToken?: TokenSymbol;
  shortToken?: TokenSymbol;
  longExchange: ExchangeName;
  shortExchange: ExchangeName;
  size: number;
  entryTimestamp: Date;
  entryFundingRates: {
    longRate: number;
    shortRate: number;
    spreadAPR: number;
  };
  entrySpreadAPR?: number;
  longFundingRate?: number;
  shortFundingRate?: number;
  longMarkPrice?: number;
  shortMarkPrice?: number;
  currentPnl: number;
  unrealizedPnL?: number;
  realizedPnL?: number;
  totalFees?: number;
  hoursOpen?: number;
  autoCloseEnabled: boolean;
  autoCloseAPRThreshold: number;
  autoClosePnLThreshold: number;
  autoCloseTimeoutHours?: number;
  status: PositionStatus;
  closedAt?: Date;
  closedReason?: string;
  longPositionId?: string;
  shortPositionId?: string;
  lastUpdated?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface PositionCreationAttributes
  extends Optional<
    PositionAttributes,
    "id" | "createdAt" | "updatedAt" | "currentPnl" | "closedAt" | "closedReason" | "longPositionId" | "shortPositionId"
  > {}

class Position extends Model<PositionAttributes, PositionCreationAttributes> implements PositionAttributes {
  public id!: string;
  public userId!: string;
  public token!: TokenSymbol;
  public longToken?: TokenSymbol;
  public shortToken?: TokenSymbol;
  public longExchange!: ExchangeName;
  public shortExchange!: ExchangeName;
  public size!: number;
  public entryTimestamp!: Date;
  public entryFundingRates!: {
    longRate: number;
    shortRate: number;
    spreadAPR: number;
  };
  public entrySpreadAPR?: number;
  public longFundingRate?: number;
  public shortFundingRate?: number;
  public longMarkPrice?: number;
  public shortMarkPrice?: number;
  public currentPnl!: number;
  public unrealizedPnL?: number;
  public realizedPnL?: number;
  public totalFees?: number;
  public hoursOpen?: number;
  public autoCloseEnabled!: boolean;
  public autoCloseAPRThreshold!: number;
  public autoClosePnLThreshold!: number;
  public autoCloseTimeoutHours?: number;
  public status!: PositionStatus;
  public closedAt?: Date;
  public closedReason?: string;
  public longPositionId?: string;
  public shortPositionId?: string;
  public lastUpdated?: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public static associate() {
    Position.belongsTo(User, { foreignKey: "userId", as: "user" });
  }

  public getHoursOpen(): number {
    const now = new Date();
    const entryTime = new Date(this.entryTimestamp);
    return (now.getTime() - entryTime.getTime()) / (1000 * 60 * 60);
  }

  public shouldAutoClose(): boolean {
    if (!this.autoCloseEnabled || this.status !== "OPEN") return false;

    const hoursOpen = this.getHoursOpen();
    const timeoutHours = 168; // 7 days default

    return this.currentPnl <= this.autoClosePnLThreshold || hoursOpen >= timeoutHours;
  }
}

Position.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
    },
    token: {
      type: DataTypes.ENUM("BTC", "ETH", "SOL", "AVAX", "MATIC", "ARB", "OP"),
      allowNull: false,
    },
    longExchange: {
      type: DataTypes.ENUM("vest", "hyperliquid", "orderly", "extended", "paradex", "backpack", "hibachi"),
      allowNull: false,
    },
    shortExchange: {
      type: DataTypes.ENUM("vest", "hyperliquid", "orderly", "extended", "paradex", "backpack", "hibachi"),
      allowNull: false,
    },
    size: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
      validate: {
        min: 0.00000001,
      },
    },
    entryTimestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    entryFundingRates: {
      type: DataTypes.JSON,
      allowNull: false,
      validate: {
        hasRequiredFields(value: any) {
          if (!value || typeof value !== "object") {
            throw new Error("entryFundingRates must be an object");
          }
          if (
            typeof value.longRate !== "number" ||
            typeof value.shortRate !== "number" ||
            typeof value.spreadAPR !== "number"
          ) {
            throw new Error("entryFundingRates must contain longRate, shortRate, and spreadAPR");
          }
        },
      },
    },
    currentPnl: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
      defaultValue: 0,
    },
    autoCloseEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    autoCloseAPRThreshold: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 10,
    },
    autoClosePnLThreshold: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: -5,
    },
    status: {
      type: DataTypes.ENUM("OPEN", "CLOSED", "ERROR", "CLOSING"),
      allowNull: false,
      defaultValue: "OPEN",
    },
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    closedReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    longPositionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    shortPositionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    longToken: {
      type: DataTypes.ENUM("BTC", "ETH", "SOL", "AVAX", "MATIC", "ARB", "OP"),
      allowNull: true,
    },
    shortToken: {
      type: DataTypes.ENUM("BTC", "ETH", "SOL", "AVAX", "MATIC", "ARB", "OP"),
      allowNull: true,
    },
    entrySpreadAPR: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
    },
    longFundingRate: {
      type: DataTypes.DECIMAL(12, 8),
      allowNull: true,
    },
    shortFundingRate: {
      type: DataTypes.DECIMAL(12, 8),
      allowNull: true,
    },
    longMarkPrice: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
    },
    shortMarkPrice: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
    },
    unrealizedPnL: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
    },
    realizedPnL: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
    },
    totalFees: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
    },
    hoursOpen: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    autoCloseTimeoutHours: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 168,
    },
    lastUpdated: {
      type: DataTypes.DATE,
      allowNull: true,
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
    modelName: "Position",
    tableName: "positions",
    indexes: [
      {
        fields: ["userId"],
      },
      {
        fields: ["status"],
      },
      {
        fields: ["token"],
      },
      {
        fields: ["entryTimestamp"],
      },
    ],
  },
);

export default Position;
