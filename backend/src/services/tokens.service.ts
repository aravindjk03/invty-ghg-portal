import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  provider: string;
}

const ISSUER = 'invty-ghg-portal';
const AUDIENCE = 'invty-ghg-portal-client';

/**
 * Short-lived access tokens.
 *
 * The signing secret is validated at startup (see config/env), and the process
 * refuses to boot in production on the development default, so a deployment
 * cannot accidentally sign tokens anyone could forge.
 */
export const tokensService = {
  issueAccessToken(claims: AccessTokenClaims): string {
    const options: SignOptions = {
      expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
      issuer: ISSUER,
      audience: AUDIENCE,
      subject: claims.sub,
    };
    return jwt.sign({ email: claims.email, provider: claims.provider }, env.JWT_SECRET, options);
  },

  verifyAccessToken(token: string): AccessTokenClaims | null {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;

      if (!payload.sub) return null;
      return {
        sub: String(payload.sub),
        email: String(payload.email ?? ''),
        provider: String(payload.provider ?? 'password'),
      };
    } catch {
      return null;
    }
  },
};
