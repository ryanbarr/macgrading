import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

interface Props {
  visible: boolean;
  imageUrl: string | null;
  onClose: () => void;
}

/** Full-screen card art with native pinch-zoom and pan. */
export function CardImageViewer({ visible, imageUrl, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewer}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          maximumZoomScale={5}
          minimumZoomScale={1}
          bouncesZoom
          centerContent
        >
          {imageUrl && (
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="contain"
            />
          )}
        </ScrollView>
        <Pressable
          style={styles.close}
          onPress={onClose}
          accessibilityLabel="Close image viewer"
        >
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: '#171717' },
  scroll: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', aspectRatio: 63 / 88 },
  close: {
    position: 'absolute',
    top: theme.spacing(14),
    right: theme.spacing(5),
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    paddingVertical: theme.spacing(2),
    paddingHorizontal: theme.spacing(4),
  },
  closeText: { color: '#ffffff', fontWeight: '600' },
});
