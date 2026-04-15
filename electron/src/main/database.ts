import { DatabaseManager } from 'pipeline';

export class DatabaseService {
  private db: DatabaseManager | null = null;

  initialize(dbPath: string) {
    this.db = new DatabaseManager(dbPath);
  }

  close() {
    this.db?.close();
  }
}