const fs = require("fs");
const path = require("path");

const indexPath = path.join(__dirname, "..", "index.html");
const placeholder = "REPLACE_WITH_YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
const clientId = process.env.GOOGLE_CLIENT_ID;

if (!clientId) {
    console.warn("GOOGLE_CLIENT_ID env var is not set, leaving placeholder in index.html");
    process.exit(0);
}

const html = fs.readFileSync(indexPath, "utf8");
fs.writeFileSync(indexPath, html.replaceAll(placeholder, clientId));
console.log("Injected GOOGLE_CLIENT_ID into index.html");
