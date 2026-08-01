import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@/index.css";

import { createRoot } from "react-dom/client";

import { createSpreadsheetClient } from "@/infra/spreadsheet-client";
import App from "@/presentation/App";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

const client = createSpreadsheetClient();

createRoot(root).render(<App client={client} />);
