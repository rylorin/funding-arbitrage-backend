import { DataTypes, Model, Optional, Op } from 'sequelize';
import { sequelize } from '../config/database';
import { ExchangeName, TokenSymbol } from '../types/index';

interface FundingRateAttributes {
  id: string;
  exchange: ExchangeName;
  token: TokenSymbol;
  fundingRate: number;
  nextFunding: Date;
  timestamp: Date;
  markPrice?: number;
  indexPrice?: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FundingRateCreationAttributes extends Optional<
  FundingRateAttributes,
  'id' | 'createdAt' | 'updatedAt' | 'markPrice' | 'indexPrice'
> {}

class FundingRate extends Model<FundingRateAttributes, FundingRateCreationAttributes> implements FundingRateAttributes {
  public id!: string;
  public exchange!: ExchangeName;
  public token!: TokenSymbol;
  public fundingRate!: number;
  public nextFunding!: Date;
  public timestamp!: Date;
  public markPrice?: number;
  public indexPrice?: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public static async getLatestRates(token?: TokenSymbol, exchange?: ExchangeName) {
    const whereClause: any = {};
    if (token) whereClause.token = token;
    if (exchange) whereClause.exchange = exchange;

    if (token && exchange) {
      // Get latest for specific token and exchange
      return await FundingRate.findAll({
        where: whereClause,
        order: [['timestamp', 'DESC']],
        limit: 1,
      });
    }

    // For broader queries, get more recent data to ensure we have multiple exchanges/tokens
    return await FundingRate.findAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      limit: 2000, // Increase limit to get more data for arbitrage calculations
    });
  }

  public static async getLatestForTokenAndExchange(token: TokenSymbol, exchange: ExchangeName) {
    return await FundingRate.findOne({
      where: { token, exchange },
      order: [['timestamp', 'DESC']],
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
      order: [['timestamp', 'ASC']],
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
      type: DataTypes.ENUM('vest', 'hyperliquid', 'orderly', 'extended', 'paradex', 'backpack', 'hibachi'),
      allowNull: false,
    },
    token: {
      type: DataTypes.ENUM('BTC', 'ETH', 'SOL', 'AVAX', 'MATIC', 'ARB', 'OP'),
      allowNull: false,
    },
    fundingRate: {
      type: DataTypes.DECIMAL(18, 12),
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
    modelName: 'FundingRate',
    tableName: 'funding_rates',
    indexes: [
      {
        unique: true,
        fields: ['exchange', 'token'],
      },
      {
        fields: ['exchange'],
      },
      {
        fields: ['token'],
      },
      {
        fields: ['timestamp'],
      },
      {
        fields: ['nextFunding'],
      },
    ],
  }
);

export default FundingRate;