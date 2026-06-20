import { describe, it, expect } from "vitest";
import { money, compactMoney, signedPct, shares } from "./format";

describe("formatters", () => {
  it("formats money with no decimals", () => {
    expect(money(1234567)).toBe("$1,234,567");
    expect(money(null)).toBe("—");
  });
  it("compacts large money", () => {
    expect(compactMoney(2_500_000)).toBe("$2.5M");
    expect(compactMoney(3_000_000_000)).toBe("$3.0B");
    expect(compactMoney(0)).toBe("—");
  });
  it("formats signed percent", () => {
    expect(signedPct(12.3)).toBe("+12.3%");
    expect(signedPct(-4)).toBe("-4.0%");
  });
  it("formats share counts", () => {
    expect(shares(12345)).toBe("12,345");
    expect(shares(null)).toBe("—");
  });
});
