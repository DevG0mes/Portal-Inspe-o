export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
