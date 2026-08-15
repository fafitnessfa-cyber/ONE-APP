import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getRecipeDraftTotals,
  recalculateRecipeIngredientDraft,
  searchUserFoods,
  type RecipeDraft,
  type RecipeIngredientDraft,
} from '../../lib/nutrition/user-items';
import { searchCatalogFoods, applyServingSelection, calculateNutritionForServing } from '../../lib/nutrition/catalog';
import type { NutritionCatalogStateItem } from '../../types';
import { colors, fontFamily, fontSize, radius, spacing } from '../../theme';

interface RecipeEditorModalProps {
  initialDraft: RecipeDraft | null;
  visible: boolean;
  onClose: () => void;
  onSave: (draft: RecipeDraft) => Promise<void>;
  onArchive?: (recipeId: string) => Promise<void>;
}

interface RecipeFormState {
  id?: string;
  name: string;
  description: string;
  finalWeight: string;
  servingCount: string;
  ingredients: RecipeIngredientDraft[];
}

interface IngredientEditorState {
  visible: boolean;
  index: number | null;
  search: string;
  selectedItem: NutritionCatalogStateItem | null;
  quantity: string;
  customResults: NutritionCatalogStateItem[];
  catalogResults: NutritionCatalogStateItem[];
  isSearching: boolean;
  errorMessage: string | null;
}

function toFiniteNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatNumber(value: number | null | undefined) {
  if (value == null) {
    return '';
  }

  const rounded = Number(value.toFixed(4));
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
}

function formatMacro(value: number | undefined) {
  if (value == null) {
    return '0';
  }

  const roundedValue = Number(value.toFixed(1));
  return Number.isInteger(roundedValue) ? `${roundedValue}` : roundedValue.toFixed(1);
}

function createEmptyIngredientEditor(): IngredientEditorState {
  return {
    visible: false,
    index: null,
    search: '',
    selectedItem: null,
    quantity: '1',
    customResults: [],
    catalogResults: [],
    isSearching: false,
    errorMessage: null,
  };
}

function mapDraftToFormState(draft: RecipeDraft | null): RecipeFormState {
  if (!draft) {
    return {
      name: '',
      description: '',
      finalWeight: '',
      servingCount: '',
      ingredients: [],
    };
  }

  return {
    id: draft.id,
    name: draft.name,
    description: draft.description,
    finalWeight: formatNumber(draft.finalWeightG),
    servingCount: formatNumber(draft.servingCount),
    ingredients: draft.ingredients,
  };
}

function SourcePill({ source }: { source: NutritionCatalogStateItem['source'] }) {
  const sourceCopy =
    source === 'custom'
      ? { label: 'Custom', backgroundColor: '#16231A', textColor: '#89E7A3' }
      : { label: 'USDA', backgroundColor: '#1D2817', textColor: colors.accentLight };

  return (
    <View style={[styles.sourcePill, { backgroundColor: sourceCopy.backgroundColor }]}>
      <Text
        allowFontScaling={false}
        style={[styles.sourcePillText, { color: sourceCopy.textColor }]}
      >
        {sourceCopy.label}
      </Text>
    </View>
  );
}

function SearchResultRow({
  item,
  onPress,
}: {
  item: NutritionCatalogStateItem;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.searchResultRow} onPress={onPress}>
      <View style={styles.searchResultMeta}>
        <View style={styles.searchResultTitleRow}>
          <Text allowFontScaling={false} style={styles.searchResultTitle}>
            {item.name}
          </Text>
          <SourcePill source={item.source} />
        </View>
        {item.brand ? (
          <Text allowFontScaling={false} style={styles.searchResultBrand}>
            {item.brand}
          </Text>
        ) : null}
        <Text allowFontScaling={false} style={styles.searchResultStats}>
          {item.servingLabel} • {Math.round(item.caloriesPerServing)} kcal • P
          {formatMacro(item.proteinPerServing)}g • C{formatMacro(item.carbsPerServing)}g • F
          {formatMacro(item.fatsPerServing)}g
        </Text>
      </View>
      <Ionicons name="add" size={18} color={colors.accent} />
    </Pressable>
  );
}

