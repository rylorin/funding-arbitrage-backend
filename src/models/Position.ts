import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import { ExchangeName, PositionStatus, TokenSymbol } from "../types/index";
import User from "./User";

interface PositionAttributes {
  id: string;
  userId: string;
  token: TokenSymbol;
  longExchange: ExchangeName;
  shortExchange: ExchangeName;
  longPositionId?: string;
  shortPositionId?: string;
  longOrderId?: string;
  shortOrderId?: string;
  longSize: number | null;
  shortSize: number | null;
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
  declare public id: string;
  declare public userId: string;
  declare public token: TokenSymbol;
  declare public longToken?: TokenSymbol;
  declare public shortToken?: TokenSymbol;
  declare public longExchange: ExchangeName;
  declare public shortExchange: ExchangeName;
  declare public longPositionId?: string;
  declare public shortPositionId?: string;
  declare public longOrderId?: string;
  declare public shortOrderId?: string;
  declare public longSize: number;
  declare public shortSize: number;
  declare public entryTimestamp: Date;
  declare public entryFundingRates: {
    longRate: number;
    shortRate: number;
    spreadAPR: number;
  };
  declare public entrySpreadAPR?: number;
  declare public longFundingRate?: number;
  declare public shortFundingRate?: number;
  declare public longMarkPrice?: number;
  declare public shortMarkPrice?: number;
  declare public currentPnl: number;
  declare public unrealizedPnL?: number;
  declare public realizedPnL?: number;
  declare public totalFees?: number;
  declare public hoursOpen?: number;
  declare public autoCloseEnabled: boolean;
  declare public autoCloseAPRThreshold: number;
  declare public autoClosePnLThreshold: number;
  declare public autoCloseTimeoutHours?: number;
  declare public status: PositionStatus;
  declare public closedAt?: Date;
  declare public closedReason?: string;
  declare public lastUpdated?: Date;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;

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

  public size(): number {
    return this.longSize + this.shortSize;
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
      type: DataTypes.STRING,
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
    longPositionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    shortPositionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    longSize: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
      validate: {
        min: 0.00000001,
      },
    },
    shortSize: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
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
