import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_SCORE } from '../../app/utils/passwordValidate';

let initialized = false;
function ensureInit() {
  if (initialized) return;
  zxcvbnOptions.setOptions({
    translations: zxcvbnEnPackage.translations,
    graphs: zxcvbnCommonPackage.adjacencyGraphs,
    dictionary: { ...zxcvbnCommonPackage.dictionary, ...zxcvbnEnPackage.dictionary },
  });
  initialized = true;
}

export function validatePassword(password: string, userInputs: string[] = []): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  ensureInit();
  const { score } = zxcvbn(password, userInputs);
  if (score < PASSWORD_MIN_SCORE) {
    return 'Password is too weak';
  }
  return null;
}
