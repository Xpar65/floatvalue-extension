import { describe, expect, it } from "vitest";
import { nameHash } from "../src/domain/name-hash";

describe("nameHash", () => {
  it("matches exact UTF-8 SHA-256 golden values", async () => {
    await expect(nameHash("AK-47 | Redline (Field-Tested)")).resolves.toBe(
      "6ea9b71d44ad7b751248456500e8d3731a2bf94ad5f86a51e6d554fdddffa36f"
    );
    await expect(nameHash("StatTrak™ AK-47 | Redline (Field-Tested)")).resolves.toBe(
      "2c6fc6329cfbf1581eefc0bb825ed2afdb4bc5fe70311158212320729a588c2d"
    );
  });

  it("does not normalize case or whitespace", async () => {
    const exact = await nameHash("AK-47 | Redline (Field-Tested)");
    expect(await nameHash("ak-47 | Redline (Field-Tested)")).not.toBe(exact);
    expect(await nameHash("AK-47 | Redline (Field-Tested) ")).not.toBe(exact);
  });
});
