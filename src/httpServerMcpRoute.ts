import type { Express, Request, Response } from "express";
import { hasToolCallStarted } from "./requestContext.js";
import { reconcileResolvedProfile } from "./httpServerShared.js";

type ManagedRequest = {
  close: () => Promise<void>;
  transport: {
    handleRequest: (req: Request, res: Response, body: unknown) => Promise<void>;
  };
};

type RequestResolution =
  | {
      cleanup?: () => Promise<void>;
      managedRequest: ManagedRequest;
      status: "ready";
    }
  | {
      status: "invalid-session-header";
    };

type InstallMcpPostRouteOptions = {
  app: Express;
  createManagedRequest: () => Promise<ManagedRequest>;
  getJsonRpcDebugDetails: (parsedBody: unknown) => Record<string, unknown>;
  getRequestAuthDebugOptions: (req: Pick<Request, "path" | "url">) => { authMode?: "http" | "stdio" | "oauth" | "none"; authRequired?: boolean };
  getRequestDebugDetails: (req: Request, options?: { authMode?: string; authRequired?: boolean }) => Record<string, unknown>;
  getRequestPath: (req: Pick<Request, "path" | "url">) => string;
  getToolCallName: (parsedBody: unknown) => string | undefined;
  logHttpDebug: (event: string, details: Record<string, unknown>) => void;
  path: string;
  resolveRequest: (req: Request, createRequest: () => Promise<ManagedRequest>) => Promise<RequestResolution>;
  writeMethodNotAllowed: (res: Response, allowedMethods: readonly string[]) => void;
  writeRequestResolution: (res: Response, resolution: Exclude<RequestResolution, { cleanup?: () => Promise<void>; managedRequest: ManagedRequest; status: "ready" }>) => void;
};

const HTTP_ALLOWED_METHODS = ["POST"] as const;

export function installMcpPostRoute(options: InstallMcpPostRouteOptions) {
  const {
    app,
    createManagedRequest,
    getJsonRpcDebugDetails,
    getRequestAuthDebugOptions,
    getRequestDebugDetails,
    getRequestPath,
    getToolCallName,
    logHttpDebug,
    path,
    resolveRequest,
    writeMethodNotAllowed,
    writeRequestResolution,
  } = options;

  app.use(async (req, res, next) => {
    if (getRequestPath(req) !== path) {
      next();
      return;
    }

    if (req.method !== "POST") {
      logHttpDebug("request.rejected", {
        ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
        reason: "method-not-allowed",
      });
      writeMethodNotAllowed(res, HTTP_ALLOWED_METHODS);
      return;
    }

    const parsedBody: unknown = req.body;
    const resolution = await resolveRequest(
      req,
      createManagedRequest,
    );

    if (resolution.status !== "ready") {
      logHttpDebug("request.rejected", {
        ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
        reason: resolution.status,
      });
      writeRequestResolution(res, resolution);
      return;
    }

    let cleanedUp = false;
    const cleanup = async () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      await resolution.cleanup?.();
    };

    try {
      res.once("close", () => {
        void cleanup();
      });

      const resolvedProfile = reconcileResolvedProfile(req, res.locals, parsedBody);

      logHttpDebug("transport.handoff", {
        ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
        ...getJsonRpcDebugDetails(parsedBody),
        cleanup: Boolean(resolution.cleanup),
        profileId: resolvedProfile?.profileId,
        profileReason: resolvedProfile?.reason,
      });
      await resolution.managedRequest.transport.handleRequest(req, res, parsedBody);

      const toolName = getToolCallName(parsedBody);

      if (toolName && !hasToolCallStarted()) {
        logHttpDebug("tool.dispatch.absent", {
          ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
          ...getJsonRpcDebugDetails(parsedBody),
          toolName,
        });
      }
    } catch (error) {
      await cleanup();
      next(error);
    }
  });
}
