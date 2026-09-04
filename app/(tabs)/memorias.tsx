import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { EpisodicMemory } from '@/services/local-episodic-memory-core';
import { clearLocalMemories, deleteLocalMemory, listLocalMemories } from '@/services/local-episodic-memory';

export default function LocalMemoriesScreen() {
  const router = useRouter();
  const [memories, setMemories] = useState<EpisodicMemory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadMemories = useCallback(async () => {
    setIsLoading(true);
    try {
      setMemories((await listLocalMemories()).reverse());
    } catch {
      Alert.alert('Falha nas memórias', 'Não foi possível ler as memórias locais. O chat continuará funcionando.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadMemories(); }, [loadMemories]);

  const confirmDelete = useCallback((memory: EpisodicMemory) => {
    Alert.alert('Apagar memória?', memory.content, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: async () => {
        try {
          await deleteLocalMemory(memory.id);
          setMemories((current) => current.filter((item) => item.id !== memory.id));
        } catch {
          Alert.alert('Falha ao apagar', 'A memória não pôde ser apagada.');
        }
      } },
    ]);
  }, []);

  const confirmClear = useCallback(() => {
    Alert.alert('Apagar todas as memórias?', 'O histórico da conversa não será alterado.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar todas', style: 'destructive', onPress: async () => {
        try {
          await clearLocalMemories();
          setMemories([]);
        } catch {
          Alert.alert('Falha ao apagar', 'As memórias não puderam ser apagadas.');
        }
      } },
    ]);
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="light" backgroundColor="#050817" />
      <View style={styles.header}>
        <Pressable accessibilityLabel="Voltar para o chat" onPress={() => router.back()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>← Chat</Text>
        </Pressable>
        <View style={styles.titleArea}>
          <Text style={styles.title}>Memórias locais</Text>
          <Text style={styles.subtitle}>Fatos pessoais guardados somente neste aparelho</Text>
        </View>
        <Pressable accessibilityLabel="Apagar todas as memórias" disabled={isLoading || memories.length === 0} onPress={confirmClear} style={({ pressed }) => [styles.button, (isLoading || memories.length === 0) && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Limpar</Text>
        </Pressable>
      </View>
      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator color="#6EA8FF" size="large" /></View>
      ) : (
        <FlatList
          data={memories}
          keyExtractor={(memory) => memory.id}
          contentContainerStyle={[styles.list, memories.length === 0 && styles.emptyList]}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.memory}>{item.content}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.date}>{new Date(item.updatedAt).toLocaleDateString('pt-BR')}</Text>
                <Pressable accessibilityLabel={`Apagar memória: ${item.content}`} onPress={() => confirmDelete(item)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                  <Text style={styles.deleteText}>Apagar</Text>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Nenhuma memória ainda</Text><Text style={styles.emptyText}>Fatos pessoais explícitos que possam ajudar em conversas futuras aparecerão aqui.</Text></View>}
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
  memory: { color: '#DCE5F7', fontSize: 14, lineHeight: 21 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  date: { color: '#8492B5', fontSize: 11 },
  deleteButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: '#291522' },
  deleteText: { color: '#FF9BB2', fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingHorizontal: 34 },
  emptyTitle: { color: '#E8EEFF', fontSize: 19, fontWeight: '700' },
  emptyText: { color: '#93A1C1', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9 },
});
