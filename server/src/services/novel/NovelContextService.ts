import { NovelCoreService } from "./NovelCoreService";

export class NovelContextService {
  protected readonly core = new NovelCoreService();

  listNovels(...args: Parameters<NovelCoreService["listNovels"]>) {
    return this.core.listNovels(...args);
  }

  createNovel(...args: Parameters<NovelCoreService["createNovel"]>) {
    return this.core.createNovel(...args);
  }

  getNovelById(...args: Parameters<NovelCoreService["getNovelById"]>) {
    return this.core.getNovelById(...args);
  }

  updateNovel(...args: Parameters<NovelCoreService["updateNovel"]>) {
    return this.core.updateNovel(...args);
  }

  deleteNovel(...args: Parameters<NovelCoreService["deleteNovel"]>) {
    return this.core.deleteNovel(...args);
  }

  listChapters(...args: Parameters<NovelCoreService["listChapters"]>) {
    return this.core.listChapters(...args);
  }

  createChapter(...args: Parameters<NovelCoreService["createChapter"]>) {
    return this.core.createChapter(...args);
  }

  updateChapter(...args: Parameters<NovelCoreService["updateChapter"]>) {
    return this.core.updateChapter(...args);
  }

  deleteChapter(...args: Parameters<NovelCoreService["deleteChapter"]>) {
    return this.core.deleteChapter(...args);
  }

  listCharacters(...args: Parameters<NovelCoreService["listCharacters"]>) {
    return this.core.listCharacters(...args);
  }

  createCharacter(...args: Parameters<NovelCoreService["createCharacter"]>) {
    return this.core.createCharacter(...args);
  }

  updateCharacter(...args: Parameters<NovelCoreService["updateCharacter"]>) {
    return this.core.updateCharacter(...args);
  }

  deleteCharacter(...args: Parameters<NovelCoreService["deleteCharacter"]>) {
    return this.core.deleteCharacter(...args);
  }

  listCharacterTimeline(...args: Parameters<NovelCoreService["listCharacterTimeline"]>) {
    return this.core.listCharacterTimeline(...args);
  }

  syncCharacterTimeline(...args: Parameters<NovelCoreService["syncCharacterTimeline"]>) {
    return this.core.syncCharacterTimeline(...args);
  }

  syncAllCharacterTimeline(...args: Parameters<NovelCoreService["syncAllCharacterTimeline"]>) {
    return this.core.syncAllCharacterTimeline(...args);
  }

  evolveCharacter(...args: Parameters<NovelCoreService["evolveCharacter"]>) {
    return this.core.evolveCharacter(...args);
  }

  checkCharacterAgainstWorld(...args: Parameters<NovelCoreService["checkCharacterAgainstWorld"]>) {
    return this.core.checkCharacterAgainstWorld(...args);
  }

  createNovelSnapshot(...args: Parameters<NovelCoreService["createNovelSnapshot"]>) {
    return this.core.createNovelSnapshot(...args);
  }

  listNovelSnapshots(...args: Parameters<NovelCoreService["listNovelSnapshots"]>) {
    return this.core.listNovelSnapshots(...args);
  }

  restoreFromSnapshot(...args: Parameters<NovelCoreService["restoreFromSnapshot"]>) {
    return this.core.restoreFromSnapshot(...args);
  }
}
