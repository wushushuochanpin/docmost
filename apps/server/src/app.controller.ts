import { Body, Controller, Get, Logger, Post } from "@nestjs/common";
import { AppService } from "./app.service";

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Diagnostic endpoint: the client reports frontend runtime errors
   * (window.onerror / unhandledrejection / error-boundary fallbacks) here
   * so page-load failures can be diagnosed from server logs without
   * requiring browser console access.
   */
  @Post("diag/frontend-error")
  logFrontendError(
    @Body()
    body: {
      context?: string;
      message?: string;
      stack?: string;
      url?: string;
      userAgent?: string;
      ts?: string;
    },
  ): { ok: boolean } {
    this.logger.warn(
      `[frontend-error] context=${body?.context ?? "?"} url=${body?.url ?? "?"} message=${body?.message ?? "?"} stack=${(body?.stack ?? "").slice(0, 1500)} ua=${body?.userAgent ?? "?"} ts=${body?.ts ?? "?"}`,
    );
    return { ok: true };
  }
}
