import puppeteer from "puppeteer";

const file = process.argv[2];
const url = `file://${process.cwd()}/${file}`;

const browser = await puppeteer.launch();
const page = await browser.newPage();

page.on("pageerror", err => console.error("Runtime error:", err.message));
page.on("console", msg => console.log("Console:", msg.text()));

await page.goto(url);
await browser.close();

