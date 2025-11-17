import FundingRate from "./FundingRate";
import Position from "./Position";
import TradeHistory from "./TradeHistory";
import User, { UserSettings } from "./User";

User.hasMany(Position, { foreignKey: "userId", as: "positions" });
Position.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(TradeHistory, { foreignKey: "userId", as: "trades" });
TradeHistory.belongsTo(User, { foreignKey: "userId", as: "user" });

Position.hasMany(TradeHistory, { foreignKey: "positionId", as: "trades" });
TradeHistory.belongsTo(Position, { foreignKey: "positionId", as: "position" });

export { FundingRate, Position, TradeHistory, User };
export type { UserSettings };
// export default {
//   User,
//   Position,
//   FundingRate,
//   TradeHistory,
// };
