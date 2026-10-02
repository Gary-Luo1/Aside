import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "./config.ts";
import { PROVIDER_PRESETS } from "./presets.ts";

describe("PROVIDER_PRESETS", () => {
  it("示例地址和模型名都能通过配置校验", () => {
    for (const preset of PROVIDER_PRESETS) {
      const result = validateConfig({
        baseUrl: preset.baseUrl,
        apiKey: "test-key",
        model: preset.model,
      });
      assert.equal(result.ok, true, preset.id);
    }
  });
});
