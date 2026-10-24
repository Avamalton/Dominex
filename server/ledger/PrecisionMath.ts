/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PrecisionMath.ts
 * DIMONEX Zero-Float Fixed-Point Mathematical Engine
 * Absolute rule: NEVER use IEEE-754 binary floating point (JavaScript 'number')
 * for financial calculation, balances, fees, prices, or quantities.
 */

export interface CurrencyConfig {
  code: string;
  decimals: number;
  minStep: bigint;
  name: string;
}

export const CURRENCIES: Record<string, CurrencyConfig> = {
  IDR: { code: 'IDR', decimals: 2, minStep: 100n, name: 'Indonesian Rupiah' },       // 1.00 IDR = 100 units (sen)
  BTC: { code: 'BTC', decimals: 8, minStep: 1n, name: 'Bitcoin (Satoshis)' },         // 1.0 BTC = 100,000,000 sats
  ETH: { code: 'ETH', decimals: 8, minStep: 1n, name: 'Ethereum' },                  // 1.0 ETH = 100,000,000 units
  USDT: { code: 'USDT', decimals: 6, minStep: 1n, name: 'Tether USD' },              // 1.0 USDT = 1,000,000 units
};

export class PrecisionMath {
  /**
   * Parse a user-provided string representation into raw BigInt units.
   * e.g. parseToUnits("45000000.50", 2) -> 4500000050n
   * e.g. parseToUnits("0.00150000", 8) -> 150000n
   */
  static parseToUnits(val: string | number, decimals: number): bigint {
    const str = String(val).trim();
    if (!str || str === '0') return 0n;

    // Check negative
    if (str.startsWith('-')) {
      throw new Error(`Negative financial amounts are not allowed: ${str}`);
    }

    // Validate format (digits and at most one dot)
    if (!/^\d+(\.\d+)?$/.test(str)) {
      throw new Error(`Invalid monetary number format: ${str}`);
    }

    const [integerPart, fractionalPart = ''] = str.split('.');
    
    // Pad or truncate fractional part to matching decimals
    let cleanFraction = fractionalPart.slice(0, decimals);
    while (cleanFraction.length < decimals) {
      cleanFraction += '0';
    }

    const combinedStr = integerPart + cleanFraction;
    return BigInt(combinedStr);
  }

  /**
   * Format raw BigInt units back into exact decimal string representation.
   * e.g. formatFromUnits(4500000050n, 2) -> "45000000.50"
   * e.g. formatFromUnits(150000n, 8) -> "0.00150000"
   */
  static formatFromUnits(units: bigint, decimals: number, trimTrailingZeros = false): string {
    if (units === 0n) {
      if (trimTrailingZeros || decimals === 0) return '0';
      return '0.' + '0'.repeat(decimals);
    }

    const isNegative = units < 0n;
    const absUnits = isNegative ? -units : units;
    const str = absUnits.toString().padStart(decimals + 1, '0');

    if (decimals === 0) {
      return (isNegative ? '-' : '') + str;
    }

    const integerPart = str.slice(0, -decimals) || '0';
    let fractionalPart = str.slice(-decimals);

    if (trimTrailingZeros) {
      fractionalPart = fractionalPart.replace(/0+$/, '');
      if (!fractionalPart) return (isNegative ? '-' : '') + integerPart;
    }

    return (isNegative ? '-' : '') + `${integerPart}.${fractionalPart}`;
  }

  /**
   * Multiply quantity (in base decimals) by price (in quote decimals)
   * to get quote volume (in quote decimals).
   * 
   * Formula:
   * QuoteVolume (quote units) = (Quantity * Price) / (10 ^ baseDecimals)
   * Uses integer division with round-half-up.
   */
  static calculateQuoteAmount(
    baseQuantityUnits: bigint,
    baseDecimals: number,
    quotePriceUnits: bigint
  ): bigint {
    const scale = 10n ** BigInt(baseDecimals);
    const product = baseQuantityUnits * quotePriceUnits;
    // Round half up: (product + scale/2) / scale
    return (product + scale / 2n) / scale;
  }

  /**
   * Calculate base quantity bought when spending a given quote volume.
   * 
   * Formula:
   * BaseQuantity (base units) = (QuoteAmount * (10 ^ baseDecimals)) / Price
   */
  static calculateBaseQuantity(
    quoteAmountUnits: bigint,
    baseDecimals: number,
    quotePriceUnits: bigint
  ): bigint {
    if (quotePriceUnits <= 0n) {
      throw new Error('Price must be greater than zero');
    }
    const scale = 10n ** BigInt(baseDecimals);
    return (quoteAmountUnits * scale) / quotePriceUnits;
  }

  /**
   * Calculate fee in basis points (1 bps = 0.01% = 1/10,000).
   * e.g. 10 bps = 0.10%, 20 bps = 0.20%.
   * 
   * Formula:
   * Fee = (amountUnits * BigInt(bps) + 5000n) / 10000n  (Round half up)
   */
  static calculateFee(amountUnits: bigint, bps: number): bigint {
    if (bps <= 0) return 0n;
    const bpsBig = BigInt(bps);
    return (amountUnits * bpsBig + 5000n) / 10000n;
  }

  /**
   * Format display for Rupiah (e.g. "Rp 1.450.000.000")
   */
  static formatIDRDisplay(units: bigint): string {
    const idrAmount = units / 100n; // Integer Rupiah
    return 'Rp ' + idrAmount.toLocaleString('id-ID');
  }

  /**
   * Format display for Crypto (e.g. "0.02450000 BTC")
   */
  static formatCryptoDisplay(units: bigint, currency: string): string {
    const config = CURRENCIES[currency] || { decimals: 8 };
    const formatted = this.formatFromUnits(units, config.decimals, false);
    return `${formatted} ${currency}`;
  }
}
