// Grava o vídeo de reserva da demo: mudo, 1440 × 900, com legendas em pt-PT.
// Segue o guião da demo (entregaveis/2026-11-20-ppt/guiao.md, B4): Vigiar (20 s) → Completar (20 s) → Prever a 3 h (10 s) →
// Proteger e mapa de risco potencial (30 s) → o alerta ao vivo, o modo «agora» (30 s). No ① o cursor recua às 16h e o ▶ leva-o
// às 20h, com o mapa a escurecer (ADR-0040); abre o pop-up da RSU0030 e, no mapa de risco potencial, o da SC0021. Alvo: até 2 min.
//
// Pré-requisitos (sem rede): a API e a web servida em URL_WEB (por omissão `vite preview`, http://localhost:4173), ou
// `docker compose up` com URL_WEB=http://localhost:5173. A web compilada fala com a API de VITE_API_URL (por omissão
// http://localhost:8000). O ffmpeg converte o WebM em MP4.
// O modo «agora» precisa de `agora.ativo: true` na API. Sem editar o config do repo: copie `config/riasense.yaml`, ligue-o na
// cópia e arranque a API com RIASENSE_CONFIG=/caminho/da/copia.yaml.
// As legendas só têm frases e números que estão na aplicação ou em data/processed/. O script diz no
// terminal o segundo em que começa cada passo, para medir a duração.
//
//   uv run uvicorn app:app --app-dir api --port 8000 &                       # a API (RIASENSE_DATA_INTERIM=data/interim)
//   cd web && VITE_API_URL=http://localhost:8000 npm run build && npx vite preview &
//   npm run gravar-demo                                                       # tema claro → entregaveis/riasense-demo.mp4
//   TEMA=escuro npm run gravar-demo                                           # tema escuro → entregaveis/riasense-demo-escuro.mp4
//   (numa porta que não seja a 8000: VITE_API_URL e a API na mesma porta; SAIDA=/caminho/teste.mp4 não mexe nos vídeos versionados)
//   ENSAIO=1 npm run gravar-demo                                              # só o ensaio da GPU: placa, decisão da app, fps e duas fotos, sem vídeo final
//
// A GPU (ADR-0041, ponto 8): os modelos 3D só ficam com ≥ 30 fps; abaixo disso, a app recua para a vista de cima, sem eles.
// O Chromium do Playwright, sem opções, desenha o WebGL por software (SwiftShader) e fica abaixo dos 30 fps. Por isso lança-se
// com a aceleração por hardware ligada (no macOS, o ANGLE sobre o Metal) e o script pára se a placa for de software, ou se a
// própria app tiver recuado (lê o `data-recuo` que ela deixa no mapa depois dos seus 3 s de amostra); nesse caso não
// escreve o vídeo final.

import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const URL_WEB = process.env.URL_WEB ?? "http://localhost:4173";
const TAMANHO = { width: 1440, height: 900 };
const ENSAIO = process.env.ENSAIO === "1";
// Os mesmos números da app (web/src/componentes/mapa/Mapa.tsx): a amostra de 3 s e o mínimo de 30 fps.
const FPS_MINIMO = 30;
const AMOSTRA_FPS_MS = 3000;
// A aceleração por hardware: no macOS, o WebGL passa pelo ANGLE sobre o Metal (a GPU do Mac), em vez do SwiftShader.
const OPCOES_GPU = {
  args: ["--enable-gpu", "--ignore-gpu-blocklist", ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])],
};
const PLACA_DE_SOFTWARE = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i;
// O tema claro por omissão: é o vídeo de reserva, onde se vê a passagem do dia para a noite (ADR-0040). Com TEMA=escuro, a
// alternativa, no tema da demo ao vivo. A saída segue o tema, para uma gravação nunca ficar por cima do vídeo do outro tema
// (claro → entregaveis/riasense-demo.mp4, escuro → entregaveis/riasense-demo-escuro.mp4). SAIDA=… grava noutro sítio.
const TEMA = process.env.TEMA === "escuro" ? "dark" : "light";
const SAIDA = resolve(process.env.SAIDA ?? join(RAIZ, TEMA === "dark" ? "entregaveis/riasense-demo-escuro.mp4" : "entregaveis/riasense-demo.mp4"));

