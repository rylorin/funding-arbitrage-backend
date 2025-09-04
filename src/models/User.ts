import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import { UserSettings } from '../types/index';

interface UserAttributes {
  id: string;
  walletAddress: string;
  settings: UserSettings;
  createdAt: Date;
  updatedAt: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: string;
  public walletAddress!: string;
  public settings!: UserSettings;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public static associate() {
    // Will be defined when other models are created
  }
}

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
      defaultValue: {
        autoCloseAPRThreshold: 10, // 10% APR minimum
        autoClosePnLThreshold: -5, // -5% PnL threshold
        autoCloseTimeoutHours: 168, // 7 days
        preferredExchanges: ['vest', 'hyperliquid'],
        riskTolerance: 'medium',
        notificationPreferences: {
          email: false,
          webhook: false,
          discord: false,
        },
      },
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
    modelName: 'User',
    tableName: 'users',
    indexes: [
      {
        unique: true,
        fields: ['walletAddress'],
      },
    ],
  }
);

export default User;