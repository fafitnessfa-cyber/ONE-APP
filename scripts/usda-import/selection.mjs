function bytesToMegabytes(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(1));
}

function compareNumbersDescending(left, right) {
  if (left === right) {
    return 0;
  }

  return left > right ? 1 : -1;
}

function compareBooleansDescending(left, right) {
  return compareNumbersDescending(left ? 1 : 0, right ? 1 : 0);
}

function compareTextAscending(left, right) {
  if (left === right) {
    return 0;
  }

  return left < right ? 1 : -1;
}

function compareNumbersAscending(left, right) {
  if (left === right) {
    return 0;
  }

  return left < right ? 1 : -1;
}

function normalizeSortText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function buildSelectionQuality(normalizedFood) {
  const brandName = normalizedFood.catalogFood.brand_name ?? null;
  const brandOwner = normalizedFood.catalogFood.metadata?.branded?.brandOwner ?? null;
  const ingredients = normalizedFood.catalogFood.metadata?.branded?.ingredients ?? null;
  const category = normalizedFood.catalogFood.description ?? null;
  const countryCode = normalizedFood.catalogFood.country_code ?? null;
  const canonicalCount = normalizedFood.stats.mappedCanonicalNutrients;
  const hasBarcode = normalizedFood.stats.hasBarcode;
  const hasBrand = brandName != null;
  const hasBrandOwner = brandOwner != null;
  const hasHouseholdServing = normalizedFood.stats.hasHouseholdServing;
  const hasCountryCode = countryCode != null;
  const hasIngredients = ingredients != null;
  const hasCategory = category != null;
  const hasServingNutrientValues = normalizedFood.servingRows.some(
    (servingRow) =>
      servingRow.isDefault &&
      servingRow.nutrientValues != null &&
      Object.keys(servingRow.nutrientValues).length > 0,
  );

  const score =
    canonicalCount * 100 +
    (hasBarcode ? 60 : 0) +
    (hasBrand ? 45 : 0) +
    (hasHouseholdServing ? 30 : 0) +
    (hasBrandOwner ? 15 : 0) +
    (hasCountryCode ? 10 : 0) +
    (hasIngredients ? 8 : 0) +
    (hasCategory ? 5 : 0) +
    (hasServingNutrientValues ? 4 : 0);

  let tier = 'standard';
  let tierRank = 1;

  if (canonicalCount >= 10 && hasBarcode && hasBrand && hasHouseholdServing) {
    tier = 'premium';
    tierRank = 4;
  } else if (canonicalCount >= 8 && (hasBarcode || hasBrand) && hasHouseholdServing) {
    tier = 'high';
    tierRank = 3;
  } else if (canonicalCount >= 6 && (hasBarcode || hasBrand || hasHouseholdServing)) {
    tier = 'good';
    tierRank = 2;
  }

  return {
    tier,
    tierRank,
    score,
    canonicalCount,
    hasBarcode,
    hasBrand,
    hasBrandOwner,
    hasHouseholdServing,
    hasCountryCode,
    hasIngredients,
    hasCategory,
    hasServingNutrientValues,
  };
}

function compareSelectionCandidates(left, right) {
  return (
    compareNumbersDescending(left.quality.tierRank, right.quality.tierRank) ||
    compareNumbersDescending(left.quality.score, right.quality.score) ||
    compareNumbersDescending(
      left.quality.canonicalCount,
      right.quality.canonicalCount,
    ) ||
    compareBooleansDescending(left.quality.hasBarcode, right.quality.hasBarcode) ||
    compareBooleansDescending(left.quality.hasBrand, right.quality.hasBrand) ||
    compareBooleansDescending(
      left.quality.hasHouseholdServing,
      right.quality.hasHouseholdServing,
    ) ||
    compareBooleansDescending(left.quality.hasIngredients, right.quality.hasIngredients) ||
    compareBooleansDescending(left.quality.hasCountryCode, right.quality.hasCountryCode) ||
    compareBooleansDescending(left.quality.hasCategory, right.quality.hasCategory) ||
    compareTextAscending(left.brandSortKey, right.brandSortKey) ||
    compareTextAscending(left.nameSortKey, right.nameSortKey) ||
    compareNumbersAscending(left.fdcId, right.fdcId)
  );
}

