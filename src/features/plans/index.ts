import * as GetCategoryTool from "./GetCategoryTool.js";
import * as GetMonthCategoryTool from "./GetMonthCategoryTool.js";
import * as GetPlanDetailsTool from "./GetPlanDetailsTool.js";
import * as GetPlanMonthTool from "./GetPlanMonthTool.js";
import * as GetPlanSettingsTool from "./GetPlanSettingsTool.js";
import * as ListPlanCategoriesTool from "./ListPlanCategoriesTool.js";
import * as ListPlanMonthsTool from "./ListPlanMonthsTool.js";
import * as ListPlansTool from "./ListPlansTool.js";

export const plansToolCatalog = [
  { title: "List Plans", tool: ListPlansTool },
  { title: "Get Plan", tool: GetPlanDetailsTool },
  { title: "Get Plan Settings", tool: GetPlanSettingsTool },
  { title: "Get Plan Month", tool: GetPlanMonthTool },
  { title: "List Plan Months", tool: ListPlanMonthsTool },
  { title: "List Categories", tool: ListPlanCategoriesTool },
  { title: "Get Category", tool: GetCategoryTool },
  { title: "Get Month Category", tool: GetMonthCategoryTool },
];
