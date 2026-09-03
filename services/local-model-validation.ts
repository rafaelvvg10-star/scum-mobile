const GGUF_MAGIC = [0x47, 0x47, 0x55, 0x46] as const;

export type CopiedModelValidation = {
  expectedSize: number;
  copiedSize: number;
  actualSize: number;
  header: Uint8Array;
};

export function validateCopiedModel({
  expectedSize,
  copiedSize,
  actualSize,
  header,
}: CopiedModelValidation): string | null {
  if (copiedSize !== expectedSize || actualSize !== expectedSize) {
    return `size mismatch (expected=${expectedSize}, copied=${copiedSize}, actual=${actualSize})`;
  }

  if (
    header.length !== GGUF_MAGIC.length ||
    GGUF_MAGIC.some((byte, index) => header[index] !== byte)
  ) {
    return 'invalid GGUF magic';
  }

  return null;
}

export function fileUriToNativePath(uri: string) {
  return uri.startsWith('file://') ? uri.slice(7) : uri;
}

export function isFileUriInsideDirectory(uri: string, directoryUri: string) {
  const directoryPrefix = directoryUri.endsWith('/')
    ? directoryUri
    : `${directoryUri}/`;

  return (
    uri.startsWith('file://') &&
    uri !== directoryUri &&
    uri.startsWith(directoryPrefix)
  );
}

export function sanitizeLocalModelDiagnostic(value: unknown) {
  const detail =
    value instanceof Error ? `${value.name}: ${value.message}` : String(value);

  return detail
    .replace(/content:\/\/[^\s"']+/gi, '<content-uri>')
    .replace(/file:\/\/[^\s"']+/gi, '<private-file>')
    .replace(/\/(?:data|storage|sdcard)\/[^\s"']+/gi, '<private-path>');
}
