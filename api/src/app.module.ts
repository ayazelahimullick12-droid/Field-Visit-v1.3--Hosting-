import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { config } from './config';
import { PrismaModule } from './common/prisma.service';
import { AuthGuard } from './auth/auth.guard';
import { AuthController } from './auth/auth.controller';
import { PeopleController } from './people/people.controller';
import { ReferenceDataController } from './reference-data/reference-data.controller';
import { VisitsController } from './visits/visits.controller';
import { VisitsService } from './visits/visits.service';
import { ActionItemsController } from './action-items/action-items.controller';
import { ActionItemsService } from './action-items/action-items.service';
import { MailController } from './mail/mail.controller';
import { MailService } from './mail/mail.service';
import { UploadsController } from './uploads/uploads.controller';
import { PublicController } from './public/public.controller';

/**
 * The whole API. To add a feature: write a controller (endpoints) and, if it has rules,
 * a service; then list them here.
 */
@Module({
  imports: [
    PrismaModule,
    JwtModule.register({ global: true, secret: config.secret }),
    // a generous general limit; sign-in has its own stricter one (auth.controller.ts)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
  ],
  controllers: [
    AuthController,
    PeopleController,
    ReferenceDataController,
    VisitsController,
    ActionItemsController,
    MailController,
    UploadsController,
    PublicController,
  ],
  providers: [
    VisitsService,
    ActionItemsService,
    MailService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
