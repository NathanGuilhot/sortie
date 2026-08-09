import type { DatabaseManager, SuggestionEngine } from 'pipeline';
import { type Board, type Image } from 'shared';

interface DatabaseBoardsDeps {
  requireDb(): DatabaseManager;
  fetchImagesByIdsInOrder(ids: number[]): Image[];
  invalidateMetadataCaches(): void;
  getSuggestionEngine(): SuggestionEngine;
}

export class DatabaseBoardsService {
  constructor(private readonly deps: DatabaseBoardsDeps) {}

  async getBoards(): Promise<Board[]> {
    return this.deps.requireDb().boards.listBoards();
  }

  async getBoard(tagId: number): Promise<Board | null> {
    return this.deps.requireDb().boards.getBoard(tagId);
  }

  async getBoardImages(tagId: number, limit: number = 100, offset: number = 0): Promise<Image[]> {
    const ids = this.deps.requireDb().boards.getBoardImageIdsPaged(tagId, limit, offset);
    return this.deps.fetchImagesByIdsInOrder(ids);
  }

  async reorderBoardImages(tagId: number, orderedImageIds: number[]): Promise<void> {
    this.deps.requireDb().boards.reorderBoardImages(tagId, orderedImageIds);
    this.deps.invalidateMetadataCaches();
  }

  async getBoardImageSuggestions(tagId: number): Promise<Image[]> {
    const suggestions = await this.deps
      .getSuggestionEngine()
      .generateImageSuggestionsForBoard(tagId, 20);
    if (suggestions.length === 0) return [];
    return this.deps.fetchImagesByIdsInOrder(suggestions.map((suggestion) => suggestion.imageId));
  }

  async addImageToBoard(imageId: number, tagId: number): Promise<void> {
    await this.addImagesToBoard([imageId], tagId);
  }

  async addImagesToBoard(imageIds: number[], tagId: number): Promise<void> {
    if (imageIds.length === 0) return;
    this.deps.requireDb().boards.addImagesToBoard(imageIds, tagId);
    this.deps.invalidateMetadataCaches();
  }

  async removeImageFromBoard(imageId: number, tagId: number): Promise<void> {
    this.deps.requireDb().boards.removeImageFromBoard(imageId, tagId);
    this.deps.invalidateMetadataCaches();
  }

  async createBoard(name: string, color?: string): Promise<Board> {
    const board = this.deps.requireDb().boards.createBoard(name, color);
    return {
      ...board,
      image_count: 0,
      cover_image_id: null,
      cover_image_path: null,
      preview_image_paths: [],
    };
  }

  async renameBoard(tagId: number, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Board name cannot be empty');
    this.deps.requireDb().tags.renameTag(tagId, trimmed);
    this.deps.invalidateMetadataCaches();
  }

  async setBoardColor(tagId: number, color: string): Promise<void> {
    this.deps.requireDb().tags.setTagColor(tagId, color);
  }

  async deleteBoard(tagId: number): Promise<void> {
    this.deps.requireDb().tags.deleteTag(tagId);
    this.deps.invalidateMetadataCaches();
  }
}
