/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/lib/formatters.ts
 * Number and currency formatters strictly enforcing tabular numerals and zero-float principles.
 */

export function formatIDR(senOrUnits: string | bigint | number, includeSen = false): string {
  try {
    const rawUnits = BigInt(senOrUnits);
    const rupiah = rawUnits / 100n;
    const sen = rawUnits % 100n;

    const formattedRupiah = rupiah.toLocaleString('id-ID');
    if (includeSen && sen !== 0n) {
      const senStr = sen.toString().padStart(2, '0');
      return `Rp ${formattedRupiah},${senStr}`;
    }
    return `Rp ${formattedRupiah}`;
  } catch (err) {
    return 'Rp 0';
  }
}

export function formatCrypto(units: string | bigint, decimals: number, currencySymbol?: string): string {
  try {
    const rawUnits = BigInt(units);
    if (rawUnits === 0n) return `0.${'0'.repeat(Math.min(decimals, 4))}${currencySymbol ? ' ' + currencySymbol : ''}`;

    const isNegative = rawUnits < 0n;
    const abs = isNegative ? -rawUnits : rawUnits;
    const str = abs.toString().padStart(decimals + 1, '0');

    const integerPart = str.slice(0, -decimals) || '0';
    let fraction = str.slice(-decimals);

    // Trim excessive trailing zeros beyond 4 digits if zero
    if (fraction.length > 4) {
      fraction = fraction.slice(0, 8);
    }

    const res = `${isNegative ? '-' : ''}${integerPart}.${fraction}`;
    return currencySymbol ? `${res} ${currencySymbol}` : res;
  } catch (err) {
    return `0${currencySymbol ? ' ' + currencySymbol : ''}`;
  }
}

export function formatTimestamp(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
