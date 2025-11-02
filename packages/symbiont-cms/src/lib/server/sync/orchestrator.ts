import type { DatabaseBlueprint, SyncOptions, SyncSummary } from '../../types.js';
import type { PageObjectResponse } from '@notionhq/client';
import { NotionAdapter } from '../notion/adapter.js';
import { PostRepository } from './post-repository.js';
import { PostBuilder } from './post-builder.js';

export class SyncOrchestrator {
  constructor(
    private notionAdapter: NotionAdapter,
    private postBuilder: PostBuilder,
    private postRepository: PostRepository
  ) {}
  
  async syncDataSource(config: DatabaseBlueprint, options: SyncOptions): Promise<SyncSummary>
  async processPage(page: PageObjectResponse): Promise<void>
}