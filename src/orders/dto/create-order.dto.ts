import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { OrderItemDto } from './order-item.dto';

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1) //validate minimum 1 item in array
  @ValidateNested({ each: true }) //validate each item in array
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
