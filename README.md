# Scum Mobile

Scum é um projeto pessoal de estudo, feito por um desenvolvedor iniciante para
aprender na prática React Native, Expo, integração nativa, LLMs locais, GGUF,
persistência, memória e conceitos de desenvolvimento de software.

Ele evoluiu do antigo **Sky Companion**. Não é um produto profissional, não
pretende competir com assistentes comerciais e continua sendo um Beta
experimental e imperfeito. O trabalho realizado é real; as limitações também.

Na arquitetura mobile final, o Scum funciona local-first no Android usando
`llama.rn`. O usuário escolhe e importa o próprio modelo GGUF, e o funcionamento
principal pode ser totalmente offline depois da importação. O aplicativo mantém
histórico e memória episódica no próprio aparelho.

O mobile não depende de Groq, Render, Turso ou backend remoto. Nenhum GGUF é
incluído no APK.

Modelos pequenos podem responder mal, interpretar frases literalmente ou ser
extremamente limitados. Essa é uma limitação conhecida e aceita do Beta. A
personalidade final do Scum é propositalmente simples e direta.

**O projeto Scum Beta está oficialmente encerrado.**

## Tecnologias

- React Native
- Expo
- TypeScript
- `llama.rn`
- GGUF
- Android ARM64

## Instalação e uso

Para preparar o projeto:

```bash
npm install
```

Para gerar um APK standalone ARM64:

```bash
npx eas-cli build --platform android --profile preview
```

Depois de instalar o APK, abra o menu, escolha **Escolher e importar GGUF** e
selecione um arquivo `.gguf`. A compatibilidade e o consumo de memória dependem
do modelo e do aparelho.

## Validação final

- 49 testes aprovados
- TypeScript aprovado
- ESLint aprovado
- Expo Doctor: 18/18
- APK standalone ARM64 validado

## História

Os detalhes do caminho do Sky Companion até o Scum estão em
[ROADMAP](https://github.com/rafaelvvg10-star/scum-backend/blob/feat/turso-episodic-memory/historia/ROADMAP.md),
[CHANGELOG](https://github.com/rafaelvvg10-star/scum-backend/blob/feat/turso-episodic-memory/historia/CHANGELOG.md)
e [LEGADO](https://github.com/rafaelvvg10-star/scum-backend/blob/feat/turso-episodic-memory/historia/00_LEGADO.md).

## Licença

MIT. Consulte [LICENSE](LICENSE).
