import { useNetInfo } from '@react-native-community/netinfo';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Shown only when the device is definitively offline (isConnected === false;
 * null means "unknown" and stays silent to avoid flashing on startup).
 */
export function OfflineBanner() {
  const { isConnected } = useNetInfo();
  if (isConnected !== false) {
    return null;
  }
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        No connection — minting and search are unavailable
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    backgroundColor: '#404040',
    paddingVertical: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
});
