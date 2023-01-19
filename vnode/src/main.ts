import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigModule } from '@nestjs/config';
import { LoggerService, Logger } from '@nestjs/common';



async function bootstrap() {

  // configure env
  ConfigModule.forRoot({
    envFilePath: `.env`,
    isGlobal: true,
  });

  let log = new Logger('main');
  log.debug(`console logger attached!`);
  log.debug(`using db $1`, process.env.DB_NAME);

  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT);
  log.debug(`listening on port ${process.env.PORT}`)
  log.debug(`app started!`)
}
bootstrap();
