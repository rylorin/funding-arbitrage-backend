import { z } from "zod/v4";

import { zodLong } from "../utils/zod";

const TransferSchema = z.object({
  id: zodLong(),
});

export const TransferResponseSchema = z.object({ data: TransferSchema });
