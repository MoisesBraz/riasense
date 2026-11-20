import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BoletimCamara } from "./paineis/BoletimCamara";
import "./styles/tokens.css";
import "./styles/app.css";

// O boletim da Câmara (ADR-0052) é uma página para imprimir, aberta da ④ com `?boletim`: sempre no tema claro, como no papel.
const boletim = new URLSearchParams(window.location.search).has("boletim");
if (boletim) document.documentElement.dataset.theme = "light";

createRoot(document.getElementById("root")!).render(<StrictMode>{boletim ? <BoletimCamara /> : <App />}</StrictMode>);
