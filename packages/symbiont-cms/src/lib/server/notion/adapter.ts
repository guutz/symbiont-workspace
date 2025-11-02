export class NotionAdapter {
  constructor(private notion: Client, private n2m: NotionToMarkdown) {}
  
  async getPage(pageId: string): Promise<PageObjectResponse>
  async queryDataSource(dataSourceId: string, filter?: any): Promise<PageObjectResponse[]>
  async updateProperty(pageId: string, propertyName: string, value: any): Promise<void>
  async pageToMarkdown(pageId: string): Promise<string>
}