import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SupportChatController } from './support-chat.controller';
import { SupportChatService } from './support-chat.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [SupportChatController],
  providers: [SupportChatService],
})
export class SupportChatModule {}
