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

    return await FundingRate.findAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      limit: exchange ? 1 : 10,
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
        fields: ['exchange', 'token', 'timestamp'],
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