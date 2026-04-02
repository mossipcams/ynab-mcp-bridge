import * as GetPayeeLocationTool from "./GetPayeeLocationTool.js";
import * as GetPayeeLocationsByPayeeTool from "./GetPayeeLocationsByPayeeTool.js";
import * as GetPayeeTool from "./GetPayeeTool.js";
import * as ListPayeeLocationsTool from "./ListPayeeLocationsTool.js";
import * as ListPayeesTool from "./ListPayeesTool.js";

export const payeesToolCatalog = [
  { title: "List Payees", tool: ListPayeesTool },
  { title: "Get Payee", tool: GetPayeeTool },
  { title: "List Payee Locations", tool: ListPayeeLocationsTool },
  { title: "Get Payee Location", tool: GetPayeeLocationTool },
  { title: "Get Payee Locations By Payee", tool: GetPayeeLocationsByPayeeTool },
];
