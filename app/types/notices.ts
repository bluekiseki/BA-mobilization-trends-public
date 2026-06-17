export interface Notice {
  post_id: string;
  title: string;
  category: string;
  region: string;
  type: string;
  thumbnail?: string;
  api_create_date: number;
  api_modify_date: number;
}

export interface NoticesResponse {
  data: Notice[];
  total?: number;
}
