# Scum Mobile

Aplicativo Expo do Scum. O modo Online usa o backend remoto autenticado; o modo Local usa `llama.rn` inteiramente no celular.

## Backend Online

Copie `.env.example` para `.env` e configure `EXPO_PUBLIC_SCUM_API_URL` e `EXPO_PUBLIC_SCUM_API_TOKEN`. Produção exige HTTPS; desenvolvimento também aceita HTTP para um servidor local. O token é enviado somente no header Bearer e nunca é salvo no histórico ou no armazenamento do aplicativo.

Variáveis `EXPO_PUBLIC_*` são incorporadas ao bundle e podem ser lidas por quem possui o aplicativo. Portanto, este token não é um segredo real: trata-se de uma limitação consciente do MVP de dono único, não de autenticação multiusuário.

Os perfis EAS usam os ambientes `development`, `preview` e `production`. Cadastre `EXPO_PUBLIC_SCUM_API_URL` e `EXPO_PUBLIC_SCUM_API_TOKEN` como variáveis plain text nos ambientes `preview` e `production` do projeto Expo; não coloque valores em `eas.json`. O perfil `preview` gera APK instalável diretamente, enquanto `production` permanece separado para distribuição futura.

Antes de qualquer build remoto, confirme login com `eas whoami` e revise o que será enviado: código-fonte não ignorado, configuração Expo/EAS, dependências e as variáveis do ambiente escolhido. Só então, mediante autorização, use `eas build --platform android --profile preview`.

## Homologação no aparelho

1. Instale o APK de preview.
2. Abra Online por Wi-Fi ou dados móveis e envie uma mensagem.
3. Crie uma memória pessoal identificável, feche o aplicativo e desligue o PC.
4. Reabra e confirme que Online continua respondendo.
5. Converse sobre o assunto e verifique recuperação natural; depois mude de assunto e confirme que a lembrança não é forçada.
6. Desative a internet e confirme uma mensagem Online curta, sem detalhes internos.
7. Selecione Local e confirme que o GGUF responde offline.
8. Restaure a internet e confirme que Online só volta quando selecionado.

## Modo Local experimental

O modo Local é simples, offline e de emergência. Não há promessa de boa velocidade no Redmi Note 14.

Configuração conservadora preparada:

- CPU apenas (`n_gpu_layers: 0` e OpenCL desativado);
- contexto de 1024 tokens;
- saída máxima de 120 tokens;
- uma geração por vez;
- modelo sugerido: Qwen2.5 0.5B Instruct, GGUF Q4.

O APK não contém nem baixa modelos. No menu, toque em **Escolher e importar GGUF** e selecione manualmente um `.gguf` na memória interna. O Android normalmente entrega um URI `content://`, que o `llama.rn` não abre diretamente. Após confirmação com tamanho e espaço livre, o Scum copia o arquivo em fluxo, com progresso, para o armazenamento privado persistente do app. A cópia não usa cache temporário.

Extensão, URI, tamanho, espaço livre e metadados GGUF são validados antes do carregamento. Uma cópia parcial ou inválida é removida automaticamente.

**Descarregar modelo** libera somente o contexto da RAM. Depois disso, **Remover arquivo importado** apaga a cópia privada mediante nova confirmação; o arquivo original escolhido pelo usuário nunca é alterado. A referência e os metadados resumidos ficam no armazenamento seguro enquanto a cópia existir.

## Development build Android

`llama.rn` contém código nativo e não funciona no Expo Go. Esta etapa precisa de uma development build Android própria.

Não é necessário instalar Android Studio ou Android SDK. Para gerar a development build na nuvem, entre na conta Expo e envie o perfil definido em `eas.json`:

```bash
npm install
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile development
```

Quando o EAS terminar, abra o link/QR da build no Redmi, baixe o APK de desenvolvimento e autorize a instalação. Depois, inicie o servidor JavaScript na mesma rede:

```bash
npx expo start --dev-client
```

## Validar o carregamento no Redmi

1. Abra o menu `☰`.
2. Toque em **Escolher e importar GGUF**.
3. Selecione preferencialmente **Qwen2.5 0.5B Instruct GGUF Q4**.
4. Confira o aviso de tamanho/espaço e confirme a importação.
5. Aguarde o progresso chegar a 100% e a validação nativa terminar.
6. Confirme o alerta **Modelo local carregado** e o estado `Local — nome.gguf • carregado` no menu.
7. Toque em **Descarregar modelo** para liberar RAM.
8. Se quiser apagar a cópia privada, use separadamente **Remover arquivo importado** e confirme.

A validação real de abertura pelo `llama.rn` só estará concluída depois desse teste no Redmi `arm64-v8a`. Esta etapa não gera APK final de produção.

## Licença

Este projeto está distribuído sob a licença MIT. Consulte o arquivo [LICENSE](LICENSE) para mais informações.
