import User from "./User";
import Position from "./Position";
import FundingRate from "./FundingRate";
import TradeHistory from "./TradeHistory";

User.hasMany(Position, { foreignKey: "userId", as: "positions" });
Position.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(TradeHistory, { foreignKey: "userId", as: "trades" });
TradeHistory.belongsTo(User, { foreignKey: "userId", as: "user" });

Position.hasMany(TradeHistory, { foreignKey: "positionId", as: "trades" });
TradeHistory.belongsTo(Position, { foreignKey: "positionId", as: "position" });

export { User, Position, FundingRate, TradeHistory };

export default {
  User,
  Position,
  FundingRate,
  TradeHistory,
};
