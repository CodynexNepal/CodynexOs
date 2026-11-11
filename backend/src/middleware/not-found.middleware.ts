import { Request, Response } from 'express';
import { STATUS_CODE } from '../constant/statusCode.interface';

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(STATUS_CODE.NOT_FOUND).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};
