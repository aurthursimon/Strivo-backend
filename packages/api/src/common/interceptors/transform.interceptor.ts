import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { map } from 'rxjs/operators';
import type { Observable } from 'rxjs';

export interface ApiResponse<T> {
  data: T;
  statusCode: number;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const statusCode = context.switchToHttp().getResponse().statusCode as number;
    return next.handle().pipe(
      map((data) => ({
        data,
        statusCode,
      })),
    );
  }
}
