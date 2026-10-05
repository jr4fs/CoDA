import { User } from "@common/types/accounts";

interface JwtPayload {
  userId?: string;
  username?: string;
  email?: string;
  exp?: number;
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return atob(padded);
}

export function parseJwt(token: string): JwtPayload | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = base64UrlDecode(payload);
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = parseJwt(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 < Date.now();
}

export function buildUserFromToken(token: string): User | null {
  const payload = parseJwt(token);
  if (!payload?.userId || !payload?.username || !payload?.email) {
    return null;
  }
  return {
    id: payload.userId,
    name: payload.username,
    username: payload.username,
    email: payload.email,
  };
}
