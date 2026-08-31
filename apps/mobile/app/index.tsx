import { isValidCertNumber } from '@macgrading/shared';
import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>MAC Grading — shared linked: {String(isValidCertNumber('000000001'))}</Text>
    </View>
  );
}
