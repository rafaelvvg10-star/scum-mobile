# Scum Mobile

Assistente Android local-first feito com Expo e `llama.rn`. O aplicativo não depende de backend próprio nem de Groq: o usuário importa um arquivo GGUF, que permanece no armazenamento privado do aparelho, e toda inferência acontece localmente.

## Recursos

- importação e troca genérica de arquivos `.gguf`;
- histórico recente persistido localmente;
- calculadora segura e data/hora totalmente offline;
- localização foreground somente quando solicitada;
- clima atual via Open-Meteo;
- leitura limitada de páginas HTTP/HTTPS públicas.

Busca web genérica não está habilitada. Brave e Tavily exigem chaves que não podem ser mantidas secretas em um APK puramente local; nenhum backend novo foi criado para contornar isso.

## Verificações

```bash
npm install
npm test
npx tsc --noEmit
npm run lint
npx expo-doctor
```

## APK standalone

O perfil `preview` é ARM64-only, não depende de Metro nem Expo Go e não inclui modelos:

```bash
npx eas-cli@16.28.0 build --platform android --profile preview --non-interactive
```

No aparelho, abra o menu, escolha **Escolher e importar GGUF** e selecione qualquer `.gguf`. Compatibilidade e consumo de memória dependem da versão do `llama.rn` e do hardware.

Localização é pedida somente ao usar localização ou clima. Não há rastreamento em segundo plano nem persistência das coordenadas.

## Licença

MIT. Consulte [LICENSE](LICENSE).
