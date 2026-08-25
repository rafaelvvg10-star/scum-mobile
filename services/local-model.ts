import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import type { LlamaContext, RNLlamaOAICompatibleMessage } from 'llama.rn';

import {
  LOCAL_MAX_OUTPUT_TOKENS,
  runLocalGeneration,
} from './local-completion';
import {
  fileUriToNativePath,
  isFileUriInsideDirectory,
  sanitizeLocalModelDiagnostic,
  validateCopiedModel,
} from './local-model-validation';

export const LOCAL_MODEL_CONFIG = {
  nCtx: 1024,
  nGpuLayers: 0,
  maxOutputTokens: LOCAL_MAX_OUTPUT_TOKENS,
  nParallel: 1,
} as const;

const MODEL_STORAGE_KEY = 'scum.localModel.metadata.v1';
const MODEL_DIRECTORY_NAME = 'local-models';
const STORAGE_SAFETY_MARGIN = 256 * 1024 * 1024;

export type LocalModelMetadata = {
  name: string;
  uri: string;
  size: number | null;
  mimeType: string | null;
  architecture: string | null;
  modelName: string | null;
  selectedAt: string;
};

export type LocalModelSelection = {
  metadata: LocalModelMetadata;
  loaded: true;
};

export class LocalModelError extends Error {
  constructor(
    public readonly code:
      | 'invalid_file'
      | 'insufficient_storage'
      | 'insufficient_memory'
      | 'incompatible_model'
      | 'load_failed'
      | 'busy'
      | 'not_loaded',
    message: string
  ) {
    super(message);
    this.name = 'LocalModelError';
  }
}

let context: LlamaContext | null = null;
let operationInProgress = false;

export type LocalModelImportDetails = {
  name: string;
  size: number;
  availableSpace: number;
};

export type LocalModelImportOptions = {
  confirmImport: (details: LocalModelImportDetails) => Promise<boolean>;
  onProgress?: (progress: number) => void;
};

function modelDirectory() {
  return new Directory(Paths.document, MODEL_DIRECTORY_NAME);
}

function readStringField(info: Record<string, unknown>, field: string) {
  const value = info[field];

  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function validateAsset(asset: DocumentPicker.DocumentPickerAsset) {
  if (!asset.name.toLowerCase().endsWith('.gguf')) {
    throw new LocalModelError(
      'invalid_file',
      'Arquivo inválido. Escolha um modelo com extensão .gguf.'
    );
  }

  if (!/^(?:file|content):\/\//i.test(asset.uri)) {
    throw new LocalModelError(
      'invalid_file',
      'O Android não forneceu uma URI local válida para este arquivo.'
    );
  }

  if (asset.size !== undefined && asset.size <= 0) {
    throw new LocalModelError('invalid_file', 'O arquivo GGUF está vazio.');
  }
}

async function copyToPrivateStorage(
  asset: DocumentPicker.DocumentPickerAsset,
  size: number,
  onProgress?: (progress: number) => void
) {
  const directory = modelDirectory();
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, `model-${Date.now()}.gguf`);
  const source = new File(asset.uri);
  destination.create({ overwrite: false });

  const reader = source.readableStream().getReader();
  const writer = destination.writableStream().getWriter();
  let copied = 0;

  onProgress?.(0);
  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      await writer.write(value);
      copied += value.byteLength;
      onProgress?.(Math.min(copied / size, 1));
    }

    await writer.close();

    const handle = destination.open();
    let header: Uint8Array;
    try {
      header = handle.readBytes(4);
    } finally {
      handle.close();
    }

    const validationError = validateCopiedModel({
      expectedSize: size,
      copiedSize: copied,
      actualSize: destination.size,
      header,
    });

    if (validationError) {
      throw new LocalModelError(
        'invalid_file',
        validationError === 'invalid GGUF magic'
          ? 'O arquivo selecionado não possui um cabeçalho GGUF válido.'
          : 'A cópia do modelo ficou incompleta. Selecione o arquivo novamente.'
      );
    }

    onProgress?.(1);
    return destination;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    await writer.abort(error).catch(() => undefined);

    if (destination.exists) {
      destination.delete();
    }

    throw error;
  }
}

