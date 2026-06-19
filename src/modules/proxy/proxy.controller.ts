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
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';

@ApiTags('Proxy')
@ApiBearerAuth()
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
      const hostname = parsedUrl.hostname;
      if (parsedUrl.protocol !== 'https:') {
        throw new BadRequestException('Only https URLs are allowed');
      }
      if (hostname !== 'finnhub.io' && !hostname.endsWith('.finnhub.io')) {
        throw new BadRequestException('Only finnhub.io images are allowed');
      }

      this.logger.debug(`Proxying image: ${url}`);

      const response = await firstValueFrom(
        this.httpService.get(url, {
          responseType: 'stream',
          // Bound the upstream request so a slow/hung finnhub socket can't pin
          // a server connection indefinitely.
          timeout: 10000,
          // Only the initial host is validated, so do NOT follow redirects —
          // otherwise a finnhub open-redirect could reach an internal target.
          maxRedirects: 0,
          headers: {
            'User-Agent': 'Neural-Ticker-Backend/1.0',
            // Forwarding strict headers might cause issues if Finnhub checks them,
            // but usually standard GET is fine.
          },
        }),
      );

      // Forward content type header. axios now types header values as a broad
      // union; content-type is a string at runtime.
      const contentType = response.headers['content-type'] as
        | string
        | undefined;
      if (contentType) {
        res.set('Content-Type', contentType);
      }

      // Cache control - cache for 1 day
      res.set('Cache-Control', 'public, max-age=86400');

      // Handle mid-stream upstream failures, otherwise the client connection
      // hangs forever and the error event goes unhandled (can crash the process).
      response.data.on('error', (streamErr: Error) => {
        this.logger.error(
          `Stream error while proxying ${url}: ${streamErr.message}`,
        );
        if (!res.headersSent) {
          res.status(502).send('Upstream stream error');
        } else {
          res.destroy(streamErr);
        }
      });

      // Pipe the stream to the response
      response.data.pipe(res);
    } catch (error) {
      // Preserve client errors (bad/disallowed URL) as 400 instead of masking
      // them as 404.
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to proxy image: ${url}`, error);
      if (!res.headersSent) {
        res.status(502).send('Image not found or inaccessible');
      }
    }
  }
}