class MinHeap {
  constructor(compare) {
    this.compare = compare;
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  peek() {
    return this.items[0] ?? null;
  }

  push(item) {
    this.items.push(item);
    this.#bubbleUp(this.items.length - 1);
  }

  replaceTop(item) {
    const previousTop = this.items[0] ?? null;
    this.items[0] = item;
    this.#bubbleDown(0);
    return previousTop;
  }

  toArray() {
    return [...this.items];
  }

  #bubbleUp(startIndex) {
    let index = startIndex;

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);

      if (this.compare(this.items[index], this.items[parentIndex]) >= 0) {
        break;
      }

      [this.items[index], this.items[parentIndex]] = [
        this.items[parentIndex],
        this.items[index],
      ];
      index = parentIndex;
    }
  }

  #bubbleDown(startIndex) {
    let index = startIndex;

    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = index * 2 + 2;
      let smallestIndex = index;

      if (
        leftIndex < this.items.length &&
        this.compare(this.items[leftIndex], this.items[smallestIndex]) < 0
      ) {
        smallestIndex = leftIndex;
      }

      if (
        rightIndex < this.items.length &&
        this.compare(this.items[rightIndex], this.items[smallestIndex]) < 0
      ) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === index) {
        break;
      }

      [this.items[index], this.items[smallestIndex]] = [
        this.items[smallestIndex],
        this.items[index],
      ];
      index = smallestIndex;
    }
  }
}

function buildSelectionCandidate(normalizedFood) {
  const quality = buildSelectionQuality(normalizedFood);

  return {
    fdcId: normalizedFood.fdcId,
    quality,
    brandSortKey: normalizeSortText(normalizedFood.catalogFood.brand_name),
    nameSortKey: normalizeSortText(normalizedFood.catalogFood.name),
    selectionMetadata: {
      qualityTier: quality.tier,
      qualityScore: quality.score,
      canonicalNutrientCount: quality.canonicalCount,
      hasBarcode: quality.hasBarcode,
      hasBrand: quality.hasBrand,
      hasHouseholdServing: quality.hasHouseholdServing,
      hasCountryCode: quality.hasCountryCode,
      hasIngredients: quality.hasIngredients,
      hasCategory: quality.hasCategory,
    },
  };
}

function createSelectionSummary(limit) {
  return {
    limit,
    startedAt: Date.now(),
    parsedFoods: 0,
    eligibleFoods: 0,
    rejectedFoods: 0,
    replacementCount: 0,
    peakRssBytes: process.memoryUsage().rss,
    rejectedByCode: {},
  };
}

function recordRejectedSelectionFood(summary, code) {
  summary.rejectedFoods += 1;
  summary.rejectedByCode[code] = (summary.rejectedByCode[code] ?? 0) + 1;
}

function maybeLogSelectionProgress(summary, { force = false } = {}) {
  if (!force && summary.parsedFoods % 25000 !== 0) {
    return;
  }

  const elapsedSeconds = Number(((Date.now() - summary.startedAt) / 1000).toFixed(1));

  console.log(
    `[selection] parsed=${summary.parsedFoods} eligible=${summary.eligibleFoods} retained=${Math.min(summary.eligibleFoods, summary.limit)} rejected=${summary.rejectedFoods} replacements=${summary.replacementCount} elapsed_s=${elapsedSeconds} peak_rss_mb=${bytesToMegabytes(summary.peakRssBytes)}`,
  );
}

export function compareExpandedSelectionCandidates(left, right) {
  return compareSelectionCandidates(left, right);
}

export function buildExpandedSelectionCandidate(normalizedFood) {
  return buildSelectionCandidate(normalizedFood);
}

