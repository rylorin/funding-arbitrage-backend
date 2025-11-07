import { type Decimal, type RoundingMode } from "./number";

export const roundToMinChange = (value: Decimal, minChange: Decimal, roundingMode?: RoundingMode) => {
  return value
    .div(minChange)
    .decimalPlaces(0, roundingMode)
    .times(minChange)
    .decimalPlaces(minChange.decimalPlaces() || 0);
};
