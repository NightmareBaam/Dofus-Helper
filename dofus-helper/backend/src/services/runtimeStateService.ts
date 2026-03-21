import type { CharactersPayload } from "./charactersStorage.js";

class RuntimeStateService {
  private charactersRevision = 0;
  private charactersPayload: CharactersPayload | null = null;

  getCharactersRevision(): number {
    return this.charactersRevision;
  }

  getCharactersPayload(): CharactersPayload | null {
    return this.charactersPayload;
  }

  publishCharacters(payload: CharactersPayload): void {
    this.charactersPayload = payload;
    this.charactersRevision += 1;
  }
}

export const runtimeStateService = new RuntimeStateService();
