import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </ClerkProvider>,
);
