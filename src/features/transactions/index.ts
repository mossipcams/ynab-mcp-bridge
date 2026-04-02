import * as GetScheduledTransactionTool from "./GetScheduledTransactionTool.js";
import * as GetTransactionTool from "./GetTransactionTool.js";
import * as GetTransactionsByAccountTool from "./GetTransactionsByAccountTool.js";
import * as GetTransactionsByCategoryTool from "./GetTransactionsByCategoryTool.js";
import * as GetTransactionsByMonthTool from "./GetTransactionsByMonthTool.js";
import * as GetTransactionsByPayeeTool from "./GetTransactionsByPayeeTool.js";
import * as ListScheduledTransactionsTool from "./ListScheduledTransactionsTool.js";
import * as ListTransactionsTool from "./ListTransactionsTool.js";
import * as SearchTransactionsTool from "./SearchTransactionsTool.js";

export const transactionsToolCatalog = [
  { title: "List Transactions", tool: ListTransactionsTool },
  { title: "Search Transactions", tool: SearchTransactionsTool },
  { title: "Get Transactions By Month", tool: GetTransactionsByMonthTool },
  { title: "Get Transaction", tool: GetTransactionTool },
  { title: "Get Transactions By Account", tool: GetTransactionsByAccountTool },
  { title: "Get Transactions By Category", tool: GetTransactionsByCategoryTool },
  { title: "Get Transactions By Payee", tool: GetTransactionsByPayeeTool },
  { title: "List Scheduled Transactions", tool: ListScheduledTransactionsTool },
  { title: "Get Scheduled Transaction", tool: GetScheduledTransactionTool },
];
