/**
 * Monetary handling.
 *
 * All money is stored and computed as an integer number of minor units
 * (kobo for NGN) in a bigint. Floating point is never used for amounts,
 * which avoids rounding errors. Conversion to a human-readable decimal
 * string happens only at the API/UI boundary.
 */

const MINOR_EXPONENTS: Record<string, number> = {
  NGN: 2,
};

const DEFAULT_EXPONENT = 2;

// The platform's primary currency is NGN; amounts in other currencies
// default to 2 decimal places (documented assumption: no FX conversion).
function exponentFor(currency: string): number {
  return MINOR_EXPONENTS[currency] ?? DEFAULT_EXPONENT;
}

const DECIMAL_RE = /^(-?)(\d+)(?:\.(\d+))?$/;

export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAmountError";
  }
}

/**
 * Integer minor units -> decimal string.
 * 1299975n, "NGN" -> "12999.75"
 */
export function minorUnitsToDecimalString(amountMinor: bigint, currency: string): string {
  const exp = exponentFor(currency);
  const factor = 10n ** BigInt(exp);
  const sign = amountMinor < 0n ? "-" : "";
  const abs = amountMinor < 0n ? -amountMinor : amountMinor;
  const whole = abs / factor;
  const frac = (abs % factor).toString().padStart(exp, "0");
  return `${sign}${whole.toString()}.${frac}`;
}

/**
 * Decimal string -> integer minor units, rejecting anything malformed
 * or with more decimal places than the currency allows.
 * "12999.75", "NGN" -> 1299975n
 */
export function decimalStringToMinorUnits(amount: string, currency: string): bigint {
  const exp = exponentFor(currency);
  const match = DECIMAL_RE.exec(amount.trim());
  if (!match) {
    throw new InvalidAmountError(`Invalid amount: "${amount}"`);
  }
  const sign = match[1] ?? "";
  const whole = match[2] ?? "";
  const frac = match[3] ?? "";
  if (frac.length > exp) {
    throw new InvalidAmountError(
      `Amount "${amount}" has more than ${exp} decimal places for ${currency}`,
    );
  }
  const factor = 10n ** BigInt(exp);
  const value = BigInt(whole) * factor + BigInt(frac.padEnd(exp, "0"));
  return sign === "-" ? -value : value;
}

/**
 * Minor units -> formatted NGN for display.
 * 1299975n -> "₦12,999.75"
 */
export function formatNGN(amountMinor: bigint): string {
  const decimal = minorUnitsToDecimalString(amountMinor, "NGN");
  const parts = decimal.split(".");
  const whole = parts[0] ?? "0";
  const frac = parts[1] ?? "00";
  const negative = whole.startsWith("-");
  const digits = negative ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}₦${grouped}.${frac}`;
}
