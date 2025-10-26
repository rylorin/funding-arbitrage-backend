import { DataTypes, Model, Optional, Op } from "sequelize";
import { sequelize } from "../config/database";
import { ExchangeName, TokenSymbol } from "../types/index";
import User from "./User";
import Position from "./Position";

interface TradeHistoryAttributes {
  id: string;
  userId: string;
  positionId: string;
  action: "OPEN" | "CLOSE" | "PARTIAL_CLOSE";
  exchange: ExchangeName;
  token: TokenSymbol;
  side: "long" | "short" | "close_long" | "close_short" | "DELTA_NEUTRAL" | "AUTO_CLOSE";
  size: number;
  price: number;
  fee: number;
  externalTradeId?: string;
  timestamp: Date;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

interface TradeHistoryCreationAttributes extends Optional<TradeHistoryAttributes, "id" | "createdAt" | "updatedAt"> {}

class TradeHistory
  extends Model<TradeHistoryAttributes, TradeHistoryCreationAttributes>
  implements TradeHistoryAttributes
{
  public id!: string;
  public userId!: string;
  public positionId!: string;
  public action!: "OPEN" | "CLOSE" | "PARTIAL_CLOSE";
  public exchange!: ExchangeName;
  public token!: TokenSymbol;
  public side!: "long" | "short" | "close_long" | "close_short" | "DELTA_NEUTRAL" | "AUTO_CLOSE";
  public size!: number;
  public price!: number;
  public fee!: number;
  public externalTradeId?: string;
  public timestamp!: Date;
  public metadata?: any;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public static associate() {
    TradeHistory.belongsTo(User, { foreignKey: "userId", as: "user" });
    TradeHistory.belongsTo(Position, {
      foreignKey: "positionId",
      as: "position",
    });
  }

  public static async getTradingVolume(userId: string, days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const trades = await TradeHistory.findAll({
      where: {
        userId,
        timestamp: {
          [Op.gte]: cutoff,
        },
      },
    });

    return trades.reduce((total, trade) => total + trade.size * trade.price, 0);
  }

  public static async getTradingFees(userId: string, days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const trades = await TradeHistory.findAll({
      where: {
        userId,
        timestamp: {
          [Op.gte]: cutoff,
        },
      },
    });

    return trades.reduce((total, trade) => total + trade.fee, 0);
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
    positionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Position,
        key: "id",
      },
    },
    action: {
      type: DataTypes.ENUM("OPEN", "CLOSE", "PARTIAL_CLOSE"),
      allowNull: false,
    },
    exchange: {
      type: DataTypes.ENUM("vest", "hyperliquid", "orderly", "extended", "paradex", "backpack", "hibachi"),
      allowNull: false,
    },
    token: {
      type: DataTypes.ENUM("BTC", "ETH", "SOL", "AVAX", "MATIC", "ARB", "OP"),
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
    fee: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
      defaultValue: 0,
    },
    externalTradeId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    metadata: {
      type: DataTypes.JSON,
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
    modelName: "TradeHistory",
    tableName: "trade_history",
    indexes: [
      {
        fields: ["userId"],
      },
      {
        fields: ["positionId"],
      },
      {
        fields: ["exchange"],
      },
      {
        fields: ["timestamp"],
      },
      {
        unique: true,
        fields: ["externalTradeId", "exchange"],
      },
    ],
  },
);

export default TradeHistory;
