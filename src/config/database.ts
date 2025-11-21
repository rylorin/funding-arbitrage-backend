import { config } from "dotenv";
import { Options, Sequelize } from "sequelize";

config();

interface DatabaseConfig {
  development: Options;
  test: Options;
  production: Options;
}

const databaseConfig: DatabaseConfig = {
  development: {
    dialect: "sqlite",
    storage: "./database.sqlite",
    // logging: console.log,
    logging: false,
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: false,
    },
  },
  test: {
    dialect: "sqlite",
    storage: ":memory:",
    logging: false,
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: false,
    },
  },
  production: {
    dialect: "postgres",
    host: process.env.DATABASE_HOST || "localhost",
    port: parseInt(process.env.DATABASE_PORT || "5432"),
    database: process.env.DATABASE_NAME || "funding_arbitrage",
    username: process.env.DATABASE_USER || "postgres",
    password: process.env.DATABASE_PASSWORD || "",
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
    logging: false,
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: false,
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  },
};

const environment = (process.env.NODE_ENV as keyof DatabaseConfig) || "development";
const dbConfig = databaseConfig[environment];
let warmupDone = false;

export const sequelize = new Sequelize(dbConfig);

export const connectDatabase = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    console.log(`✅ Database connected successfully (${environment})`);

    if (environment === "development" && !warmupDone) {
      await sequelize.sync({ alter: false, force: false });
      console.log("✅ Database tables synchronized");
    }
    warmupDone = true;
  } catch (error) {
    console.error("⚠️ Unable to connect to database:", error);
    throw error;
  }
};

export const closeDatabaseConnection = async (): Promise<void> => {
  try {
    await sequelize.close();
    console.log("Database connection closed");
  } catch (error) {
    console.error("Error closing database connection:", error);
  }
};

export default sequelize;
