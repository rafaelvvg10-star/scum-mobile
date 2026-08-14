import { StatusBar } from 'expo-status-bar';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  API_CONFIGURATION_ERROR,
  API_URL,
} from '@/config/api';

type MessageAuthor = 'sky' | 'user';

type Message = {
  id: string;
  author: MessageAuthor;
  text: string;
};

type ChatResponse = {
  pergunta: string;
  resposta: string;
  provedor: 'groq' | 'ollama' | 'sem_consulta';
  modelo: string | null;
};

type ModelsResponse = {
  padrao: {
    provedor: 'groq';
    modelo: string;
  };
  modelos_groq: string[];
  modelos_ollama: string[];
};

type ModelSelection = {
  provedor: 'automatico' | 'groq' | 'ollama';
  modelo: string | null;
  label: string;
};

type LastProvider = Pick<ChatResponse, 'provedor' | 'modelo'>;

const INITIAL_SELECTION: ModelSelection = {
  provedor: 'automatico',
  modelo: null,
  label: 'Automático',
};

const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'sky-welcome',
    author: 'sky',
    text: 'Olá, Kunh. Estou aqui. Esta é a primeira interface oficial do nosso Beta.',
  },
];

function createMessageId(author: MessageAuthor) {
  return `${author}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isModelMenuVisible, setIsModelMenuVisible] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelMenuError, setModelMenuError] = useState<string | null>(null);
  const [groqModel, setGroqModel] = useState(DEFAULT_GROQ_MODEL);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [modelSelection, setModelSelection] = useState(INITIAL_SELECTION);
  const [lastProvider, setLastProvider] = useState<LastProvider | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  const scrollToLatestMessage = useCallback((animated = true) => {
    listRef.current?.scrollToEnd({ animated });
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollToLatestMessage());

    return () => cancelAnimationFrame(frame);
  }, [isTyping, messages, scrollToLatestMessage]);

  const openModelMenu = useCallback(async () => {
    setIsModelMenuVisible(true);
    setModelMenuError(null);

    if (!API_URL) {
      setModelMenuError(API_CONFIGURATION_ERROR);
      return;
    }

    setIsLoadingModels(true);

    try {
      const response = await fetch(`${API_URL}/modelos`);

      if (!response.ok) {
        throw new Error(`A API respondeu com o status ${response.status}`);
      }

      const data: ModelsResponse = await response.json();

      if (
        typeof data?.padrao?.modelo !== 'string' ||
        !Array.isArray(data.modelos_ollama)
      ) {
        throw new Error('A API retornou uma lista de modelos inválida');
      }

      setGroqModel(data.padrao.modelo);
      setLocalModels(
        data.modelos_ollama.filter(
          (model): model is string => typeof model === 'string' && Boolean(model.trim())
        )
      );
    } catch {
      setModelMenuError('Não consegui carregar os modelos disponíveis.');
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  const chooseModel = useCallback((selection: ModelSelection) => {
    setModelSelection(selection);
    setIsModelMenuVisible(false);
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();

    if (!text || isTyping) {
      return;
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      { id: createMessageId('user'), author: 'user', text },
    ]);
    setInput('');
    setIsTyping(true);
    try {
      if (!API_URL) {
        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: createMessageId('sky'),
            author: 'sky',
            text: API_CONFIGURATION_ERROR,
          },
        ]);

        return;
      }

      const query = [
        `pergunta=${encodeURIComponent(text)}`,
        `provedor=${encodeURIComponent(modelSelection.provedor)}`,
      ];

      if (modelSelection.modelo) {
        query.push(`modelo=${encodeURIComponent(modelSelection.modelo)}`);
      }

      const url = `${API_URL}/chat?${query.join('&')}`;
      const response = await fetch(url, { method: 'POST' });

      if (!response.ok) {
        throw new Error(`A API respondeu com o status ${response.status}`);
      }

      const data: ChatResponse = await response.json();

      if (
        typeof data?.resposta !== 'string' ||
        !data.resposta.trim() ||
        !['groq', 'ollama', 'sem_consulta'].includes(data.provedor) ||
        (data.modelo !== null && typeof data.modelo !== 'string')
      ) {
        throw new Error('A API retornou uma resposta inválida');
      }

      setLastProvider({
        provedor: data.provedor,
        modelo: data.modelo,
      });

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId('sky'),
          author: 'sky',
          text: data.resposta.trim(),
        },
      ]);
    } catch (error) {
      console.error('Falha ao conectar com a API do Scum:', error);

      const mensagemDeErro =
        error instanceof TypeError
          ? 'Sem conexão com a API do Scum. Verifique a rede e tente novamente.'
          : 'A API não conseguiu responder. Tente novamente.';

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId('sky'),
          author: 'sky',
          text: mensagemDeErro,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  }, [input, isTyping, modelSelection]);

  const providerFooter = lastProvider
    ? lastProvider.provedor === 'sem_consulta'
      ? 'Última resposta • sem consulta de modelo'
      : `Última resposta • ${lastProvider.provedor} • ${lastProvider.modelo}`
    : `Modo atual • ${modelSelection.label}`;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="light" backgroundColor="#000000" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        style={styles.keyboardArea}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.miniAvatar}>
              <Text style={styles.miniAvatarText}>S</Text>
            </View>

            <View style={styles.menuSlot}>
              <Pressable
                accessibilityHint="Abre as opções da conversa"
                accessibilityLabel="Menu da conversa"
                accessibilityRole="button"
                hitSlop={8}
                onPress={openModelMenu}
                style={({ pressed }) => [
                  styles.menuButton,
                  pressed && styles.menuButtonPressed,
                ]}>
                <Text style={styles.menuText}>⋮</Text>
              </Pressable>
            </View>

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
              <Text style={styles.identityTitle}>Sua companheira de jornada</Text>
              <Text style={styles.identitySubtitle}>
                Magia, tecnologia e foco para construir algo extraordinário.
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
            <Text style={styles.localNotice}>{providerFooter}</Text>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsModelMenuVisible(false)}
        statusBarTranslucent
        transparent
        visible={isModelMenuVisible}>
        <Pressable
          accessible={false}
          onPress={() => setIsModelMenuVisible(false)}
          style={styles.menuOverlay}>
          <Pressable
            accessibilityRole="menu"
            onPress={(event) => event.stopPropagation()}
            style={styles.modelMenu}>
            <View style={styles.modelMenuHeader}>
              <View style={styles.modelMenuTitleArea}>
                <Text style={styles.modelMenuTitle}>Modelo da conversa</Text>
                <Text style={styles.modelMenuCurrent}>
                  Atual: {modelSelection.label}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Fechar menu"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setIsModelMenuVisible(false)}>
                <Text style={styles.modelMenuClose}>×</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.modelOptions}
              showsVerticalScrollIndicator={false}>
              <ModelOption
                label="Automático"
                description="Groq primeiro, Ollama como fallback"
                selected={modelSelection.provedor === 'automatico'}
                onPress={() => chooseModel(INITIAL_SELECTION)}
              />
              <ModelOption
                label="Groq"
                description={groqModel}
                selected={modelSelection.provedor === 'groq'}
                onPress={() =>
                  chooseModel({
                    provedor: 'groq',
                    modelo: groqModel,
                    label: `Groq • ${groqModel}`,
                  })
                }
              />

              <Text style={styles.localModelsTitle}>MODELOS DO PC (OLLAMA)</Text>
              {isLoadingModels ? (
                <View style={styles.modelsLoading}>
                  <ActivityIndicator color="#8EBBFF" />
                  <Text style={styles.modelsLoadingText}>Consultando Ollama...</Text>
                </View>
              ) : (
                localModels.map((model) => (
                  <ModelOption
                    key={model}
                    label={model}
                    description="Ollama local"
                    selected={
                      modelSelection.provedor === 'ollama' &&
                      modelSelection.modelo === model
                    }
                    onPress={() =>
                      chooseModel({
                        provedor: 'ollama',
                        modelo: model,
                        label: `Ollama • ${model}`,
                      })
                    }
                  />
                ))
              )}

              {!isLoadingModels && localModels.length === 0 && !modelMenuError && (
                <Text style={styles.modelsEmpty}>Nenhum modelo local encontrado.</Text>
              )}
              {modelMenuError && (
                <Text style={styles.modelMenuError}>{modelMenuError}</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

type ModelOptionProps = {
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
};

function ModelOption({
  label,
  description,
  selected,
  onPress,
}: ModelOptionProps) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.modelOption,
        selected && styles.modelOptionSelected,
        pressed && styles.modelOptionPressed,
      ]}>
      <View style={styles.modelOptionText}>
        <Text style={styles.modelOptionLabel}>{label}</Text>
        <Text style={styles.modelOptionDescription}>{description}</Text>
      </View>
      {selected && <Text style={styles.modelOptionCheck}>✓</Text>}
    </Pressable>
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
  miniAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#132954',
    borderWidth: 1,
    borderColor: '#437DCF',
  },
  miniAvatarText: {
    color: '#EAF4FF',
    fontSize: 18,
    fontWeight: '800',
  },
  menuSlot: {
    flex: 1,
    marginLeft: 11,
  },
  menuButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonPressed: {
    opacity: 0.65,
  },
  menuText: {
    color: '#A8C9FA',
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '700',
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
  localNotice: {
    color: '#53617F',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.2,
  },
  menuOverlay: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 72,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  modelMenu: {
    maxHeight: '72%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#263657',
    backgroundColor: '#090E20',
    overflow: 'hidden',
  },
  modelMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#18233F',
  },
  modelMenuTitleArea: {
    flex: 1,
  },
  modelMenuTitle: {
    color: '#EDF3FF',
    fontSize: 16,
    fontWeight: '800',
  },
  modelMenuCurrent: {
    color: '#8290B1',
    fontSize: 11,
    marginTop: 3,
  },
  modelMenuClose: {
    color: '#A8C9FA',
    fontSize: 26,
    lineHeight: 28,
  },
  modelOptions: {
    padding: 10,
  },
  modelOption: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  modelOptionSelected: {
    backgroundColor: '#111A31',
    borderWidth: 1,
    borderColor: 'rgba(92, 82, 170, 0.42)',
  },
  modelOptionPressed: {
    opacity: 0.7,
  },
  modelOptionText: {
    flex: 1,
  },
  modelOptionLabel: {
    color: '#EAF1FF',
    fontSize: 14,
    fontWeight: '700',
  },
  modelOptionDescription: {
    color: '#7180A6',
    fontSize: 10,
    marginTop: 3,
  },
  modelOptionCheck: {
    color: '#8EBBFF',
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 10,
  },
  localModelsTitle: {
    color: '#53617F',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: 12,
    marginBottom: 5,
    marginLeft: 12,
  },
  modelsLoading: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 9,
  },
  modelsLoadingText: {
    color: '#8290B1',
    fontSize: 12,
  },
  modelsEmpty: {
    color: '#7180A6',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modelMenuError: {
    color: '#F0A6B2',
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
