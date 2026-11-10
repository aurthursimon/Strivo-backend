export interface ApiResponse<T> {
  data: T;
  statusCode: number;
}

export interface ApiError {
  message: string | string[];
  error: string;
  statusCode: number;
  path?: string;
}

export interface AuthTokenResponse {
  accessToken: string;
}

export interface UserProfile {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  provider: 'GUEST' | 'EMAIL' | 'GOOGLE' | 'APPLE';
  accountSecured: boolean;
  emailVerified: boolean;
  locale: string;
  birthDate: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE' | null;
  createdAt: string;
  updatedAt: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  info: Record<string, { status: string }>;
  error: Record<string, { status: string; message?: string }>;
  details: Record<string, { status: string }>;
}
