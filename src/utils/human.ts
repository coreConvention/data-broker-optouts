import readline from "readline";

export async function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => rl.question(`${prompt}\nPress Enter to continue...`, () => resolve()));
  rl.close();
}

export async function promptForCode(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise<string>((resolve) => rl.question(`${prompt}\nEnter code: `, (ans) => resolve(ans.trim())));
  rl.close();
  return code;
}