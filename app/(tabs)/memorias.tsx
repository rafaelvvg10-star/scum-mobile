import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { loadLocalHistory } from '@/services/local-history';
import type { StoredChatMessage } from '@/services/local-history-validation';

export default function LocalHistoryScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setMessages(await loadLocalHistory());
    setIsLoading(false);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="light" backgroundColor="#050817" />
      <View style={styles.header}>
        <Pressable accessibilityLabel="Voltar para o chat" onPress={() => router.back()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>← Chat</Text>
        </Pressable>
        <View style={styles.titleArea}>
          <Text style={styles.title}>Histórico local</Text>
          <Text style={styles.subtitle}>Mensagens recentes salvas somente no aparelho</Text>
        </View>
        <Pressable accessibilityLabel="Recarregar histórico local" disabled={isLoading} onPress={loadHistory} style={({ pressed }) => [styles.button, isLoading && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>↻</Text>
        </Pressable>
      </View>
      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator color="#6EA8FF" size="large" /></View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={[styles.list, messages.length === 0 && styles.emptyList]}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.author}>{item.author === 'user' ? 'VOCÊ' : 'SCUM LOCAL'}</Text>
              <Text style={styles.message}>{item.text}</Text>
            </View>
          )}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Nenhuma mensagem salva</Text><Text style={styles.emptyText}>A conversa recente aparecerá aqui e continuará disponível offline.</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050817' },
  header: { minHeight: 88, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#1B2947' },
  titleArea: { flex: 1, marginHorizontal: 14 },
  title: { color: '#F2F6FF', fontSize: 21, fontWeight: '700' },
  subtitle: { color: '#8492B5', fontSize: 12, marginTop: 4 },
  button: { minWidth: 64, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#121D35', borderWidth: 1, borderColor: '#2B4775', paddingHorizontal: 10 },
  buttonText: { color: '#C9DBFF', fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.4 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 20, gap: 12 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  card: { padding: 16, borderRadius: 16, backgroundColor: '#10192E', borderWidth: 1, borderColor: '#203556' },
  author: { color: '#72A9FF', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  message: { color: '#DCE5F7', fontSize: 14, lineHeight: 21, marginTop: 7 },
  empty: { alignItems: 'center', paddingHorizontal: 34 },
  emptyTitle: { color: '#E8EEFF', fontSize: 19, fontWeight: '700' },
  emptyText: { color: '#93A1C1', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9 },
});