function classifyLoadError(error: unknown): LocalModelError {
  if (error instanceof LocalModelError) {
    return error;
  }

  const detail = error instanceof Error ? error.message : String(error);

  if (/memory|alloc|mmap|out of memory/i.test(detail)) {
    return new LocalModelError(
      'insufficient_memory',
      'Memória insuficiente para carregar este modelo. Descarregue outros aplicativos ou escolha um GGUF menor.'
    );
  }

  if (/gguf|unsupported|incompatible|architecture|tensor|vocab/i.test(detail)) {
    return new LocalModelError(
      'incompatible_model',
      'Modelo incompatível ou GGUF inválido. Tente uma quantização compatível, como Qwen2.5 0.5B Instruct Q4.'
    );
  }

  if (/native module|jsi bindings|rcllama|cannot find native/i.test(detail)) {
    return new LocalModelError(
      'load_failed',
      'O modo local exige um development build Android com llama.rn; ele não funciona no Expo Go.'
    );
  }

  return new LocalModelError(
    'load_failed',
    'Não foi possível carregar o modelo local. Selecione o arquivo novamente e confira o espaço e a memória disponíveis.'
  );
}

function logLoadFailure(stage: string, error: unknown) {
  if (__DEV__) {
    console.error(
      `[LocalModel] Falha em ${stage}:`,
      sanitizeLocalModelDiagnostic(error)
    );
  }
}

async function initializeLocalModel(modelUri: string) {
  const llama = await import('llama.rn');
  const nativePath = fileUriToNativePath(modelUri);
  let loadStage = 'leitura dos metadados GGUF';
  let removeNativeLogListener: (() => void) | null = null;
  let disableNativeLog: (() => Promise<void>) | null = null;

  try {
    if (__DEV__) {
      const subscription = llama.addNativeLogListener((level, text) => {
        console.debug(
          `[LocalModel][llama.rn][${level}]`,
          sanitizeLocalModelDiagnostic(text)
        );
      });
      removeNativeLogListener = subscription.remove;
      await llama.toggleNativeLog(true);
      disableNativeLog = () => llama.toggleNativeLog(false);
    }

    const rawInfo = await llama.loadLlamaModelInfo(nativePath);
    const info = rawInfo as Record<string, unknown>;

    if (!info || typeof info !== 'object' || Object.keys(info).length === 0) {
      throw new LocalModelError(
        'incompatible_model',
        'O arquivo não contém metadados GGUF reconhecíveis.'
      );
    }

    if (context) {
      await context.release();
      context = null;
    }

    loadStage = 'inicialização do contexto llama.rn';
    context = await llama.initLlama({
      model: nativePath,
      n_ctx: LOCAL_MODEL_CONFIG.nCtx,
      n_gpu_layers: LOCAL_MODEL_CONFIG.nGpuLayers,
      n_parallel: LOCAL_MODEL_CONFIG.nParallel,
      use_mlock: false,
    });

    return info;
  } catch (error) {
    logLoadFailure(loadStage, error);
    throw error;
  } finally {
    removeNativeLogListener?.();
    await disableNativeLog?.().catch(() => undefined);
  }
}

async function persistMetadata(metadata: LocalModelMetadata) {
  await SecureStore.setItemAsync(MODEL_STORAGE_KEY, JSON.stringify(metadata));
}

export async function getStoredLocalModel(): Promise<LocalModelMetadata | null> {
  const stored = await SecureStore.getItemAsync(MODEL_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const metadata = JSON.parse(stored) as LocalModelMetadata;

    if (
      typeof metadata.name !== 'string' ||
      !metadata.name.toLowerCase().endsWith('.gguf') ||
      typeof metadata.uri !== 'string' ||
      !metadata.uri.startsWith(modelDirectory().uri) ||
      !new File(metadata.uri).exists
    ) {
      throw new Error('Metadados inválidos');
    }

    return metadata;
  } catch {
    await SecureStore.deleteItemAsync(MODEL_STORAGE_KEY);
    return null;
  }
}

export function isLocalModelLoaded() {
  return context !== null;
}

export async function loadStoredLocalModel(): Promise<LocalModelSelection> {
  if (operationInProgress) {
    throw new LocalModelError('busy', 'Há uma operação local em andamento.');
  }

  const metadata = await getStoredLocalModel();
  if (!metadata) {
    throw new LocalModelError(
      'not_loaded',
      'Nenhum modelo importado foi encontrado. Importe um arquivo GGUF primeiro.'
    );
  }

  operationInProgress = true;
  try {
    await initializeLocalModel(metadata.uri);
    return { metadata, loaded: true };
  } catch (error) {
    if (context) {
      await context.release().catch(() => undefined);
      context = null;
    }

    throw classifyLoadError(error);
  } finally {
    operationInProgress = false;
  }
}

