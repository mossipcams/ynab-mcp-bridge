import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createYnabApi as createSdkYnabApi } from "./ynabApi.js";
import * as GetAccountTool from "./tools/GetAccountTool.js";
import * as GetCategoryTool from "./tools/GetCategoryTool.js";
import * as GetMoneyMovementGroupsByMonthTool from "./tools/GetMoneyMovementGroupsByMonthTool.js";
import * as GetMoneyMovementsByMonthTool from "./tools/GetMoneyMovementsByMonthTool.js";
import * as GetMonthCategoryTool from "./tools/GetMonthCategoryTool.js";
import * as GetPayeeTool from "./tools/GetPayeeTool.js";
import * as GetPlanDetailsTool from "./tools/GetPlanDetailsTool.js";
import * as GetPlanMonthTool from "./tools/GetPlanMonthTool.js";
import * as GetPlanSettingsTool from "./tools/GetPlanSettingsTool.js";
import * as GetTransactionsByMonthTool from "./tools/GetTransactionsByMonthTool.js";
import * as ListPlanCategoriesTool from "./tools/ListPlanCategoriesTool.js";
import * as ListPlansTool from "./tools/ListPlansTool.js";
export const SERVER_INFO = {
    name: "ynab-mcp-bridge",
    version: "0.1.2",
};
const toolRegistrations = [
    { title: "List Plans", module: ListPlansTool },
    { title: "Get Plan", module: GetPlanDetailsTool },
    { title: "Get Plan Settings", module: GetPlanSettingsTool },
    { title: "Get Plan Month", module: GetPlanMonthTool },
    { title: "List Categories", module: ListPlanCategoriesTool },
    { title: "Get Category", module: GetCategoryTool },
    { title: "Get Month Category", module: GetMonthCategoryTool },
    { title: "Get Transactions By Month", module: GetTransactionsByMonthTool },
    { title: "Get Account", module: GetAccountTool },
    { title: "Get Payee", module: GetPayeeTool },
    { title: "Get Money Movements By Month", module: GetMoneyMovementsByMonthTool },
    { title: "Get Money Movement Groups By Month", module: GetMoneyMovementGroupsByMonthTool },
];
export function createYnabApi(token = process.env.YNAB_API_TOKEN || "") {
    return createSdkYnabApi(token);
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
