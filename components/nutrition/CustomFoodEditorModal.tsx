import React, { useEffect, useMemo, useState } from 'react';
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
import type { NutritionCanonicalNutrientCode } from '../../types';
import type {
  CustomFoodDraft,
  CustomFoodServingDraft,
} from '../../lib/nutrition/user-items';
import { colors, fontFamily, fontSize, radius, spacing } from '../../theme';

type NutrientField = {
  code: NutritionCanonicalNutrientCode;
  label: string;
  unit: string;
  required?: boolean;
};

interface CustomFoodEditorModalProps {
  initialDraft: CustomFoodDraft | null;
  visible: boolean;
  onClose: () => void;
  onSave: (draft: CustomFoodDraft) => Promise<void>;
  onArchive?: (userFoodId: string) => Promise<void>;
}

interface ServingFormState {
  id?: string;
  servingName: string;
  quantity: string;
  gramWeight: string;
  milliliterVolume: string;
  householdUnit: string;
  isDefault: boolean;
}

interface DraftFormState {
  id?: string;
  baseServingId?: string;
  name: string;
  brandName: string;
  description: string;
  baseAmount: string;
  baseUnit: 'g' | 'ml';
  nutrients: Record<NutritionCanonicalNutrientCode, string>;
  extraServings: ServingFormState[];
}

const REQUIRED_FIELDS: NutrientField[] = [
  { code: 'energy_kcal', label: 'Calories', unit: 'kcal', required: true },
  { code: 'protein', label: 'Protein', unit: 'g', required: true },
  { code: 'carbohydrate', label: 'Carbs', unit: 'g', required: true },
  { code: 'fat', label: 'Fat', unit: 'g', required: true },
];

const OPTIONAL_FIELDS: NutrientField[] = [
  { code: 'fiber', label: 'Fiber', unit: 'g' },
  { code: 'sugars', label: 'Sugar', unit: 'g' },
  { code: 'sodium', label: 'Sodium', unit: 'mg' },
  { code: 'potassium', label: 'Potassium', unit: 'mg' },
  { code: 'calcium', label: 'Calcium', unit: 'mg' },
  { code: 'iron', label: 'Iron', unit: 'mg' },
  { code: 'vitamin_c', label: 'Vitamin C', unit: 'mg' },
  { code: 'vitamin_d', label: 'Vitamin D', unit: 'mcg' },
  { code: 'saturated_fat', label: 'Sat Fat', unit: 'g' },
  { code: 'cholesterol', label: 'Cholesterol', unit: 'mg' },
];

const NUTRIENT_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

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

function createEmptyServing(isDefault: boolean): ServingFormState {
  return {
    servingName: '',
    quantity: '1',
    gramWeight: '',
    milliliterVolume: '',
    householdUnit: '',
    isDefault,
  };
}

function createBaseNutrientState() {
  return NUTRIENT_FIELDS.reduce(
    (state, field) => ({
      ...state,
      [field.code]: '',
    }),
    {} as Record<NutritionCanonicalNutrientCode, string>,
  );
}

function mapDraftToFormState(draft: CustomFoodDraft | null): DraftFormState {
  if (!draft) {
    return {
      name: '',
      brandName: '',
      description: '',
      baseAmount: '100',
      baseUnit: 'g',
      nutrients: createBaseNutrientState(),
      extraServings: [createEmptyServing(false)],
    };
  }

  const baseServingLabel = `${formatNumber(draft.baseAmount)} ${draft.baseUnit}`;
  const nutrientState = createBaseNutrientState();

  NUTRIENT_FIELDS.forEach((field) => {
    nutrientState[field.code] = formatNumber(draft.nutrientValues[field.code]);
  });

  const baseServingIndex = draft.servings.findIndex(
    (serving) =>
      serving.servingName.trim().toLowerCase() === baseServingLabel.toLowerCase() &&
      Math.abs(serving.quantity - draft.baseAmount) < 0.0001 &&
      ((draft.baseUnit === 'g' &&
        serving.gramWeight != null &&
        Math.abs(serving.gramWeight - draft.baseAmount) < 0.0001) ||
        (draft.baseUnit === 'ml' &&
          serving.milliliterVolume != null &&
          Math.abs(serving.milliliterVolume - draft.baseAmount) < 0.0001)),
  );
  const baseServing = baseServingIndex >= 0 ? draft.servings[baseServingIndex] : undefined;
  const extraServings = draft.servings
    .filter((_, index) => index !== baseServingIndex)
    .map((serving) => ({
      id: serving.id,
      servingName: serving.servingName,
      quantity: formatNumber(serving.quantity),
      gramWeight: formatNumber(serving.gramWeight),
      milliliterVolume: formatNumber(serving.milliliterVolume),
      householdUnit: serving.householdUnit ?? '',
      isDefault: serving.isDefault,
    }));

  return {
    id: draft.id,
    baseServingId: baseServing?.id,
    name: draft.name,
    brandName: draft.brandName,
    description: draft.description,
    baseAmount: formatNumber(draft.baseAmount),
    baseUnit: draft.baseUnit,
    nutrients: nutrientState,
    extraServings: extraServings.length > 0 ? extraServings : [createEmptyServing(false)],
  };
}

