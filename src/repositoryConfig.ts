import { getOrCreateDeviceId, LocalStorageRepository, type AsayellRepository } from './repository'
import { SupabaseRepository } from './supabaseRepository'

const defaultSupabaseUrl = 'https://yyeaeewfqamdtiprshdd.supabase.co'
const defaultSupabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5ZWFlZXdmcWFtZHRpcHJzaGRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzMzIzOTUsImV4cCI6MjExMDkwODM5NX0.26DwoU9Qcy8_lrKvIYiI0moclxSzVX6Fm7AMR5jRPik'

export function createRepository(): AsayellRepository {
  try {
    getOrCreateDeviceId()
  } catch {
    // Browsers that block storage can still open public pages. Profile operations report the failure when used.
  }

  if (import.meta.env.VITE_ASAYELL_REPOSITORY === 'local') return new LocalStorageRepository()

  return new SupabaseRepository(
    import.meta.env.VITE_SUPABASE_URL || defaultSupabaseUrl,
    import.meta.env.VITE_SUPABASE_ANON_KEY || defaultSupabaseAnonKey,
  )
}
