import { createServerClient } from '@supabase/ssr'

type CookieStore = {
  getAll: () => Array<{ name: string; value: string }>
  set?: (name: string, value: string, options?: Record<string, unknown>) => void
}

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY_2

export const createClient = (cookieStore: CookieStore) => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase server configuration')
  }

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set?.(name, value, options)
        })
      },
    },
  })
}