export function CustomFoodEditorModal({
  initialDraft,
  visible,
  onClose,
  onSave,
  onArchive,
}: CustomFoodEditorModalProps) {
  const [formState, setFormState] = useState<DraftFormState>(() =>
    mapDraftToFormState(initialDraft),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setFormState(mapDraftToFormState(initialDraft));
    setErrorMessage(null);
  }, [initialDraft, visible]);

  const baseServingLabel = useMemo(() => {
    const amount = toFiniteNumber(formState.baseAmount);
    return amount != null ? `${formatNumber(amount)} ${formState.baseUnit}` : `Base ${formState.baseUnit}`;
  }, [formState.baseAmount, formState.baseUnit]);

  const updateServing = (
    index: number,
    updater: (serving: ServingFormState) => ServingFormState,
  ) => {
    setFormState((currentState) => ({
      ...currentState,
      extraServings: currentState.extraServings.map((serving, servingIndex) =>
        servingIndex === index ? updater(serving) : serving,
      ),
    }));
  };

  const handleSetDefaultServing = (index: number) => {
    setFormState((currentState) => ({
      ...currentState,
      extraServings: currentState.extraServings.map((serving, servingIndex) => ({
        ...serving,
        isDefault: servingIndex === index,
      })),
    }));
  };

  const handleSave = async () => {
    const name = formState.name.trim();
    const baseAmount = toFiniteNumber(formState.baseAmount);

    if (!name) {
      setErrorMessage('Food name is required.');
      return;
    }

    if (baseAmount == null || baseAmount <= 0) {
      setErrorMessage('Base amount must be a positive number.');
      return;
    }

    const nutrientValues = NUTRIENT_FIELDS.reduce<Record<NutritionCanonicalNutrientCode, number>>(
      (values, field) => {
        const numericValue = toFiniteNumber(formState.nutrients[field.code]);

        if (numericValue != null) {
          values[field.code] = numericValue;
        }

        return values;
      },
      {} as Record<NutritionCanonicalNutrientCode, number>,
    );

    const missingRequiredField = REQUIRED_FIELDS.find(
      (field) => nutrientValues[field.code] == null,
    );

    if (missingRequiredField) {
      setErrorMessage(`${missingRequiredField.label} is required.`);
      return;
    }

    const cleanedExtraServings = formState.extraServings
      .map((serving, index) => ({
        id: serving.id,
        servingName: serving.servingName.trim(),
        quantity: toFiniteNumber(serving.quantity),
        gramWeight: toFiniteNumber(serving.gramWeight),
        milliliterVolume: toFiniteNumber(serving.milliliterVolume),
        householdUnit: serving.householdUnit.trim(),
        isDefault: serving.isDefault,
        sortOrder: index + 1,
      }))
      .filter((serving) => serving.servingName.length > 0);

    const invalidServing = cleanedExtraServings.find((serving) => {
      if (serving.quantity == null || serving.quantity <= 0) {
        return true;
      }

      if (formState.baseUnit === 'g') {
        return serving.gramWeight == null || serving.gramWeight <= 0;
      }

      return serving.milliliterVolume == null || serving.milliliterVolume <= 0;
    });

    if (invalidServing) {
      setErrorMessage(
        formState.baseUnit === 'g'
          ? 'Each extra serving needs a positive gram weight.'
          : 'Each extra serving needs a positive milliliter volume.',
      );
      return;
    }

    const hasDefaultExtraServing = cleanedExtraServings.some(
      (serving) => serving.isDefault,
    );
    const baseServing: CustomFoodServingDraft = {
      id: formState.baseServingId,
      servingName: baseServingLabel,
      quantity: baseAmount,
      gramWeight: formState.baseUnit === 'g' ? baseAmount : null,
      milliliterVolume: formState.baseUnit === 'ml' ? baseAmount : null,
      householdUnit: formState.baseUnit,
      isDefault: !hasDefaultExtraServing,
      sortOrder: 0,
    };
    const nextDraft: CustomFoodDraft = {
      id: formState.id,
      name,
      brandName: formState.brandName.trim(),
      description: formState.description.trim(),
      baseAmount,
      baseUnit: formState.baseUnit,
      nutrientValues,
      servings: [
        baseServing,
        ...cleanedExtraServings.map((serving) => ({
          id: serving.id,
          servingName: serving.servingName,
          quantity: serving.quantity!,
          gramWeight: serving.gramWeight,
          milliliterVolume: serving.milliliterVolume,
          householdUnit: serving.householdUnit || serving.servingName,
          isDefault: serving.isDefault,
          sortOrder: serving.sortOrder,
        })),
      ],
    };

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await onSave(nextDraft);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save the custom food right now.',
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
        error instanceof Error ? error.message : 'Unable to archive the custom food right now.',
      );
    } finally {
      setIsArchiving(false);
    }
  };

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
                {formState.id ? 'Edit Custom Food' : 'Create Custom Food'}
              </Text>
              <Text allowFontScaling={false} style={styles.subtitle}>
                Keep your private foods searchable and loggable without changing old logs.
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
                placeholder="Food name"
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
                style={styles.input}
                placeholder="Brand (optional)"
                placeholderTextColor={colors.textMuted}
                value={formState.brandName}
                onChangeText={(value) =>
                  setFormState((currentState) => ({
                    ...currentState,
                    brandName: value,
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
                Base Nutrition
              </Text>
              <View style={styles.inlineRow}>
                <TextInput
                  allowFontScaling={false}
                  style={[styles.input, styles.inlineInput]}
                  placeholder="100"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={formState.baseAmount}
                  onChangeText={(value) =>
                    setFormState((currentState) => ({
                      ...currentState,
                      baseAmount: value,
                    }))
                  }
                />
                <View style={styles.segmentRow}>
                  {(['g', 'ml'] as const).map((unit) => (
                    <Pressable
                      key={unit}
                      style={[
                        styles.segmentChip,
                        formState.baseUnit === unit && styles.segmentChipActive,
                      ]}
                      onPress={() =>
                        setFormState((currentState) => ({
                          ...currentState,
                          baseUnit: unit,
                        }))
                      }
                    >
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.segmentChipText,
                          formState.baseUnit === unit && styles.segmentChipTextActive,
                        ]}
                      >
                        {unit.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Text allowFontScaling={false} style={styles.helperText}>
                Base serving: {baseServingLabel}
              </Text>
            </View>

            <View style={styles.section}>
              <Text allowFontScaling={false} style={styles.sectionTitle}>
                Required Nutrients
              </Text>
              <View style={styles.grid}>
                {REQUIRED_FIELDS.map((field) => (
                  <View key={field.code} style={styles.gridField}>
                    <Text allowFontScaling={false} style={styles.fieldLabel}>
                      {field.label}
                    </Text>
                    <TextInput
                      allowFontScaling={false}
                      style={styles.input}
                      keyboardType="decimal-pad"
                      placeholder={field.unit}
                      placeholderTextColor={colors.textMuted}
                      value={formState.nutrients[field.code]}
                      onChangeText={(value) =>
                        setFormState((currentState) => ({
                          ...currentState,
                          nutrients: {
                            ...currentState.nutrients,
                            [field.code]: value,
                          },
                        }))
                      }
                    />
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text allowFontScaling={false} style={styles.sectionTitle}>
                Optional Nutrients
              </Text>
              <View style={styles.grid}>
                {OPTIONAL_FIELDS.map((field) => (
                  <View key={field.code} style={styles.gridField}>
                    <Text allowFontScaling={false} style={styles.fieldLabel}>
                      {field.label}
                    </Text>
                    <TextInput
                      allowFontScaling={false}
                      style={styles.input}
                      keyboardType="decimal-pad"
                      placeholder={field.unit}
                      placeholderTextColor={colors.textMuted}
                      value={formState.nutrients[field.code]}
                      onChangeText={(value) =>
                        setFormState((currentState) => ({
                          ...currentState,
                          nutrients: {
                            ...currentState.nutrients,
                            [field.code]: value,
                          },
                        }))
                      }
                    />
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text allowFontScaling={false} style={styles.sectionTitle}>
                  Extra Servings
                </Text>
                <Pressable
                  style={styles.inlineAction}
                  onPress={() =>
                    setFormState((currentState) => ({
                      ...currentState,
                      extraServings: [
                        ...currentState.extraServings,
                        createEmptyServing(false),
                      ],
                    }))
                  }
                >
                  <Ionicons name="add" size={16} color={colors.accent} />
                  <Text allowFontScaling={false} style={styles.inlineActionText}>
                    Add
                  </Text>
                </Pressable>
              </View>

              <Text allowFontScaling={false} style={styles.helperText}>
                Add entries like “1 scoop = 32 g” without replacing the base serving.
              </Text>

              {formState.extraServings.map((serving, index) => (
                <View key={serving.id ?? `extra-serving-${index}`} style={styles.servingCard}>
                  <View style={styles.servingHeader}>
                    <Text allowFontScaling={false} style={styles.servingTitle}>
                      Extra Serving {index + 1}
                    </Text>
                    <View style={styles.servingHeaderActions}>
                      <Pressable
                        style={[
                          styles.defaultPill,
                          serving.isDefault && styles.defaultPillActive,
                        ]}
                        onPress={() => handleSetDefaultServing(index)}
                      >
                        <Text
                          allowFontScaling={false}
                          style={[
                            styles.defaultPillText,
                            serving.isDefault && styles.defaultPillTextActive,
                          ]}
                        >
                          {serving.isDefault ? 'Default' : 'Set Default'}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.iconButton}
                        onPress={() =>
                          setFormState((currentState) => ({
                            ...currentState,
                            extraServings:
                              currentState.extraServings.length === 1
                                ? [createEmptyServing(false)]
                                : currentState.extraServings.filter(
                                    (_, servingIndex) => servingIndex !== index,
                                  ),
                          }))
                        }
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color={colors.danger}
                        />
                      </Pressable>
                    </View>
                  </View>

                  <TextInput
                    allowFontScaling={false}
                    style={styles.input}
                    placeholder="Serving name"
                    placeholderTextColor={colors.textMuted}
                    value={serving.servingName}
                    onChangeText={(value) =>
                      updateServing(index, (currentServing) => ({
                        ...currentServing,
                        servingName: value,
                      }))
                    }
                  />
                  <View style={styles.grid}>
                    <View style={styles.gridField}>
                      <Text allowFontScaling={false} style={styles.fieldLabel}>
                        Quantity
                      </Text>
                      <TextInput
                        allowFontScaling={false}
                        style={styles.input}
                        keyboardType="decimal-pad"
                        placeholder="1"
                        placeholderTextColor={colors.textMuted}
                        value={serving.quantity}
                        onChangeText={(value) =>
                          updateServing(index, (currentServing) => ({
                            ...currentServing,
                            quantity: value,
                          }))
                        }
                      />
                    </View>
                    <View style={styles.gridField}>
                      <Text allowFontScaling={false} style={styles.fieldLabel}>
                        {formState.baseUnit === 'g' ? 'Gram Weight' : 'Volume'}
                      </Text>
                      <TextInput
                        allowFontScaling={false}
                        style={styles.input}
                        keyboardType="decimal-pad"
                        placeholder={formState.baseUnit === 'g' ? '32' : '240'}
                        placeholderTextColor={colors.textMuted}
                        value={
                          formState.baseUnit === 'g'
                            ? serving.gramWeight
                            : serving.milliliterVolume
                        }
                        onChangeText={(value) =>
                          updateServing(index, (currentServing) => ({
                            ...currentServing,
                            gramWeight:
                              formState.baseUnit === 'g'
                                ? value
                                : currentServing.gramWeight,
                            milliliterVolume:
                              formState.baseUnit === 'ml'
                                ? value
                                : currentServing.milliliterVolume,
                          }))
                        }
                      />
                    </View>
                  </View>
                  <TextInput
                    allowFontScaling={false}
                    style={styles.input}
                    placeholder="Unit label (optional)"
                    placeholderTextColor={colors.textMuted}
                    value={serving.householdUnit}
                    onChangeText={(value) =>
                      updateServing(index, (currentServing) => ({
                        ...currentServing,
                        householdUnit: value,
                      }))
                    }
                  />
                </View>
              ))}
            </View>

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
                      Archive Food
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
                    {formState.id ? 'Save Custom Food' : 'Create Custom Food'}
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
  defaultPill: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  defaultPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  defaultPillText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '600',
  },
  defaultPillTextActive: {
    color: colors.background,
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
    minWidth: 130,
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
  inlineInput: {
    flex: 1,
  },
  inlineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
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
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
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
  segmentChip: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  segmentChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  segmentChipText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '600',
  },
  segmentChipTextActive: {
    color: colors.background,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  servingCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  servingHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  servingHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  servingTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.caption,
    fontWeight: '600',
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
