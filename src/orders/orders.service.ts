/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order, OrderStatus, PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto, OrderItemDto, PaidOrderDto } from './dto';
import { NATS_SERVICE } from 'src/config';
import { firstValueFrom } from 'rxjs';
import { PaymentsWithItems } from './interface/payment-with-items.interface';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('OrdersService');

  constructor(
    @Inject(NATS_SERVICE) private readonly productClient: ClientProxy,
  ) {
    super();
  }
  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async create(createOrderDto: CreateOrderDto) {
    try {
      const productIds = createOrderDto.items.map((item) => item.productId);
      const products: any[] = await firstValueFrom(
        this.productClient.send(
          { cmd: 'validate_products' },
          {
            productIds,
          },
        ),
      );

      //total amount to be paid
      const totalAmount = createOrderDto.items.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0,
      );

      //create order
      const order = await this.order.create({
        data: {
          totalItems: createOrderDto.items.length,
          totalAmount,
          status: OrderStatus.PENDING,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                price: item.price,
              })),
            },
          },
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            },
          },
        },
      });

      return {
        ...order,
        OrderItem: order.OrderItem.map((item) => {
          return {
            ...item,
            productName: products.find(
              (product) => product.id === item.productId,
            ).name,
          };
        }),
      };
    } catch (e) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: e.message,
      });
    }
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const totalPages = await this.order.count({
      where: {
        status: orderPaginationDto.status,
      },
    });

    const currentPage = orderPaginationDto.page;
    const perPage = orderPaginationDto.limit;

    return {
      data: await this.order.findMany({
        skip: (currentPage - 1) * perPage,
        take: perPage,
        where: {
          status: orderPaginationDto.status,
        },
      }),
      meta: {
        total: totalPages,
        page: currentPage,
        lastPage: Math.ceil(totalPages / perPage),
      },
    };
  }

  async findOne(id: string) {
    const order = await this.order.findFirst({
      where: { id },
      include: {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          },
        },
      },
    });

    if (!order) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with id ${id} not found`,
      });
    }

    const productIds = order.OrderItem.map((item) => item.productId);
    const products: any[] = await firstValueFrom(
      this.productClient.send(
        { cmd: 'validate_products' },
        {
          productIds,
        },
      ),
    );
    return {
      ...order,
      OrderItem: order.OrderItem.map((item) => {
        return {
          ...item,
          productName: products.find((product) => product.id === item.productId)
            .name,
        };
      }),
    };
  }

  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto;

    const order = await this.findOne(id);
    if (order.status === status) {
      return order;
    }

    return this.order.update({
      where: { id },
      data: { status: status },
    });
  }

  async createPaymentSession(order: PaymentsWithItems) {
    const paymentsSession = await firstValueFrom(
      this.productClient.send('create.payments.session', {
        orderId: order.id,
        currency: 'usd',
        items: order.OrderItem.map((item) => ({
          name: item.productName,
          price: item.price,
          quantity: item.quantity,
        })),
      }),
    );
    return paymentsSession;
  }

  async paidOrder(paidOrderDto: PaidOrderDto) {
    this.logger.log(paidOrderDto);
    await this.order.update({
      where: { id: paidOrderDto.orderId },
      data: {
        status: OrderStatus.PAID,
        paid: true,
        paidAt: new Date(),
        stripeChargeId: paidOrderDto.stripePaymentId,
        //Relacion
        OrderReceipt: {
          create: {
            receiptUrl: paidOrderDto.receiptUrl,
          },
        },
      },
    });
    return this.findOne(paidOrderDto.orderId);
  }
}
