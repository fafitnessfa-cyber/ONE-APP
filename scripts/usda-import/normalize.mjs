import { USDA_CANONICAL_NUTRIENTS } from './config.mjs';

const BRANDED_REQUIRED_LOG_CODES = new Set([
  'energy_kcal',
  'protein',
  'carbohydrate',
  'fat',
]);
const GRAM_UNIT_CODES = new Set(['g', 'gm', 'grm', 'gram', 'grams']);
const MILLILITER_UNIT_CODES = new Set([
  'ml',
  'mlt',
  'milliliter',
  'milliliters',
]);
const MARKET_COUNTRY_CODE_BY_NAME = new Map([
  ['UNITED STATES', 'US'],
  ['NEW ZEALAND', 'NZ'],
]);

function toTrimmedText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableText(value) {
  const trimmed = toTrimmedText(value);
  return trimmed || null;
}

function toFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function roundCompleteness(value) {
  return Number(value.toFixed(4));
}

function isFiniteNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isFinitePositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizeCategoryDescription(food) {
  const brandedCategory =
    normalizeNullableText(food?.brandedFoodCategory) ??
    normalizeNullableText(food?.foodCategory);

  if (brandedCategory) {
    return brandedCategory;
  }

  return (
    toTrimmedText(food?.foodCategory?.description) ||
    toTrimmedText(food?.wweiaFoodCategory?.wweiaFoodCategoryDescription) ||
    null
  );
}

