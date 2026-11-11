import { Request, Response, NextFunction } from 'express';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { STATUS_CODE } from '../constant/statusCode.interface';

function flattenErrors(errors: ValidationError[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const err of errors) {
    if (err.constraints) {
      result[err.property] = Object.values(err.constraints);
    }
    if (err.children && err.children.length > 0) {
      const childMap = flattenErrors(err.children);
      for (const [k, v] of Object.entries(childMap)) {
        result[`${err.property}.${k}`] = v;
      }
    }
  }
  return result;
}

export function validateDto<T extends object>(dtoClass: new () => T) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const instance = plainToInstance(dtoClass, req.body ?? {});
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: false,
      stopAtFirstError: false,
    });

    if (errors.length > 0) {
      res.status(STATUS_CODE.UNPROCESSABLE_ENTITY).json({
        success: false,
        message: 'Validation error',
        errors: flattenErrors(errors),
      });
      return;
    }

    req.body = instance;
    next();
  };
}
