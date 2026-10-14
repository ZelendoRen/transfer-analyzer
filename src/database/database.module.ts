import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TransactionsEntity } from './entity/transactions.entity';
import { BlocksEntity } from './entity/blocks.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        entities: [TransactionsEntity, BlocksEntity],
        synchronize: configService.get<string>('DB_SYNCHRONIZE') !== 'false',
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
