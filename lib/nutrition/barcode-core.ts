export type NutritionBarcodeFormat =
  | 'ean8'
  | 'upc_a'
  | 'ean13'
  | 'gtin14'
  | 'upc_e';

export type NutritionBarcodeNormalizationErrorCode =
  | 'empty'
  | 'unsupported_format'
  | 'invalid_check_digit'
  | 'unsupported_upce';

export interface NutritionBarcodeNormalizationSuccess {
  ok: true;
  cleanedDigits: string;
  format: NutritionBarcodeFormat;
  normalizedBarcode: string;
  rawValue: string;
}

export interface NutritionBarcodeNormalizationFailure {
  ok: false;
  cleanedDigits: string;
  code: NutritionBarcodeNormalizationErrorCode;
  message: string;
  rawValue: string;
}

export type NutritionBarcodeNormalizationResult =
  | NutritionBarcodeNormalizationSuccess
  | NutritionBarcodeNormalizationFailure;

function calculateGtinCheckDigit(body: string) {
  let total = 0;

  for (let index = 0; index < body.length; index += 1) {
    const reverseIndex = body.length - 1 - index;
    const digit = Number(body[reverseIndex]);
    total += digit * (index % 2 === 0 ? 3 : 1);
  }

  return (10 - (total % 10)) % 10;
}

function isValidGtinDigits(digits: string) {
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) {
    return false;
  }

  const body = digits.slice(0, -1);
  const checkDigit = Number(digits.at(-1));

  return calculateGtinCheckDigit(body) === checkDigit;
}

function expandUpceToUpca(upce: string) {
  if (!/^\d{8}$/.test(upce) || !isValidGtinDigits(upce)) {
    return null;
  }

  const numberSystem = upce[0];

  if (numberSystem !== '0' && numberSystem !== '1') {
    return null;
  }

  const d1 = upce[1];
  const d2 = upce[2];
  const d3 = upce[3];
  const d4 = upce[4];
  const d5 = upce[5];
  const d6 = upce[6];
  const checkDigit = upce[7];

  if (d6 === '0' || d6 === '1' || d6 === '2') {
    return `${numberSystem}${d1}${d2}${d6}0000${d3}${d4}${d5}${checkDigit}`;
  }

  if (d6 === '3') {
    return `${numberSystem}${d1}${d2}${d3}00000${d4}${d5}${checkDigit}`;
  }

  if (d6 === '4') {
    return `${numberSystem}${d1}${d2}${d3}${d4}00000${d5}${checkDigit}`;
  }

  return `${numberSystem}${d1}${d2}${d3}${d4}${d5}0000${d6}${checkDigit}`;
}

function getFormatForDigits(
  digits: string,
  hintType?: string | null,
): NutritionBarcodeFormat | null {
  if (hintType === 'upc_e' && digits.length === 8) {
    return 'upc_e';
  }

  if (digits.length === 8) {
    return 'ean8';
  }

  if (digits.length === 12) {
    return 'upc_a';
  }

  if (digits.length === 13) {
    return 'ean13';
  }

  if (digits.length === 14) {
    return 'gtin14';
  }

  return null;
}

export function normalizeBarcodeInput(
  rawValue: string,
  options?: {
    hintType?: string | null;
  },
): NutritionBarcodeNormalizationResult {
  const cleanedDigits = rawValue.replace(/[^\d]/g, '');

  if (!cleanedDigits) {
    return {
      ok: false,
      rawValue,
      cleanedDigits,
      code: 'empty',
      message: 'Enter a barcode to continue.',
    };
  }

  const format = getFormatForDigits(cleanedDigits, options?.hintType);

  if (!format) {
    return {
      ok: false,
      rawValue,
      cleanedDigits,
      code: 'unsupported_format',
      message: 'Use a valid UPC, EAN, or GTIN barcode.',
    };
  }

  if (format === 'upc_e') {
    const expandedUpca = expandUpceToUpca(cleanedDigits);

    if (!expandedUpca) {
      return {
        ok: false,
        rawValue,
        cleanedDigits,
        code: 'unsupported_upce',
        message: 'That UPC-E barcode could not be validated.',
      };
    }

    return {
      ok: true,
      rawValue,
      cleanedDigits,
      format,
      normalizedBarcode: expandedUpca.padStart(14, '0'),
    };
  }

  if (!isValidGtinDigits(cleanedDigits)) {
    return {
      ok: false,
      rawValue,
      cleanedDigits,
      code: 'invalid_check_digit',
      message: 'That barcode does not look valid. Check the numbers and try again.',
    };
  }

  return {
    ok: true,
    rawValue,
    cleanedDigits,
    format,
    normalizedBarcode: cleanedDigits.padStart(14, '0'),
  };
}
