import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/*
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private logger = new Logger(`HTTP`);
    use(req: Request, res: Response, next: NextFunction) {
        this.logger.log(`Logging HTTP request ${req.method} ${req.url} ${res.statusCode}`,);
        next();
    }
}*/
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private logger = new Logger('HTTP');

    use(req: Request, resp: Response, next: NextFunction): void {
        const { ip, method, originalUrl } = req;
        const userAgent = req.get('user-agent') || '';

        resp.on('finish', () => {
            const { statusCode } = resp;
            const contentLength = resp.get('content-length');

            this.logger.debug(
                `${method} ${originalUrl} ${statusCode} ${contentLength} - ${userAgent} ${ip}`,
            );
        });

        this.logger.debug(`Logging HTTP request ${req.method} ${req.originalUrl}`,);

        next();
    }
}