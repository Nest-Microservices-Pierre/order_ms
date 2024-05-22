import { Module } from '@nestjs/common';
import {
  ClientsModule,
  Transport,
  ClientProviderOptions,
} from '@nestjs/microservices';
import { NATS_SERVICE, envs } from 'src/config';

const natsClientOptions: ClientProviderOptions = {
  name: NATS_SERVICE,
  transport: Transport.NATS,
  options: {
    servers: envs.NATS_SERVER,
  },
};

@Module({
  imports: [ClientsModule.register([natsClientOptions])],
  exports: [ClientsModule.register([natsClientOptions])],
})
export class NatsModule {}
