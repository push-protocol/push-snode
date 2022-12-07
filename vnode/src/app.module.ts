import { AppController } from './AppController';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
// import { AppController } from './app.controller';
// import { AppService } from './app.service';
import { LoggerMiddleware } from './loaders/loggerMiddleware';
import DbService from "./loaders/dbService";

@Module({
  imports: [],
  controllers: [AppController],
  providers: [DbService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
