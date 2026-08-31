import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { scumApi, toSafeApiMessage, type Memory } from '@/services/scum-api';

function formatKey(key: string) {
  const text = key.replace(/_/g, ' ');

  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function MemoriesScreen() {
  const router = useRouter();

  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await scumApi.getMemories();

      if (!Array.isArray(data.memorias)) {
        throw new Error('A API retornou uma lista de memórias inválida');
      }

      setMemories(data.memorias);
    } catch (requestError) {
      setError(toSafeApiMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const confirmDelete = (memory: Memory) => {
    Alert.alert(
      'Esquecer memória?',
      `O Scum deixará de lembrar: ${formatKey(memory.chave)} — ${memory.valor}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Esquecer',
          style: 'destructive',
          onPress: () => deleteMemory(memory.chave),
        },
      ]
    );
  };

  const deleteMemory = async (key: string) => {
    setDeletingKey(key);
    setError(null);

    try {
      await scumApi.deleteMemory(key);

      setMemories((currentMemories) =>
        currentMemories.filter((memory) => memory.chave !== key)
      );
    } catch (requestError) {
      setError(toSafeApiMessage(requestError));
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="light" backgroundColor="#050817" />

      <View style={styles.header}>
        <Pressable
          accessibilityHint="Retorna à conversa com o Scum"
          accessibilityLabel="Voltar para o chat"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.buttonPressed,
          ]}>
          <Text style={styles.backText}>← Chat</Text>
        </Pressable>

        <View style={styles.titleArea}>
          <Text style={styles.title}>Memórias do Scum</Text>
          <Text style={styles.subtitle}>
            Informações essenciais guardadas pelo Scum Online
          </Text>
        </View>

        <Pressable
          accessibilityLabel="Recarregar memórias"
          accessibilityRole="button"
          disabled={isLoading}
          onPress={loadMemories}
          style={({ pressed }) => [
            styles.reloadButton,
            isLoading && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}>
          <Text style={styles.reloadText}>↻</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator color="#6EA8FF" size="large" />
          <Text style={styles.stateText}>Consultando memórias...</Text>
        </View>
      ) : (
        <FlatList
          data={memories}
          keyExtractor={(memory) => memory.chave}
          contentContainerStyle={[
            styles.list,
            memories.length === 0 && styles.emptyList,
          ]}
          renderItem={({ item }) => {
            const isDeleting = deletingKey === item.chave;

            return (
              <View style={styles.memoryCard}>
                <View style={styles.memoryContent}>
                  <Text style={styles.category}>
                    {item.categoria.toUpperCase()}
                  </Text>
                  <Text style={styles.memoryKey}>
                    {formatKey(item.chave)}
                  </Text>
                  <Text style={styles.memoryValue}>{item.valor}</Text>
                </View>

                <Pressable
                  accessibilityLabel={`Esquecer ${formatKey(item.chave)}`}
                  disabled={isDeleting}
                  onPress={() => confirmDelete(item)}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    isDeleting && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}>
                  <Text style={styles.deleteText}>
                    {isDeleting ? '...' : 'Esquecer'}
                  </Text>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>✦</Text>
              <Text style={styles.emptyTitle}>Nenhuma memória salva</Text>
              <Text style={styles.emptyText}>
                Quando você contar algo importante para o Scum, ele poderá
                aparecer aqui.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050817',
  },
  header: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1B2947',
  },
  titleArea: {
    flex: 1,
    marginHorizontal: 14,
  },
  title: {
    color: '#F2F6FF',
    fontSize: 21,
    fontWeight: '700',
  },
  subtitle: {
    color: '#8492B5',
    fontSize: 12,
    marginTop: 4,
  },
  backButton: {
    minWidth: 64,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121D35',
    borderWidth: 1,
    borderColor: '#2B4775',
  },
  backText: {
    color: '#C9DBFF',
    fontSize: 13,
    fontWeight: '700',
  },
  reloadButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#162746',
    borderWidth: 1,
    borderColor: '#31558C',
  },
  reloadText: {
    color: '#9FC4FF',
    fontSize: 24,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  errorBox: {
    marginHorizontal: 20,
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#2A1724',
    borderWidth: 1,
    borderColor: '#773348',
  },
  errorText: {
    color: '#FFC0CB',
    fontSize: 14,
    lineHeight: 20,
  },
  list: {
    padding: 20,
    gap: 12,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  memoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#10192E',
    borderWidth: 1,
    borderColor: '#203556',
  },
  memoryContent: {
    flex: 1,
  },
  category: {
    color: '#72A9FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  memoryKey: {
    color: '#E7EEFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
  },
  memoryValue: {
    color: '#ABB9D5',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: '#251C31',
    borderWidth: 1,
    borderColor: '#5D3C68',
  },
  deleteText: {
    color: '#EAB6F5',
    fontSize: 12,
    fontWeight: '700',
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  stateText: {
    color: '#9AA9C9',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 34,
  },
  emptyIcon: {
    color: '#70A8FF',
    fontSize: 42,
  },
  emptyTitle: {
    color: '#E8EEFF',
    fontSize: 19,
    fontWeight: '700',
    marginTop: 16,
  },
  emptyText: {
    color: '#93A1C1',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 9,
  },
});
