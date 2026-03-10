import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as ynab from "ynab";
import * as ApproveTransactionTool from "./tools/ApproveTransactionTool.js";
import * as BudgetSummaryTool from "./tools/BudgetSummaryTool.js";
import * as BulkApproveTransactionsTool from "./tools/BulkApproveTransactionsTool.js";
import * as CreateTransactionTool from "./tools/CreateTransactionTool.js";
import * as DeleteTransactionTool from "./tools/DeleteTransactionTool.js";
import * as GetTransactionsTool from "./tools/GetTransactionsTool.js";
import * as GetUnapprovedTransactionsTool from "./tools/GetUnapprovedTransactionsTool.js";
import * as ImportTransactionsTool from "./tools/ImportTransactionsTool.js";
import * as ListAccountsTool from "./tools/ListAccountsTool.js";
import * as ListBudgetsTool from "./tools/ListBudgetsTool.js";
import * as ListCategoriesTool from "./tools/ListCategoriesTool.js";
import * as ListMonthsTool from "./tools/ListMonthsTool.js";
import * as ListPayeesTool from "./tools/ListPayeesTool.js";
import * as ListScheduledTransactionsTool from "./tools/ListScheduledTransactionsTool.js";
import * as UpdateCategoryBudgetTool from "./tools/UpdateCategoryBudgetTool.js";
import * as UpdateTransactionTool from "./tools/UpdateTransactionTool.js";
export const SERVER_INFO = {
    name: "ynab-mcp-server",
    version: "0.1.2",
};
const toolRegistrations = [
    { title: "List Budgets", module: ListBudgetsTool },
    { title: "Get Unapproved Transactions", module: GetUnapprovedTransactionsTool },
    { title: "Budget Summary", module: BudgetSummaryTool },
    { title: "Create Transaction", module: CreateTransactionTool },
    { title: "Approve Transaction", module: ApproveTransactionTool },
    { title: "Update Category Budget", module: UpdateCategoryBudgetTool },
    { title: "Update Transaction", module: UpdateTransactionTool },
    { title: "Bulk Approve Transactions", module: BulkApproveTransactionsTool },
    { title: "List Payees", module: ListPayeesTool },
    { title: "Get Transactions", module: GetTransactionsTool },
    { title: "Delete Transaction", module: DeleteTransactionTool },
    { title: "List Categories", module: ListCategoriesTool },
    { title: "List Accounts", module: ListAccountsTool },
    { title: "List Scheduled Transactions", module: ListScheduledTransactionsTool },
    { title: "Import Transactions", module: ImportTransactionsTool },
    { title: "List Months", module: ListMonthsTool },
];
export function createYnabApi(token = process.env.YNAB_API_TOKEN || "") {
    return new ynab.API(token);
}
export function createServer(api = createYnabApi()) {
    const server = new McpServer(SERVER_INFO);
    for (const { title, module } of toolRegistrations) {
        server.registerTool(module.name, {
            title,
            description: module.description,
            inputSchema: module.inputSchema,
        }, async (input) => module.execute(input, api));
    }
    return server;
}
