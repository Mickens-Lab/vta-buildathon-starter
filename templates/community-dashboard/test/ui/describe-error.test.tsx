// A bare fetch failure becomes the shared explanation (origin, URL, both causes, the VTC override), not "the community did not answer".
import { describe, expect, it } from "vitest";
import { describeError } from "../../src/client.ts";

describe("describeError", () => {
  it("explains a TypeError from fetch with the page origin and the VTC URL", () => {
    const m = describeError(new TypeError("NetworkError when attempting to fetch resource."));
    expect(m).toMatch(/did not answer/i);
    expect(m).toContain(location.origin);
    expect(m).toContain("http://vtc.test");
    expect(m).toContain("npm run doctor");
    expect(m).toContain("VTC_CORS_ORIGINS_TOML");
  });

  it("leaves configuration errors alone", () => {
    expect(describeError(new Error("No app credential. Run `npm run up`."))).toBe("No app credential. Run `npm run up`.");
  });
});
