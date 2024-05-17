import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PRODUCTS_SERVICE, envs } from 'src/config';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  imports: [
    ClientsModule.register([
      {
        name: PRODUCTS_SERVICE, // Ensure this is defined somewhere
        transport: Transport.TCP,
        options: {
          host: envs.productsMicroservice.host,
          port: envs.productsMicroservice.port,
        },
      },
    ]),
  ],
})
export class OrdersModule {}
