import { GraphQLClient, gql } from 'graphql-request';

export class PostRepository {
  constructor(private gqlClient: GraphQLClient) {}
  
  async getByNotionPageId(pageId: string, sourceId: string): Promise<Post | null>
  async getBySlug(slug: string, sourceId: string): Promise<Post | null>
  async getAllForSource(sourceId: string): Promise<Post[]>
  async upsert(post: PostData): Promise<void>
  async deleteForSource(sourceId: string): Promise<number>
}