export function RecipeEditorModal({
  initialDraft,
  visible,
  onClose,
  onSave,
  onArchive,
}: RecipeEditorModalProps) {
  const [formState, setFormState] = useState<RecipeFormState>(() =>
    mapDraftToFormState(initialDraft),
  );
  const [ingredientEditor, setIngredientEditor] = useState<IngredientEditorState>(
    createEmptyIngredientEditor(),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const searchSequenceRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setFormState(mapDraftToFormState(initialDraft));
    setIngredientEditor(createEmptyIngredientEditor());
    setErrorMessage(null);
  }, [initialDraft, visible]);

  useEffect(() => {
    if (!ingredientEditor.visible || ingredientEditor.selectedItem) {
      return;
    }

    const normalizedQuery = ingredientEditor.search.trim();
    const nextSearchSequence = searchSequenceRef.current + 1;
    searchSequenceRef.current = nextSearchSequence;

    if (normalizedQuery.length < 2) {
      setIngredientEditor((currentState) => ({
        ...currentState,
        customResults: [],
        catalogResults: [],
        isSearching: false,
        errorMessage: null,
      }));
      return;
    }

    const timeoutId = setTimeout(() => {
      setIngredientEditor((currentState) => ({
        ...currentState,
        isSearching: true,
        errorMessage: null,
      }));

      void Promise.allSettled([
        searchUserFoods(normalizedQuery, 6),
        searchCatalogFoods(normalizedQuery, 6),
      ]).then(([customResult, catalogResult]) => {
        if (searchSequenceRef.current !== nextSearchSequence) {
          return;
        }

        setIngredientEditor((currentState) => ({
          ...currentState,
          customResults:
            customResult.status === 'fulfilled' ? customResult.value : [],
          catalogResults:
            catalogResult.status === 'fulfilled' ? catalogResult.value : [],
          isSearching: false,
          errorMessage:
            customResult.status === 'rejected' && catalogResult.status === 'rejected'
              ? 'Unable to search ingredients right now.'
              : null,
        }));
      });
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [ingredientEditor.search, ingredientEditor.selectedItem, ingredientEditor.visible]);

  const recipeTotals = useMemo(
    () => getRecipeDraftTotals(formState.ingredients),
    [formState.ingredients],
  );
  const ingredientPreview = useMemo(() => {
    if (!ingredientEditor.selectedItem) {
      return null;
    }

    const quantity = toFiniteNumber(ingredientEditor.quantity);

    if (quantity == null || quantity <= 0) {
      return null;
    }

    return calculateNutritionForServing(
      ingredientEditor.selectedItem,
      ingredientEditor.selectedItem.selectedServingId,
      quantity,
    );
  }, [ingredientEditor.quantity, ingredientEditor.selectedItem]);

  const openIngredientEditor = (ingredient?: RecipeIngredientDraft, index?: number) => {
    setIngredientEditor({
      visible: true,
      index: index ?? null,
      search: '',
      selectedItem: ingredient?.item ?? null,
      quantity: ingredient ? formatNumber(ingredient.quantity) : '1',
      customResults: [],
      catalogResults: [],
      isSearching: false,
      errorMessage: null,
    });
  };

  const handleConfirmIngredient = () => {
    if (!ingredientEditor.selectedItem) {
      setIngredientEditor((currentState) => ({
        ...currentState,
        errorMessage: 'Select an ingredient first.',
      }));
      return;
    }

    const quantity = toFiniteNumber(ingredientEditor.quantity);

    if (quantity == null || quantity <= 0) {
      setIngredientEditor((currentState) => ({
        ...currentState,
        errorMessage: 'Ingredient quantity must be a positive number.',
      }));
      return;
    }

    try {
      const previousIngredient =
        ingredientEditor.index == null
          ? undefined
          : formState.ingredients[ingredientEditor.index];
      const nextIngredient = recalculateRecipeIngredientDraft(
        {
          id: previousIngredient?.id,
          position: ingredientEditor.index ?? formState.ingredients.length,
        },
        ingredientEditor.selectedItem,
        quantity,
      );

      setFormState((currentState) => {
        const nextIngredients =
          ingredientEditor.index == null
            ? [...currentState.ingredients, nextIngredient]
            : currentState.ingredients.map((ingredient, ingredientIndex) =>
                ingredientIndex === ingredientEditor.index
                  ? nextIngredient
                  : ingredient,
              );

        return {
          ...currentState,
          ingredients: nextIngredients.map((ingredient, ingredientIndex) => ({
            ...ingredient,
            position: ingredientIndex,
          })),
        };
      });
      setIngredientEditor(createEmptyIngredientEditor());
    } catch (error) {
      setIngredientEditor((currentState) => ({
        ...currentState,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Unable to use that ingredient serving right now.',
      }));
    }
  };

  const handleSave = async () => {
    const name = formState.name.trim();
    const finalWeight = toFiniteNumber(formState.finalWeight);
    const servingCount = toFiniteNumber(formState.servingCount);

    if (!name) {
      setErrorMessage('Recipe name is required.');
      return;
    }

    if (formState.ingredients.length === 0) {
      setErrorMessage('Add at least one ingredient before saving.');
      return;
    }

    if (finalWeight == null || finalWeight <= 0) {
      setErrorMessage('Final cooked weight must be a positive number.');
      return;
    }

    if (servingCount != null && servingCount <= 0) {
      setErrorMessage('Serving count must be positive when provided.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await onSave({
        id: formState.id,
        name,
        description: formState.description.trim(),
        finalWeightG: finalWeight,
        servingCount,
        ingredients: formState.ingredients,
        totalNutrientValues: recipeTotals,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save the recipe right now.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!formState.id || !onArchive) {
      return;
    }

    setIsArchiving(true);
    setErrorMessage(null);

    try {
      await onArchive(formState.id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to archive the recipe right now.',
      );
    } finally {
      setIsArchiving(false);
    }
  };

  const caloriesTotal = Math.round(recipeTotals.energy_kcal ?? 0);
  const proteinTotal = formatMacro(recipeTotals.protein);
  const carbsTotal = formatMacro(recipeTotals.carbohydrate);
  const fatsTotal = formatMacro(recipeTotals.fat);
  const fiberTotal = formatMacro(recipeTotals.fiber);

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text allowFontScaling={false} style={styles.title}>
                {formState.id ? 'Edit Recipe' : 'Create Recipe'}
              </Text>
              <Text allowFontScaling={false} style={styles.subtitle}>
                Build private recipes from USDA foods and your own custom foods, then log them by grams or servings.
              </Text>
            </View>

            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={styles.section}>
              <Text allowFontScaling={false} style={styles.sectionTitle}>
                Basics
              </Text>
              <TextInput
                allowFontScaling={false}
                style={styles.input}
                placeholder="Recipe name"
                placeholderTextColor={colors.textMuted}
                value={formState.name}
                onChangeText={(value) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    name: value,
                  }))
                }
              />
              <TextInput
                allowFontScaling={false}
                style={[styles.input, styles.multilineInput]}
                placeholder="Description (optional)"
                placeholderTextColor={colors.textMuted}
                multiline
                value={formState.description}
                onChangeText={(value) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    description: value,
                  }))
                }
              />
            </View>

            <View style={styles.section}>
              <Text allowFontScaling={false} style={styles.sectionTitle}>
                Portion Setup
              </Text>
              <View style={styles.grid}>
                <View style={styles.gridField}>
                  <Text allowFontScaling={false} style={styles.fieldLabel}>
                    Final Cooked Weight (g)
                  </Text>
                  <TextInput
                    allowFontScaling={false}
                    style={styles.input}
                    keyboardType="decimal-pad"
                    placeholder="450"
                    placeholderTextColor={colors.textMuted}
                    value={formState.finalWeight}
                    onChangeText={(value) =>
                      setFormState((currentState) => ({
                        ...currentState,
                        finalWeight: value,
                      }))
                    }
                  />
                </View>
                <View style={styles.gridField}>
                  <Text allowFontScaling={false} style={styles.fieldLabel}>
                    Serving Count (optional)
                  </Text>
                  <TextInput
                    allowFontScaling={false}
                    style={styles.input}
                    keyboardType="decimal-pad"
                    placeholder="3"
                    placeholderTextColor={colors.textMuted}
                    value={formState.servingCount}
                    onChangeText={(value) =>
                      setFormState((currentState) => ({
                        ...currentState,
                        servingCount: value,
                      }))
                    }
                  />
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text allowFontScaling={false} style={styles.sectionTitle}>
                Running Totals
              </Text>
              <View style={styles.metricsRow}>
                <View style={styles.metricCard}>
                  <Text allowFontScaling={false} style={styles.metricLabel}>
                    Calories
                  </Text>
                  <Text allowFontScaling={false} style={styles.metricValue}>
                    {caloriesTotal}
                  </Text>
                </View>
                <View style={styles.metricCard}>
                  <Text allowFontScaling={false} style={styles.metricLabel}>
                    Protein
                  </Text>
                  <Text allowFontScaling={false} style={styles.metricValue}>
                    {proteinTotal}g
                  </Text>
                </View>
                <View style={styles.metricCard}>
                  <Text allowFontScaling={false} style={styles.metricLabel}>
                    Carbs
                  </Text>
                  <Text allowFontScaling={false} style={styles.metricValue}>
                    {carbsTotal}g
                  </Text>
                </View>
                <View style={styles.metricCard}>
                  <Text allowFontScaling={false} style={styles.metricLabel}>
                    Fats
                  </Text>
                  <Text allowFontScaling={false} style={styles.metricValue}>
                    {fatsTotal}g
                  </Text>
                </View>
              </View>
              <Text allowFontScaling={false} style={styles.helperText}>
                Fiber: {fiberTotal}g
              </Text>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text allowFontScaling={false} style={styles.sectionTitle}>
                  Ingredients
                </Text>
                <Pressable
                  style={styles.inlineAction}
                  onPress={() => openIngredientEditor()}
                >
                  <Ionicons name="add" size={16} color={colors.accent} />
                  <Text allowFontScaling={false} style={styles.inlineActionText}>
                    Add
                  </Text>
                </Pressable>
              </View>

              {formState.ingredients.length === 0 ? (
                <Text allowFontScaling={false} style={styles.helperText}>
                  Add ingredients from your custom foods or the USDA catalog.
                </Text>
              ) : (
                formState.ingredients.map((ingredient, index) => (
                  <View key={ingredient.id ?? `${ingredient.item.id}-${index}`} style={styles.ingredientCard}>
                    <View style={styles.ingredientHeader}>
                      <View style={styles.ingredientText}>
                        <View style={styles.searchResultTitleRow}>
                          <Text allowFontScaling={false} style={styles.ingredientName}>
                            {ingredient.item.name}
                          </Text>
                          <SourcePill source={ingredient.item.source} />
                        </View>
                        <Text allowFontScaling={false} style={styles.ingredientMeta}>
                          {formatMacro(ingredient.quantity)} x {ingredient.item.servingLabel}
                          {ingredient.effectiveGrams != null
                            ? ` • ${formatMacro(ingredient.effectiveGrams)} g`
                            : ''}
                        </Text>
                        <Text allowFontScaling={false} style={styles.ingredientMeta}>
                          {Math.round(ingredient.nutrientTotals.energy_kcal ?? 0)} kcal • P
                          {formatMacro(ingredient.nutrientTotals.protein)}g • C
                          {formatMacro(ingredient.nutrientTotals.carbohydrate)}g • F
                          {formatMacro(ingredient.nutrientTotals.fat)}g
                        </Text>
                      </View>

                      <View style={styles.ingredientActions}>
                        <Pressable
                          style={styles.iconButton}
                          onPress={() => openIngredientEditor(ingredient, index)}
                        >
                          <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
                        </Pressable>
                        <Pressable
                          style={styles.iconButton}
                          onPress={() =>
                            setFormState((currentState) => ({
                              ...currentState,
                              ingredients: currentState.ingredients.filter(
                                (_, ingredientIndex) => ingredientIndex !== index,
                              ),
                            }))
                          }
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>

            {ingredientEditor.visible ? (
              <View style={styles.section}>
                <Text allowFontScaling={false} style={styles.sectionTitle}>
                  {ingredientEditor.index == null ? 'Add Ingredient' : 'Edit Ingredient'}
                </Text>

                {ingredientEditor.selectedItem ? (
                  <View style={styles.ingredientBuilder}>
                    <View style={styles.sectionHeader}>
                      <View style={styles.ingredientText}>
                        <View style={styles.searchResultTitleRow}>
                          <Text allowFontScaling={false} style={styles.ingredientName}>
                            {ingredientEditor.selectedItem.name}
                          </Text>
                          <SourcePill source={ingredientEditor.selectedItem.source} />
                        </View>
                        {ingredientEditor.selectedItem.brand ? (
                          <Text allowFontScaling={false} style={styles.ingredientMeta}>
                            {ingredientEditor.selectedItem.brand}
                          </Text>
                        ) : null}
                      </View>

                      <Pressable
                        style={styles.inlineAction}
                        onPress={() =>
                          setIngredientEditor((currentState) => ({
                            ...currentState,
                            selectedItem: null,
                            search: '',
                            customResults: [],
                            catalogResults: [],
                            errorMessage: null,
                          }))
                        }
                      >
                        <Text allowFontScaling={false} style={styles.inlineActionText}>
                          Change
                        </Text>
                      </Pressable>
                    </View>

                    {(ingredientEditor.selectedItem.servingOptions ?? []).length > 1 ? (
                      <View style={styles.servingChipRow}>
                        {(ingredientEditor.selectedItem.servingOptions ?? []).map((serving) => (
                          <Pressable
                            key={serving.id}
                            style={[
                              styles.servingChip,
                              serving.id === ingredientEditor.selectedItem?.selectedServingId &&
                                styles.servingChipActive,
                            ]}
                            onPress={() =>
                              setIngredientEditor((currentState) => ({
                                ...currentState,
                                selectedItem: applyServingSelection(
                                  currentState.selectedItem!,
                                  serving.id,
                                ),
                              }))
                            }
                          >
                            <Text
                              allowFontScaling={false}
                              style={[
                                styles.servingChipText,
                                serving.id === ingredientEditor.selectedItem?.selectedServingId &&
                                  styles.servingChipTextActive,
                              ]}
                            >
                              {serving.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}

                    <TextInput
                      allowFontScaling={false}
                      style={styles.input}
                      keyboardType="decimal-pad"
                      placeholder="Quantity"
                      placeholderTextColor={colors.textMuted}
                      value={ingredientEditor.quantity}
                      onChangeText={(value) =>
                        setIngredientEditor((currentState) => ({
                          ...currentState,
                          quantity: value,
                        }))
                      }
                    />

                    {ingredientPreview ? (
                      <View style={styles.previewCard}>
                        <Text allowFontScaling={false} style={styles.previewText}>
                          {Math.round(ingredientPreview.calories)} kcal • P
                          {formatMacro(ingredientPreview.protein)}g • C
                          {formatMacro(ingredientPreview.carbs)}g • F
                          {formatMacro(ingredientPreview.fats)}g
                        </Text>
                        {ingredientPreview.effectiveGrams != null ? (
                          <Text allowFontScaling={false} style={styles.previewHint}>
                            Effective grams: {formatMacro(ingredientPreview.effectiveGrams)} g
                          </Text>
                        ) : null}
                      </View>
                    ) : null}

                    <View style={styles.builderActions}>
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={() => setIngredientEditor(createEmptyIngredientEditor())}
                      >
                        <Text allowFontScaling={false} style={styles.secondaryButtonText}>
                          Cancel
                        </Text>
                      </Pressable>
                      <Pressable style={styles.primaryButton} onPress={handleConfirmIngredient}>
                        <Text allowFontScaling={false} style={styles.primaryButtonText}>
                          {ingredientEditor.index == null ? 'Add Ingredient' : 'Save Ingredient'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.ingredientBuilder}>
                    <TextInput
                      allowFontScaling={false}
                      style={styles.input}
                      placeholder="Search ingredients..."
                      placeholderTextColor={colors.textMuted}
                      value={ingredientEditor.search}
                      onChangeText={(value) =>
                        setIngredientEditor((currentState) => ({
                          ...currentState,
                          search: value,
                        }))
                      }
                    />

                    {ingredientEditor.isSearching ? (
                      <View style={styles.searchLoadingRow}>
                        <ActivityIndicator size="small" color={colors.accent} />
                        <Text allowFontScaling={false} style={styles.helperText}>
                          Searching ingredients...
                        </Text>
                      </View>
                    ) : null}

                    {ingredientEditor.customResults.length > 0 ? (
                      <View style={styles.resultSection}>
                        <Text allowFontScaling={false} style={styles.resultSectionTitle}>
                          Your Foods
                        </Text>
                        {ingredientEditor.customResults.map((item) => (
                          <SearchResultRow
                            key={`custom-${item.id}`}
                            item={item}
                            onPress={() =>
                              setIngredientEditor((currentState) => ({
                                ...currentState,
                                selectedItem: item,
                                errorMessage: null,
                              }))
                            }
                          />
                        ))}
                      </View>
                    ) : null}

                    {ingredientEditor.catalogResults.length > 0 ? (
                      <View style={styles.resultSection}>
                        <Text allowFontScaling={false} style={styles.resultSectionTitle}>
                          Food Database
                        </Text>
                        {ingredientEditor.catalogResults.map((item) => (
                          <SearchResultRow
                            key={`catalog-${item.id}`}
                            item={item}
                            onPress={() =>
                              setIngredientEditor((currentState) => ({
                                ...currentState,
                                selectedItem: item,
                                errorMessage: null,
                              }))
                            }
                          />
                        ))}
                      </View>
                    ) : null}

                    {ingredientEditor.errorMessage ? (
                      <Text allowFontScaling={false} style={styles.errorText}>
                        {ingredientEditor.errorMessage}
                      </Text>
                    ) : ingredientEditor.search.trim().length >= 2 &&
                      !ingredientEditor.isSearching &&
                      ingredientEditor.customResults.length === 0 &&
                      ingredientEditor.catalogResults.length === 0 ? (
                      <Text allowFontScaling={false} style={styles.helperText}>
                        No matching ingredients found.
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            ) : null}

            {errorMessage ? (
              <Text allowFontScaling={false} style={styles.errorText}>
                {errorMessage}
              </Text>
            ) : null}

            <View style={styles.footer}>
              {formState.id && onArchive ? (
                <Pressable
                  style={[styles.secondaryButton, styles.archiveButton]}
                  onPress={() => void handleArchive()}
                  disabled={isArchiving || isSaving}
                >
                  {isArchiving ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Text allowFontScaling={false} style={styles.archiveButtonText}>
                      Archive Recipe
                    </Text>
                  )}
                </Pressable>
              ) : null}

              <Pressable
                style={styles.primaryButton}
                onPress={() => void handleSave()}
                disabled={isSaving || isArchiving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text allowFontScaling={false} style={styles.primaryButtonText}>
                    {formState.id ? 'Save Recipe' : 'Create Recipe'}
                  </Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  archiveButton: {
    borderColor: colors.danger,
  },
  archiveButtonText: {
    color: colors.danger,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
  builderActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  footer: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  gridField: {
    flexGrow: 1,
    minWidth: 150,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerText: {
    flex: 1,
    paddingRight: spacing.md,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
  },
  iconButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  ingredientActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ingredientBuilder: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  ingredientCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  ingredientHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  ingredientMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    marginTop: spacing.xs,
  },
  ingredientName: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  ingredientText: {
    flex: 1,
  },
  inlineAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  inlineActionText: {
    color: colors.accent,
    fontSize: fontSize.caption,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: fontSize.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  metricCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    minWidth: 110,
    padding: spacing.md,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '600',
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 6, 3, 0.68)',
  },
  modalRoot: {
    backgroundColor: 'rgba(4, 6, 3, 0.6)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  multilineInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  previewHint: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    marginTop: spacing.xs,
  },
  previewText: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  resultSection: {
    gap: spacing.sm,
  },
  resultSectionTitle: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  searchLoadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  searchResultBrand: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    marginTop: spacing.xs,
  },
  searchResultMeta: {
    flex: 1,
  },
  searchResultRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  searchResultStats: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
    marginTop: spacing.xs,
  },
  searchResultTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: fontSize.body,
    fontWeight: '700',
    paddingRight: spacing.sm,
  },
  searchResultTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
  servingChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  servingChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  servingChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  servingChipText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '600',
  },
  servingChipTextActive: {
    color: colors.background,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '92%',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing.lg,
    width: 56,
  },
  sourcePill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  sourcePillText: {
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: fontSize.heading,
  },
});
