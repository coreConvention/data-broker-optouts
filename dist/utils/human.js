import readline from "readline";
export async function waitForEnter(prompt) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise((resolve) => rl.question(`${prompt}\nPress Enter to continue...`, () => resolve()));
    rl.close();
}
export async function promptForCode(prompt) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const code = await new Promise((resolve) => rl.question(`${prompt}\nEnter code: `, (ans) => resolve(ans.trim())));
    rl.close();
    return code;
}
