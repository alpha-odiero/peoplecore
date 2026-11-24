import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { AuthResult, AuthenticatedUser } from '@peoplecore/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../common/app-error';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService, type IssuedSession } from './auth.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto';

@ApiTags('Auth')
@ApiCookieAuth('pc_refresh')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    const issued = await this.authService.login(dto, request);
    this.applySessionCookies(response, issued);
    return issued.result;
  }

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    const issued = await this.authService.register(dto, request);
    this.applySessionCookies(response, issued);
    return issued.result;
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResult> {
    this.assertCsrf(request);
    const refreshToken = request.cookies?.pc_refresh;
    if (!refreshToken) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is missing');
    }
    const csrfToken = request.cookies?.pc_csrf ?? '';
    const issued = await this.authService.refresh(refreshToken, request, csrfToken);
    this.applySessionCookies(response, issued);
    return issued.result;
  }

  @HttpCode(204)
  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(request.cookies?.pc_refresh, request);
    this.clearSessionCookies(response);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser | null): AuthenticatedUser {
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Account is not available');
    return user;
  }

  @Public()
  @HttpCode(202)
  @Post('forgot-password')
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<{ accepted: true }> {
    await this.authService.forgotPassword(dto, request);
    return { accepted: true };
  }

  @Public()
  @HttpCode(204)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request): Promise<void> {
    await this.authService.resetPassword(dto, request);
  }

  private assertCsrf(request: Request): void {
    const cookieToken = request.cookies?.pc_csrf;
    const headerToken = request.header('x-csrf-token');
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new AppError(403, 'CSRF_INVALID', 'CSRF token is missing or invalid');
    }
  }

  private applySessionCookies(response: Response, issued: IssuedSession): void {
    const refreshTtl = this.numberConfig('PC_JWT_REFRESH_TTL', 1_209_600);
    response.cookie('pc_refresh', issued.refreshToken, this.cookieOptions(refreshTtl * 1000, true));
    response.cookie('pc_csrf', issued.csrfToken, this.cookieOptions(refreshTtl * 1000, false));
  }

  private clearSessionCookies(response: Response): void {
    const options = { path: '/', domain: this.config.get<string>('PC_COOKIE_DOMAIN') || undefined };
    response.clearCookie('pc_refresh', options);
    response.clearCookie('pc_csrf', options);
  }

  private cookieOptions(maxAge: number, httpOnly: boolean): Record<string, unknown> {
    return {
      httpOnly,
      secure: this.booleanConfig('PC_COOKIE_SECURE'),
      sameSite: this.config.get<'strict' | 'lax' | 'none'>('PC_COOKIE_SAME_SITE') ?? 'strict',
      domain: this.config.get<string>('PC_COOKIE_DOMAIN') || undefined,
      path: '/',
      maxAge,
    };
  }

  private booleanConfig(key: string): boolean {
    const value = this.config.get(key);
    return value === true || value === 'true' || value === '1';
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
