import { StatusBar } from 'expo-status-bar';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
};


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
  const listRef = useRef<FlatList<Message>>(null);

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

      const url = `${API_URL}/chat?pergunta=${encodeURIComponent(text)}`;
      const response = await fetch(url, { method: 'POST' });

      if (!response.ok) {
        throw new Error(`A API respondeu com o status ${response.status}`);
      }

      const data: ChatResponse = await response.json();

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId('sky'),
          author: 'sky',
          text: data.resposta,
        },
      ]);
    } catch (error) {
      console.error('Falha ao conectar com a API da Sky:', error);

      const mensagemDeErro =
        error instanceof TypeError
          ? 'Não consegui alcançar meu cérebro local. Verifique se a API está ligada e se o celular continua na mesma rede Wi-Fi.'
          : 'Meu cérebro local respondeu com um erro. Verifique se a API está ativa e tente novamente.';

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
  }, [input, isTyping]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="light" backgroundColor="#050817" />

      <View pointerEvents="none" style={styles.backgroundDecoration}>
        <View style={styles.glowLarge} />
        <View style={styles.glowSmall} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        style={styles.keyboardArea}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.miniAvatar}>
              <Text style={styles.miniAvatarText}>S</Text>
            </View>

            <View style={styles.brandText}>
              <Text style={styles.name}>Sky</Text>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Cérebro local conectado</Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              <Pressable
                accessibilityHint="Abre a lista de memórias essenciais da Sky"
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
                  <Text style={styles.avatarSpark}>✦</Text>
                  <Text style={styles.avatarLetter}>S</Text>
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
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const isSky = item.author === 'sky';

              return (
                <View
                  style={[
                    styles.messageRow,
                    isSky ? styles.skyMessageRow : styles.userMessageRow,
                  ]}>
                  {isSky && (
                    <View style={styles.messageAvatar}>
                      <Text style={styles.messageAvatarText}>S</Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.messageBubble,
                      isSky ? styles.skyBubble : styles.userBubble,
                    ]}>
                    {isSky && <Text style={styles.messageAuthor}>SKY</Text>}
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
                  <View style={styles.messageAvatar}>
                    <Text style={styles.messageAvatarText}>S</Text>
                  </View>
                  <View style={[styles.messageBubble, styles.skyBubble, styles.typingBubble]}>
                    <Text style={styles.typingText}>Sky está pensando •••</Text>
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
                placeholder="Converse com a Sky..."
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
            <Text style={styles.localNotice}>Ollama local • llama3.2:1b</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050817',
  },
  keyboardArea: {
    flex: 1,
  },
  backgroundDecoration: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  glowLarge: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(34, 104, 255, 0.12)',
    top: -150,
    right: -130,
  },
  glowSmall: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(67, 220, 255, 0.07)',
    top: 185,
    left: -110,
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
  brandText: {
    flex: 1,
    marginLeft: 11,
  },
  name: {
    color: '#F5F8FF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#58E1B5',
    marginRight: 6,
  },
  statusText: {
    color: '#8494B9',
    fontSize: 11,
    fontWeight: '600',
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
  },
  avatarLetter: {
    color: '#F3F8FF',
    fontSize: 34,
    fontWeight: '900',
  },
  avatarSpark: {
    position: 'absolute',
    top: 6,
    right: 10,
    color: '#8CEBFF',
    fontSize: 12,
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
    backgroundColor: '#090E20',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#18233F',
    overflow: 'hidden',
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
  messageAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#153569',
    borderWidth: 1,
    borderColor: '#477FD0',
    marginRight: 8,
  },
  messageAvatarText: {
    color: '#E5F1FF',
    fontSize: 11,
    fontWeight: '900',
  },
  messageBubble: {
    maxWidth: '100%',
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  skyBubble: {
    flexShrink: 1,
    backgroundColor: '#111A31',
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#1E2D4D',
  },
  userBubble: {
    backgroundColor: '#2563C7',
    borderBottomRightRadius: 6,
  },
  messageAuthor: {
    color: '#72ABFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 4,
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
});
