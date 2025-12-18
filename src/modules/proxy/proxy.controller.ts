import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';

@ApiTags('Proxy')
@Public()
@Controller('proxy')
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(private readonly httpService: HttpService) {}

  @Get('image')
  @ApiOperation({ summary: 'Proxy images from allowed domains to bypass CORS' })
  @ApiQuery({
    name: 'url',
    required: true,
    description: 'The URL of the image to proxy (must be from finnhub.io)',
  })
  @ApiResponse({ status: 200, description: 'The image stream' })
  @ApiResponse({
    status: 400,
    description: 'Invalid URL or not from finnhub.io',
  })
  @ApiResponse({ status: 404, description: 'Image not found' })
  async proxyImage(@Query('url') url: string, @Res() res: Response) {
    if (!url) {
      throw new BadRequestException('URL parameter is required');
    }

    try {
      const parsedUrl = new URL(url);
      if (!parsedUrl.hostname.endsWith('finnhub.io')) {
        throw new BadRequestException('Only finnhub.io images are allowed');
      }

      this.logger.debug(`Proxying image: ${url}`);

      const response = await firstValueFrom(
        this.httpService.get(url, {
          responseType: 'stream',
          headers: {
            'User-Agent': 'Neural-Ticker-Backend/1.0',
            // Forwarding strict headers might cause issues if Finnhub checks them,
            // but usually standard GET is fine.
          },
        }),
      );

      // Forward content type header
      const contentType = response.headers['content-type'];
      if (contentType) {
        res.set('Content-Type', contentType);
      }

      // Cache control - cache for 1 day
      res.set('Cache-Control', 'public, max-age=86400');

      // Pipe the stream to the response
      response.data.pipe(res);
    } catch (error) {
      this.logger.error(`Failed to proxy image: ${url}`, error);
      res.status(404).send('Image not found or inaccessible');
    }
  }
}
