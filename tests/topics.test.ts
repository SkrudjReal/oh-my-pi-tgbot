import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { TopicManager } from "../src/services/topics";

describe("TopicManager URL Parsing & Topic State Management", () => {
  const tmpPath = path.join(os.tmpdir(), `omp-topics-${Date.now()}.json`);
  const manager = new TopicManager(tmpPath);

  afterAll(async () => {
    await fs.rm(tmpPath, { force: true });
  });

  test("parseTopicLink correctly parses standard internal Telegram topic URLs", () => {
    const res1 = manager.parseTopicLink("https://t.me/c/4488980222/5");
    expect(res1).toEqual({ chatId: -1004488980222, topicId: 5 });

    const res2 = manager.parseTopicLink("https://t.me/c/10099887766/42");
    expect(res2).toEqual({ chatId: -10099887766, topicId: 42 });

    const res3 = manager.parseTopicLink("t.me/c/1234567890/1");
    expect(res3).toEqual({ chatId: -1001234567890, topicId: 1 });
  });

  test("parseTopicLink correctly parses raw key format", () => {
    const raw = manager.parseTopicLink("-1004488980222:5");
    expect(raw).toEqual({ chatId: -1004488980222, topicId: 5 });
  });

  test("parseTopicLink returns null for invalid formats", () => {
    expect(manager.parseTopicLink("https://t.me/username")).toBeNull();
    expect(manager.parseTopicLink("random text")).toBeNull();
  });

  test("addTopic, isTopicActive, listTopics, and removeTopic work seamlessly", async () => {
    await manager.addTopic(-1004488980222, 5, "Dev Thread", 12345);

    expect(await manager.isTopicActive(-1004488980222, 5)).toBe(true);
    expect(await manager.isTopicActive(-1004488980222, 99)).toBe(false);
    expect(await manager.isTopicActive(-10011111111, 5)).toBe(false);

    const list = await manager.listTopics();
    expect(list.length).toBe(1);
    expect(list[0].chat_title).toBe("Dev Thread");

    const removed = await manager.removeTopic(-1004488980222, 5);
    expect(removed).toBe(true);
    expect(await manager.isTopicActive(-1004488980222, 5)).toBe(false);
  });
});
