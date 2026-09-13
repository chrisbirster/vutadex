import { render } from "@solidjs/web";
import { App } from "./App";
import "./reset.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
render(() => <App />, root);
