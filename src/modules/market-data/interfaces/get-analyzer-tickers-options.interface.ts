export interface GetAnalyzerTickersOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
  search?: string;
  symbols?: string[]; // Added missing symbols prop
  // Filters
  risk?: string[];
  aiRating?: string[];
  upside?: string;
  sector?: string[];
  isAdmin?: boolean;
}
