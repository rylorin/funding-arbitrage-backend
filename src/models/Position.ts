import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import { ArbitrageOpportunityData, ExchangeName, PositionStatus, TokenSymbol } from "../types/index";
import User from "./User";

interface PositionAttributes {
  id: string;
  userId: string;
  token: TokenSymbol;
  status: PositionStatus;
  opportunity: ArbitrageOpportunityData;
  entryTimestamp: Date;

  // Long leg
  longExchange: ExchangeName;
  longSize: number | null;
  longPrice: number | null;
  longOrderId?: string;

  // Short leg
  shortExchange: ExchangeName;
  shortSize: number | null;
  shortPrice: number | null;
  shortOrderId?: string;

  currentPnl: number;
  unrealizedPnL?: number;
  realizedPnL?: number;
  totalFees?: number;
  hoursOpen?: number;
  autoCloseEnabled: boolean;
  autoCloseAPRThreshold: number;
  autoClosePnLThreshold: number;
  autoCloseTimeoutHours?: number;
  closedAt?: Date;
  closedReason?: string;
  lastUpdated?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface PositionCreationAttributes
  extends Optional<
    PositionAttributes,
    "id" | "createdAt" | "updatedAt" | "currentPnl" | "closedAt" | "closedReason" | "longOrderId" | "shortOrderId"
  > {}

class Position extends Model<PositionAttributes, PositionCreationAttributes> implements PositionAttributes {
  declare public id: string;
  declare public userId: string;
  declare public token: TokenSymbol;
  declare public status: PositionStatus;
  declare public opportunity: ArbitrageOpportunityData;
  declare public entryTimestamp: Date;

  declare public longExchange: ExchangeName;
  declare public longSize: number;
  declare public longPrice: number;
  declare public longOrderId?: string;

  declare public shortExchange: ExchangeName;
  declare public shortSize: number;
  declare public shortPrice: number;
  declare public shortOrderId?: string;

  declare public entryFundingRates: {
    longRate: number;
    shortRate: number;
    spreadAPR: number;
  };
  declare public entrySpreadAPR?: number;
  declare public longFundingRate?: number;
  declare public shortFundingRate?: number;
  declare public currentPnl: number;
  declare public unrealizedPnL?: number;
  declare public realizedPnL?: number;
  declare public totalFees?: number;
  declare public hoursOpen?: number;
  declare public autoCloseEnabled: boolean;
  declare public autoCloseAPRThreshold: number;
  declare public autoClosePnLThreshold: number;
  declare public autoCloseTimeoutHours?: number;
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
    status: {
      type: DataTypes.ENUM("OPEN", "CLOSED", "ERROR", "CLOSING"),
      allowNull: false,
      defaultValue: "OPEN",
    },
    opportunity: {
      type: DataTypes.JSON,
      allowNull: false,
      validate: {
        hasRequiredFields(value: any) {
          if (!value || typeof value !== "object") {
            throw new Error("opportunity must be an object");
          }
          if (
            !value.longExchange ||
            typeof value.longExchange !== "object" ||
            !value.shortExchange ||
            typeof value.shortExchange !== "object" ||
            !value.spread ||
            typeof value.spread !== "object"
          ) {
            throw new Error("opportunity must contain longExchange, shortExchange, and spread");
          }
        },
      },
    },
    entryTimestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    longExchange: {
      type: DataTypes.ENUM("vest", "hyperliquid", "orderly", "extended", "paradex", "backpack", "hibachi"),
      allowNull: false,
    },
    longSize: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
      validate: {
        min: 0.00000001,
      },
    },
    longPrice: {
      type: DataTypes.NUMBER,
      allowNull: true,
    },
    longOrderId: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    shortExchange: {
      type: DataTypes.ENUM("vest", "hyperliquid", "orderly", "extended", "paradex", "backpack", "hibachi"),
      allowNull: false,
    },
    shortSize: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
      validate: {
        min: 0.00000001,
      },
    },
    shortPrice: {
      type: DataTypes.NUMBER,
      allowNull: true,
    },
    shortOrderId: {
      type: DataTypes.STRING,
      allowNull: true,
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
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    closedReason: {
      type: DataTypes.STRING,
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
