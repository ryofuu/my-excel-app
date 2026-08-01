import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@/app.styles.css";

import { createRoot } from "react-dom/client";

import { createEngineSpreadsheetClient } from "@/infra/engine-spreadsheet-client.adapter";
import App from "@/presentation/app.component";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

const client = createEngineSpreadsheetClient();

createRoot(root).render(<App client={client} />);
