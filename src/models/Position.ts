import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/database";
import { ExchangeName, PlacedOrderData, TokenSymbol } from "../types/index";
import TradeHistory from "./TradeHistory";
import User from "./User";

export enum PositionStatus {
  OPENING = "OPENING",
  OPEN = "OPEN",
  CLOSING = "CLOSING",
  CLOSED = "CLOSED",
  ERROR = "ERROR",
}

// export const PositionStatus = {
//   OPEN : "OPEN",
//   CLOSING:"CLOSING",
//   CLOSED : "CLOSED",
//   ERROR : "ERROR",
// } as const;
// export type PositionStatus = (typeof PositionStatus)[keyof typeof PositionStatus];

export enum PositionSide {
  LONG = "long",
  SHORT = "short",
}

interface PositionAttributes extends PlacedOrderData {
  id: string;
  userId: string;
  tradeId: string;

  token: TokenSymbol;
  status: PositionStatus;
  entryTimestamp: Date;

  cost?: number;
  unrealizedPnL?: number;
  realizedPnL?: number;

  updatedAt: Date;
  createdAt: Date;
}

interface PositionCreationAttributes
  extends Optional<PositionAttributes, "id" | "orderId" | "createdAt" | "updatedAt"> {}

export class Position extends Model<PositionAttributes, PositionCreationAttributes> implements PositionAttributes {
  declare public id: string;
  declare public userId: string;
  declare public tradeId: string;
  declare public token: TokenSymbol;
  declare public status: PositionStatus;
  declare public entryTimestamp: Date;

  declare public exchange: ExchangeName;
  declare public side: PositionSide;
  declare public size: number;
  declare public price: number;
  declare public leverage: number;
  declare public slippage: number;
  declare public orderId: string;

  declare public cost: number;
  declare public unrealizedPnL: number;
  declare public realizedPnL: number;

  declare public readonly updatedAt: Date;
  declare public readonly createdAt: Date;

  public static associate() {
    Position.belongsTo(User, { foreignKey: "userId", as: "user" });
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
    tradeId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: TradeHistory,
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
    entryTimestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    exchange: {
      type: DataTypes.ENUM("vest", "hyperliquid", "orderly", "extended", "asterperp", "paradex", "backpack", "hibachi"),
      allowNull: false,
    },
    side: {
      type: DataTypes.ENUM("long", "short"),
      allowNull: false,
    },
    size: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
    },
    price: {
      type: DataTypes.NUMBER,
      allowNull: false,
    },
    leverage: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
    },
    slippage: {
      type: DataTypes.NUMBER,
      allowNull: false,
    },
    orderId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cost: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
    },
    unrealizedPnL: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
      defaultValue: 0,
    },
    realizedPnL: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
      defaultValue: 0,
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
