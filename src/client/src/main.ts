import { initLocale } from "./i18n";
import "./components/PiWebApp";

// Runs before the first render microtask, so the stored or system locale is
// active when <pi-web-app> renders for the first time.
initLocale();
