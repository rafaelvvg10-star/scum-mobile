import type {
  CompletionParams,
  LlamaContext,
  NativeCompletionResult,
  RNLlamaOAICompatibleMessage,
} from 'llama.rn';

export const LOCAL_MAX_OUTPUT_TOKENS = 220;
export const LOCAL_TEMPERATURE = 0.3;
export const LOCAL_STOP_WORDS = [
  '</s>',
  '<|end|>',
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
  '<|EOT|>',
  '<|END_OF_TURN_TOKEN|>',
  '<|end_of_turn|>',
  '<|endoftext|>',
] as const;

type LocalCompletionDiagnosticSource = Partial<
  Pick<
    NativeCompletionResult,
    | 'stopped_eos'
    | 'stopped_limit'
    | 'stopped_word'
    | 'stopping_word'
    | 'tokens_predicted'
    | 'truncated'
    | 'context_full'
    | 'interrupted'
  >
>;

type LocalCompletionLogger = Pick<Console, 'info' | 'warn'>;
type DiagnosticValue = boolean | number | string | null;

export type LocalCompletionDiagnostic = {
  reason:
    | 'eos'
    | 'stop_word'
    | 'token_limit'
    | 'context_full'
    | 'interrupted'
    | 'truncated_context'
    | 'unknown';
  stopped_eos: DiagnosticValue;
  stopped_limit: DiagnosticValue;
  stopped_word: DiagnosticValue;
  stopping_word: DiagnosticValue;
  tokens_predicted: DiagnosticValue;
  truncated: DiagnosticValue;
  context_full: DiagnosticValue;
  interrupted: DiagnosticValue;
};

function diagnosticValue(value: unknown): DiagnosticValue {
  return typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
    ? value
    : null;
}

function isActiveIndicator(value: DiagnosticValue) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value > 0;
  }

  return typeof value === 'string' && value.length > 0;
}

function inferStopReason(
  diagnostic: Omit<LocalCompletionDiagnostic, 'reason'>
): LocalCompletionDiagnostic['reason'] {
  if (isActiveIndicator(diagnostic.interrupted)) {
    return 'interrupted';
  }

  if (isActiveIndicator(diagnostic.context_full)) {
    return 'context_full';
  }

  if (isActiveIndicator(diagnostic.stopped_limit)) {
    return 'token_limit';
  }

  if (
    isActiveIndicator(diagnostic.stopped_word) ||
    isActiveIndicator(diagnostic.stopping_word)
  ) {
    return 'stop_word';
  }

  if (isActiveIndicator(diagnostic.stopped_eos)) {
    return 'eos';
  }

  if (isActiveIndicator(diagnostic.truncated)) {
    return 'truncated_context';
  }

  return 'unknown';
}

export function buildLocalCompletionParams(
  messages: RNLlamaOAICompatibleMessage[]
): CompletionParams {
  return {
    messages,
    n_predict: LOCAL_MAX_OUTPUT_TOKENS,
    temperature: LOCAL_TEMPERATURE,
    stop: [...LOCAL_STOP_WORDS],
  };
}

export function createLocalCompletionDiagnostic(
  result: LocalCompletionDiagnosticSource
): LocalCompletionDiagnostic {
  const indicators = {
    stopped_eos: diagnosticValue(result.stopped_eos),
    stopped_limit: diagnosticValue(result.stopped_limit),
    stopped_word: diagnosticValue(result.stopped_word),
    stopping_word: diagnosticValue(result.stopping_word),
    tokens_predicted: diagnosticValue(result.tokens_predicted),
    truncated: diagnosticValue(result.truncated),
    context_full: diagnosticValue(result.context_full),
    interrupted: diagnosticValue(result.interrupted),
  };

  return {
    reason: inferStopReason(indicators),
    ...indicators,
  };
}

export function logLocalCompletionDiagnostic(
  result: LocalCompletionDiagnosticSource,
  logger: LocalCompletionLogger = console
) {
  const diagnostic = createLocalCompletionDiagnostic(result);
  const hasContextProblem =
    isActiveIndicator(diagnostic.stopped_limit) ||
    isActiveIndicator(diagnostic.truncated) ||
    isActiveIndicator(diagnostic.context_full);

  if (hasContextProblem) {
    logger.warn('[LocalModel] Geração encerrada com pressão de limite:', diagnostic);
  } else {
    logger.info('[LocalModel] Geração encerrada:', diagnostic);
  }

  return diagnostic;
}

export async function runLocalGeneration(
  localContext: Pick<LlamaContext, 'completion'>,
  messages: RNLlamaOAICompatibleMessage[],
  logger: LocalCompletionLogger = console
) {
  const result = await localContext.completion(
    buildLocalCompletionParams(messages)
  );
  logLocalCompletionDiagnostic(result, logger);

  return result;
}
