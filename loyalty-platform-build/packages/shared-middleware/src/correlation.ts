import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function correlationId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const existing = req.header('x-correlation-id');
    const id = existing ?? uuidv4();
    req.correlationId = id;
    res.setHeader('x-correlation-id', id);
    next();
  };
}
