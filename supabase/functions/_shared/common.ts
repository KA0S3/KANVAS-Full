import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.98.0";

export type JsonRecord = Record<string, unknown>;

export const functionEnv = {
  supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
};

export const serviceClient = (): SupabaseClient =>
  createClient(functionEnv.supabaseUrl, functionEnv.serviceRoleKey, {
    auth: { persistSession: false },
  });

export const userClient = (authorization: string): SupabaseClient =>
  createClient(functionEnv.supabaseUrl, functionEnv.anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });

export const allowedOrigins = (): string[] =>
  (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173,https://kanvas-it.com")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export const corsHeaders = (request: Request): HeadersInit => {
  const origin = request.headers.get("origin") ?? "";
  const allowed = allowedOrigins();
  return {
    "access-control-allow-origin": allowed.includes(origin) ? origin : allowed[0] ?? "*",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "vary": "origin",
  };
};

export const json = (request: Request, body: JsonRecord, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "content-type": "application/json" },
  });

export const readJson = async <T = JsonRecord>(request: Request): Promise<T> => {
  try {
    return await request.json() as T;
  } catch {
    return {} as T;
  }
};

export const bearerToken = (request: Request): string | null => {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
};

export const requireUser = async (request: Request): Promise<{ user: User; token: string }> => {
  const token = bearerToken(request);
  if (!token) throw new HttpError(401, "missing_authorization");

  const { data, error } = await userClient(`Bearer ${token}`).auth.getUser();
  if (error || !data.user) throw new HttpError(401, "invalid_authorization");
  return { user: data.user, token };
};

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: JsonRecord) {
    super(message);
  }
}

export const handleError = (request: Request, error: unknown): Response => {
  if (error instanceof HttpError) {
    return json(request, { error: error.message, ...(error.details ?? {}) }, error.status);
  }
  console.error(error);
  return json(request, { error: "internal_error" }, 500);
};

export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const randomCode = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export const activeEntitlementFilter = (query: any) =>
  query
    .in("status", ["active", "trial"])
    .lte("starts_at", new Date().toISOString())
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

export const getActiveEntitlement = async (
  supabase: SupabaseClient,
  userId: string,
  channel = "stable",
) => {
  const { data, error } = await activeEntitlementFilter(
    supabase
      .from("entitlements")
      .select("*")
      .eq("user_id", userId)
      .contains("allowed_channels", [channel])
      .order("created_at", { ascending: false })
      .limit(1),
  ).maybeSingle();

  if (error) throw error;
  return data;
};

export const assertAdmin = async (supabase: SupabaseClient, userId: string) => {
  const { data, error } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new HttpError(403, "admin_required");
  return data;
};
