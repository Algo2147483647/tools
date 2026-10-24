export function estimateTextWidth(text: string, fontSize: number): number {
  return Array.from(String(text || "")).reduce(
    (width, character) => width + getCharacterEmWidth(character) * fontSize,
    0,
  );
}

function getCharacterEmWidth(character: string): number {
  if (/[\u0300-\u036f]/.test(character)) {
    return 0;
  }
  if (/\s/.test(character)) {
    return 0.32;
  }
  if (isCjkCharacter(character) || /[\u3000-\u303f\uff00-\uffef]/.test(character)) {
    return 1;
  }
  if (/[MW@#%&]/.test(character)) {
    return 0.88;
  }
  if (/[A-Z0-9]/.test(character)) {
    return 0.66;
  }
  if (/[ilI|.,'`!;:]/.test(character)) {
    return 0.34;
  }
  if (/[-_/\\()[\]{}]/.test(character)) {
    return 0.46;
  }
  return 0.56;
}

function isCjkCharacter(character: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(character);
}
