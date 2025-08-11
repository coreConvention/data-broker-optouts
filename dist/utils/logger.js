import { promises as fs } from "fs";
import path from "path";
export class Logger {
    filePath;
    constructor(logDir = "./", fileName = `optouts-${Date.now()}.jsonl`) {
        this.filePath = path.resolve(logDir, fileName);
    }
    async append(result) {
        const line = JSON.stringify(result) + "\n";
        await fs.appendFile(this.filePath, line, { encoding: "utf-8" });
    }
    path() {
        return this.filePath;
    }
}
