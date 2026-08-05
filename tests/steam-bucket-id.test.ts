import { describe, expect, it } from "vitest";
import { decodeBucketId } from "../src/domain/steam-bucket-id";

describe("decodeBucketId", () => {
  it("decodes AK-47 Redline", () => {
    expect(decodeBucketId("G1807209A023004")).toEqual({
      defIndex: 7,
      paintKit: 282,
      quality: 4
    });
  });

  it("decodes Gamma Case without a paint kit", () => {
    expect(decodeBucketId("G188C213004")).toEqual({ defIndex: 4236, quality: 4 });
  });

  it("decodes a knife quality marker", () => {
    expect(decodeBucketId("G188E04202B3003")).toEqual({
      defIndex: 526,
      paintKit: 43,
      quality: 3
    });
  });

  it.each(["", "G", "X1807", "G180", "G18ZZ", "G80"])("rejects malformed %s", (value) => {
    expect(() => decodeBucketId(value)).toThrow();
  });

  it("skips a valid unknown length-delimited field", () => {
    expect(decodeBucketId("G1807209A0230043A0100")).toMatchObject({
      defIndex: 7,
      paintKit: 282,
      quality: 4
    });
  });
});
