import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { TokenModule } from '../auth/token.module';

@Module({
  imports: [TokenModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
