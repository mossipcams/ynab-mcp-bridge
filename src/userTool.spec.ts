import { describe, expect, it, vi } from "vitest";

import * as GetUserTool from "./features/meta/GetUserTool.js";

function parseResponseText(result: Awaited<ReturnType<typeof GetUserTool.execute>>) {
  return JSON.parse(result.content[0].text);
}

describe("user tool", () => {
  it("gets the authenticated user", async () => {
    const api = {
      user: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-1",
              email: "matt@example.com",
            },
          },
        }),
      },
    };

    const result = await GetUserTool.execute({}, api as any);

    expect(api.user.getUser).toHaveBeenCalledOnce();
    expect(parseResponseText(result)).toEqual({
      user: {
        id: "user-1",
        email: "matt@example.com",
      },
    });
  });
});
