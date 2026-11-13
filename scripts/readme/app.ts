// One app window: the real entry point (src/main.tsx), after the demo clock is in place.
import { installClock } from "./harness/clock";
import "./harness/app.css";
installClock();
await import("../../src/main.tsx");
