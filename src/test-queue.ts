import { messageQueue } from "./lib/queue.ts";
import redis from "./lib/redis.ts";
console.log("Redis Client:", !!redis);
console.log("is mock?", !((redis as any).options));
