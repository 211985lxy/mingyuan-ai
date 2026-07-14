import type { ContentType, ExpressionBlueprint, HotTopic, TemplateVariable } from "@/types/content-template";

export interface PaginatedResponse<T> {
  results: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicTemplateListItem {
  id: string;
  displayName: string;
  description: string | null;
  hookType: string | null;
  industry: string[];
  contentType: ContentType;
  tags: string[];
  featured: boolean;
  usageCount: number;
  variables: TemplateVariable[];
  expressionBlueprint: ExpressionBlueprint | null;
}

export interface PublicTemplateDetail extends PublicTemplateListItem {
  scriptTemplate: string;
}

export interface HotTopicsResponse {
  topics: HotTopic[];
  updatedAt: string;
}
