const parseBooleanFlag = (value: unknown, fallback = false): boolean => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

export const USE_DESKTOP_MODE = true;
export const USE_ACCOUNT_LIMITS = false;

const useSupabase = parseBooleanFlag(import.meta.env.VITE_USE_SUPABASE, false);
const useSupabaseAuth = parseBooleanFlag(import.meta.env.VITE_USE_SUPABASE_AUTH, false);

export const USE_SUPABASE = useSupabase;
export const USE_SUPABASE_AUTH = useSupabase && useSupabaseAuth;
