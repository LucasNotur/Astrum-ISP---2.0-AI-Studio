export interface ISearchResult {
  filename: string;
  score: number;
  content: string;
}

export interface ISearchPort {
  search(
    query: string,
    tenantId: string,
    options: { limit: number; hydeSensitivity: string },
  ): Promise<ISearchResult[]>;
}
