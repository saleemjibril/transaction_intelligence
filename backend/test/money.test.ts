import { describe, expect, it } from "vitest";
import {
  InvalidAmountError,
  decimalStringToMinorUnits,
  formatNGN,
  minorUnitsToDecimalString,
} from "../src/lib/money";

describe("money", () => {
  it("round-trips a NGN amount without floating point", () => {
    const minor = decimalStringToMinorUnits("12999.75", "NGN");
    expect(minor).toBe(1299975n);
    expect(minorUnitsToDecimalString(minor, "NGN")).toBe("12999.75");
  });

  it("handles zero and whole-ngn amounts", () => {
    expect(decimalStringToMinorUnits("0", "NGN")).toBe(0n);
    expect(minorUnitsToDecimalString(0n, "NGN")).toBe("0.00");
    expect(decimalStringToMinorUnits("1500", "NGN")).toBe(150000n);
    expect(minorUnitsToDecimalString(150000n, "NGN")).toBe("1500.00");
  });

  it("rejects more decimal places than the currency allows", () => {
    expect(() => decimalStringToMinorUnits("1.234", "NGN")).toThrow(InvalidAmountError);
  });

  it("rejects malformed amounts", () => {
    expect(() => decimalStringToMinorUnits("abc", "NGN")).toThrow(InvalidAmountError);
    expect(() => decimalStringToMinorUnits("", "NGN")).toThrow(InvalidAmountError);
    expect(() => decimalStringToMinorUnits(".75", "NGN")).toThrow(InvalidAmountError);
  });

  it("formats NGN with symbol and thousands separators", () => {
    expect(formatNGN(1299975n)).toBe("₦12,999.75");
    expect(formatNGN(150000000n)).toBe("₦1,500,000.00");
  });
});
