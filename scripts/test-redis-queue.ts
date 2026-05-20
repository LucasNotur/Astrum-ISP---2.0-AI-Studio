
import redis from "../src/lib/redis.ts";
import { enqueueMessage } from "../src/lib/queue.ts";

async function test() {
  console.log("Redis instance:", typeof redis);
  try {
    await redis.set("test-key", "test-value", "EX", 10);
    const val = await redis.get("test-key");
    console.log("Redis test set/get:", val === "test-value" ? "OK" : "FAIL");
    
    console.log("Testing enqueueMessage...");
    await enqueueMessage("test-tenant", { messageId: "123", customerId: "cust1" }, { delay: 100 });
    console.log("Enqueue success (mock or real)");

  } catch (e) {
    console.error("Test failed:", e);
  }
}

test();
