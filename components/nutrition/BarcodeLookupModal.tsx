import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CameraView,
  type BarcodeScanningResult,
  useCameraPermissions,
} from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { lookupFoodByBarcode, type NutritionBarcodeLookupResult } from '../../lib/nutrition/catalog';
import type { NutritionCatalogStateItem } from '../../types';
import { colors, fontFamily, fontSize, radius, spacing } from '../../theme';

interface BarcodeLookupModalProps {
  mealLabel: string;
  visible: boolean;
  onClose: () => void;
  onFoodFound: (item: NutritionCatalogStateItem) => void;
}

function getLookupMessage(result: NutritionBarcodeLookupResult) {
  if (result.message) {
    return result.message;
  }

  if (result.status === 'not_found') {
    return 'Product not found.';
  }

  if (result.status === 'incomplete') {
    return 'Product found, but nutrition information is incomplete.';
  }

  if (result.status === 'external_error') {
    return 'Packaged-food lookup is unavailable right now.';
  }

  return 'Unable to look up that barcode right now.';
}

export function BarcodeLookupModal({
  mealLabel,
  visible,
  onClose,
  onFoodFound,
}: BarcodeLookupModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manualBarcode, setManualBarcode] = useState('');
  const [cameraAvailable, setCameraAvailable] = useState<boolean>(Platform.OS !== 'web');
  const [isLookupPending, setIsLookupPending] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [isScannerEnabled, setIsScannerEnabled] = useState(true);
  const scanLockRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setManualBarcode('');
      setLookupMessage(null);
      setIsScannerEnabled(true);
      scanLockRef.current = false;
      return;
    }

    let isMounted = true;

    if (Platform.OS === 'web') {
      void CameraView.isAvailableAsync()
        .then((isAvailable: boolean) => {
          if (isMounted) {
            setCameraAvailable(isAvailable);
          }
        })
        .catch(() => {
          if (isMounted) {
            setCameraAvailable(false);
          }
        });
    } else {
      setCameraAvailable(true);
    }

    return () => {
      isMounted = false;
    };
  }, [visible]);

  const cameraReady =
    visible &&
    cameraAvailable &&
    permission?.granted === true &&
    isScannerEnabled &&
    !isLookupPending;

  const runLookup = async (barcodeValue: string, barcodeType?: string | null) => {
    setIsLookupPending(true);
    setLookupMessage(null);

    try {
      const result = await lookupFoodByBarcode(barcodeValue, {
        barcodeType,
      });

      if (result.item) {
        onFoodFound(result.item);
        setManualBarcode('');
        setLookupMessage(null);
        setIsScannerEnabled(true);
        scanLockRef.current = false;
        return;
      }

      setLookupMessage(getLookupMessage(result));
      setIsScannerEnabled(false);
      scanLockRef.current = false;
    } catch (error) {
      console.error('Barcode lookup failed', error);
      setLookupMessage('Packaged-food lookup is unavailable right now.');
      setIsScannerEnabled(false);
      scanLockRef.current = false;
    } finally {
      setIsLookupPending(false);
    }
  };

  const handleBarcodeScanned = ({ data, type }: BarcodeScanningResult) => {
    if (scanLockRef.current || isLookupPending) {
      return;
    }

    scanLockRef.current = true;
    setManualBarcode(data);
    setIsScannerEnabled(false);
    void runLookup(data, type);
  };

  const handleManualLookup = () => {
    if (!manualBarcode.trim() || isLookupPending) {
      return;
    }

    scanLockRef.current = true;
    void runLookup(manualBarcode, null);
  };

  const handleScanAgain = () => {
    setLookupMessage(null);
    setIsScannerEnabled(true);
    scanLockRef.current = false;
  };

  const handleEnableCamera = async () => {
    try {
      const response = await requestPermission();

      if (!response.granted) {
        setLookupMessage('Camera access is off. You can still enter the barcode manually.');
      }
    } catch {
      setLookupMessage('Camera access is off. You can still enter the barcode manually.');
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

          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              <Text allowFontScaling={false} style={styles.sheetTitle}>
                Scan Barcode
              </Text>
              <Text allowFontScaling={false} style={styles.sheetSubtitle}>
                Scan with the camera or enter the code manually.
              </Text>
            </View>

            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close barcode lookup"
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.targetChip}>
            <Text allowFontScaling={false} style={styles.targetChipText}>
              Logging to {mealLabel}
            </Text>
          </View>

          <View style={styles.cameraCard}>
            <View style={styles.cameraHeader}>
              <Text allowFontScaling={false} style={styles.cameraTitle}>
                Camera
              </Text>
              {cameraReady ? (
                <Text allowFontScaling={false} style={styles.cameraMeta}>
                  Point at a UPC or EAN code
                </Text>
              ) : null}
            </View>

            {cameraReady ? (
              <View style={styles.cameraPreviewWrap}>
                <CameraView
                  style={styles.cameraPreview}
                  facing="back"
                  onBarcodeScanned={handleBarcodeScanned}
                  barcodeScannerSettings={{
                    barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'itf14'],
                  }}
                />
                <View pointerEvents="none" style={styles.scanLine} />
              </View>
            ) : (
              <View style={styles.cameraFallback}>
                <Ionicons name="scan-outline" size={18} color={colors.textMuted} />
                <Text allowFontScaling={false} style={styles.cameraFallbackText}>
                  {permission?.granted === false
                    ? 'Camera access is off. Manual barcode entry is ready below.'
                    : !cameraAvailable
                    ? 'Camera scanning is unavailable here. Manual barcode entry is ready below.'
                    : 'Enable the camera to scan, or enter the code manually below.'}
                </Text>
              </View>
            )}

            <View style={styles.cameraActions}>
              {permission?.granted !== true ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={handleEnableCamera}
                  accessibilityRole="button"
                  accessibilityLabel="Enable camera access"
                >
                  <Text allowFontScaling={false} style={styles.secondaryButtonText}>
                    Enable Camera
                  </Text>
                </Pressable>
              ) : null}

              {!cameraReady ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={handleScanAgain}
                  accessibilityRole="button"
                  accessibilityLabel="Scan another barcode"
                >
                  <Text allowFontScaling={false} style={styles.secondaryButtonText}>
                    Scan Again
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.manualCard}>
            <Text allowFontScaling={false} style={styles.manualLabel}>
              Manual barcode
            </Text>
            <View style={styles.manualRow}>
              <TextInput
                allowFontScaling={false}
                value={manualBarcode}
                onChangeText={setManualBarcode}
                style={styles.manualInput}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Enter UPC, EAN, or GTIN"
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={handleManualLookup}
              />
              <Pressable
                style={styles.lookupButton}
                onPress={handleManualLookup}
                disabled={isLookupPending}
                accessibilityRole="button"
                accessibilityLabel="Look up barcode"
              >
                {isLookupPending ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text allowFontScaling={false} style={styles.lookupButtonText}>
                    Look Up
                  </Text>
                )}
              </Pressable>
            </View>

            {lookupMessage ? (
              <Text allowFontScaling={false} style={styles.lookupMessage}>
                {lookupMessage}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
  sheetHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  sheetHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.display,
    fontSize: fontSize.title,
  },
  sheetSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    lineHeight: 18,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  targetChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  targetChipText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  cameraCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cameraTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
  },
  cameraMeta: {
    color: colors.textMuted,
    fontSize: fontSize.caption,
  },
  cameraPreviewWrap: {
    height: 184,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  cameraPreview: {
    flex: 1,
  },
  scanLine: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    top: '50%',
    height: 2,
    marginTop: -1,
    backgroundColor: colors.accent,
    opacity: 0.9,
  },
  cameraFallback: {
    minHeight: 92,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
    justifyContent: 'center',
  },
  cameraFallbackText: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    lineHeight: 18,
  },
  cameraActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
  },
  manualCard: {
    gap: spacing.sm,
  },
  manualLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
  },
  manualRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  manualInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontSize: fontSize.title,
  },
  lookupButton: {
    minWidth: 100,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  lookupButtonText: {
    color: colors.background,
    fontSize: fontSize.body,
  },
  lookupMessage: {
    color: colors.textSecondary,
    fontSize: fontSize.body,
    lineHeight: 18,
  },
});
