import { logAppEvent } from "./logger.js";
import { getJsonRpcDebugDetails, getRequestDebugDetails, getRequestPath, HTTP_ALLOWED_METHODS, isJsonParseError, isPayloadTooLargeError, logHttpDebug, reconcileResolvedProfile, resolveRequest, writeInternalServerError, writeMethodNotAllowed, writeNotFound, writeParseError, writePayloadTooLarge, writeRequestResolution, } from "./httpServerShared.js";
export function registerMcpTransportRoutes(options) {
    const { app, createStatefulRequest, createStatelessRequest, getRequestAuthDebugOptions, managedSessions, path, touchManagedSession, ynab, } = options;
    app.use(async (req, res, next) => {
        if (getRequestPath(req) !== path) {
            next();
            return;
        }
        if (req.method !== "POST" && req.method !== "DELETE") {
            logHttpDebug("request.rejected", {
                ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
                reason: "method-not-allowed",
            });
            writeMethodNotAllowed(res, HTTP_ALLOWED_METHODS);
            return;
        }
        const parsedBody = req.body;
        const resolution = await resolveRequest(req, {
            createStatefulRequest: () => createStatefulRequest(ynab, managedSessions),
            createStatelessRequest: () => createStatelessRequest(ynab),
            sessions: managedSessions,
            touchSession: touchManagedSession,
        }, parsedBody);
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
        }
        catch (error) {
            await cleanup();
            next(error);
        }
    });
    app.use((req, res) => {
        logHttpDebug("request.rejected", {
            ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
            reason: "path-not-found",
        });
        writeNotFound(res);
    });
    const errorHandler = (error, req, res, next) => {
        const requestError = error;
        if (res.headersSent) {
            next(error);
            return;
        }
        if (isJsonParseError(error)) {
            logHttpDebug("request.parse_error", getRequestDebugDetails(req));
            writeParseError(res);
            return;
        }
        if (isPayloadTooLargeError(error)) {
            logHttpDebug("request.payload_too_large", getRequestDebugDetails(req));
            writePayloadTooLarge(res);
            return;
        }
        logAppEvent("http", "request.error", {
            ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
            error: requestError,
        });
        writeInternalServerError(res);
    };
    app.use(errorHandler);
}
