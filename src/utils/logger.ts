import { promises as fs } from "fs";
import { OptOutResult } from "../types.js";
import path from "path";

export class Logger {
  private readonly filePath: string;

  public constructor(logDir: string = "./", fileName: string = `optouts-${Date.now()}.jsonl`) {
    this.filePath = path.resolve(logDir, fileName);
  }

  public async append(result: OptOutResult): Promise<void> {
    const line = JSON.stringify(result) + "\n";
    await fs.appendFile(this.filePath, line, { encoding: "utf-8" });
  }

  public path(): string {
    return this.filePath;
  }
}