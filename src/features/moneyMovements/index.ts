import * as GetMoneyMovementGroupsByMonthTool from "./GetMoneyMovementGroupsByMonthTool.js";
import * as GetMoneyMovementGroupsTool from "./GetMoneyMovementGroupsTool.js";
import * as GetMoneyMovementsByMonthTool from "./GetMoneyMovementsByMonthTool.js";
import * as GetMoneyMovementsTool from "./GetMoneyMovementsTool.js";

export const moneyMovementsToolCatalog = [
  { title: "Get Money Movements", tool: GetMoneyMovementsTool },
  { title: "Get Money Movements By Month", tool: GetMoneyMovementsByMonthTool },
  { title: "Get Money Movement Groups", tool: GetMoneyMovementGroupsTool },
  { title: "Get Money Movement Groups By Month", tool: GetMoneyMovementGroupsByMonthTool },
];
