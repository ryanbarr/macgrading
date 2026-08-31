import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/auth-context';

export default function Home() {
  const { user, signOut } = useAuth();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Text>Signed in as {user?.email}</Text>
      <Pressable onPress={signOut}>
        <Text style={{ textDecorationLine: 'underline' }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