function buildFoodMetadata({
  dataset,
  food,
  importProfile,
  importProfiles,
  importMode,
  importLabel,
  selectionMetadata,
  baseUnit,
  countryCode,
  normalizedBarcode,
  originalBarcode,
}) {
  return {
    importProfile,
    importProfiles: [...new Set(importProfiles)],
    lastImportProfile: importProfile,
    importMode,
    importLabel,
    usda: {
      fdcId: food.fdcId,
      datasetKey: dataset.key,
      datasetName: dataset.displayName,
      sourceCode: dataset.sourceCode,
      releaseId: dataset.releaseId,
      releaseFile: dataset.jsonFileName,
      dataType: food.dataType ?? null,
      foodClass: food.foodClass ?? null,
      publicationDate: food.publicationDate ?? null,
      categoryId:
        food.foodCategory?.id ??
        food.wweiaFoodCategory?.wweiaFoodCategoryCode ??
        null,
      categoryDescription: normalizeCategoryDescription(food),
      scientificName: food.scientificName ?? null,
      ndbNumber: food.ndbNumber ?? null,
      foodCode: food.foodCode ?? null,
      startDate: food.startDate ?? null,
      endDate: food.endDate ?? null,
      wweiaFoodCategory:
        food.wweiaFoodCategory?.wweiaFoodCategoryDescription ?? null,
      marketCountry: food.marketCountry ?? null,
      normalizedCountryCode: countryCode ?? null,
      originalDescription: food.description,
      inputFoodCount: Array.isArray(food.inputFoods) ? food.inputFoods.length : 0,
      portionCount: Array.isArray(food.foodPortions) ? food.foodPortions.length : 0,
      baseUnit: baseUnit ?? null,
      sourceRecordUrl: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${food.fdcId}/nutrients`,
    },
    barcode:
      normalizedBarcode == null && originalBarcode == null
        ? null
        : {
            normalized: normalizedBarcode,
            original:
              originalBarcode && originalBarcode !== normalizedBarcode
                ? originalBarcode
                : null,
          },
    importQuality: selectionMetadata ?? null,
    branded:
      dataset.key !== 'branded'
        ? null
        : {
            brandOwner: normalizeNullableText(food.brandOwner),
            brandName: normalizeNullableText(food.brandName),
            dataSource: normalizeNullableText(food.dataSource),
            marketCountry: normalizeNullableText(food.marketCountry),
            packagedWeight: normalizeNullableText(food.packageWeight),
            servingSize: toFiniteNumber(food.servingSize),
            servingSizeUnit: normalizeNullableText(food.servingSizeUnit),
            householdServingFullText: normalizeNullableText(
              food.householdServingFullText,
            ),
            ingredients: normalizeNullableText(food.ingredients),
            brandedFoodCategory: normalizeCategoryDescription(food),
            availableDate:
              normalizeNullableText(food.availableDate) ??
              normalizeNullableText(food.publishedDate),
            modifiedDate: normalizeNullableText(food.modifiedDate),
            gtinUpc: normalizeNullableText(food.gtinUpc),
          },
  };
}

function getFoodNutrientId(nutrientRow) {
  if (Number.isInteger(nutrientRow?.nutrient?.id)) {
    return nutrientRow.nutrient.id;
  }

  if (Number.isInteger(nutrientRow?.nutrientId)) {
    return nutrientRow.nutrientId;
  }

  return null;
}

function getFoodNutrientAmount(nutrientRow) {
  const amount = toFiniteNumber(nutrientRow?.amount ?? nutrientRow?.value);

  if (amount == null || amount < 0) {
    return null;
  }

  return amount;
}

function getFoodNutrientName(nutrientRow) {
  return (
    normalizeNullableText(nutrientRow?.nutrient?.name) ??
    normalizeNullableText(nutrientRow?.nutrientName) ??
    'USDA nutrient'
  );
}

function getFoodNutrientDerivationDescription(nutrientRow) {
  return (
    normalizeNullableText(nutrientRow?.foodNutrientDerivation?.description) ??
    normalizeNullableText(nutrientRow?.derivationDescription)
  );
}

function getNutrientBasisPriority(nutrientRow, target) {
  const description =
    getFoodNutrientDerivationDescription(nutrientRow)?.toLowerCase() ?? '';

  if (!description) {
    return target === 'base' ? 100 : 0;
  }

  if (description.includes('100 unit') || description.includes('per 100')) {
    return target === 'base' ? 400 : 100;
  }

  if (description.includes('serving size')) {
    return target === 'serving' ? 400 : 100;
  }

  return 200;
}

function upsertPreferredNutrientRow(index, nutrientId, nutrientRow, target) {
  const priority = getNutrientBasisPriority(nutrientRow, target);
  const existing = index.get(nutrientId);

  if (!existing || priority > existing.priority) {
    index.set(nutrientId, {
      amount: getFoodNutrientAmount(nutrientRow),
      nutrientRow,
      priority,
    });
  }
}

function buildUsdaNutrientIndex(food) {
  const baseById = new Map();
  const servingById = new Map();
  let skippedInvalidNutrients = 0;

  for (const nutrientRow of food.foodNutrients ?? []) {
    const nutrientId = getFoodNutrientId(nutrientRow);
    const amount = getFoodNutrientAmount(nutrientRow);

    if (!nutrientId || amount == null) {
      skippedInvalidNutrients += 1;
      continue;
    }

    const normalizedRow = {
      ...nutrientRow,
      amount,
      nutrient:
        nutrientRow?.nutrient ??
        (nutrientId
          ? {
              id: nutrientId,
              name: getFoodNutrientName(nutrientRow),
            }
          : null),
    };

    upsertPreferredNutrientRow(baseById, nutrientId, normalizedRow, 'base');
    upsertPreferredNutrientRow(servingById, nutrientId, normalizedRow, 'serving');
  }

  return { baseById, servingById, skippedInvalidNutrients };
}

function mapFoodNutrients(food, nutrientIdByCode, { includeServingValues = false } = {}) {
  const {
    baseById: nutrientIndex,
    servingById: servingNutrientIndex,
    skippedInvalidNutrients,
  } = buildUsdaNutrientIndex(food);
  let missingCanonicalNutrients = 0;
  let selectedEnergyNutrientId = null;
  const mappedCodes = new Set();
  const servingNutrientValues = {};

  const nutrientRows = USDA_CANONICAL_NUTRIENTS.flatMap(({ code, usdaIds }) => {
    const matchedId = usdaIds.find((usdaId) => nutrientIndex.has(usdaId));

    if (!matchedId) {
      missingCanonicalNutrients += 1;
      return [];
    }

    const usdaRow = nutrientIndex.get(matchedId);

    if (code === 'energy_kcal') {
      selectedEnergyNutrientId = matchedId;
    }

    mappedCodes.add(code);

    if (includeServingValues) {
      const matchedServingId = usdaIds.find((usdaId) => servingNutrientIndex.has(usdaId));
      const servingRow = matchedServingId
        ? servingNutrientIndex.get(matchedServingId)
        : null;

      if (servingRow?.amount != null) {
        servingNutrientValues[code] = servingRow.amount;
      }
    }

    return [
      {
        nutrientId: nutrientIdByCode.get(code),
        amount: usdaRow.amount,
        dataOrigin: `USDA nutrient ${matchedId} (${getFoodNutrientName(
          usdaRow.nutrientRow,
        )})`,
      },
    ];
  });

  return {
    nutrientRows,
    servingNutrientValues:
      Object.keys(servingNutrientValues).length > 0 ? servingNutrientValues : null,
    mappedCodes,
    missingCanonicalNutrients,
    skippedInvalidNutrients,
    selectedEnergyNutrientId,
  };
}

function parseLeadingQuantity(label) {
  const trimmed = toTrimmedText(label);

  const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)\s+(.+)$/);
  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const numerator = Number(mixedMatch[2]);
    const denominator = Number(mixedMatch[3]);

    return {
      quantity: whole + numerator / denominator,
      householdUnit: mixedMatch[4].trim(),
    };
  }

  const fractionMatch = trimmed.match(/^(\d+)\/(\d+)\s+(.+)$/);
  if (fractionMatch) {
    return {
      quantity: Number(fractionMatch[1]) / Number(fractionMatch[2]),
      householdUnit: fractionMatch[3].trim(),
    };
  }

  const numericMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (numericMatch) {
    return {
      quantity: Number(numericMatch[1]),
      householdUnit: numericMatch[2].trim(),
    };
  }

  return {
    quantity: 1,
    householdUnit: trimmed || null,
  };
}

function formatQuantity(value) {
  return Number.isInteger(value) ? `${value}` : `${value}`;
}

function buildFoundationServing(portion) {
  const gramWeight = Number(portion?.gramWeight);
  const measureName =
    toTrimmedText(portion?.measureUnit?.abbreviation) ||
    toTrimmedText(portion?.measureUnit?.name);

  if (!isFinitePositiveNumber(gramWeight) || !measureName || measureName === 'RACC') {
    return null;
  }

  const quantity =
    typeof portion.amount === 'number'
      ? portion.amount
      : typeof portion.value === 'number'
      ? portion.value
      : 1;

  if (!isFinitePositiveNumber(quantity)) {
    return null;
  }

  const modifier = toTrimmedText(portion?.modifier);

  return {
    sourceServingId: normalizeNullableText(portion?.id ? String(portion.id) : null),
    servingName: [formatQuantity(quantity), measureName, modifier]
      .filter(Boolean)
      .join(' '),
    quantity,
    gramWeight,
    milliliterVolume: null,
    householdUnit: measureName,
    isDefault: false,
  };
}

function buildSurveyServing(portion) {
  const gramWeight = Number(portion?.gramWeight);
  const description = toTrimmedText(portion?.portionDescription);

  if (
    !isFinitePositiveNumber(gramWeight) ||
    !description ||
    description.toLowerCase() === 'quantity not specified'
  ) {
    return null;
  }

  const parsed = parseLeadingQuantity(description);

  if (!isFinitePositiveNumber(parsed.quantity)) {
    return null;
  }

  return {
    sourceServingId: normalizeNullableText(portion?.id ? String(portion.id) : null),
    servingName: description,
    quantity: parsed.quantity,
    gramWeight,
    milliliterVolume: null,
    householdUnit: parsed.householdUnit,
    isDefault: false,
  };
}

function calculateGtinCheckDigit(body) {
  let total = 0;

  for (let index = 0; index < body.length; index += 1) {
    const reverseIndex = body.length - 1 - index;
    const digit = Number(body[reverseIndex]);
    total += digit * (index % 2 === 0 ? 3 : 1);
  }

  return (10 - (total % 10)) % 10;
}

function isValidGtinDigits(digits) {
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) {
    return false;
  }

  const body = digits.slice(0, -1);
  const checkDigit = Number(digits.at(-1));

  return calculateGtinCheckDigit(body) === checkDigit;
}

function normalizeBrandedBarcode(value) {
  const originalBarcode = normalizeNullableText(value);

  if (!originalBarcode) {
    return {
      hasValue: false,
      isValid: false,
      normalizedBarcode: null,
      originalBarcode: null,
    };
  }

  const cleanedDigits = originalBarcode.replace(/[^\d]/g, '');

  if (!cleanedDigits || !isValidGtinDigits(cleanedDigits)) {
    return {
      hasValue: true,
      isValid: false,
      normalizedBarcode: null,
      originalBarcode,
    };
  }

  return {
    hasValue: true,
    isValid: true,
    normalizedBarcode: cleanedDigits.padStart(14, '0'),
    originalBarcode,
  };
}

function normalizeBrandedCountryCode(value) {
  const trimmedValue = normalizeNullableText(value);

  if (!trimmedValue) {
    return null;
  }

  if (/^[A-Za-z]{2}$/.test(trimmedValue)) {
    return trimmedValue.toUpperCase();
  }

  const mappedCountryCode = MARKET_COUNTRY_CODE_BY_NAME.get(trimmedValue.toUpperCase());
  return mappedCountryCode ?? null;
}

function normalizeBrandedBaseUnit(food) {
  const unit = normalizeNullableText(food?.servingSizeUnit)?.toLowerCase();

  if (unit && GRAM_UNIT_CODES.has(unit)) {
    return 'g';
  }

  if (unit && MILLILITER_UNIT_CODES.has(unit)) {
    return 'ml';
  }

  const hints = [
    normalizeNullableText(food?.householdServingFullText),
    normalizeNullableText(food?.packageWeight),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    hints &&
    (/\bml\b/.test(hints) ||
      hints.includes('milliliter') ||
      hints.includes('millilitre') ||
      hints.includes('fl oz') ||
      hints.includes('fluid ounce'))
  ) {
    return 'ml';
  }

  if (
    hints &&
    (/\bg\b/.test(hints) ||
      hints.includes('gram') ||
      hints.includes('grams') ||
      hints.includes('grm'))
  ) {
    return 'g';
  }

  return null;
}

function buildBrandedServing(food, baseUnit, nutrientValues) {
  const servingSize = toFiniteNumber(food?.servingSize);

  if (!isFinitePositiveNumber(servingSize)) {
    return null;
  }

  const householdServingText = normalizeNullableText(food?.householdServingFullText);
  const parsed = householdServingText
    ? parseLeadingQuantity(householdServingText)
    : {
        quantity: 1,
        householdUnit: baseUnit,
      };

  return {
    sourceServingId:
      householdServingText != null
        ? `usda-branded-household:${householdServingText.toLowerCase()}`
        : `usda-branded-serving:${servingSize}-${baseUnit}`,
    servingName: householdServingText ?? `${servingSize} ${baseUnit}`,
    quantity: isFinitePositiveNumber(parsed.quantity) ? parsed.quantity : 1,
    gramWeight: baseUnit === 'g' ? servingSize : null,
    milliliterVolume: baseUnit === 'ml' ? servingSize : null,
    householdUnit: parsed.householdUnit ?? baseUnit,
    isDefault: true,
    nutrientValues:
      nutrientValues && Object.keys(nutrientValues).length > 0 ? nutrientValues : null,
  };
}

function dedupeServings(servings) {
  const seen = new Set();
  const uniqueServings = [];

  for (const serving of servings) {
    const key =
      serving.sourceServingId ??
      `${serving.servingName.toLowerCase()}|${serving.quantity}|${serving.gramWeight}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueServings.push(serving);
  }

  return uniqueServings;
}

function mapFoodServings(dataset, food, options = {}) {
  if (dataset.key === 'branded') {
    const baseUnit = options.baseUnit;
    const brandedServing = buildBrandedServing(
      food,
      baseUnit,
      options.servingNutrientValues,
    );
    const baseServing = {
      sourceServingId: null,
      servingName: `100 ${baseUnit}`,
      quantity: 100,
      gramWeight: baseUnit === 'g' ? 100 : null,
      milliliterVolume: baseUnit === 'ml' ? 100 : null,
      householdUnit: baseUnit,
      isDefault: brandedServing == null,
      nutrientValues: null,
    };

    return {
      servingRows: brandedServing
        ? dedupeServings([brandedServing, baseServing])
        : [baseServing],
      skippedInvalidServings: brandedServing ? 0 : 1,
    };
  }

  const baseServing = {
    sourceServingId: null,
    servingName: '100 g',
    quantity: 100,
    gramWeight: 100,
    milliliterVolume: null,
    householdUnit: 'g',
    isDefault: true,
  };
  let skippedInvalidServings = 0;

  const mappedPortions = (food.foodPortions ?? [])
    .map((portion) => {
      const serving =
        dataset.key === 'foundation'
          ? buildFoundationServing(portion)
          : buildSurveyServing(portion);

      if (!serving) {
        skippedInvalidServings += 1;
      }

      return serving;
    })
    .filter(Boolean);

  const servings = [baseServing, ...dedupeServings(mappedPortions)];

  return {
    servingRows: servings,
    skippedInvalidServings,
  };
}

function classifyFood(dataset) {
  return {
    foodType: dataset.foodType,
    verificationLevel: dataset.verificationLevel,
  };
}

export class FoodValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function normalizeUsdaFood({
  dataset,
  food,
  importProfile,
  importProfiles,
  importMode,
  importLabel,
  selectionMetadata,
  nutrientIdByCode,
  sourceIdByCode,
}) {
  if (!Number.isInteger(food?.fdcId)) {
    throw new FoodValidationError('missing_fdc_id', 'USDA food is missing a valid integer fdcId.');
  }

  const name = toTrimmedText(food.description);

  if (!name) {
    throw new FoodValidationError(
      'missing_name',
      `USDA food ${food.fdcId} is missing a description.`,
    );
  }

  const sourceId = sourceIdByCode.get(dataset.sourceCode);

  if (!sourceId) {
    throw new Error(`Missing source id mapping for ${dataset.sourceCode}.`);
  }

  const isBrandedDataset = dataset.key === 'branded';
  const classification = classifyFood(dataset);
  const baseUnit = isBrandedDataset ? normalizeBrandedBaseUnit(food) : 'g';

  if (isBrandedDataset && !baseUnit) {
    throw new FoodValidationError(
      'unsupported_base_unit',
      `USDA branded food ${food.fdcId} is missing a supported gram/ml serving unit.`,
    );
  }

  const normalizedBarcode = isBrandedDataset
    ? normalizeBrandedBarcode(food.gtinUpc)
    : null;
  const countryCode = isBrandedDataset
    ? normalizeBrandedCountryCode(food.marketCountry)
    : 'US';
  const nutrientMapping = mapFoodNutrients(food, nutrientIdByCode);

  if (
    isBrandedDataset &&
    [...BRANDED_REQUIRED_LOG_CODES].some((code) => !nutrientMapping.mappedCodes.has(code))
  ) {
    throw new FoodValidationError(
      'missing_core_macros',
      `USDA branded food ${food.fdcId} is missing one or more core logging nutrients.`,
    );
  }

  const servingMapping = mapFoodServings(dataset, food, {
    baseUnit,
  });
  const metadata = buildFoodMetadata({
    dataset,
    food,
    importProfile,
    importProfiles,
    importMode,
    importLabel,
    selectionMetadata,
    baseUnit,
    countryCode,
    normalizedBarcode: normalizedBarcode?.normalizedBarcode ?? null,
    originalBarcode: normalizedBarcode?.originalBarcode ?? null,
  });

  return {
    datasetKey: dataset.key,
    fdcId: food.fdcId,
    catalogFood: {
      source_id: sourceId,
      source_food_id: String(food.fdcId),
      food_type: classification.foodType,
      name,
      description: normalizeCategoryDescription(food),
      brand_name:
        isBrandedDataset
          ? normalizeNullableText(food.brandName) ??
            normalizeNullableText(food.brandOwner)
          : null,
      country_code: countryCode,
      verification_level: classification.verificationLevel,
      data_completeness: roundCompleteness(
        nutrientMapping.nutrientRows.length / USDA_CANONICAL_NUTRIENTS.length,
      ),
      base_amount: 100,
      base_unit: baseUnit ?? 'g',
      is_active: true,
      metadata,
    },
    nutrientRows: nutrientMapping.nutrientRows,
    servingRows: servingMapping.servingRows,
    barcodeRows:
      normalizedBarcode?.isValid && normalizedBarcode.normalizedBarcode
        ? [
            {
              barcode: normalizedBarcode.normalizedBarcode,
              countryCode,
              isPrimary: true,
            },
          ]
        : [],
    stats: {
      mappedCanonicalNutrients: nutrientMapping.nutrientRows.length,
      missingCanonicalNutrients: nutrientMapping.missingCanonicalNutrients,
      skippedInvalidNutrients: nutrientMapping.skippedInvalidNutrients,
      selectedEnergyNutrientId: nutrientMapping.selectedEnergyNutrientId,
      skippedInvalidServings: servingMapping.skippedInvalidServings,
      servingCount: servingMapping.servingRows.length,
      hasHouseholdServing: servingMapping.servingRows.length > 1,
      onlyBaseServing: servingMapping.servingRows.length === 1,
      hasNoCanonicalNutrients: nutrientMapping.nutrientRows.length === 0,
      hasBarcode: Boolean(
        normalizedBarcode?.isValid && normalizedBarcode.normalizedBarcode,
      ),
      skippedInvalidBarcode: Boolean(normalizedBarcode?.hasValue && !normalizedBarcode?.isValid),
    },
  };
}
