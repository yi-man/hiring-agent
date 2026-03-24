// 主题类型
export type Theme = 'light' | 'dark' | 'system';

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}

// 全局类型定义
export type { Metadata } from 'next';
export type { ReactNode } from 'react';

// 通用类型
export type Nullable<T> = T | null | undefined;

export type Optional<T> = T | null | undefined | void;

export type Required<T> = Exclude<T, null | undefined>;

export type StringOrNull = string | null;

export type NumberOrNull = number | null;

export type BooleanOrNull = boolean | null;

export type DateOrNull = Date | null;

export type ArrayOrNull<T> = T[] | null;

export type RecordOrNull<T = unknown> = Record<string, T> | null;

export type MaybePromise<T> = T | Promise<T>;

// 响应类型
export type ApiResponse<T> = {
  data: T;
  success: boolean;
  message?: string;
  error?: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type PaginationParams = {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
};

// 用户类型
export type User = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'admin' | 'user' | 'guest';
  createdAt: Date;
  updatedAt: Date;
};

// 文章类型
export type Post = {
  id: string;
  title: string;
  content: string;
  excerpt?: string;
  author: User;
  category: string;
  tags: string[];
  published: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

// 产品类型
export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  discountPrice?: number;
  images: string[];
  category: string;
  tags: string[];
  stock: number;
  rating: number;
  reviews: number;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// 订单类型
export type Order = {
  id: string;
  user: User;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  paymentMethod: string;
  shippingAddress: Address;
  billingAddress: Address;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderItem = {
  id: string;
  product: Product;
  quantity: number;
  price: number;
};

export type Address = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// 搜索类型
export type SearchParams = {
  query: string;
  category?: string;
  priceRange?: [number, number];
  tags?: string[];
};
