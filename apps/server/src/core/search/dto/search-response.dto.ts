import { Space } from '@docmost/db/types/entity.types';

export class SearchResultPathItemDto {
  id: string;
  slugId: string;
  title: string;
  icon: string;
  nodeType: 'file' | 'folder';
}

export class SearchResponseDto {
  id: string;
  slugId: string;
  title: string;
  icon: string;
  nodeType: 'file' | 'folder';
  parentPageId: string;
  creatorId: string;
  rank: number;
  highlight: string;
  createdAt: Date;
  updatedAt: Date;
  space: Partial<Space>;
  path: SearchResultPathItemDto[];
}
