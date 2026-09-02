import type { CardSummary } from '@macgrading/shared';
import { ALLOWED_PHOTO_TYPES } from '@macgrading/shared';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../../../src/api/client';
import { certKeys, useCert } from '../../../../src/api/queries';
import { useAuth } from '../../../../src/auth/auth-context';
import { LabelPreview } from '../../../../src/components/LabelPreview';
import { StatusChip } from '../../../../src/components/StatusChip';
import { uploadCertPhoto } from '../../../../src/photos/upload';
import { theme } from '../../../../src/theme';

export default function CertDetail() {
  const { certNumber } = useLocalSearchParams<{ certNumber: string }>();
  const cert = useCert(certNumber);
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: certKeys.detail(certNumber) });
    queryClient.invalidateQueries({ queryKey: ['certs'] });
  };

  const addPhoto = async (source: 'camera' | 'library') => {
    const picker =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsMultipleSelection: false });
    if (picker.canceled || !picker.assets[0]) return;
    const asset = picker.assets[0];
    const mimeType = asset.mimeType ?? 'image/jpeg';
    if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(mimeType)) {
      Alert.alert('Unsupported format', `${mimeType} is not accepted.`);
      return;
    }
    setUploading(true);
    try {
      await uploadCertPhoto({
        certNumber,
        token: token!,
        uri: asset.uri,
        mimeType,
        sortOrder: cert.data?.photos.length ?? 0,
      });
      refresh();
    } catch (error) {
      Alert.alert('Photo upload failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = (photoId: string) => {
    Alert.alert('Delete photo?', 'The image is removed from the cert page.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiFetch<void>(`/certs/${certNumber}/photos/${photoId}`, {
              method: 'DELETE',
              token,
            });
            refresh();
          } catch (error) {
            Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unknown error');
          }
        },
      },
    ]);
  };

  if (!cert.data) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: certNumber }} />
        <Text style={styles.subtle}>{cert.isLoading ? 'Loading…' : 'Cert not found.'}</Text>
      </View>
    );
  }

  const data = cert.data;
  const card: CardSummary = {
    cardboardTensId: data.cardboardTensId,
    cardName: data.cardName,
    setName: data.setName,
    cardNumber: data.cardNumber,
    releaseYear: data.releaseYear,
    category: data.category,
    cardImageUrl: data.cardImageUrl,
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: data.certNumber }} />
      <LabelPreview
        card={card}
        certNumber={data.certNumber}
        grade={data.grade}
        gradeName={data.gradeName}
        isPrototype={data.isPrototype}
        variants={data.variants}
      />
      <StatusChip status={data.status} photoCount={data.photos.length} />

      {data.status === 'PENDING_GRADE' && (
        <Pressable
          style={styles.button}
          onPress={() => router.push(`/cert/${data.certNumber}/grade`)}
        >
          <Text style={styles.buttonText}>Enter the grade</Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>Slab photos</Text>
      <View style={styles.photoGrid}>
        {data.photos.map((photo) => (
          <Pressable key={photo.id} onLongPress={() => deletePhoto(photo.id)}>
            <Image source={{ uri: photo.url }} style={styles.photo} />
          </Pressable>
        ))}
        {data.photos.length === 0 && (
          <Text style={styles.subtle}>No photos yet — add them after sealing the slab.</Text>
        )}
      </View>
      <View style={styles.photoButtons}>
        <Pressable
          style={[styles.button, styles.buttonHalf]}
          disabled={uploading}
          onPress={() => addPhoto('camera')}
        >
          <Text style={styles.buttonText}>{uploading ? 'Uploading…' : 'Take photo'}</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.buttonHalf]}
          disabled={uploading}
          onPress={() => addPhoto('library')}
        >
          <Text style={styles.buttonText}>From library</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Long-press a photo to delete it.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(4), paddingBottom: 64 },
  subtle: { color: theme.colors.subtle },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  photo: { width: 104, height: 104, borderRadius: 6, backgroundColor: '#e5e5e5' },
  photoButtons: { flexDirection: 'row', gap: theme.spacing(3) },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    padding: theme.spacing(4),
    alignItems: 'center',
  },
  buttonHalf: { flex: 1 },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  hint: { fontSize: 12, color: theme.colors.subtle },
});
