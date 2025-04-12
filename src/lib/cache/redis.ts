import { Redis } from '@upstash/redis';

// Ensure environment variables are set
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  console.warn('Upstash Redis environment variables not fully configured. Caching will be disabled.');
  // Provide dummy functions or throw error depending on desired behavior if cache is critical
}

// Initialize Upstash Redis client only if configured
const redis = redisUrl && redisToken ? new Redis({
  url: redisUrl,
  token: redisToken,
}) : null;

/**
 * Retrieves a value from the Redis cache.
 * Automatically parses JSON strings.
 *
 * @param key - The cache key.
 * @returns The cached value (parsed if JSON), or null if not found, not configured, or error.
 */
export async function getCache<T = any>(key: string): Promise<T | null> {
  if (!redis) return null; // Cache disabled

  try {
    const data = await redis.get<string | T>(key);
    if (data === null) {
      return null;
    }
    // Attempt to parse if it looks like a JSON string
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) as T;
      } catch {
        // If parsing fails, return the raw string (or handle as needed)
        console.warn(`Failed to parse cached value for key "${key}" as JSON.`);
        // Depending on use case, might return 'data as T' here if strings are valid cache values
        return data as T; // Return raw string if parsing fails but string is expected
      }
    }
    return data; // Return as is if already parsed by Upstash client (e.g., objects)
  } catch (error) {
    console.error(`Error getting cache for key "${key}":`, error);
    return null;
  }
}

/**
 * Stores a value in the Redis cache.
 * Automatically stringifies objects/arrays.
 *
 * @param key - The cache key.
 * @param value - The value to store.
 * @param ttlSeconds - Optional time-to-live in seconds.
 */
export async function setCache(key: string, value: any, ttlSeconds?: number): Promise<void> {
  if (!redis) return; // Cache disabled

  try {
    const valueToStore = typeof value === 'object' ? JSON.stringify(value) : value;
    if (ttlSeconds) {
      await redis.set(key, valueToStore, { ex: ttlSeconds });
    } else {
      await redis.set(key, valueToStore);
    }
  } catch (error) {
    console.error(`Error setting cache for key "${key}":`, error);
  }
}

/**
 * Deletes a key from the Redis cache.
 *
 * @param key - The cache key to delete.
 */
export async function deleteCache(key: string): Promise<void> {
  if (!redis) return; // Cache disabled

  try {
    await redis.del(key);
  } catch (error) {
    console.error(`Error deleting cache for key "${key}":`, error);
  }
}

// Export the client instance if needed directly
export default redis;
