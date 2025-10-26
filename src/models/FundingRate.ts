import { DataTypes, Model, Op, Optional } from "sequelize";
import { sequelize } from "../config/database";
import { ExchangeName, TokenSymbol } from "../types/index";

type FundingRateAttributes = {
  id: string;
  exchange: ExchangeName;
  token: TokenSymbol;
  fundingRate: number;
  fundingFrequency: number; // in hours
  nextFunding: Date;
  timestamp: Date;
  markPrice?: number;
  indexPrice?: number;
  createdAt: Date;
  updatedAt: Date;
};

type FundingRateCreationAttributes = Optional<
  FundingRateAttributes,
  "id" | "createdAt" | "updatedAt" | "markPrice" | "indexPrice"
>;

class FundingRate extends Model<
  FundingRateAttributes,
  FundingRateCreationAttributes
> {
  declare public id: string;
  declare public exchange: ExchangeName;
  declare public token: TokenSymbol;
  declare public fundingRate: number;
  declare public fundingFrequency: number; // in hours
  declare public nextFunding: Date;
  declare public timestamp: Date;
  declare public markPrice?: number;
  declare public indexPrice?: number;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;

  public static async getLatestRates(
    token?: TokenSymbol,
    exchange?: ExchangeName
  ): Promise<FundingRate[]> {
    let result: FundingRate[];
    const now = Date.now();

    const whereClause: any = {
      fundingRate: { [Op.ne]: null },
      timestamp: { [Op.gte]: new Date(now - 2 * 60 * 60_000) }, // Only consider entries from the last 2 hours
    };
    if (token) whereClause.token = token;
    if (exchange) whereClause.exchange = exchange;

    if (token && exchange) {
      // Get latest for specific token and exchange
      result = await FundingRate.findAll({
        where: whereClause,
        order: [["timestamp", "DESC"]],
        limit: 1,
      });
    } else {
      // For broader queries, get more recent data to ensure we have multiple exchanges/tokens
      result = await FundingRate.findAll({
        where: whereClause,
        order: [["timestamp", "DESC"]],
        limit: 2000, // Increase limit to get more data for arbitrage calculations
      });
    }
    console.log(
      `✅ FundingRate - getLatestRates: fetched ${result.length} records from DB for token=${token} exchange=${exchange}`
    );
    return result;
  }

  public static async getLatestForTokenAndExchange(
    token: TokenSymbol,
    exchange: ExchangeName
  ) {
    return await FundingRate.findOne({
      where: { token, exchange },
      order: [["timestamp", "DESC"]],
    });
  }

  public static async getHistoricalRates(
    token: TokenSymbol,
    exchange: ExchangeName,
    hours: number = 24
  ) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);

    return await FundingRate.findAll({
      where: {
        token,
        exchange,
        timestamp: {
          [Op.gte]: cutoff,
        },
      },
      order: [["timestamp", "ASC"]],
    });
  }
}

FundingRate.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    exchange: {
      type: DataTypes.ENUM(
        "vest",
        "hyperliquid",
        "orderly",
        "extended",
        "paradex",
        "backpack",
        "hibachi"
      ),
      allowNull: false,
    },
    token: {
      type: DataTypes.ENUM("BTC", "ETH", "SOL", "AVAX", "MATIC", "ARB", "OP"),
      allowNull: false,
    },
    fundingRate: {
      type: DataTypes.DECIMAL(18, 12),
      allowNull: false,
    },
    fundingFrequency: {
      type: DataTypes.SMALLINT,
      defaultValue: 1, // Default to 1 hour(s) if not provided
      allowNull: false,
    },
    nextFunding: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    markPrice: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
    },
    indexPrice: {
      type: DataTypes.DECIMAL(18, 8),
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
    modelName: "FundingRate",
    tableName: "funding_rates",
    indexes: [
      {
        unique: true,
        fields: ["exchange", "token"],
      },
      {
        fields: ["exchange"],
      },
      {
        fields: ["token"],
      },
      {
        fields: ["timestamp"],
      },
      {
        fields: ["nextFunding"],
      },
    ],
  }
);

export default FundingRate;