// Legenda fixa na área do mapa, acima da atribuição do OpenStreetMap (obrigatória, ODbL, nunca tapada) e da barra da hora;
// não tapa os painéis da direita. Com um pop-up aberto, usa-se uma legenda de uma só linha, para não o tapar.
async function legenda(page, texto, ms) {
  await page.evaluate((t) => {
    let el = document.getElementById("legenda-video");
    if (!el) {
      el = document.createElement("div");
      el.id = "legenda-video";
      Object.assign(el.style, {
        position: "fixed", left: "16px", width: "1000px", bottom: "150px", zIndex: "9999", textAlign: "center",
        pointerEvents: "none", font: "600 22px/1.35 system-ui, sans-serif",
      });
      document.body.appendChild(el);
    }
    el.innerHTML = t ? `<span style="background:rgba(10,12,20,.82);color:#fff;padding:10px 18px;border-radius:10px;
      display:inline-block;max-width:900px">${t}</span>` : "";
  }, texto);
  await page.waitForTimeout(ms);
}

async function separador(page, nome) {
  await page.getByRole("tab", { name: nome }).click();
  await page.waitForTimeout(700);
}

// O cursor de hora anda devagar: uma hora de cada vez, como se o apresentador o arrastasse.
async function andarHoras(page, n, msPorHora) {
  const cursor = page.locator("#cursor-hora");
  await cursor.focus();
  for (let i = 0; i < n; i++) {
    await cursor.press("ArrowRight");
    await page.waitForTimeout(msPorHora);
  }
}

// O cursor recua horas, uma de cada vez (o ▶ depois faz o caminho de volta).
async function recuarHoras(page, n) {
  const cursor = page.locator("#cursor-hora");
  await cursor.focus();
  for (let i = 0; i < n; i++) await cursor.press("ArrowLeft");
  await page.waitForTimeout(800);
}

/** A placa que desenha o WebGL nesta página (o nome que o Chromium dá ao renderer), ou null sem WebGL. */
function placaDoWebgl(page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return null;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  });
}

/** Pára com uma mensagem clara se o WebGL não estiver na GPU: assim o vídeo sairia sem os modelos 3D. */
async function confirmarGpu(browser) {
  const pagina = await browser.newPage();
  const placa = await placaDoWebgl(pagina);
  await pagina.close();
  if (!placa || PLACA_DE_SOFTWARE.test(placa)) {
    await browser.close();
    throw new Error(
      `Sem GPU: o Chromium desenha o WebGL ${placa ? `por software (${placa})` : "sem WebGL nenhum"}. Assim o mapa fica abaixo ` +
        "de 30 fps, a app recua para a vista de cima e o vídeo sairia sem os modelos 3D (ADR-0041, ponto 8). Grave no Mac, na " +
        "sessão de quem está ao ecrã (não por SSH, nem com o ecrã bloqueado, nem dentro de um contentor). Nenhum vídeo foi escrito.",
    );
  }
  return placa;
}

/** Os fotogramas por segundo da página durante `ms`, contados com o requestAnimationFrame (como o `medirFps` da app). */
function medirFps(page, ms = AMOSTRA_FPS_MS) {
  return page.evaluate(
    (ms) =>
      new Promise((resolver) => {
        let n = 0;
        const inicio = performance.now();
        const passo = (t) => {
          n++;
          if (t - inicio < ms) requestAnimationFrame(passo);
          else resolver((n * 1000) / (t - inicio));
        };
        requestAnimationFrame(passo);
      }),
    ms,
  );
}

function confirmarFps(fps) {
  if (fps < FPS_MINIMO) {
    throw new Error(
      `O mapa mediu ${fps.toFixed(0)} fps (mínimo ${FPS_MINIMO}): a app recua para a vista de cima e o vídeo sairia sem os modelos 3D ` +
        "(ADR-0041, ponto 8). Feche outras aplicações pesadas e volte a tentar. Nenhum vídeo final foi escrito.",
    );
  }
}

/**
 * A decisão da própria app (ADR-0041, ponto 8): nos 3 s depois de o mapa carregar, ela mede os fps e, abaixo de 30, recua
 * para a vista de cima, sem os modelos 3D. Deixa a decisão no contentor do mapa (`data-recuo="sim|nao"`, `data-fps`). É a única
 * prova de que os modelos ficam no ecrã: os .glb carregam-se na mesma quando a app recua. null se a decisão não chegar.
 */