export function finalizeExpandedSelectionSummary(summary, heap) {
  const selectedCandidates = heap
    .toArray()
    .sort((left, right) => -compareSelectionCandidates(left, right));

  const retainedTierCounts = selectedCandidates.reduce((counts, candidate) => {
    counts[candidate.quality.tier] = (counts[candidate.quality.tier] ?? 0) + 1;
    return counts;
  }, {});

  const retainedFoods = selectedCandidates.length;
  const averageCanonicalNutrients =
    retainedFoods === 0
      ? 0
      : Number(
          (
            selectedCandidates.reduce(
              (sum, candidate) => sum + candidate.quality.canonicalCount,
              0,
            ) / retainedFoods
          ).toFixed(4),
        );

  return {
    targetLimit: summary.limit,
    parsedFoods: summary.parsedFoods,
    eligibleFoods: summary.eligibleFoods,
    rejectedFoods: summary.rejectedFoods,
    retainedFoods,
    overflowFoods: Math.max(summary.eligibleFoods - retainedFoods, 0),
    replacementCount: summary.replacementCount,
    elapsedSeconds: Number(((Date.now() - summary.startedAt) / 1000).toFixed(2)),
    peakRssMb: bytesToMegabytes(summary.peakRssBytes),
    averageCanonicalNutrients,
    retainedTierCounts,
    rejectedByCode: Object.fromEntries(
      Object.entries(summary.rejectedByCode).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    sampleTopSelections: selectedCandidates.slice(0, 10).map((candidate) => ({
      fdcId: candidate.fdcId,
      qualityTier: candidate.quality.tier,
      qualityScore: candidate.quality.score,
      canonicalNutrientCount: candidate.quality.canonicalCount,
      hasBarcode: candidate.quality.hasBarcode,
      hasBrand: candidate.quality.hasBrand,
      hasHouseholdServing: candidate.quality.hasHouseholdServing,
    })),
  };
}

export async function buildExpandedBrandedSelection({
  dataset,
  limit,
  normalizeFood,
  referenceData,
  importProfile,
  importMode,
  iterateFoods,
}) {
  const summary = createSelectionSummary(limit);
  const heap = new MinHeap((left, right) => compareSelectionCandidates(left, right));

  for await (const food of iterateFoods(dataset)) {
    summary.parsedFoods += 1;
    summary.peakRssBytes = Math.max(summary.peakRssBytes, process.memoryUsage().rss);

    if (!food || typeof food !== 'object') {
      recordRejectedSelectionFood(summary, 'invalid_food_payload');
      maybeLogSelectionProgress(summary);
      continue;
    }

    try {
      const normalizedFood = normalizeFood({
        dataset,
        food,
        importProfile,
        importProfiles: [importProfile],
        importMode,
        importLabel: null,
        nutrientIdByCode: referenceData.nutrientIdByCode,
        sourceIdByCode: referenceData.sourceIdByCode,
      });
      const candidate = buildSelectionCandidate(normalizedFood);
      summary.eligibleFoods += 1;

      if (heap.size < limit) {
        heap.push(candidate);
      } else {
        const weakestRetainedCandidate = heap.peek();

        if (
          weakestRetainedCandidate &&
          compareSelectionCandidates(candidate, weakestRetainedCandidate) > 0
        ) {
          heap.replaceTop(candidate);
          summary.replacementCount += 1;
        }
      }
    } catch (error) {
      const isRecoverableSelectionError =
        error instanceof RangeError ||
        error instanceof TypeError ||
        (error && typeof error === 'object' && 'code' in error && error.code);

      if (!isRecoverableSelectionError) {
        throw error;
      }

      const code =
        error && typeof error === 'object' && 'code' in error && error.code
          ? String(error.code)
          : 'selection_error';
      recordRejectedSelectionFood(summary, code);
    }

    maybeLogSelectionProgress(summary);
  }

  maybeLogSelectionProgress(summary, { force: true });

  const selectedCandidates = heap
    .toArray()
    .sort((left, right) => -compareSelectionCandidates(left, right));
  const selectionSummary = finalizeExpandedSelectionSummary(summary, heap);

  return {
    selectedByFdcId: new Map(
      selectedCandidates.map((candidate) => [candidate.fdcId, candidate]),
    ),
    summary: selectionSummary,
  };
}
