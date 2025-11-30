import FundingRate from "./FundingRate";
import { Position, PositionSide, PositionStatus } from "./Position";
import { TradeHistory } from "./TradeHistory";
import { User, UserAttributes, UserSettings, defaultUserSettings } from "./User";

User.hasMany(Position, { foreignKey: "userId", as: "positions" });
Position.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(TradeHistory, { foreignKey: "userId", as: "trades" });
TradeHistory.belongsTo(User, { foreignKey: "userId", as: "user" });

TradeHistory.hasMany(Position, { foreignKey: "tradeId", as: "positions" });
Position.belongsTo(TradeHistory, { foreignKey: "tradeId", as: "trade" });

export { FundingRate, Position, PositionSide, PositionStatus, TradeHistory, User, defaultUserSettings };
export type { UserAttributes, UserSettings };