async function decisaoDaApp(page) {
  const mapa = page.locator(".mapa[data-recuo]");
  const chegou = await mapa.waitFor({ state: "attached", timeout: 20_000 }).then(() => true, () => false);
  if (!chegou) return null;
  return { recuou: (await mapa.getAttribute("data-recuo")) === "sim", fps: Number(await mapa.getAttribute("data-fps")) };
}

function confirmarDecisao(decisao) {
  if (!decisao) {
    throw new Error(
      "A app não disse se recuou (falta o `data-recuo` no mapa, 20 s depois de abrir): a web compilada é antiga, ou a " +
        "janela é estreita e o mapa abre de cima. Volte a compilar a web (npm run build). Nenhum vídeo final foi escrito.",
    );
  }
  if (decisao.recuou) {
    throw new Error(
      `A app mediu ${decisao.fps} fps ao abrir (mínimo ${FPS_MINIMO}) e recuou para a vista de cima, sem os modelos 3D ` +
        "(ADR-0041, ponto 8). Feche outras aplicações pesadas e volte a tentar. Nenhum vídeo final foi escrito.",
    );
  }
}

const textoDaDecisao = (d) =>
  !d ? "sem decisão (falta o data-recuo)" : `${d.fps} fps ao abrir, ${d.recuou ? "RECUOU para a vista de cima, sem os modelos 3D" : "não recuou: modelos 3D no mapa"}`;

/**
 * O ensaio (ENSAIO=1): o mesmo Chromium e o mesmo contexto do vídeo final (gravação ligada), sem o guião e sem escrever o vídeo
 * final. Como no início do vídeo, o cursor recua às 16h e o ▶ anda, com o «Trânsito» (ligado por omissão no ①): mede os fps
 * nesses 3 s (ADR-0041, ponto 8) e tira duas fotos do mapa inclinado, no zoom de abertura (o do vídeo) e um passo mais perto.
 * Deixa as fotos e o vídeo curto numa pasta temporária e diz onde.
 */
async function ensaiar(pasta) {
  const browser = await chromium.launch(OPCOES_GPU);
  const placa = await confirmarGpu(browser);
  const context = await browser.newContext({
    viewport: TAMANHO, colorScheme: TEMA, locale: "pt-PT", recordVideo: { dir: pasta, size: TAMANHO },
  });
  const page = await context.newPage();
  const modelos = new Set();
  page.on("response", (r) => {
    if (/\/modelos\/[^/]+\.glb$/.test(new URL(r.url()).pathname) && r.ok()) modelos.add(r.url().split("/").pop());
  });
  await page.goto(URL_WEB);
  await page.getByRole("button", { name: /^RSU0030 · falha de rede/ }).waitFor({ timeout: 30_000 });
  // A app mede os fps nos 3 s depois de o mapa carregar e decide aí se recua: as fotos tiram-se depois da decisão.
  const decisao = await decisaoDaApp(page);
  if (!decisao) {
    await browser.close();
    rmSync(pasta, { recursive: true, force: true }); // sem decisão, o vídeo curto não serve: não fica no TMPDIR
    confirmarDecisao(decisao);
  }
  await recuarHoras(page, 4);
  await page.getByRole("button", { name: /Reproduzir/ }).click();
  const fps = await medirFps(page);
  await page.getByRole("button", { name: /Pausar/ }).click();
  await page.waitForTimeout(800);
  const tema = TEMA === "dark" ? "escuro" : "claro";
  const fotos = [join(pasta, `ensaio-3d-${tema}.png`), join(pasta, `ensaio-3d-${tema}-perto.png`)];
  await page.screenshot({ path: fotos[0] });
  await page.getByRole("button", { name: "Aproximar" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: fotos[1] });
  const video = page.video();
  await context.close();
  await browser.close();
  console.log(`placa: ${placa}`);
  console.log(`a app: ${textoDaDecisao(decisao)}`);
  console.log(`fps com o ▶ e o «Trânsito»: ${fps.toFixed(0)} (mínimo ${FPS_MINIMO})`);
  // Os .glb servidos não provam que os modelos estão no ecrã (carregam-se mesmo quando a app recua): isso dizem a linha da app e
  // as fotos. Esta linha só confirma que a web compilada tem a pasta modelos/.
  console.log(`modelos 3D (.glb) servidos: ${modelos.size} (${[...modelos].sort().join(", ") || "nenhum"})`);
  console.log(`fotos → ${fotos.join("\n        ")}\nvídeo curto → ${await video.path()}`);
  console.log("Confirme nas fotos que o mapa está inclinado, com os edifícios em relevo, os veículos nas ruas e os peões nas passadeiras (não pontos).");
  confirmarDecisao(decisao);
  confirmarFps(fps);
  if (modelos.size === 0) throw new Error("Nenhum modelo 3D (.glb) carregou: veja se a web compilada tem a pasta modelos/.");
}

