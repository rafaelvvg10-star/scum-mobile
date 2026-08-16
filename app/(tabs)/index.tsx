import { StatusBar } from 'expo-status-bar';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
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
  extractLocalCompletionText,
  resolveChatTransport,
  type ChatMode,
  toLocalMessages,
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
          toLocalMessages([...messages, userMessage])
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
      <StatusBar style="light" backgroundColor="#000000" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        style={styles.keyboardArea}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Pressable
              accessibilityHint="Abre as opções do aplicativo"
              accessibilityLabel="Abrir menu"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setIsMenuVisible(true)}
              style={({ pressed }) => [
                styles.menuButton,
                pressed && styles.menuButtonPressed,
              ]}>
              <Text style={styles.menuIcon}>☰</Text>
            </Pressable>

            <View style={styles.headerActions}>
              <Pressable
                accessibilityHint="Abre a lista de memórias essenciais do Scum"
                accessibilityLabel="Memórias"
                accessibilityRole="button"
                onPress={() => router.push('/memorias' as Href)}
                style={({ pressed }) => [
                  styles.memoriesButton,
                  pressed && styles.memoriesButtonPressed,
                ]}>
                <Text style={styles.memoriesButtonText}>Memórias</Text>
              </Pressable>

              <View style={styles.betaBadge}>
                <Text style={styles.betaText}>BETA</Text>
              </View>
            </View>
          </View>

          <View style={styles.identityArea}>
            <View style={styles.orbitOuter}>
              <View style={styles.orbitMiddle}>
                <View style={styles.avatar}>
                  <Image
                    source={require('@/assets/images/scum-idle.png')}
                    resizeMode="contain"
                    style={styles.idleImage}
                  />
                </View>
              </View>
            </View>

            <View style={styles.identityText}>
              <Text style={styles.identityTitle}>Seu companheiro de jornada</Text>
              <Text style={styles.identitySubtitle}>
                Onde o bom senso vem para morrer em paz.
              </Text>
            </View>
          </View>
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
            renderItem={({ item }) => {
              const isSky = item.author === 'sky';

              return (
                <View
                  style={[
                    styles.messageRow,
                    isSky ? styles.skyMessageRow : styles.userMessageRow,
                  ]}>
                  <View
                    style={[
                      styles.messageBubble,
                      isSky ? styles.skyBubble : styles.userBubble,
                    ]}>
                    <Text style={[styles.messageText, !isSky && styles.userMessageText]}>
                      {item.text}
                    </Text>
                    {isSky && item.source ? (
                      <Text style={styles.messageSource}>
                        Resposta: {item.source === 'local' ? 'Local' : 'Groq'}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            }}
            ListFooterComponent={
              isTyping ? (
                <View style={[styles.messageRow, styles.skyMessageRow]}>
                  <View style={[styles.messageBubble, styles.skyBubble, styles.typingBubble]}>
                    <Text style={styles.typingText}>Scum está pensando •••</Text>
                  </View>
                </View>
              ) : null
            }
          />

          <View style={styles.composerArea}>
            <Text style={styles.activeModeText}>
              Modo ativo: {chatMode === 'local' ? 'Local' : 'Groq'}
              {chatMode === 'local' && !isLocalModelLoaded ? ' • modelo descarregado' : ''}
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                value={input}
                onChangeText={setInput}
                onSubmitEditing={sendMessage}
                placeholder="Converse com o Scum..."
                placeholderTextColor="#7180A6"
                selectionColor="#6EA8FF"
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
    backgroundColor: '#000000',
  },
  keyboardArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D1730',
    borderWidth: 1,
    borderColor: '#29466F',
  },
  menuButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  menuIcon: {
    color: '#A8C9FA',
    fontSize: 21,
    lineHeight: 23,
  },
  betaBadge: {
    borderWidth: 1,
    borderColor: '#314B7A',
    backgroundColor: '#0D1730',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  memoriesButton: {
    minHeight: 34,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#29466F',
    backgroundColor: '#0C1930',
    borderRadius: 999,
    paddingHorizontal: 11,
  },
  memoriesButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  memoriesButtonText: {
    color: '#A8C9FA',
    fontSize: 11,
    fontWeight: '700',
  },
  betaText: {
    color: '#8EBBFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  identityArea: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
  },
  orbitOuter: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(91, 151, 255, 0.24)',
  },
  orbitMiddle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(96, 223, 255, 0.22)',
    backgroundColor: 'rgba(16, 34, 72, 0.5)',
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16376D',
    borderWidth: 1,
    borderColor: '#69A8FF',
    overflow: 'hidden',
  },
  idleImage: {
    width: 70,
    height: 70,
  },
  identityText: {
    flex: 1,
    marginLeft: 16,
  },
  identityTitle: {
    color: '#EAF1FF',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  identitySubtitle: {
    color: '#8290B1',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  chatPanel: {
    flex: 1,
    marginHorizontal: 12,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#18233F',
    overflow: 'hidden',
  },
  chatList: {
    flex: 1,
  },
  messageList: {
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 16,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 13,
  },
  skyMessageRow: {
    justifyContent: 'flex-start',
    paddingRight: 45,
  },
  userMessageRow: {
    justifyContent: 'flex-end',
    paddingLeft: 48,
  },
  messageBubble: {
    maxWidth: '100%',
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  skyBubble: {
    flexShrink: 1,
    backgroundColor: '#0C111D',
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(92, 82, 170, 0.28)',
  },
  userBubble: {
    backgroundColor: '#243F92',
    experimental_backgroundImage:
      'linear-gradient(135deg, #173F82 0%, #40256F 100%)',
    borderBottomRightRadius: 6,
  },
  messageText: {
    color: '#D9E1F2',
    fontSize: 14,
    lineHeight: 20,
  },
  messageSource: {
    color: '#7180A6',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  typingBubble: {
    paddingVertical: 9,
  },
  typingText: {
    color: '#7888AB',
    fontSize: 12,
    fontStyle: 'italic',
  },
  composerArea: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 9 : 12,
    borderTopWidth: 1,
    borderTopColor: '#151F37',
    backgroundColor: '#090E20',
  },
  activeModeText: {
    color: '#7180A6',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 7,
    paddingHorizontal: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#263657',
    backgroundColor: '#0D1529',
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 5,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 112,
    color: '#EDF3FF',
    fontSize: 14,
    lineHeight: 19,
    paddingTop: 9,
    paddingBottom: 8,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3478E5',
  },
  sendButtonDisabled: {
    backgroundColor: '#1A2945',
  },
  sendButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
  sendIcon: {
    color: '#FFFFFF',
    fontSize: 22,
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