export async function selectAndLoadLocalModel(
  options: LocalModelImportOptions
): Promise<LocalModelSelection | null> {
  if (operationInProgress) {
    throw new LocalModelError('busy', 'Há uma operação local em andamento.');
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/octet-stream',
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  const pickerCacheCopy = isFileUriInsideDirectory(asset.uri, Paths.cache.uri)
    ? new File(asset.uri)
    : null;

  try {
    validateAsset(asset);
    const source = new File(asset.uri);
    const size = asset.size ?? source.size;

    if (!Number.isFinite(size) || size <= 0) {
      throw new LocalModelError(
        'invalid_file',
        'Não foi possível determinar o tamanho do arquivo GGUF.'
      );
    }

    const availableSpace = Paths.availableDiskSpace;
    if (availableSpace < size + STORAGE_SAFETY_MARGIN) {
      throw new LocalModelError(
        'insufficient_storage',
        'Espaço insuficiente. Libere espaço interno antes de importar o modelo.'
      );
    }

    const storedModel = await getStoredLocalModel();
    if (storedModel) {
      throw new LocalModelError(
        'load_failed',
        'Já existe um modelo importado. Descarregue e remova o arquivo atual antes de importar outro.'
      );
    }

    const confirmed = await options.confirmImport({
      name: asset.name,
      size,
      availableSpace,
    });

    if (!confirmed) {
      return null;
    }

    operationInProgress = true;
    let importedFile: File | null = null;

    try {
      importedFile = await copyToPrivateStorage(
        asset,
        size,
        options.onProgress
      );
      const info = await initializeLocalModel(importedFile.uri);

      const metadata: LocalModelMetadata = {
        name: asset.name,
        uri: importedFile.uri,
        size,
        mimeType: asset.mimeType ?? null,
        architecture: readStringField(info, 'general.architecture'),
        modelName: readStringField(info, 'general.name'),
        selectedAt: new Date().toISOString(),
      };

      await persistMetadata(metadata);
      return { metadata, loaded: true };
    } catch (error) {
      if (context) {
        await context.release().catch(() => undefined);
        context = null;
      }

      if (importedFile?.exists) {
        importedFile.delete();
      }

      throw classifyLoadError(error);
    } finally {
      operationInProgress = false;
    }
  } finally {
    if (pickerCacheCopy?.exists) {
      try {
        pickerCacheCopy.delete();
      } catch (error) {
        logLoadFailure('remoção da cópia temporária do DocumentPicker', error);
      }
    }
  }
}

export async function removeImportedLocalModel() {
  if (operationInProgress) {
    throw new LocalModelError('busy', 'Há uma operação local em andamento.');
  }

  if (context) {
    throw new LocalModelError(
      'busy',
      'Descarregue o modelo da RAM antes de remover o arquivo importado.'
    );
  }

  const metadata = await getStoredLocalModel();
  if (metadata) {
    const directoryUri = modelDirectory().uri;

    if (!metadata.uri.startsWith(directoryUri)) {
      throw new LocalModelError(
        'invalid_file',
        'A referência do modelo importado é inválida.'
      );
    }

    const file = new File(metadata.uri);
    if (file.exists) {
      file.delete();
    }
  }

  await SecureStore.deleteItemAsync(MODEL_STORAGE_KEY);
}

export async function releaseLocalModel() {
  if (operationInProgress) {
    throw new LocalModelError('busy', 'Há uma operação local em andamento.');
  }

  if (!context) {
    return;
  }

  operationInProgress = true;
  try {
    await context.release();
    context = null;
  } finally {
    operationInProgress = false;
  }
}

export async function runLocalCompletion(
  messages: RNLlamaOAICompatibleMessage[]
) {
  if (!context) {
    throw new LocalModelError(
      'not_loaded',
      'Nenhum modelo local está carregado. Escolha um arquivo GGUF no menu.'
    );
  }

  if (operationInProgress) {
    throw new LocalModelError(
      'busy',
      'A geração local anterior ainda não terminou.'
    );
  }

  operationInProgress = true;
  try {
    return await runLocalGeneration(context, messages);
  } finally {
    operationInProgress = false;
  }
}
