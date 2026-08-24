import { StatusBar } from 'expo-status-bar';
import { type Href, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  type ListRenderItemInfo,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  buildLocalMessages,
  extractLocalCompletionText,
  resolveChatTransport,
  type ChatMode,
} from '@/services/chat-routing';
import {
  API_CONFIGURATION_ERROR,
  API_URL,
} from '@/config/api';
import {
  getStoredLocalModel,
  isLocalModelLoaded as getIsLocalModelLoaded,
  loadStoredLocalModel,
  LocalModelError,
  type LocalModelImportDetails,
  type LocalModelMetadata,
  releaseLocalModel,
  removeImportedLocalModel,
  runLocalCompletion,
  selectAndLoadLocalModel,
} from '@/services/local-model';

type MessageAuthor = 'sky' | 'user';

type Message = {
  id: string;
  author: MessageAuthor;
  text: string;
  source?: ChatMode;
};

type ChatResponse = {
  pergunta: string;
  resposta: string;
};

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'sky-welcome',
    author: 'sky',
    text: 'Sinal recebido. A carcaça acordou. 💀',
  },
];

function createMessageId(author: MessageAuthor) {
  return `${author}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const ChatMessage = memo(function ChatMessage({
  message,
  reduceMotion,
}: {
  message: Message;
  reduceMotion: boolean;
}) {
  const isSky = message.author === 'sky';
  const entrance = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      return;
    }

    Animated.timing(entrance, {
      toValue: 1,
      duration: isSky ? 220 : 180,
      useNativeDriver: true,
    }).start();
  }, [entrance, isSky, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.messageRow,
        isSky ? styles.skyMessageRow : styles.userMessageRow,
        {
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [isSky ? 0 : 8, 0],
              }),
            },
          ],
        },
      ]}>
      <Text
        selectable
        style={[styles.messageText, !isSky && styles.userMessageText]}>
        {message.text}
      </Text>
    </Animated.View>
  );
});

function TypingIndicator({ reduceMotion }: { reduceMotion: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.32,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulse, reduceMotion]);

  return (
    <View style={[styles.messageRow, styles.skyMessageRow]}>
      <Animated.View style={[styles.typingDot, { opacity: pulse }]} />
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [chatMode, setChatMode] = useState<ChatMode>('groq');
  const [isTyping, setIsTyping] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [localModel, setLocalModel] = useState<LocalModelMetadata | null>(null);
  const [isLocalModelLoaded, setIsLocalModelLoaded] = useState(false);
  const [isLocalModelBusy, setIsLocalModelBusy] = useState(false);
  const [localModelImportProgress, setLocalModelImportProgress] = useState<number | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const sendInProgressRef = useRef(false);

  const scrollToLatestMessage = useCallback((animated = true) => {
    listRef.current?.scrollToEnd({ animated });
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollToLatestMessage());

    return () => cancelAnimationFrame(frame);
  }, [isTyping, messages, scrollToLatestMessage]);

  useEffect(() => {
    getStoredLocalModel()
      .then((metadata) => {
        setLocalModel(metadata);
        setIsLocalModelLoaded(getIsLocalModelLoaded());
      })
      .catch(() => setLocalModel(null));
  }, []);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );

    return () => subscription.remove();
  }, []);

  const renderMessage = useCallback(
    ({ item }: ListRenderItemInfo<Message>) => (
      <ChatMessage message={item} reduceMotion={reduceMotion} />
    ),
    [reduceMotion]
  );

  const confirmLocalModelImport = useCallback(
    ({ name, size, availableSpace }: LocalModelImportDetails) =>
      new Promise<boolean>((resolve) => {
        const formatSize = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(2)} GB`;

        Alert.alert(
          'Importar modelo para o Scum?',
          `${name}\n\nTamanho: ${formatSize(size)}\nEspaço livre: ${formatSize(availableSpace)}\n\nUma cópia persistente será criada no armazenamento privado do app. Ela não ficará no cache.`,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Importar', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        );
      }),
    []
  );

  const chooseLocalModel = useCallback(async () => {
    setIsLocalModelBusy(true);
    setLocalModelImportProgress(null);
    try {
      const selection = await selectAndLoadLocalModel({
        confirmImport: confirmLocalModelImport,
        onProgress: setLocalModelImportProgress,
      });

      if (selection) {
        setLocalModel(selection.metadata);
        setIsLocalModelLoaded(true);
        Alert.alert(
          'Modelo local carregado',
          `${selection.metadata.name}\n\nModo CPU de emergência: o desempenho pode ser lento.`
        );
      }
    } catch (error) {
      Alert.alert(
        'Falha no modelo local',
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o arquivo GGUF.'
      );
    } finally {
      setIsLocalModelBusy(false);
      setLocalModelImportProgress(null);
    }
  }, [confirmLocalModelImport]);

  const unloadLocalModel = useCallback(async () => {
    setIsLocalModelBusy(true);
    try {
      await releaseLocalModel();
      setIsLocalModelLoaded(false);
      Alert.alert('Modelo descarregado', 'A memória RAM usada pelo modelo foi liberada.');
    } catch (error) {
      Alert.alert(
        'Não foi possível descarregar',
        error instanceof Error ? error.message : 'Tente novamente em instantes.'
      );
    } finally {
      setIsLocalModelBusy(false);
    }
  }, []);

  const loadImportedLocalModel = useCallback(async () => {
    setIsLocalModelBusy(true);
    try {
      const selection = await loadStoredLocalModel();
      setLocalModel(selection.metadata);
      setIsLocalModelLoaded(true);
      Alert.alert(
        'Modelo local carregado',
        `${selection.metadata.name}\n\nAgora você pode selecionar o modo Local.`
      );
    } catch (error) {
      setIsLocalModelLoaded(false);
      Alert.alert(
        'Não foi possível carregar',
        error instanceof Error ? error.message : 'Tente novamente em instantes.'
      );
    } finally {
      setIsLocalModelBusy(false);
    }
  }, []);

  const confirmRemoveImportedModel = useCallback(() => {
    Alert.alert(
      'Remover arquivo importado?',
      'O GGUF armazenado pelo Scum será apagado do espaço privado do app. O arquivo original escolhido por você não será alterado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            setIsLocalModelBusy(true);
            try {
              await removeImportedLocalModel();
              setLocalModel(null);
              setIsLocalModelLoaded(false);
              Alert.alert('Modelo removido', 'A cópia importada foi apagada.');
            } catch (error) {
              Alert.alert(
                'Não foi possível remover',
                error instanceof Error ? error.message : 'Tente novamente em instantes.'
              );
            } finally {
              setIsLocalModelBusy(false);
            }
          },
        },
      ]
    );
  }, []);

  const confirmClearConversation = useCallback(() => {
    Alert.alert(
      'Limpar conversa?',
      'Isso apaga apenas as mensagens visíveis. As memórias permanecem intactas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: () => {
            setMessages([]);
            setInput('');
            setIsMenuVisible(false);
          },
        },
      ]
    );
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();

    if (!text || isTyping || sendInProgressRef.current) {
      return;
    }

    sendInProgressRef.current = true;
    const userMessage: Message = {
      id: createMessageId('user'),
      author: 'user',
      text,
    };

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
    ]);
    setInput('');
    setIsTyping(true);
    try {
      const transport = resolveChatTransport(chatMode, isLocalModelLoaded);

      if (transport === 'local') {
        const result = await runLocalCompletion(
          buildLocalMessages(messages, userMessage)
        );
        const responseText = extractLocalCompletionText(result);

        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: createMessageId('sky'),
            author: 'sky',
            text: responseText,
            source: 'local',
          },
        ]);
        return;
      }

      if (!API_URL) {
        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: createMessageId('sky'),
            author: 'sky',
            text: API_CONFIGURATION_ERROR,
            source: 'groq',
          },
        ]);

        return;
      }

      const url = `${API_URL}/chat?pergunta=${encodeURIComponent(text)}`;
      const response = await fetch(url, { method: 'POST' });

      if (!response.ok) {
        throw new Error(`A API respondeu com o status ${response.status}`);
      }

      const data: ChatResponse = await response.json();

      if (
        typeof data?.resposta !== 'string' ||
        !data.resposta.trim()
      ) {
        throw new Error('A API retornou uma resposta inválida');
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId('sky'),
          author: 'sky',
          text: data.resposta.trim(),
          source: 'groq',
        },
      ]);
    } catch (error) {
      console.error(`Falha no modo ${chatMode} do Scum:`, error);

      const localContextMissing =
        chatMode === 'local' &&
        error instanceof LocalModelError &&
        error.code === 'not_loaded';

      if (localContextMissing) {
        setIsLocalModelLoaded(false);
      }

      const mensagemDeErro = chatMode === 'local'
        ? !isLocalModelLoaded || localContextMissing ||
          (error instanceof Error && error.message === 'local_model_not_loaded')
          ? 'O modelo local está descarregado. Use “Carregar modelo” no menu antes de enviar.'
          : 'O modelo local não conseguiu responder. Tente novamente.'
        : error instanceof TypeError
          ? 'Sem conexão com a API do Scum. Verifique a rede e tente novamente.'
          : 'A API não conseguiu responder. Tente novamente.';

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId('sky'),
          author: 'sky',
          text: mensagemDeErro,
          source: chatMode,
        },
      ]);
    } finally {
      sendInProgressRef.current = false;
      setIsTyping(false);
    }
  }, [chatMode, input, isLocalModelLoaded, isTyping, messages]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" backgroundColor="#050507" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        style={styles.keyboardArea}>
        <View style={styles.header}>
          <Pressable
            accessibilityHint="Abre as opções do aplicativo"
            accessibilityLabel="Abrir menu"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setIsMenuVisible(true)}
            style={({ pressed }) => [
              styles.menuButton,
              pressed && styles.menuButtonPressed,
            ]}>
            <Text style={styles.menuIcon}>☰</Text>
          </Pressable>

          <Text style={styles.betaText}>BETA</Text>
        </View>

        <View style={styles.chatPanel}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(message) => message.id}
            style={styles.chatList}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={styles.messageList}
            onLayout={() => scrollToLatestMessage(false)}
            renderItem={renderMessage}
            ListFooterComponent={
              isTyping ? <TypingIndicator reduceMotion={reduceMotion} /> : null
            }
          />

          <View style={styles.composerArea}>
            <Text style={styles.activeModeText}>
              {chatMode === 'local' ? 'Local' : 'Groq'}
              {chatMode === 'local' && !isLocalModelLoaded ? ' • modelo descarregado' : ''}
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                value={input}
                onChangeText={setInput}
                onSubmitEditing={sendMessage}
                placeholder="Converse com o Scum..."
                placeholderTextColor="#858A98"
                selectionColor="#4285FF"
                returnKeyType="send"
                maxLength={1200}
                multiline
                style={styles.input}
              />

              <Pressable
                accessibilityLabel="Enviar mensagem"
                disabled={!input.trim() || isTyping}
                onPress={sendMessage}
                style={({ pressed }) => [
                  styles.sendButton,
                  (!input.trim() || isTyping) && styles.sendButtonDisabled,
                  pressed && styles.sendButtonPressed,
                ]}>
                <Text style={styles.sendIcon}>↑</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsMenuVisible(false)}
        statusBarTranslucent
        transparent
        visible={isMenuVisible}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar menu"
          onPress={() => setIsMenuVisible(false)}
          style={styles.menuOverlay}>
          <Pressable
            accessibilityRole="menu"
            onPress={(event) => event.stopPropagation()}
            style={styles.menuPanel}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Scum</Text>
              <Pressable
                accessibilityLabel="Fechar menu"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setIsMenuVisible(false)}>
                <Text style={styles.menuClose}>×</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityHint="Abre a lista de memórias essenciais do Scum"
              accessibilityLabel="Memórias"
              accessibilityRole="menuitem"
              onPress={() => {
                setIsMenuVisible(false);
                router.push('/memorias' as Href);
              }}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}>
              <Text style={styles.menuActionText}>Memórias</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Usar modo Groq"
              accessibilityRole="radio"
              accessibilityState={{ checked: chatMode === 'groq' }}
              onPress={() => setChatMode('groq')}
              style={({ pressed }) => [
                styles.menuItem,
                chatMode === 'groq' && styles.modeMenuItemActive,
                pressed && styles.menuItemPressed,
              ]}>
              <Text
                style={[
                  styles.menuItemText,
                  chatMode === 'groq' && styles.modeMenuTextActive,
                ]}>
                {chatMode === 'groq' ? '✓ ' : ''}Groq — online
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Usar modo Local"
              accessibilityRole="radio"
              accessibilityState={{
                checked: chatMode === 'local',
                disabled: !isLocalModelLoaded,
              }}
              disabled={!isLocalModelLoaded}
              onPress={() => setChatMode('local')}
              style={({ pressed }) => [
                styles.menuItem,
                chatMode === 'local' && styles.modeMenuItemActive,
                !isLocalModelLoaded && styles.menuItemDisabled,
                pressed && styles.menuItemPressed,
              ]}>
              <Text
                style={[
                  styles.menuItemText,
                  chatMode === 'local' && styles.modeMenuTextActive,
                ]}
                numberOfLines={1}>
                {chatMode === 'local' ? '✓ ' : ''}Local —{' '}
                {localModel?.name ?? 'nenhum modelo importado'}
                {localModel ? (isLocalModelLoaded ? ' • carregado' : ' • descarregado') : ''}
              </Text>
            </Pressable>
            <Pressable
              accessibilityHint="Carrega na memória RAM o arquivo GGUF já importado"
              accessibilityLabel="Carregar modelo importado"
              accessibilityRole="menuitem"
              disabled={!localModel || isLocalModelLoaded || isLocalModelBusy}
              onPress={loadImportedLocalModel}
              style={({ pressed }) => [
                styles.menuItem,
                (!localModel || isLocalModelLoaded || isLocalModelBusy) &&
                  styles.menuItemDisabled,
                pressed && styles.menuItemPressed,
              ]}>
              <Text style={styles.menuActionText}>Carregar modelo</Text>
            </Pressable>
            <Pressable
              accessibilityHint="Escolhe e valida um modelo GGUF da memória do celular"
              accessibilityLabel="Escolher arquivo GGUF"
              accessibilityRole="menuitem"
              disabled={isLocalModelBusy}
              onPress={chooseLocalModel}
              style={({ pressed }) => [
                styles.menuItem,
                isLocalModelBusy && styles.menuItemDisabled,
                pressed && styles.menuItemPressed,
              ]}>
              <Text style={styles.menuActionText}>
                {localModelImportProgress !== null
                  ? `Importando modelo • ${Math.round(localModelImportProgress * 100)}%`
                  : isLocalModelBusy
                    ? 'Processando modelo...'
                    : 'Escolher e importar GGUF'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityHint="Libera da memória RAM o modelo local carregado"
              accessibilityLabel="Descarregar modelo"
              accessibilityRole="menuitem"
              disabled={!isLocalModelLoaded || isLocalModelBusy}
              onPress={unloadLocalModel}
              style={({ pressed }) => [
                styles.menuItem,
                (!isLocalModelLoaded || isLocalModelBusy) && styles.menuItemDisabled,
                pressed && styles.menuItemPressed,
              ]}>
              <Text style={styles.menuActionText}>Descarregar modelo</Text>
            </Pressable>
            <Pressable
              accessibilityHint="Remove apenas a cópia GGUF privada depois de descarregar o modelo"
              accessibilityLabel="Remover arquivo importado"
              accessibilityRole="menuitem"
              disabled={!localModel || isLocalModelLoaded || isLocalModelBusy}
              onPress={confirmRemoveImportedModel}
              style={({ pressed }) => [
                styles.menuItem,
                (!localModel || isLocalModelLoaded || isLocalModelBusy) &&
                  styles.menuItemDisabled,
                pressed && styles.menuItemPressed,
              ]}>
              <Text style={styles.clearMenuItemText}>Remover arquivo importado</Text>
            </Pressable>
            <Pressable
              accessibilityHint="Apaga apenas as mensagens visíveis, sem remover memórias"
              accessibilityLabel="Limpar conversa"
              accessibilityRole="menuitem"
              disabled={isTyping}
              onPress={confirmClearConversation}
              style={({ pressed }) => [
                styles.menuItem,
                styles.clearMenuItem,
                isTyping && styles.menuItemDisabled,
                pressed && styles.menuItemPressed,
              ]}>
              <Text style={styles.clearMenuItemText}>Limpar conversa</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050507',
  },
  keyboardArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 4,
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonPressed: {
    opacity: 0.62,
    transform: [{ scale: 0.94 }],
  },
  menuIcon: {
    color: '#4285FF',
    fontSize: 28,
    lineHeight: 30,
  },
  betaText: {
    color: '#4285FF',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginRight: 4,
  },
  chatPanel: {
    flex: 1,
    backgroundColor: '#050507',
  },
  chatList: {
    flex: 1,
  },
  messageList: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  skyMessageRow: {
    justifyContent: 'flex-start',
    paddingRight: 36,
  },
  userMessageRow: {
    justifyContent: 'flex-end',
    paddingLeft: 44,
  },
  messageText: {
    flexShrink: 1,
    color: '#D8DCE6',
    fontSize: 16,
    lineHeight: 24,
  },
  userMessageText: {
    color: '#4285FF',
    textAlign: 'right',
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4285FF',
  },
  composerArea: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: Platform.OS === 'ios' ? 8 : 10,
    backgroundColor: '#050507',
  },
  activeModeText: {
    color: '#4285FF',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    paddingHorizontal: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 52,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#A7ABB5',
    backgroundColor: '#11131A',
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    minHeight: 39,
    maxHeight: 112,
    color: '#F2F4F8',
    fontSize: 15,
    lineHeight: 21,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4285FF',
    backgroundColor: '#11131A',
  },
  sendButtonDisabled: {
    borderColor: '#4A4E58',
    opacity: 0.48,
  },
  sendButtonPressed: {
    backgroundColor: '#18213A',
    transform: [{ scale: 0.92 }],
  },
  sendIcon: {
    color: '#4285FF',
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '700',
  },
  menuOverlay: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 66,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  menuPanel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#263657',
    backgroundColor: '#090E20',
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#18233F',
  },
  menuTitle: {
    flex: 1,
    color: '#EDF3FF',
    fontSize: 16,
    fontWeight: '800',
  },
  menuClose: {
    color: '#A8C9FA',
    fontSize: 26,
    lineHeight: 28,
  },
  menuItem: {
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#151F37',
  },
  menuItemText: {
    color: '#AAB7D4',
    fontSize: 13,
  },
  modeMenuItemActive: {
    backgroundColor: '#101D38',
    borderLeftColor: '#6EA8FF',
    borderLeftWidth: 3,
  },
  modeMenuTextActive: {
    color: '#DCEAFF',
    fontWeight: '800',
  },
  menuActionText: {
    color: '#A8C9FA',
    fontSize: 13,
    fontWeight: '700',
  },
  clearMenuItem: {
    borderBottomWidth: 0,
  },
  clearMenuItemText: {
    color: '#F0A6B2',
    fontSize: 13,
    fontWeight: '700',
  },
  menuItemDisabled: {
    opacity: 0.45,
  },
  menuItemPressed: {
    backgroundColor: '#111A31',
  },
});
