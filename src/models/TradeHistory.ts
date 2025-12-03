import { DataTypes, Model, Op, Optional } from "sequelize";
import { sequelize } from "../config/database";
import { ExchangeName, TokenSymbol } from "../types/index";
import User from "./User";

export enum TradeStatus {
  OPENING = "OPENING",
  OPEN = "OPEN",
  CLOSING = "CLOSING",
  CLOSED = "CLOSED",
  ERROR = "ERROR",
}
export type TradeSide = "long" | "short" | "close_long" | "close_short" | "DELTA_NEUTRAL" | "AUTO_CLOSE";

export interface TradeHistoryAttributes {
  id: string;
  userId: string;
  exchange: ExchangeName;
  token: TokenSymbol;
  status: TradeStatus;
  side: TradeSide;
  size: number;
  price: number;

  cost: number;
  currentPnL: number;
  currentApr: number | null;

  autoCloseEnabled: boolean;
  autoCloseAPRThreshold: number;
  autoClosePnLThreshold: number;
  autoCloseTimeoutHours: number;
  closedAt?: Date;
  closedReason?: string;

  metadata?: any;
  updatedAt: Date;
  createdAt: Date;
}

export interface TradeHistoryCreationAttributes
  extends Optional<
    TradeHistoryAttributes,
    "id" | "currentPnL" | "currentApr" | "closedAt" | "closedReason" | "createdAt" | "updatedAt"
  > {}

export class TradeHistory
  extends Model<TradeHistoryAttributes, TradeHistoryCreationAttributes>
  implements TradeHistoryAttributes
{
  declare public id: string;
  declare public userId: string;
  declare public exchange: ExchangeName;
  declare public token: TokenSymbol;
  declare public status: TradeStatus;
  declare public side: "long" | "short" | "close_long" | "close_short" | "DELTA_NEUTRAL" | "AUTO_CLOSE";
  declare public size: number;
  declare public price: number;

  declare public cost: number;
  declare public currentPnL: number;
  declare public currentApr: number;

  declare public autoCloseEnabled: boolean;
  declare public autoCloseAPRThreshold: number;
  declare public autoClosePnLThreshold: number;
  declare public autoCloseTimeoutHours: number;
  declare public closedAt?: Date;
  declare public closedReason?: string;

  declare public metadata?: any;
  declare public readonly updatedAt: Date;
  declare public readonly createdAt: Date;

  public static associate() {
    TradeHistory.belongsTo(User, { foreignKey: "userId", as: "user" });
    // TradeHistory.belongsTo(Position, {
    //   foreignKey: "positionId",
    //   as: "position",
    // });
  }

  public static async getTradingVolume(userId: string, days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const trades = await TradeHistory.findAll({
      where: {
        userId,
        createdAt: {
          [Op.gte]: cutoff,
        },
      },
    });

    return trades.reduce((total, trade) => total + trade.size * trade.price, 0);
  }
}

TradeHistory.init(
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
    exchange: {
      type: DataTypes.STRING,
    },
    token: {
      type: DataTypes.ENUM("BTC", "ETH", "SOL", "AVAX", "MATIC", "ARB", "OP"),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("OPEN", "CLOSE", "PARTIAL_CLOSE", "ERROR"),
      allowNull: false,
    },
    side: {
      type: DataTypes.ENUM("long", "short", "close_long", "close_short", "DELTA_NEUTRAL", "AUTO_CLOSE"),
      allowNull: false,
    },
    size: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
      validate: {
        min: 0.00000001,
      },
    },
    price: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
      validate: {
        min: 0.00000001,
      },
    },
    cost: { type: DataTypes.NUMBER, allowNull: false },
    currentPnL: {
      type: DataTypes.NUMBER,
      allowNull: false,
      defaultValue: 0,
    },
    currentApr: {
      type: DataTypes.NUMBER,
      allowNull: true,
    },

    autoCloseEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    autoCloseAPRThreshold: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: 0,
    },
    autoClosePnLThreshold: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: -5,
    },
    autoCloseTimeoutHours: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0,
    },
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    closedReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    metadata: {
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
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "TradeHistory",
    tableName: "trade_history",
    indexes: [
      {
        fields: ["userId"],
      },
    ],
  },
);

export default TradeHistory;