// O guião da demo (entregaveis/2026-11-20-ppt/guiao.md, B4): Vigiar 20 s, Completar 20 s, Prever a 3 h 10 s, Proteger e mapa
// de risco potencial 30 s e o alerta ao vivo, o modo «agora», 30 s. Alvo: até 2 min.
async function gravar(pasta) {
  const browser = await chromium.launch(OPCOES_GPU);
  console.log(`placa: ${await confirmarGpu(browser)}`);
  const context = await browser.newContext({
    viewport: TAMANHO, colorScheme: TEMA, locale: "pt-PT", recordVideo: { dir: pasta, size: TAMANHO },
  });
  const page = await context.newPage();
  const inicio = Date.now();
  const marca = (passo) => console.log(`${((Date.now() - inicio) / 1000).toFixed(1).padStart(5)} s · ${passo}`);
  await page.goto(URL_WEB);
  // O ① abre só com o mapa: o marcador da RSU0030 diz que a página carregou.
  await page.getByRole("button", { name: /^RSU0030 · falha de rede/ }).waitFor({ timeout: 30_000 });
  // A app mede os fps nos 3 s depois de o mapa carregar, já com a gravação ligada, e deixa a decisão no mapa: se recuou, pára já.
  const decisaoAoAbrir = decisaoDaApp(page);
  await page.waitForTimeout(1500); // o mapa acaba de desenhar

  // ① Vigiar (20 s): o cursor recua às 16h e o ▶ leva-o até às 20h, com a cidade a escurecer (ADR-0040); a RSU0030 deixa de comunicar às 20h06.
  marca("① Vigiar");
  await legenda(page, "RiaSense · Av. 25 de Abril / Av. de Oita (RSU0030), 04/11", 2500);
  const decisao = await decisaoAoAbrir;
  console.log(`      a app: ${textoDaDecisao(decisao)}`);
  if (!decisao || decisao.recuou) await browser.close();
  confirmarDecisao(decisao);
  await recuarHoras(page, 4);
  await page.getByRole("button", { name: /Reproduzir/ }).click();
  await legenda(page, "▶ das 16h às 20h: o fundo do mapa escurece com o pôr do sol", 4300);
  await page.getByRole("button", { name: /Pausar/ }).click();
  await legenda(page, "① Vigiar · 38 falhas inesperadas: 11 de rede, em 2 incidentes da RSU0030, e 27 de dispositivo", 4500);
  // O pop-up da RSU0030 (ADR-0033): os sensores que ela serve, por estado, e a linha do tempo.
  await page.locator('button.marcador-mapa[data-sensor$="RoadSideUnit:0030"]').click();
  await legenda(page, "04/11, entre as 20h06 e as 20h16: as 4 passadeiras, o estacionamento e 4 segmentos ficam sem comunicação", 5000);
  await page.getByRole("button", { name: "Fechar o pop-up" }).click();
  await page.waitForTimeout(400);

  // ② Completar (20 s): abre no sensor virtual da SC0020, com o intervalo de 80 %.
  marca("② Completar");
  await separador(page, /Completar/);
  await legenda(page, "② Completar · os sensores virtuais preenchem as cerca de 135 h, com intervalo", 8500);
  await legenda(page, "Erro 0,36 nas passadeiras, contra 0,62 da referência «mesma hora, dia anterior»", 9000);

  // ③ Prever a 3 h (10 s): a hora de partida cai fora do período de teste, por isso «Ir para…».
  marca("③ Prever");
  await separador(page, /Prever/);
  await page.getByRole("button", { name: /Ir para/ }).click();
  await page.waitForTimeout(500);
  await legenda(page, "③ Prever · a 3 h, ganha à referência e à persistência nos 4 tipos de sensor: passadeiras 0,56 contra 0,62 e 0,72", 5000);
  await legenda(page, "Ressalva: sobre a mesma hora de ontem, a margem é pequena nas passadeiras (−10 %) e no estacionamento (−7 %)", 4000);

  // ④ Proteger e o mapa de risco potencial (30 s), com o pop-up da SC0021 (tem semáforo).
  marca("④ Proteger");
  await separador(page, /Proteger/);
  await legenda(page, "④ Proteger · os carros abrandam em 19 de 24 passadeiras, 17 das 19 sem semáforo", 5500);
  await legenda(page, "Aqui, 1 em cada 4 veículos passa acima do limite (29 h de dados, antes da falha)", 5000);
  await legenda(page, "Nas 5 passadeiras com semáforo, quem trava é a luz: a medida não se aplica, e nenhuma fica assinalada. Aqui há só 29 h de dados, por isso fica por confirmar", 7000);
  await page.getByRole("button", { name: "Mapa de risco potencial", exact: true, pressed: false }).first().click();
  await page.waitForTimeout(600);
  await legenda(page, "Só pontos com sensor; estimados a tracejado. Onde há semáforo, o comportamento não se aplica. Não mede acidentes.", 6500);
  await page.locator('button.marcador-mapa[data-sensor$="SmartCrosswalk:0021"]').click();
  await page.waitForTimeout(600);
  await legenda(page, "SC0021 · com semáforo: o comportamento não se aplica", 4000);

  // O alerta ao vivo (30 s), o modo «agora» (ADR-0030, ADR-0032): abrir o painel começa o simulador às 19h50 (×60: 1 minuto
  // por segundo); «Cortar a RSU0030» deixa a RSU0030 sem comunicação e, ao fim de uns minutos simulados, o aviso aparece no canto do mapa.
  marca("Agora");
  await separador(page, /Vigiar/);
  const agora = page.getByRole("button", { name: /^Simular falha/ });
  if ((await agora.count()) === 0) {
    throw new Error("Não há o botão «Simular falha»: arranque a API com agora.ativo: true (RIASENSE_CONFIG, ver o topo).");
  }
  await agora.click();
  await page.getByText(/Simulação com dados fictícios/).first().waitFor({ timeout: 10_000 });
  await legenda(page, "Modo «agora» · simulação com dados fictícios, a ×60: 1 minuto simulado por segundo", 4500);
  await page.getByRole("button", { name: /^Cortar a RSU0030/ }).click();
  await legenda(page, "Simulamos a falha da RSU0030: as passadeiras e os segmentos que ela serve ficam sem comunicação", 4000);
  await page.getByText(/sem dados há/).first().waitFor({ timeout: 40_000 });
  await legenda(page, "O painel avisa: RSU0030 sem comunicação. Verificar no local", 7000);
  marca("Fecho");
  await legenda(page, "RiaSense transforma o Living Lab num sistema que se vigia, se completa, prevê e protege.", 4500);
  marca("fim");

  const video = page.video();
  await context.close(); // o vídeo só fica completo depois de fechar o contexto
  await browser.close();
  return video.path();
}

async function gravarOVideo() {
  const pasta = mkdtempSync(join(tmpdir(), "riasense-video-"));
  try {
    const webm = await gravar(pasta);
    let final = SAIDA;
    try {
      // MP4 (H.264, sem som) para abrir em qualquer lado; sem ffmpeg, fica o WebM.
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "30",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", SAIDA]);
    } catch {
      final = SAIDA.replace(/\.mp4$/, ".webm");
      renameSync(webm, final);
    }
    console.log(`vídeo → ${final} (${(statSync(final).size / 1e6).toFixed(1)} MB)`);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

// O ensaio deixa as fotos e o vídeo curto numa pasta temporária, para se verem; nunca toca nos vídeos versionados.
try {
  if (ENSAIO) await ensaiar(mkdtempSync(join(tmpdir(), "riasense-ensaio-")));
  else await gravarOVideo();
} catch (e) {
  // Só a mensagem (sem a pilha): diz o que falta e que nenhum vídeo foi escrito.
  console.error(`\nerro: ${e.message}`);
  process.exit(1);
}
